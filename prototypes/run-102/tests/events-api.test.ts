// The event log as a client sees it: plain HTTP against the test server, in spaces made for these tests.
import { afterAll, describe, expect, it } from 'vitest'
import { createDb, databaseUrl } from '#layers/core/server/db/client'
import { ErrorBodySchema } from '#layers/core/server/lib/errors'
import { apiAs } from '#layers/core/tests/http'
import { makeActor, makeColumns, makeMember, makeSpace } from '#layers/workspace/tests/builders'
import { TEST_DB } from './test-server'

const { db, pool } = createDb(databaseUrl(TEST_DB))
afterAll(async () => { await pool.end() })

const ada = (await makeActor(db, { name: 'Logger Ada' })).id
const outsider = (await makeActor(db, { name: 'Logger Outsider' })).id

async function newSpace() {
  const space = await makeSpace(db)
  const cols = await makeColumns(db, space.id)
  await makeMember(db, space.id, ada)
  return { id: space.id, cols }
}

type Json = Record<string, any>
const json = (actor: string | undefined, method: string, path: string, body?: unknown) =>
  apiAs(actor, path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const log = async (space: string, query = '') => (await apiAs(ada, `/spaces/${space}/events?limit=200${query}`)).body.data as Json[]

describe('GET /spaces/:id/events access', () => {
  it('401 without an actor, 403 for a non-member, 404 for an unknown space, 400 for a bad filter', async () => {
    const space = await newSpace()
    const url = `/spaces/${space.id}/events`
    expect((await apiAs(undefined, url)).status).toBe(401)
    const forbidden = await apiAs(outsider, url)
    expect(forbidden.status).toBe(403)
    expect(ErrorBodySchema.parse(forbidden.body).error.code).toBeTruthy()
    expect((await apiAs(ada, `/spaces/${crypto.randomUUID()}/events`)).status).toBe(404)
    expect((await apiAs(ada, `${url}?after=-1`)).status).toBe(400)
    expect((await apiAs(ada, `${url}?target_id=nope`)).status).toBe(400)
  })
})

describe('every write produced exactly one event', () => {
  it('create, edit, state change, move and delete each add one event of the right type', async () => {
    const space = await newSpace()
    const lastId = async () => (await log(space.id)).at(-1)?.id ?? 0
    const step = async (type: string, call: () => Promise<{ status: number; body: any }>) => {
      const before = await lastId()
      const res = await call()
      expect(res.status, JSON.stringify(res.body)).toBeLessThan(300)
      const added = await log(space.id, `&after=${before}`)
      expect(added.map((e) => e.type), `after ${type}`).toEqual([type])
      expect(added[0]).toMatchObject({ actor_id: ada, space_id: space.id, target_kind: 'item' })
      return { res, event: added[0]! }
    }

    const { res: created, event } = await step('item.created', () => json(ada, 'POST', '/items', { space_id: space.id, title: 'A' }))
    const id = created.body.id
    expect(event.target_id).toBe(id)
    expect(event.changes.title).toEqual({ from: null, to: 'A' })

    const edited = await step('item.updated', () => json(ada, 'PATCH', `/items/${id}`, { title: 'B', expected_version: 1 }))
    expect(edited.event.changes).toEqual({ title: { from: 'A', to: 'B' } })

    await step('item.updated', () => json(ada, 'PATCH', `/items/${id}`, { state: 'started' }))
    await step('item.moved', () => json(ada, 'POST', `/items/${id}/move`, { column_id: space.cols.done.id }))
    const deleted = await step('item.deleted', () => json(ada, 'DELETE', `/items/${id}`))
    expect(deleted.event.target_id).toBe(id)
  })

  it('a rejected write leaves no event', async () => {
    const space = await newSpace()
    const item = (await json(ada, 'POST', '/items', { space_id: space.id, title: 'X' })).body
    const before = (await log(space.id)).length
    expect((await json(ada, 'PATCH', `/items/${item.id}`, { title: 'Y', expected_version: 99 })).status).toBe(409)
    expect((await json(ada, 'PATCH', `/items/${item.id}`, { title: '' })).status).toBe(400)
    expect((await json(outsider, 'PATCH', `/items/${item.id}`, { title: 'Z', expected_version: 1 })).status).toBe(403)
    expect((await log(space.id)).length).toBe(before)
  })
})

describe('filters and ?after=', () => {
  it('after=<id> returns exactly the later events, in order; the log never shows another space', async () => {
    const space = await newSpace()
    const other = await newSpace()
    for (const t of ['one', 'two', 'three']) await json(ada, 'POST', '/items', { space_id: space.id, title: t })
    await json(ada, 'POST', '/items', { space_id: other.id, title: 'elsewhere' })
    const all = await log(space.id)
    expect(all.map((e) => e.changes.title.to)).toEqual(['one', 'two', 'three'])
    expect(all.map((e) => e.id)).toEqual([...all.map((e) => e.id)].sort((a, b) => a - b))
    expect((await log(space.id, `&after=${all[0]!.id}`)).map((e) => e.id)).toEqual([all[1]!.id, all[2]!.id])
    expect(await log(space.id, `&after=${all[2]!.id}`)).toEqual([])
  })

  it('filters by type, target_kind and target_id', async () => {
    const space = await newSpace()
    const a = (await json(ada, 'POST', '/items', { space_id: space.id, title: 'a' })).body
    const b = (await json(ada, 'POST', '/items', { space_id: space.id, title: 'b' })).body
    await json(ada, 'PATCH', `/items/${a.id}`, { state: 'done' })
    expect((await log(space.id, '&type=item.created')).length).toBe(2)
    expect((await log(space.id, '&type=item.updated')).map((e) => e.target_id)).toEqual([a.id])
    expect((await log(space.id, `&target_id=${b.id}`)).length).toBe(1)
    expect((await log(space.id, `&target_kind=item&target_id=${a.id}`)).length).toBe(2)
    expect(await log(space.id, '&target_kind=tag')).toEqual([])
  })

  it('pages with next_cursor passed back as after, without gaps or repeats', async () => {
    const space = await newSpace()
    for (let i = 0; i < 5; i++) await json(ada, 'POST', '/items', { space_id: space.id, title: `n${i}` })
    const seen: number[] = []
    let after = '0'
    let pages = 0
    for (;;) {
      const { body } = await apiAs(ada, `/spaces/${space.id}/events?limit=2&after=${after}`)
      seen.push(...body.data.map((e: Json) => e.id))
      pages++
      if (!body.next_cursor) break
      after = body.next_cursor
    }
    expect(pages).toBe(3)
    expect(seen).toEqual((await log(space.id)).map((e) => e.id))
  })
})
