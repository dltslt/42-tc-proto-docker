// Helpers for the HTTP tests: build the API-only server, start it on a throwaway database, stop it again.
// Runs in Node inside the container (called from global-setup.ts).
import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { databaseUrl } from '../layers/core/server/db/client'

export const TEST_PORT = 3902 // 3000 + 902: next to the dev port 3102, never mapped to the host
export const TEST_DB = 'proto_run_102_http'

const root = fileURLToPath(new URL('..', import.meta.url))
const entry = `${root}tests/server-app/.output/server/index.mjs`

// Newest modification time under a folder, ignoring build output and dependencies.
function newestChange(dir: string): number {
  let newest = 0
  for (const name of readdirSync(dir, { recursive: true, encoding: 'utf8' })) {
    if (/(^|\/)(node_modules|\.output|\.nitro|tests)(\/|$)/.test(name)) continue
    const stat = statSync(`${dir}/${name}`)
    if (stat.isFile()) newest = Math.max(newest, stat.mtimeMs)
  }
  return newest
}

// Rebuild only when a source file is newer than the last build (a build takes about 20 seconds).
// `variant` builds the app with only some layers into its own folder (see removal.test.ts); the default is all of them.
export interface Variant { layers?: string[]; name?: string; port?: number }
const entryOf = (v: Variant) => (v.name ? `${root}tests/server-app/.output-${v.name}/server/index.mjs` : entry)

export function ensureBuilt(variant: Variant = {}): void {
  const entry = entryOf(variant)
  const sources = Math.max(newestChange(`${root}layers`), statSync(`${root}tests/server-app/nitro.config.ts`).mtimeMs, statSync(`${root}package.json`).mtimeMs)
  if (existsSync(entry) && statSync(entry).mtimeMs > sources) return
  const env = variant.layers ? { ...process.env, LAYERS: variant.layers.join(','), OUT_DIR: `${root}tests/server-app/.output-${variant.name}` } : process.env
  const build = spawnSync('pnpm', ['exec', 'nitro', 'build', 'tests/server-app'], { cwd: root, encoding: 'utf8', env })
  if (build.status !== 0) throw new Error(`Building the test server failed:\n${build.stdout}\n${build.stderr}`)
}

// A fresh empty database. `drop ... with (force)` also closes any connection a crashed run left behind.
export async function recreateDatabase(name: string): Promise<void> {
  const admin = new pg.Client({ connectionString: databaseUrl('postgres') })
  await admin.connect()
  try {
    await admin.query(`drop database if exists ${name} with (force)`)
    await admin.query(`create database ${name}`)
  } finally {
    await admin.end()
  }
}

export async function dropDatabase(name: string): Promise<void> {
  const admin = new pg.Client({ connectionString: databaseUrl('postgres') })
  await admin.connect()
  try {
    await admin.query(`drop database if exists ${name} with (force)`)
  } finally {
    await admin.end()
  }
}

export async function startServer(dbName: string, variant: Variant = {}): Promise<ChildProcess> {
  const port = variant.port ?? TEST_PORT
  const entry = entryOf(variant)
  const url = `http://localhost:${port}/api/v1/health`
  if (await fetch(url).then((r) => r.ok, () => false)) {
    throw new Error(`Port ${port} is already in use: is another test run still going?`)
  }
  const child = spawn('node', [entry], { env: { ...process.env, PORT: String(port), DB_NAME: dbName }, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  child.stdout.on('data', (d) => (log += d))
  child.stderr.on('data', (d) => (log += d))
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw new Error(`The test server exited early:\n${log}`)
    if (await fetch(url).then((r) => r.ok, () => false)) return child
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
  child.kill()
  throw new Error(`The test server did not answer in 10 seconds:\n${log}`)
}

export async function stopServer(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null) return
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => child.kill('SIGKILL'), 3000).unref()
  })
}
