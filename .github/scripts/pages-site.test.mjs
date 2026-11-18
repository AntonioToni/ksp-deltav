import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import { composeSite, emptyManifest, exportSite, inspectSite, MANIFEST_FILE, readManifest } from './pages-site.mjs'

const sha = character => character.repeat(40)

async function fixture(test) {
  const directory = await mkdtemp(join(tmpdir(), 'ksp-pages-test-'))
  test.after(() => rm(directory, { recursive: true, force: true }))
  const state = join(directory, 'state')
  await mkdir(state)
  const artifact = async (name, { kind = 'preview', number = 24, sourceSha = sha('a'), runId = 100, runAttempt = 1 } = {}) => {
    const site = join(directory, name)
    await mkdir(join(site, 'assets'), { recursive: true })
    await writeFile(join(site, 'index.html'), `${name} index`)
    await writeFile(join(site, 'assets', `${name}.js`), `${name} script`)
    return { site, build: { schema: 1, kind, sourceSha, runId, runAttempt,
      ...(kind === 'preview' ? { prNumber: number, mergeSha: sha('b'), baseSha: sha('c') } : {}),
      basePath: kind === 'preview' ? `/ksp-deltav/previews/pr-${number}/` : '/ksp-deltav/' } }
  }
  const production = await artifact('production-1', { kind: 'production', sourceSha: sha('f'), runId: 10 })
  const apply = overrides => composeSite(state, { mainSha: sha('f'), activeNumbers: [24, 25], production: null, previews: new Map(), ...overrides })
  return { directory, state, artifact, production, apply }
}

const text = path => readFile(path, 'utf8')

describe('consolidated production and preview snapshots', () => {
  it('bootstraps production and two independent previews in one site', async test => {
    const { state, artifact, production, apply } = await fixture(test)
    const preview24 = await artifact('preview-24', { number: 24, runId: 20 })
    const preview25 = await artifact('preview-25', { number: 25, runId: 21, sourceSha: sha('d') })
    const result = await apply({ production, previews: new Map([[24, preview24], [25, preview25]]) })
    assert.equal(result.publish, true)
    assert.equal(await text(join(state, 'index.html')), 'production-1 index')
    assert.equal(await text(join(state, 'previews/pr-24/index.html')), 'preview-24 index')
    assert.equal(await text(join(state, 'previews/pr-25/index.html')), 'preview-25 index')
    assert.deepEqual(Object.keys(result.manifest.previews), ['24', '25'])
    assert.equal(result.manifest.production.sourceSha, sha('f'))
    assert.ok(result.bytes > 0)
    assert.equal(result.files, 6)
  })

  it('updates one preview without modifying production or another active preview', async test => {
    const { state, artifact, production, apply } = await fixture(test)
    const first24 = await artifact('old-24', { number: 24, runId: 20 })
    const first25 = await artifact('other-25', { number: 25, runId: 21 })
    await apply({ production, previews: new Map([[24, first24], [25, first25]]) })
    const next24 = await artifact('new-24', { number: 24, sourceSha: sha('e'), runId: 22 })
    await apply({ previews: new Map([[24, next24]]) })
    assert.equal(await text(join(state, 'index.html')), 'production-1 index')
    assert.equal(await text(join(state, 'previews/pr-25/index.html')), 'other-25 index')
    assert.equal(await text(join(state, 'previews/pr-24/index.html')), 'new-24 index')
    await assert.rejects(text(join(state, 'previews/pr-24/assets/old-24.js')), { code: 'ENOENT' })
  })

  it('replaces production assets while retaining every active preview', async test => {
    const { state, artifact, production, apply } = await fixture(test)
    const preview = await artifact('preview-24', { number: 24 })
    await apply({ production, previews: new Map([[24, preview]]) })
    const replacement = await artifact('production-2', { kind: 'production', sourceSha: sha('e'), runId: 30 })
    const result = await apply({ mainSha: sha('e'), production: replacement })
    assert.equal(await text(join(state, 'index.html')), 'production-2 index')
    assert.equal(await text(join(state, 'previews/pr-24/index.html')), 'preview-24 index')
    await assert.rejects(text(join(state, 'assets/production-1.js')), { code: 'ENOENT' })
    assert.equal(result.manifest.production.sourceSha, sha('e'))
  })

  it('cleans closed or merged PR directories and preserves all still-active files', async test => {
    const { state, artifact, production, apply } = await fixture(test)
    await apply({ production, previews: new Map([
      [24, await artifact('preview-24', { number: 24 })],
      [25, await artifact('preview-25', { number: 25 })],
    ]) })
    const result = await apply({ activeNumbers: [25] })
    assert.deepEqual(result.removed, [24])
    assert.deepEqual(Object.keys(result.manifest.previews), ['25'])
    await assert.rejects(text(join(state, 'previews/pr-24/index.html')), { code: 'ENOENT' })
    assert.equal(await text(join(state, 'previews/pr-25/index.html')), 'preview-25 index')
    assert.equal(await text(join(state, 'index.html')), 'production-1 index')
    assert.deepEqual((await apply({ activeNumbers: [] })).removed, [25])
    assert.equal(await text(join(state, 'index.html')), 'production-1 index')
  })

  it('keeps durable snapshots when a build failed, is missing, or its artifact expired', async test => {
    const { state, artifact, production, apply } = await fixture(test)
    await apply({ production, previews: new Map([[24, await artifact('valid-24', { number: 24 })]]) })
    const original = await readManifest(state)
    for (const unavailable of ['failed', 'missing', 'expired']) {
      const result = await apply({ production: null, previews: new Map() })
      assert.equal(result.publish, true, unavailable)
      assert.deepEqual(result.manifest, original, unavailable)
      assert.equal(await text(join(state, 'previews/pr-24/index.html')), 'valid-24 index')
      assert.equal(await text(join(state, 'index.html')), 'production-1 index')
    }
  })

  it('never bootstraps a published site from preview content alone', async test => {
    const { state, artifact, apply } = await fixture(test)
    const result = await apply({ previews: new Map([[24, await artifact('preview-only')]]) })
    assert.equal(result.publish, false)
    assert.equal(result.manifest.production, null)
    await assert.rejects(text(join(state, 'index.html')), { code: 'ENOENT' })
    await assert.rejects(text(join(state, MANIFEST_FILE)), { code: 'ENOENT' })
  })

  it('reconciles all active PRs after queued events are replaced, without out-of-order rollback', async test => {
    const { state, artifact, production, apply } = await fixture(test)
    const old24 = await artifact('old-24', { number: 24, runId: 21 })
    const old25 = await artifact('old-25', { number: 25, runId: 22 })
    await apply({ production, previews: new Map([[24, old24], [25, old25]]) })
    const current24 = await artifact('current-24', { number: 24, runId: 31 })
    const current25 = await artifact('current-25', { number: 25, runId: 32 })
    // Only the last queued publisher survives. It reconciles both active builds.
    await apply({ previews: new Map([[24, current24], [25, current25]]) })
    // The completion of an older run arrives after the newer publication.
    await apply({ previews: new Map([[24, old24], [25, old25]]) })
    assert.equal(await text(join(state, 'previews/pr-24/index.html')), 'current-24 index')
    assert.equal(await text(join(state, 'previews/pr-25/index.html')), 'current-25 index')
    assert.equal((await readManifest(state)).previews['24'].runId, 31)
    assert.equal((await readManifest(state)).previews['25'].runId, 32)
  })

  it('does not roll production back when an older build completes late', async test => {
    const { state, artifact, production, apply } = await fixture(test)
    await apply({ production })
    const newer = await artifact('new-production', { kind: 'production', sourceSha: sha('f'), runId: 20 })
    await apply({ production: newer })
    await apply({ production })
    assert.equal(await text(join(state, 'index.html')), 'new-production index')
    assert.equal((await readManifest(state)).production.runId, 20)
  })

  it('exports a retryable site without state metadata or Git internals', async test => {
    const { state, directory, production, apply } = await fixture(test)
    await apply({ production })
    await mkdir(join(state, '.git'))
    await writeFile(join(state, '.git/config'), 'not published')
    const first = join(directory, 'published-first')
    const retry = join(directory, 'published-retry')
    await exportSite(state, first)
    // Even unchanged state is publishable after a failed deployment.
    assert.equal((await apply({})).publish, true)
    await exportSite(state, retry)
    assert.equal(await text(join(retry, 'index.html')), await text(join(first, 'index.html')))
    assert.deepEqual((await readdir(retry)).sort(), ['assets', 'index.html', 'previews'])
    await assert.rejects(text(join(retry, MANIFEST_FILE)), { code: 'ENOENT' })
    await assert.rejects(text(join(retry, '.git/config')), { code: 'ENOENT' })
  })
})

describe('unpublished snapshot validation', () => {
  it('rejects malformed durable identities and unknown preview directory shapes', async test => {
    const { state, production, apply } = await fixture(test)
    assert.deepEqual(await readManifest(state), emptyManifest())
    await writeFile(join(state, MANIFEST_FILE), JSON.stringify({ schema: 1, production: { sourceSha: 'bad', runId: 1, runAttempt: 1 }, previews: {} }))
    await assert.rejects(readManifest(state), /Invalid durable/)
    await rm(join(state, MANIFEST_FILE))
    await apply({ production })
    await mkdir(join(state, 'previews/not-a-pr'))
    await assert.rejects(apply({}), /Unexpected directory/)
  })

  it('rejects symbolic links and reserved Git controls without altering a live site', async test => {
    const { state, directory } = await fixture(test)
    const live = join(directory, 'live-index.html')
    await writeFile(live, 'existing production remains live')
    await symlink(live, join(state, 'escaped.html'))
    await assert.rejects(inspectSite(state), /link or special/)
    assert.equal(await text(live), 'existing production remains live')
    await rm(join(state, 'escaped.html'))
    for (const name of ['.gitattributes', '.github', 'CNAME']) {
      await writeFile(join(state, name), 'reserved')
      await assert.rejects(inspectSite(state), /Reserved control file/)
      await rm(join(state, name))
    }
  })

  it('bounds combined snapshot bytes and file count before publishing', async test => {
    const { state, directory, production, apply } = await fixture(test)
    const live = join(directory, 'live-index.html')
    await writeFile(live, 'live production')
    await apply({ production })
    await assert.rejects(inspectSite(state, 1, 50), /safe size\/file limit/)
    await assert.rejects(inspectSite(state, 1000, 1), /safe size\/file limit/)
    assert.equal(await text(live), 'live production')
  })
})
