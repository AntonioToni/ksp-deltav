import { execFileSync } from 'node:child_process'
import { cp, mkdir, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { artifactName, positiveInteger, SHA, SITE_BASE } from './pages-core.mjs'

const kind = process.argv[2]
if (!['production', 'preview'].includes(kind)) throw new Error('Choose production or preview.')
const sourceSha = process.env.PAGES_SOURCE_SHA
const runId = Number(process.env.GITHUB_RUN_ID)
const runAttempt = Number(process.env.GITHUB_RUN_ATTEMPT)
if (!SHA.test(sourceSha ?? '') || !positiveInteger(runId) || !positiveInteger(runAttempt)) throw new Error('Missing verified build identity.')
const head = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
const build = { schema: 1, kind, sourceSha, runId, runAttempt, basePath: SITE_BASE }
if (kind === 'preview') {
  const prNumber = Number(process.env.PAGES_PR_NUMBER)
  const parents = execFileSync('git', ['cat-file', '-p', 'HEAD'], { encoding: 'utf8' }).split('\n\n', 1)[0].split('\n').filter(line => line.startsWith('parent ')).map(line => line.slice(7))
  if (!positiveInteger(prNumber) || parents.length !== 2 || parents[1] !== sourceSha || !parents.every(parent => SHA.test(parent))) throw new Error('Preview must build the verified PR merge commit, including its current source head.')
  Object.assign(build, { prNumber, mergeSha: head, baseSha: parents[0], basePath: `${SITE_BASE}previews/pr-${prNumber}/` })
} else if (head !== sourceSha) throw new Error('Production must build the current main commit.')
const destination = resolve('pages-build-artifact')
await rm(destination, { recursive: true, force: true })
await mkdir(destination)
await cp(resolve('dist'), resolve(destination, 'site'), { recursive: true, dereference: false })
await writeFile(resolve(destination, 'build.json'), `${JSON.stringify(build, null, 2)}\n`)
console.log(`Prepared ${artifactName(kind, sourceSha, runAttempt, build.prNumber)}`)
