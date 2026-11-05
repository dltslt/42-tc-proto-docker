// Removal test: a layer can be taken away without breaking the others, unless another layer builds on it.
// Each case builds the API with fewer layers (about 20 seconds the first time, then cached) and starts it
// on its own port against the same throwaway database. The database still has the removed layer's tables;
// that is fine, because no remaining layer touches them.
import type { ChildProcess } from 'node:child_process'
import { afterAll, describe, expect, it } from 'vitest'
import { createDb, databaseUrl } from '#layers/core/server/db/client'
import { makeActor, makeColumns, makeMember, makeSpace } from '#layers/workspace/tests/builders'
import { ensureBuilt, startServer, stopServer, TEST_DB, type Variant } from './test-server'

const { db, pool } = createDb(databaseUrl(TEST_DB))
const children: ChildProcess[] = []
afterAll(async () => {
  await Promise.all(children.map(stopServer))
  await pool.end()
})

const actor = (await makeActor(db, { name: 'Removal Ada' })).id
const space = await makeSpace(db)
await makeColumns(db, space.id)
await makeMember(db, space.id, actor)

async function run(variant: Variant) {
  ensureBuilt(variant)
  children.push(await startServer(TEST_DB, variant))
  const call = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`http://localhost:${variant.port}/api/v1${path}`, { ...init, headers: { 'x-actor-id': actor, 'content-type': 'application/json', ...init.headers } })
    return { status: res.status, body: (await res.json()) as any }
  }
  return call
}

describe('without tags', () => {
  it('lists the other layers, drops the tag routes, and keeps everything else working', async () => {
    const call = await run({ name: 'no-tags', layers: ['core', 'workspace', 'events', 'items'], port: 3903 })
    const index = (await call('')).body
    expect(index.modules.map((m: any) => m.name)).toEqual(['core', 'workspace', 'events', 'items'])
    expect(index.modules.flatMap((m: any) => m.missing_dependencies)).toEqual([])
    expect(Object.keys((await call('/openapi.json')).body.paths).filter((p) => p.includes('tag'))).toEqual([])
    expect((await call(`/spaces/${space.id}/tags`)).status).toBe(404)
    expect((await call('/tags', { method: 'POST', body: '{}' })).status).toBe(404)

    const created = await call('/items', { method: 'POST', body: JSON.stringify({ space_id: space.id, title: 'still works' }) })
    expect(created.status).toBe(201)
    expect((await call(`/items/${created.body.id}`)).status).toBe(200)
    expect((await call(`/items/${created.body.id}`, { method: 'DELETE' })).status).toBe(200)
    expect((await call(`/spaces/${space.id}/events?type=item.created`)).status).toBe(200)
    expect((await call(`/spaces/${space.id}/columns`)).status).toBe(200)
  }, 120_000)
})

describe('without items and tags', () => {
  it('leaves workspace and the event log working', async () => {
    const call = await run({ name: 'no-items', layers: ['core', 'workspace', 'events'], port: 3904 })
    expect((await call('')).body.modules.map((m: any) => m.name)).toEqual(['core', 'workspace', 'events'])
    expect((await call('/items?space_id=' + space.id)).status).toBe(404)
    expect((await call('/spaces')).body.data.map((s: any) => s.id)).toContain(space.id)
    expect((await call(`/spaces/${space.id}/events`)).status).toBe(200)
  }, 120_000)
})

describe('removing a layer that others build on', () => {
  it('is reported by GET /api/v1 as a missing dependency', async () => {
    // events is gone but items still says it needs it: the registry shows the broken build instead of hiding it.
    const call = await run({ name: 'no-events', layers: ['core', 'workspace', 'items'], port: 3905 })
    const items = (await call('')).body.modules.find((m: any) => m.name === 'items')
    expect(items.missing_dependencies).toEqual(['events'])
  }, 120_000)
})
