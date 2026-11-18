import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { it } from 'node:test'

const script = fileURLToPath(new URL('./pages-build.mjs', import.meta.url))

function repositoryFixture(test) {
  const directory = mkdtempSync(join(tmpdir(), 'pages-build-test-'))
  test.after(() => rmSync(directory, { recursive: true, force: true }))
  const git = (...args) => execFileSync('git', args, { cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  git('init', '--initial-branch=main')
  git('config', 'user.name', 'Build fixture')
  git('config', 'user.email', 'fixture@example.invalid')
  git('config', 'core.hooksPath', '/dev/null')
  writeFileSync(join(directory, 'initial.txt'), 'base')
  git('add', '.'); git('commit', '-m', 'Initial fixture')
  const initial = git('rev-parse', 'HEAD')
  mkdirSync(join(directory, 'dist'))
  writeFileSync(join(directory, 'dist/index.html'), 'built static site')
  const build = (kind, sourceSha, additions = {}) => execFileSync(process.execPath, [script, kind], {
    cwd: directory, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, GITHUB_RUN_ID: '12345', GITHUB_RUN_ATTEMPT: '2', PAGES_SOURCE_SHA: sourceSha, PAGES_PR_NUMBER: '24', ...additions },
  })
  const manifest = () => JSON.parse(readFileSync(join(directory, 'pages-build-artifact/build.json'), 'utf8'))
  return { directory, git, build, initial, manifest }
}

it('packages production only from its checked-out source and binds the run attempt', test => {
  const fixture = repositoryFixture(test)
  fixture.build('production', fixture.initial)
  assert.deepEqual(fixture.manifest(), { schema: 1, kind: 'production', sourceSha: fixture.initial,
    runId: 12345, runAttempt: 2, basePath: '/ksp-deltav/' })
  assert.equal(readFileSync(join(fixture.directory, 'pages-build-artifact/site/index.html'), 'utf8'), 'built static site')
  assert.throws(() => fixture.build('production', 'f'.repeat(40)), /current main commit/)
})

it('requires the tested PR merge commit and records both source head and base', test => {
  const fixture = repositoryFixture(test)
  fixture.git('checkout', '-b', 'feature')
  writeFileSync(join(fixture.directory, 'feature.txt'), 'feature')
  fixture.git('add', 'feature.txt'); fixture.git('commit', '-m', 'Feature')
  const head = fixture.git('rev-parse', 'HEAD')
  assert.throws(() => fixture.build('preview', head), /verified PR merge commit/)
  fixture.git('checkout', 'main')
  writeFileSync(join(fixture.directory, 'base-change.txt'), 'new main infrastructure')
  fixture.git('add', 'base-change.txt'); fixture.git('commit', '-m', 'Main infrastructure')
  const base = fixture.git('rev-parse', 'HEAD')
  fixture.git('merge', '--no-ff', 'feature', '-m', 'Synthetic PR merge')
  fixture.build('preview', head)
  assert.deepEqual(fixture.manifest(), { schema: 1, kind: 'preview', sourceSha: head,
    runId: 12345, runAttempt: 2, basePath: '/ksp-deltav/previews/pr-24/', prNumber: 24,
    mergeSha: fixture.git('rev-parse', 'HEAD'), baseSha: base })
  assert.throws(() => fixture.build('preview', fixture.initial), /verified PR merge commit/)
  assert.throws(() => fixture.build('preview', head, { PAGES_PR_NUMBER: '0' }), /verified PR merge commit/)
})

it('does not interpret commit-message text as parent headers', test => {
  const fixture = repositoryFixture(test)
  writeFileSync(join(fixture.directory, 'next.txt'), 'next')
  fixture.git('add', 'next.txt')
  fixture.git('commit', '-m', `Message\n\nparent ${fixture.initial}`)
  assert.throws(() => fixture.build('preview', fixture.initial), /verified PR merge commit/)
})
