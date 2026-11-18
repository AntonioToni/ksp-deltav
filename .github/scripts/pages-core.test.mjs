import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  artifactName, canAdvance, eligibleRun, positiveInteger, PREVIEW_COMMENT_MARKER,
  previewComment, runStatus, trustedPullRequest, verifyBuild,
} from './pages-core.mjs'

const sha = character => character.repeat(40)
const repository = { id: 101, full_name: 'AntonioToni/ksp-deltav', default_branch: 'main' }
const pullRequest = () => ({
  number: 24, state: 'open',
  base: { ref: 'main', repo: { id: repository.id } },
  head: { sha: sha('a'), ref: 'feat/example', repo: { id: repository.id, full_name: repository.full_name } },
})
const target = { kind: 'preview', number: 24, sha: sha('a'), branch: 'feat/example' }
const run = () => ({
  workflow_id: 50, head_repository: { id: repository.id, full_name: repository.full_name },
  head_sha: target.sha, head_branch: target.branch, event: 'pull_request',
  id: 500, run_attempt: 2, status: 'completed', conclusion: 'success',
})
const build = () => ({
  schema: 1, kind: 'preview', prNumber: 24, sourceSha: target.sha,
  runId: 500, runAttempt: 2, mergeSha: sha('b'), baseSha: sha('c'),
  basePath: '/ksp-deltav/previews/pr-24/',
})

describe('trusted Pages source and build identities', () => {
  it('accepts only positive safe integer identifiers', () => {
    for (const valid of [1, 24, Number.MAX_SAFE_INTEGER]) assert.equal(positiveInteger(valid), true)
    for (const invalid of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, true, '24', null]) assert.equal(positiveInteger(invalid), false)
  })

  it('accepts an open same-repository PR targeting main and rejects forks and other targets', () => {
    assert.equal(trustedPullRequest(pullRequest(), repository), true)
    const variants = [
      { state: 'closed' }, { number: 0 },
      { base: { ref: 'another-feature', repo: { id: repository.id } } },
      { base: { ref: 'main', repo: { id: 999 } } },
      { head: { ...pullRequest().head, sha: 'unverified' } },
      { head: { ...pullRequest().head, repo: { id: 999, full_name: 'fork/ksp-deltav' } } },
      { head: { ...pullRequest().head, repo: { id: repository.id, full_name: 'fork/ksp-deltav' } } },
      { head: { ...pullRequest().head, repo: null } },
    ]
    for (const change of variants) assert.equal(trustedPullRequest({ ...pullRequest(), ...change }, repository), false)
  })

  it('binds an API run to the actual workflow, repository, source head, branch and event', () => {
    assert.equal(eligibleRun(run(), 50, repository, target), true)
    // The API can omit pull_requests; it is not a provenance requirement.
    assert.equal(eligibleRun({ ...run(), pull_requests: [] }, 50, repository, target), true)
    for (const change of [
      { workflow_id: 51 }, { head_sha: sha('d') }, { head_branch: 'another-branch' },
      { event: 'pull_request_target' }, { event: 'workflow_dispatch' },
      { id: 0 }, { run_attempt: 0 }, { run_attempt: '2' },
      { head_repository: { id: 999, full_name: repository.full_name } },
      { head_repository: { id: repository.id, full_name: 'fork/ksp-deltav' } },
    ]) assert.equal(eligibleRun({ ...run(), ...change }, 50, repository, target), false)
  })

  it('allows production push/manual runs only for the verified main source', () => {
    const production = { kind: 'production', sha: sha('e'), branch: 'main' }
    const mainRun = { ...run(), head_sha: production.sha, head_branch: 'main' }
    assert.equal(eligibleRun({ ...mainRun, event: 'push' }, 50, repository, production), true)
    assert.equal(eligibleRun({ ...mainRun, event: 'workflow_dispatch' }, 50, repository, production), true)
    assert.equal(eligibleRun({ ...mainRun, event: 'pull_request' }, 50, repository, production), false)
    assert.equal(eligibleRun({ ...mainRun, event: 'push', head_branch: 'feature' }, 50, repository, production), false)
  })

  it('uses immutable artifact names containing the source and rerun attempt', () => {
    assert.equal(artifactName('preview', target.sha, 2, 24), `preview-site-pr-24-${target.sha}-2`)
    assert.equal(artifactName('production', target.sha, 3), `production-site-${target.sha}-3`)
    for (const args of [['preview', 'bad', 2, 24], ['preview', target.sha, 0, 24], ['preview', target.sha, 1, 0]]) assert.throws(() => artifactName(...args), /Invalid artifact identity/)
  })

  it('does not trust artifact-supplied PR, path, SHA or run identity', () => {
    assert.doesNotThrow(() => verifyBuild(build(), run(), target))
    for (const change of [
      { schema: 2 }, { kind: 'production' }, { prNumber: 25 }, { sourceSha: sha('d') },
      { runId: 499 }, { runAttempt: 1 }, { basePath: '/ksp-deltav/' },
      { basePath: '/ksp-deltav/previews/pr-25/' }, { mergeSha: 'bad' }, { baseSha: 'bad' },
    ]) assert.throws(() => verifyBuild({ ...build(), ...change }, run(), target), /does not match/)
  })
})

describe('out-of-order completion and preview status', () => {
  it('rejects older runs and earlier attempts for the current source', () => {
    const previous = { sourceSha: sha('a'), runId: 500, runAttempt: 2 }
    assert.equal(canAdvance(previous, { ...previous, runId: 499, runAttempt: 10 }, sha('a')), false)
    assert.equal(canAdvance(previous, { ...previous, runAttempt: 1 }, sha('a')), false)
    assert.equal(canAdvance(previous, previous, sha('a')), false)
    assert.equal(canAdvance(previous, { ...previous, runAttempt: 3 }, sha('a')), true)
    assert.equal(canAdvance(previous, { ...previous, runId: 501, runAttempt: 1 }, sha('a')), true)
    assert.equal(canAdvance(previous, { sourceSha: sha('b'), runId: 900, runAttempt: 1 }, sha('a')), false)
  })

  it('uses the authoritative current head after a deliberate branch reset', () => {
    const previous = { sourceSha: sha('b'), runId: 500, runAttempt: 1 }
    const candidate = { sourceSha: sha('a'), runId: 490, runAttempt: 1 }
    assert.equal(canAdvance(previous, candidate, sha('a')), true)
    assert.equal(canAdvance(previous, candidate, sha('b')), false)
  })

  it('distinguishes pending, running, cancelled, failed and successful builds', () => {
    assert.equal(runStatus(null), 'waiting')
    assert.equal(runStatus({ status: 'in_progress' }), 'building')
    assert.equal(runStatus({ status: 'queued' }), 'building')
    assert.equal(runStatus(run()), 'ready')
    assert.equal(runStatus({ ...run(), conclusion: 'failure' }), 'failed')
    assert.equal(runStatus({ ...run(), conclusion: 'cancelled' }), 'cancelled')
  })

  it('claims publication only after deployment succeeds and preserves the single-comment marker', () => {
    const entry = { number: 24, trusted: true, headSha: target.sha, status: 'ready', snapshot: build() }
    const published = previewComment(entry, 'success')
    assert.match(published, /Published successfully/)
    assert.match(published, /https:\/\/antoniotoni.github.io\/ksp-deltav\/previews\/pr-24\//)
    for (const deployment of ['failure', 'waiting', 'deploying', undefined]) {
      const comment = previewComment(entry, deployment)
      assert.equal(comment.split(PREVIEW_COMMENT_MARKER).length - 1, 1)
      assert.doesNotMatch(comment, /Published successfully/)
    }
  })

  it('identifies stale retained previews and never publishes fork or closed PR URLs', () => {
    const entry = { number: 24, trusted: true, headSha: sha('d'), status: 'failed', snapshot: build() }
    const retained = previewComment(entry, 'success')
    assert.match(retained, /Latest preview build failed/)
    assert.match(retained, /previous validated preview is retained/)
    assert.match(retained, /Published commit: `aaaaaaaaaaaa`/)
    assert.doesNotMatch(retained, /Published successfully/)
    assert.match(previewComment({ ...entry, status: 'building' }, 'success'), /previous validated build/)
    assert.doesNotMatch(previewComment({ ...entry, trusted: false }, 'success'), /\]\(https:/)
    assert.match(previewComment({ ...entry, closed: true }, 'success'), /Removed:/)
  })
})
