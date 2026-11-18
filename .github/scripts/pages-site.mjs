import { cp, lstat, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { canAdvance, positiveInteger, SHA } from './pages-core.mjs'

export const MAX_SITE_BYTES = 750 * 1024 * 1024
export const MAX_SITE_FILES = 50_000
export const MANIFEST_FILE = '.pages-state.json'
export const emptyManifest = () => ({ schema: 1, production: null, previews: {} })

export async function readManifest(root) {
  let value
  try {
    if (!(await lstat(join(root, MANIFEST_FILE))).isFile()) throw new Error('Durable Pages manifest must be a regular file.')
    value = JSON.parse(await readFile(join(root, MANIFEST_FILE), 'utf8'))
  }
  catch (error) { if (error.code === 'ENOENT') return emptyManifest(); throw error }
  if (value.schema !== 1 || !value.previews || typeof value.previews !== 'object' || Array.isArray(value.previews)) throw new Error('Invalid durable Pages manifest.')
  const valid = record => record && SHA.test(record.sourceSha) && positiveInteger(record.runId) && positiveInteger(record.runAttempt)
  if (value.production !== null && !valid(value.production) || Object.entries(value.previews).some(([key, record]) => !/^[1-9]\d*$/.test(key) || !positiveInteger(Number(key)) || !valid(record))) throw new Error('Invalid durable Pages build identity.')
  return value
}

/** Reject links and git-control files before any privileged git add/copy. */
export async function inspectSite(root, maxBytes = MAX_SITE_BYTES, maxFiles = MAX_SITE_FILES) {
  let bytes = 0
  let files = 0
  async function visit(directory, top = false) {
    for (const item of await readdir(directory)) {
      if (top && ['.git', MANIFEST_FILE].includes(item)) continue
      if (item.toLowerCase().startsWith('.git') || item.toLowerCase() === 'cname') throw new Error('Reserved control file in Pages snapshot.')
      const path = join(directory, item)
      const stat = await lstat(path)
      if (stat.isDirectory()) await visit(path)
      else if (stat.isFile()) { bytes += stat.size; files++ }
      else throw new Error('Pages snapshot contains a link or special file.')
      if (bytes > maxBytes || files > maxFiles) throw new Error('Combined Pages site exceeds its safe size/file limit; close unused previews before retrying.')
    }
  }
  await visit(root, true)
  return { bytes, files }
}

const snapshotRecord = build => Object.fromEntries(Object.entries(build).filter(([key]) => ['sourceSha', 'runId', 'runAttempt', 'baseSha', 'mergeSha'].includes(key)))

/** Work on an unpublished temporary state checkout. Failure never changes the
 * live site or the durable branch. Production replacements retain previews. */
export async function composeSite(root, { mainSha, activeNumbers, production, previews }) {
  if (!SHA.test(mainSha) || activeNumbers.some(number => !positiveInteger(number))) throw new Error('Invalid current Pages target identities.')
  await mkdir(root, { recursive: true })
  const previous = await readManifest(root)
  await inspectSite(root)
  const next = structuredClone(previous)
  if (production && canAdvance(previous.production, production.build, mainSha)) {
    for (const item of await readdir(root)) if (!['.git', MANIFEST_FILE, 'previews'].includes(item)) await rm(join(root, item), { recursive: true, force: true })
    await cp(production.site, root, { recursive: true, force: true })
    next.production = snapshotRecord(production.build)
  }
  const active = new Set(activeNumbers.map(String))
  for (const [number, candidate] of previews) if (active.has(String(number)) && canAdvance(previous.previews[number], candidate.build, candidate.build.sourceSha)) {
    const destination = join(root, 'previews', `pr-${number}`)
    await rm(destination, { recursive: true, force: true })
    await mkdir(destination, { recursive: true })
    await cp(candidate.site, destination, { recursive: true, force: true })
    next.previews[number] = snapshotRecord(candidate.build)
  }
  const removed = []
  const previewRoot = join(root, 'previews')
  await mkdir(previewRoot, { recursive: true })
  for (const item of await readdir(previewRoot)) {
    const match = /^pr-([1-9]\d*)$/.exec(item)
    if (!match) throw new Error('Unexpected directory in the reserved previews tree.')
    if (!active.has(match[1])) { await rm(join(previewRoot, item), { recursive: true, force: true }); removed.push(Number(match[1])) }
  }
  for (const number of Object.keys(next.previews)) if (!active.has(number)) delete next.previews[number]
  // Bootstrap only from a validated production build, never from a preview.
  if (!next.production) return { manifest: next, removed, publish: false }
  if (!(await lstat(join(root, 'index.html'))).isFile()) throw new Error('Production root is missing.')
  const size = await inspectSite(root)
  await writeFile(join(root, MANIFEST_FILE), `${JSON.stringify(next, null, 2)}\n`)
  return { manifest: next, removed, publish: true, ...size }
}

export async function exportSite(root, destination) {
  await inspectSite(root)
  await mkdir(destination, { recursive: true })
  for (const item of await readdir(root)) if (!['.git', MANIFEST_FILE].includes(item)) await cp(join(root, item), join(destination, item), { recursive: true })
}
