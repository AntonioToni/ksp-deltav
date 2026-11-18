import { execFileSync } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  artifactName, canAdvance, eligibleRun, PREVIEW_COMMENT_MARKER,
  previewComment, runStatus, STATE_BRANCH, trustedPullRequest, verifyBuild,
} from './pages-core.mjs'
import { composeSite, emptyManifest, exportSite, readManifest } from './pages-site.mjs'

const MAX_ARTIFACT_BYTES = 150 * 1024 * 1024
const workflowFiles = { production: 'deploy-pages.yml', preview: 'build-pr-preview.yml' }

export async function upsertComment(github, coordinates, entry, deployment) {
  const comments = await github.paginate(github.rest.issues.listComments, { ...coordinates, issue_number: entry.number, per_page: 100 })
  const owned = comments.filter(comment => comment.user?.login === 'github-actions[bot]' && comment.body?.includes(PREVIEW_COMMENT_MARKER))
  const body = previewComment(entry, deployment)
  if (!owned.length) await github.rest.issues.createComment({ ...coordinates, issue_number: entry.number, body })
  else {
    if (owned[0].body !== body) await github.rest.issues.updateComment({ ...coordinates, comment_id: owned[0].id, body })
    for (const duplicate of owned.slice(1)) await github.rest.issues.deleteComment({ ...coordinates, comment_id: duplicate.id })
  }
}

/** All inputs are GitHub API metadata or inert archive data. This publisher
 * never installs dependencies, checks out a PR, or imports PR build code. */
export async function reconcile({ github, context, core }, dependencies = {}) {
  const environment = dependencies.environment ?? process.env
  const execute = dependencies.executeFileSync ?? execFileSync
  const coordinates = context.repo
  const repository = (await github.rest.repos.get(coordinates)).data
  if (repository.full_name !== 'AntonioToni/ksp-deltav' || repository.default_branch !== 'main'
    || environment.GITHUB_REF !== 'refs/heads/main') throw new Error('Publishing is restricted to the trusted main workflow.')
  const temporary = await mkdtemp(join(environment.RUNNER_TEMP, 'pages-reconcile-'))
  const state = join(temporary, 'state')
  const site = join(temporary, 'site')
  const reportPath = join(environment.RUNNER_TEMP, 'pages-report.json')
  const report = { entries: [], publish: false, site, repository: repository.full_name }
  const saveReport = () => writeFile(reportPath, `${JSON.stringify(report)}\n`)
  const token = environment.PAGES_GIT_TOKEN
  if (!token) throw new Error('Missing scoped publisher token.')
  const authorization = Buffer.from(`x-access-token:${token}`).toString('base64')
  core.setSecret(authorization)
  const gitEnvironment = {
    ...environment, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_COUNT: '2',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader', GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${authorization}`,
    GIT_CONFIG_KEY_1: 'core.hooksPath', GIT_CONFIG_VALUE_1: '/dev/null',
  }
  const git = (...args) => execute('git', args, { cwd: state, env: gitEnvironment, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  await mkdir(state)
  git('init', '--initial-branch', STATE_BRANCH)
  git('remote', 'add', 'origin', `https://github.com/${repository.full_name}.git`)
  let exists = false
  try { git('ls-remote', '--exit-code', '--heads', 'origin', `refs/heads/${STATE_BRANCH}`); exists = true }
  catch (error) { if (error.status !== 2) throw error }
  if (exists) { git('fetch', '--depth=1', 'origin', STATE_BRANCH); git('checkout', '-B', STATE_BRANCH, 'FETCH_HEAD') }
  const previous = exists ? await readManifest(state) : emptyManifest()
  const pulls = await github.paginate(github.rest.pulls.list, { ...coordinates, state: 'open', base: 'main', per_page: 100 })
  report.entries = pulls.map(pr => ({ number: pr.number, headSha: pr.head.sha,
    trusted: trustedPullRequest(pr, repository), status: 'waiting', snapshot: previous.previews[pr.number] }))
  await saveReport()
  const mainSha = (await github.rest.repos.getBranch({ ...coordinates, branch: 'main' })).data.commit.sha
  const workflows = {}
  for (const [kind, filename] of Object.entries(workflowFiles)) workflows[kind] = (await github.rest.actions.getWorkflow({ ...coordinates, workflow_id: filename })).data.id

  async function findBuild(target, old) {
    const runs = (await github.paginate(github.rest.actions.listWorkflowRuns, {
      ...coordinates, workflow_id: workflows[target.kind], head_sha: target.sha, branch: target.branch,
      ...(target.kind === 'preview' ? { event: 'pull_request' } : {}), per_page: 100,
    })).filter(run => eligibleRun(run, workflows[target.kind], repository, target))
      .sort((a, b) => b.id - a.id || b.run_attempt - a.run_attempt)
    const result = { status: runStatus(runs[0]), candidate: null }
    for (const run of runs.filter(run => run.status === 'completed' && run.conclusion === 'success')) {
      const identity = { sourceSha: target.sha, runId: run.id, runAttempt: run.run_attempt }
      if (!canAdvance(old, identity, target.sha)) break
      const artifacts = await github.paginate(github.rest.actions.listWorkflowRunArtifacts, { ...coordinates, run_id: run.id, per_page: 100 })
      const artifact = artifacts.find(item => item.name === artifactName(target.kind, target.sha, run.run_attempt, target.number) && !item.expired)
      if (!artifact) continue
      try {
        if (artifact.size_in_bytes > MAX_ARTIFACT_BYTES) throw new Error('Artifact exceeds the safe download limit.')
        const archive = await github.rest.actions.downloadArtifact({ ...coordinates, artifact_id: artifact.id, archive_format: 'zip' })
        const bytes = Buffer.from(archive.data)
        if (bytes.byteLength > MAX_ARTIFACT_BYTES) throw new Error('Artifact exceeds the safe download limit.')
        const incoming = join(temporary, `artifact-${artifact.id}`)
        const zip = `${incoming}.zip`
        await writeFile(zip, bytes)
        const output = execute('python3', [fileURLToPath(new URL('./pages_archive.py', import.meta.url)), zip, incoming], { encoding: 'utf8', maxBuffer: 1024 * 1024 })
        const build = JSON.parse(output)
        verifyBuild(build, run, target)
        result.candidate = { build, site: join(incoming, 'site') }
      } catch (error) {
        result.status = 'invalid'
        core.warning(`Rejected ${target.kind} artifact ${artifact.id}: ${error.message}`)
      }
      break
    }
    if (result.status === 'ready' && !result.candidate && old?.sourceSha !== target.sha) result.status = 'unavailable'
    return result
  }

  const production = await findBuild({ kind: 'production', sha: mainSha, branch: 'main' }, previous.production)
  const candidates = new Map()
  for (const pr of pulls) {
    const isTrusted = trustedPullRequest(pr, repository)
    const entry = report.entries.find(entry => entry.number === pr.number)
    if (isTrusted) {
      const found = await findBuild({ kind: 'preview', number: pr.number, sha: pr.head.sha, branch: pr.head.ref }, previous.previews[pr.number])
      entry.status = found.status
      if (found.candidate) candidates.set(pr.number, found.candidate)
    }
  }
  // Recheck authoritative heads after downloads. A PR may close or receive a
  // new commit while an archive is being retrieved; don't publish that payload.
  const fresh = await github.paginate(github.rest.pulls.list, { ...coordinates, state: 'open', base: 'main', per_page: 100 })
  const freshTrusted = fresh.filter(pr => trustedPullRequest(pr, repository))
  const freshByNumber = new Map(fresh.map(pr => [pr.number, pr]))
  for (const [number, candidate] of candidates) if (freshByNumber.get(number)?.head.sha !== candidate.build.sourceSha
    || !trustedPullRequest(freshByNumber.get(number) ?? {}, repository)) candidates.delete(number)
  const freshMain = (await github.rest.repos.getBranch({ ...coordinates, branch: 'main' })).data.commit.sha
  const composed = await composeSite(state, {
    mainSha: freshMain, activeNumbers: freshTrusted.map(pr => pr.number),
    production: production.candidate?.build.sourceSha === freshMain ? production.candidate : null, previews: candidates,
  })
  for (const entry of report.entries) {
    entry.snapshot = composed.manifest.previews[entry.number]
    const pr = freshByNumber.get(entry.number)
    if (!pr) entry.closed = true
    else if (pr.head.sha !== entry.headSha) { entry.headSha = pr.head.sha; entry.status = 'waiting' }
  }
  const removed = new Set([...composed.removed, ...Object.keys(previous.previews).filter(number => !freshTrusted.some(pr => pr.number === Number(number))).map(Number)])
  const eventPR = context.payload.pull_request
  if (eventPR?.state === 'closed') removed.add(eventPR.number)
  for (const number of removed) if (!report.entries.some(entry => entry.number === number)) report.entries.push({ number, closed: true })
  report.publish = composed.publish
  report.waiting = !composed.publish
  await saveReport()
  core.setOutput('publish', String(report.publish))
  core.setOutput('site', site)
  for (const entry of report.entries) await upsertComment(github, coordinates, entry, report.publish ? 'deploying' : 'waiting')
  if (!report.publish) { core.notice('Waiting for a validated production root; the live Pages site has not been changed.'); return }
  git('config', 'user.name', 'github-actions[bot]')
  git('config', 'user.email', '41898282+github-actions[bot]@users.noreply.github.com')
  git('add', '--all', '--force', '.')
  if (git('status', '--porcelain')) {
    git('commit', '-m', 'ci: reconcile production and PR preview snapshots')
    git('push', 'origin', `HEAD:refs/heads/${STATE_BRANCH}`)
  }
  await exportSite(state, site)
  core.summary.addRaw(`Consolidated Pages site: ${composed.files} files, ${Math.round(composed.bytes / 1024 / 1024)} MiB; ${Object.keys(composed.manifest.previews).length} active previews.\n`)
  await core.summary.write()
}

export async function finish({ github, context, core }, deployment, dependencies = {}) {
  const environment = dependencies.environment ?? process.env
  let report
  try { report = JSON.parse(await readFile(join(environment.RUNNER_TEMP, 'pages-report.json'), 'utf8')) }
  catch (error) { if (error.code === 'ENOENT') { core.warning('No reconciliation report is available.'); return } throw error }
  const repository = (await github.rest.repos.get(context.repo)).data
  for (const entry of report.entries) {
    const pr = (await github.rest.pulls.get({ ...context.repo, pull_number: entry.number })).data
    if (!entry.closed && pr.state === 'closed') entry.cleanupPending = true
    if (entry.closed && pr.state === 'open' && pr.base.ref === 'main') { entry.closed = false; entry.headSha = pr.head.sha; entry.status = 'waiting'; entry.snapshot = null }
    if (!entry.closed) entry.trusted = trustedPullRequest(pr, repository)
    if (!entry.closed && pr.head.sha !== entry.headSha) { entry.headSha = pr.head.sha; entry.status = 'waiting' }
    await upsertComment(github, context.repo, entry, report.waiting ? 'waiting' : deployment)
  }
}
