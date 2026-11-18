import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { artifactName, PREVIEW_COMMENT_MARKER } from './pages-core.mjs'
import { finish, reconcile, upsertComment } from './pages-publish.mjs'
import { MANIFEST_FILE } from './pages-site.mjs'

const sha = character => character.repeat(40)
const repository = { id: 101, full_name: 'AntonioToni/ksp-deltav', default_branch: 'main' }
const pr = (number, character = 'a') => ({ number, state: 'open', base: { ref: 'main', repo: { id: 101 } },
  head: { sha: sha(character), ref: `feat/pr-${number}`, repo: { id: 101, full_name: repository.full_name } } })
const production = (runId = 100) => ({ sourceSha: sha('f'), runId, runAttempt: 1 })
const snapshot = (character, runId) => ({ sourceSha: sha(character), runId, runAttempt: 1 })

function fixture(test, options = {}) {
  const root = mkdtempSync(join(tmpdir(), 'pages-publisher-test-'))
  test.after(() => rmSync(root, { recursive: true, force: true }))
  const durable = join(root, 'durable')
  mkdirSync(durable)
  const previous = options.previous
  if (previous) {
    writeFileSync(join(durable, 'index.html'), 'old production')
    writeFileSync(join(durable, MANIFEST_FILE), JSON.stringify(previous))
    for (const number of Object.keys(previous.previews)) {
      mkdirSync(join(durable, 'previews', `pr-${number}`), { recursive: true })
      writeFileSync(join(durable, 'previews', `pr-${number}`, 'index.html'), `old preview ${number}`)
    }
  }
  const pulls = options.pulls ?? [pr(24), pr(25, 'b')]
  const freshPulls = options.freshPulls ?? pulls
  let pullReads = 0
  let branchReads = 0
  const comments = new Map()
  const calls = { git: [], queried: [], downloaded: [], created: [], updated: [], warnings: [] }
  const outputs = {}
  const runs = options.runs ?? [
    { id: 100, head_sha: sha('f'), head_branch: 'main', event: 'push', workflow_id: 10 },
    { id: 200, head_sha: sha('a'), head_branch: 'feat/pr-24', event: 'pull_request', workflow_id: 20 },
    { id: 201, head_sha: sha('b'), head_branch: 'feat/pr-25', event: 'pull_request', workflow_id: 20 },
  ]
  const normalized = runs.map(run => ({ head_repository: { id: 101, full_name: repository.full_name }, run_attempt: 1,
    status: 'completed', conclusion: 'success', ...run }))
  const archives = new Map()
  const artifacts = new Map()
  for (const run of normalized) {
    const number = Number(run.head_branch.split('-').at(-1))
    const kind = run.event === 'pull_request' ? 'preview' : 'production'
    const build = { schema: 1, kind, sourceSha: run.head_sha, runId: run.id, runAttempt: run.run_attempt,
      basePath: '/ksp-deltav/', ...(kind === 'preview' ? { prNumber: number, mergeSha: sha('c'), baseSha: sha('f'), basePath: `/ksp-deltav/previews/pr-${number}/` } : {}),
      ...(options.invalidRunId === run.id ? { runId: run.id + 1000 } : {}) }
    const name = artifactName(kind, run.head_sha, run.run_attempt, number)
    const zip = join(root, `${run.id}.zip`)
    const html = kind === 'preview' ? `<html><head><meta http-equiv="Content-Security-Policy" content="script-src 'self'; connect-src 'none'"><meta name="robots" content="noindex"><meta name="ksp-preview-pr" content="${number}"></head><body>new preview ${number}</body></html>` : 'new production'
    execFileSync('python3', ['-c', 'import sys,zipfile,json\nwith zipfile.ZipFile(sys.argv[1],"w",zipfile.ZIP_DEFLATED) as z:\n z.writestr("build.json",sys.argv[2])\n z.writestr("site/index.html",sys.argv[3])\n z.writestr("site/assets/app.js","console.log(1)")', zip, JSON.stringify(build), html])
    archives.set(run.id, readFileSync(zip))
    artifacts.set(run.id, options.expiredRunId === run.id ? [] : [{ id: run.id, name, expired: false, size_in_bytes: 1024 }])
  }
  const rest = {
    repos: {
      get: async () => ({ data: repository }),
      getBranch: async () => ({ data: { commit: { sha: branchReads++ && options.freshMain ? options.freshMain : sha('f') } } }),
    },
    pulls: { list() {}, get: async ({ pull_number }) => ({ data: freshPulls.find(item => item.number === pull_number) ?? { ...pr(pull_number), state: 'closed' } }) },
    actions: {
      getWorkflow: async ({ workflow_id }) => ({ data: { id: workflow_id === 'deploy-pages.yml' ? 10 : 20 } }),
      listWorkflowRuns() {}, listWorkflowRunArtifacts() {},
      downloadArtifact: async ({ artifact_id }) => { calls.downloaded.push(artifact_id); return { data: archives.get(artifact_id) } },
    },
    issues: {
      listComments() {},
      createComment: async input => {
        calls.created.push(input)
        const value = { id: calls.created.length, body: input.body, user: { login: 'github-actions[bot]' } }
        comments.set(input.issue_number, [...(comments.get(input.issue_number) ?? []), value])
      },
      updateComment: async input => { calls.updated.push(input); for (const entries of comments.values()) for (const entry of entries) if (entry.id === input.comment_id) entry.body = input.body },
      deleteComment: async () => {},
    },
  }
  const github = { rest, paginate: async (method, args) => {
    if (method === rest.pulls.list) return structuredClone(pullReads++ ? freshPulls : pulls)
    if (method === rest.actions.listWorkflowRuns) { calls.queried.push(args); return normalized.filter(run => run.workflow_id === args.workflow_id && run.head_sha === args.head_sha) }
    if (method === rest.actions.listWorkflowRunArtifacts) return artifacts.get(args.run_id) ?? []
    if (method === rest.issues.listComments) return comments.get(args.issue_number) ?? []
    throw new Error('Unexpected GitHub API request.')
  } }
  const context = { repo: { owner: 'AntonioToni', repo: 'ksp-deltav' }, payload: options.payload ?? {} }
  const core = { setSecret() {}, setOutput: (key, value) => { outputs[key] = value },
    warning: value => calls.warnings.push(value), notice() {}, summary: { addRaw() {}, async write() {} } }
  const environment = { ...process.env, RUNNER_TEMP: root, GITHUB_REF: options.ref ?? 'refs/heads/main', PAGES_GIT_TOKEN: 'test-token-not-a-secret' }
  const executeFileSync = (command, args, settings) => {
    if (command !== 'git') return execFileSync(command, args, settings)
    calls.git.push(args)
    if (args[0] === 'init' && previous) cpSync(durable, settings.cwd, { recursive: true })
    if (args[0] === 'ls-remote' && !previous) throw Object.assign(new Error('No state branch yet'), { status: 2 })
    return args[0] === 'status' ? ' M .pages-state.json' : ''
  }
  const dependencies = { environment, executeFileSync }
  const api = { github, context, core }
  return { root, calls, outputs, comments, api, dependencies, run: () => reconcile(api, dependencies),
    report: () => JSON.parse(readFileSync(join(root, 'pages-report.json'), 'utf8')) }
}

describe('trusted publisher orchestration with real archive validation', () => {
  it('reconciles production and all active previews, then confirms a single comment after deployment', async test => {
    const fixtureState = fixture(test)
    await fixtureState.run()
    assert.equal(fixtureState.outputs.publish, 'true')
    const site = fixtureState.outputs.site
    assert.equal(readFileSync(join(site, 'index.html'), 'utf8'), 'new production')
    assert.match(readFileSync(join(site, 'previews/pr-24/index.html'), 'utf8'), /new preview 24/)
    assert.match(readFileSync(join(site, 'previews/pr-25/index.html'), 'utf8'), /new preview 25/)
    assert.deepEqual(fixtureState.calls.downloaded, [100, 200, 201])
    assert.ok(fixtureState.calls.created.every(item => !item.body.includes('Published successfully')))
    await finish(fixtureState.api, 'success', fixtureState.dependencies)
    assert.equal(fixtureState.calls.created.length, 2)
    assert.equal(fixtureState.calls.updated.length, 2)
    assert.ok(fixtureState.calls.updated.every(item => item.body.includes('Published successfully')))
    assert.ok(fixtureState.calls.git.filter(args => args[0] === 'checkout').every(args => args[2] === 'pages-state'))
    assert.ok(fixtureState.calls.git.filter(args => args[0] === 'push').every(args => args.at(-1) === 'HEAD:refs/heads/pages-state'))
  })

  it('never queries or downloads fork preview code', async test => {
    const fork = { ...pr(26, 'd'), head: { ...pr(26, 'd').head, repo: { id: 999, full_name: 'untrusted/fork' } } }
    const state = fixture(test, { pulls: [pr(24), fork] })
    await state.run()
    assert.ok(state.calls.queried.every(query => query.head_sha !== fork.head.sha))
    assert.equal(state.report().entries.find(entry => entry.number === 26).trusted, false)
    assert.ok(state.calls.created.find(comment => comment.issue_number === 26).body.includes('Fork code is never hosted'))
  })

  it('discards a downloaded preview if the authoritative head changes or the PR closes', async test => {
    for (const freshPulls of [[pr(24, 'd')], []]) {
      const state = fixture(test, { pulls: [pr(24)], freshPulls })
      await state.run()
      assert.throws(() => readFileSync(join(state.outputs.site, 'previews/pr-24/index.html')), { code: 'ENOENT' })
      assert.equal(readFileSync(join(state.outputs.site, 'index.html'), 'utf8'), 'new production')
      const entry = state.report().entries[0]
      assert.equal(freshPulls.length ? entry.status : entry.closed, freshPulls.length ? 'waiting' : true)
    }
  })

  it('preserves the production root when a main head changes during retrieval', async test => {
    const state = fixture(test, { pulls: [], freshMain: sha('e'), previous: { schema: 1, production: production(90), previews: {} } })
    await state.run()
    assert.equal(readFileSync(join(state.outputs.site, 'index.html'), 'utf8'), 'old production')
    assert.equal(state.report().publish, true)
  })

  it('rejects mismatched metadata while retaining an existing preview and production', async test => {
    const state = fixture(test, { pulls: [pr(24)], invalidRunId: 200,
      previous: { schema: 1, production: production(), previews: { 24: snapshot('d', 150) } } })
    await state.run()
    assert.equal(state.calls.warnings.length, 1)
    assert.equal(state.report().entries[0].status, 'invalid')
    assert.equal(readFileSync(join(state.outputs.site, 'previews/pr-24/index.html'), 'utf8'), 'old preview 24')
    assert.equal(readFileSync(join(state.outputs.site, 'index.html'), 'utf8'), 'old production')
    await finish(state.api, 'failure', state.dependencies)
    assert.ok(state.calls.updated[0].body.includes('Deployment failed'))
    assert.ok(!state.calls.updated[0].body.includes('Published successfully'))
  })

  it('refuses a preview-only bootstrap when production artifacts are unavailable', async test => {
    const state = fixture(test, { pulls: [pr(24)], expiredRunId: 100 })
    await state.run()
    assert.equal(state.outputs.publish, 'false')
    assert.ok(state.calls.git.every(args => args[0] !== 'push'))
    assert.ok(state.calls.created[0].body.includes('first validated production build'))
  })

  it('preserves existing site files when the latest preview build fails', async test => {
    const state = fixture(test, { pulls: [pr(24)], previous: { schema: 1, production: production(), previews: { 24: snapshot('d', 150) } },
      runs: [{ id: 200, head_sha: sha('a'), head_branch: 'feat/pr-24', event: 'pull_request', workflow_id: 20, conclusion: 'failure' }] })
    await state.run()
    assert.deepEqual(state.calls.downloaded, [])
    assert.equal(state.report().entries[0].status, 'failed')
    assert.equal(readFileSync(join(state.outputs.site, 'index.html'), 'utf8'), 'old production')
    assert.equal(readFileSync(join(state.outputs.site, 'previews/pr-24/index.html'), 'utf8'), 'old preview 24')
    await finish(state.api, 'success', state.dependencies)
    assert.ok(state.calls.updated[0].body.includes('Latest preview build failed'))
  })

  it('cleans closed previews while retaining production and another active preview', async test => {
    const state = fixture(test, { pulls: [pr(25, 'b')], previous: { schema: 1, production: production(), previews: { 24: snapshot('a', 150), 25: snapshot('b', 201) } },
      payload: { pull_request: { number: 24, state: 'closed' } } })
    await state.run()
    assert.throws(() => readFileSync(join(state.outputs.site, 'previews/pr-24/index.html')), { code: 'ENOENT' })
    assert.equal(readFileSync(join(state.outputs.site, 'previews/pr-25/index.html'), 'utf8'), 'old preview 25')
    assert.equal(readFileSync(join(state.outputs.site, 'index.html'), 'utf8'), 'old production')
    assert.ok(state.calls.created.find(item => item.issue_number === 24).body.includes('removal is pending'))
    await finish(state.api, 'success', state.dependencies)
    assert.ok(state.calls.updated.find(item => item.body.includes('Removed:')))
  })

  it('reports an expired current-head artifact without deleting an older active preview', async test => {
    const state = fixture(test, { pulls: [pr(24)], expiredRunId: 200,
      previous: { schema: 1, production: production(), previews: { 24: snapshot('d', 150) } } })
    await state.run()
    assert.equal(state.report().entries[0].status, 'unavailable')
    assert.equal(readFileSync(join(state.outputs.site, 'previews/pr-24/index.html'), 'utf8'), 'old preview 24')
    await finish(state.api, 'success', state.dependencies)
    assert.ok(state.calls.updated[0].body.includes('unavailable or expired'))
  })

  it('rejects manual dispatch from a feature ref before opening deployment state', async test => {
    const state = fixture(test, { ref: 'refs/heads/feat/unreviewed' })
    await assert.rejects(state.run(), /trusted main workflow/)
    assert.equal(state.calls.git.length, 0)
  })
})

describe('single bot-owned preview comment', () => {
  it('paginates and updates only the marker comment owned by github-actions', async () => {
    const updates = []
    const deletions = []
    const comments = [
      { id: 1, user: { login: 'a-person' }, body: PREVIEW_COMMENT_MARKER },
      { id: 2, user: { login: 'github-actions[bot]' }, body: 'another action' },
      { id: 3, user: { login: 'github-actions[bot]' }, body: PREVIEW_COMMENT_MARKER },
      { id: 4, user: { login: 'github-actions[bot]' }, body: PREVIEW_COMMENT_MARKER },
    ]
    const github = { paginate: async () => comments, rest: { issues: {
      listComments() {}, updateComment: async input => updates.push(input), deleteComment: async input => deletions.push(input),
      createComment: async () => { throw new Error('Must update existing marker') },
    } } }
    await upsertComment(github, { owner: 'AntonioToni', repo: 'ksp-deltav' }, { number: 24, trusted: true, status: 'building' }, 'deploying')
    assert.equal(updates[0].comment_id, 3)
    assert.equal(deletions[0].comment_id, 4)
  })
})
