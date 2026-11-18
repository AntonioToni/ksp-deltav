export const SITE_BASE = '/ksp-deltav/'
export const PREVIEW_COMMENT_MARKER = '<!-- ksp-deltav-pages-preview -->'
export const STATE_BRANCH = 'pages-state'
export const SHA = /^[a-f0-9]{40}$/i

export function positiveInteger(value) {
  return Number.isSafeInteger(value) && value > 0
}

export function trustedPullRequest(pr, repository) {
  return pr.state === 'open' && pr.base?.ref === repository.default_branch
    && pr.base?.repo?.id === repository.id && pr.head?.repo?.id === repository.id
    && pr.head.repo.full_name?.toLowerCase() === repository.full_name.toLowerCase()
    && positiveInteger(pr.number) && SHA.test(pr.head.sha) && typeof pr.head.ref === 'string'
}

/** Workflow/run identity comes from the GitHub API, never from PR files. */
export function eligibleRun(run, workflowId, repository, target) {
  return run.workflow_id === workflowId && run.head_repository?.id === repository.id
    && run.head_repository.full_name?.toLowerCase() === repository.full_name.toLowerCase()
    && run.head_sha === target.sha && run.head_branch === target.branch
    && (target.kind === 'preview' ? run.event === 'pull_request' : ['push', 'workflow_dispatch'].includes(run.event))
    && positiveInteger(run.id) && positiveInteger(run.run_attempt)
}

export function artifactName(kind, sha, attempt, prNumber) {
  if (!['preview', 'production'].includes(kind) || !SHA.test(sha) || !positiveInteger(attempt) || kind === 'preview' && !positiveInteger(prNumber)) throw new Error('Invalid artifact identity.')
  return `${kind === 'preview' ? `preview-site-pr-${prNumber}` : 'production-site'}-${sha}-${attempt}`
}

export function verifyBuild(build, run, target) {
  if (build.schema !== 1 || build.kind !== target.kind || build.sourceSha !== target.sha
    || build.runId !== run.id || build.runAttempt !== run.run_attempt
    || build.basePath !== (target.kind === 'preview' ? `${SITE_BASE}previews/pr-${target.number}/` : SITE_BASE)
    || target.kind === 'preview' && (build.prNumber !== target.number || !SHA.test(build.mergeSha) || !SHA.test(build.baseSha))) {
    throw new Error('Build metadata does not match the verified workflow, run, attempt and source head.')
  }
}

/** A delayed completion must not roll back a newer snapshot for the same head.
 * A deliberate new current head is authoritative, including a branch reset. */
export function canAdvance(previous, candidate, currentSha) {
  return candidate.sourceSha === currentSha && (!previous || previous.sourceSha !== currentSha
    || candidate.runId > previous.runId || candidate.runId === previous.runId && candidate.runAttempt > previous.runAttempt)
}

export function runStatus(run) {
  if (!run) return 'waiting'
  if (run.status !== 'completed') return 'building'
  return run.conclusion === 'success' ? 'ready' : run.conclusion === 'cancelled' ? 'cancelled' : 'failed'
}

export function previewComment(entry, deployment) {
  const url = `https://antoniotoni.github.io${SITE_BASE}previews/pr-${entry.number}/`
  const lines = [PREVIEW_COMMENT_MARKER, '### GitHub Pages preview', '']
  if (entry.closed || entry.cleanupPending) return [...lines, `[Preview · PR #${entry.number}](${url})`, '',
    entry.cleanupPending ? 'This PR is closed; preview removal is queued for the next consolidated deployment.'
      : deployment === 'success' ? 'Removed: this pull request is closed or no longer targets the production branch.'
        : deployment === 'failure' ? 'Preview removal failed to deploy; the previous URL may still be available.'
          : 'Preview removal is pending deployment.'].join('\n')
  if (!entry.trusted) return [...lines, 'Not published: previews are restricted to branches in this repository. Fork code is never hosted on the production origin.'].join('\n')
  lines.push(`[Preview · PR #${entry.number}](${url})`, '')
  if (deployment === 'failure') lines.push('Deployment failed or could not be confirmed. This URL may still show an earlier build.')
  else if (deployment === 'waiting') lines.push('Waiting for the first validated production build. Production must exist before previews can be published.')
  else if (deployment === 'deploying') lines.push('Deploying the consolidated production and preview site…')
  else if (entry.status === 'unavailable') lines.push(`The validated build artifact is unavailable or expired; rerun the preview build.${entry.snapshot ? ' The previous validated preview is retained.' : ' No validated preview is available yet.'}`)
  else if (entry.status === 'failed' || entry.status === 'invalid' || entry.status === 'cancelled') lines.push(`Latest preview build ${entry.status === 'invalid' ? 'failed validation' : entry.status}.${entry.snapshot ? ' The previous validated preview is retained.' : ' No validated preview is available yet.'}`)
  else if (deployment === 'success' && entry.snapshot?.sourceSha === entry.headSha && entry.status === 'ready') lines.push('Published successfully.')
  else lines.push(`Preview build ${entry.status === 'building' ? 'is running' : 'is pending'}.${entry.snapshot ? ' This URL currently shows the previous validated build.' : ' The URL will become available after validation and deployment.'}`)
  if (entry.snapshot && deployment === 'success') lines.push('', `Published commit: \`${entry.snapshot.sourceSha.slice(0, 12)}\` · [build run](https://github.com/AntonioToni/ksp-deltav/actions/runs/${entry.snapshot.runId}).`)
  lines.push('', 'Preview builds are not production. They are not indexed, do not send analytics, and use separate app preference keys.')
  return lines.join('\n')
}
