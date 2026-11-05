// The tags layer over plain HTTP. Each test works in a space of its own.
import { afterAll, describe, expect, it } from 'vitest'
import { createDb, databaseUrl } from '#layers/core/server/db/client'
import { apiAs } from '#layers/core/tests/http'
import { makeActor, makeColumns, makeMember, makeSpace } from '#layers/workspace/tests/builders'
import { TEST_DB } from './test-server'

const { db, pool } = createDb(databaseUrl(TEST_DB))
afterAll(async () => { await pool.end() })

const ada = (await makeActor(db, { name: 'Tagger Ada' })).id
const outsider = (await makeActor(db, { name: 'Tagger Outsider' })).id

async function newSpace(withAda = true) {
  const space = await makeSpace(db)
  await makeColumns(db, space.id)
  if (withAda) await makeMember(db, space.id, ada)
  return space.id
}
type Json = Record<string, any>
const call = (actor: string | undefined, method: string, path: string, body?: unknown) =>
  apiAs(actor, path, { method, headers: { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
const mkTag = async (space: string, name: string): Promise<Json> => {
  const r = await call(ada, 'POST', '/tags', { space_id: space, name })
  expect(r.status, JSON.stringify(r.body)).toBe(201)
  return r.body
}
const mkItem = async (space: string, title = 'item'): Promise<Json> => (await call(ada, 'POST', '/items', { space_id: space, title })).body
const events = async (space: string) => (await apiAs(ada, `/spaces/${space}/events?limit=200`)).body.data as Json[]

describe('tags', () => {
  it('are created, listed sorted by name, and unique per space ignoring case', async () => {
    const space = await newSpace()
    const other = await newSpace(false)
    await mkTag(space, 'bug'); await mkTag(space, 'Alpha')
    expect((await call(ada, 'POST', '/tags', { space_id: space, name: 'BUG' })).status).toBe(409)
    await call(ada, 'POST', '/tags', { space_id: other, name: 'bug' }).then((r) => expect(r.status).toBe(403)) // ada is not a member of `other`
    expect((await apiAs(ada, `/spaces/${space}/tags`)).body.data.map((t: Json) => t.name)).toEqual(['Alpha', 'bug'])
    expect((await apiAs(ada, `/spaces/${space}/tags?sort=-name`)).body.data.map((t: Json) => t.name)).toEqual(['bug', 'Alpha'])
  })

  it('reject bad input and strangers in the error shape', async () => {
    const space = await newSpace()
    expect((await call(ada, 'POST', '/tags', { space_id: space, name: '  ' })).status).toBe(400)
    expect((await call(ada, 'POST', '/tags', { space_id: space })).status).toBe(400)
    expect((await call(undefined, 'POST', '/tags', { space_id: space, name: 'x' })).status).toBe(401)
    expect((await call(outsider, 'POST', '/tags', { space_id: space, name: 'x' })).status).toBe(403)
    expect((await apiAs(outsider, `/spaces/${space}/tags`)).status).toBe(403)
    expect((await call(ada, 'DELETE', `/tags/${crypto.randomUUID()}`)).status).toBe(404)
    const tag = await mkTag(space, 'mine')
    expect((await call(outsider, 'DELETE', `/tags/${tag.id}`)).status).toBe(403)
  })
})

describe('linking', () => {
  it('links and unlinks, both ways round, and repeating either is harmless', async () => {
    const space = await newSpace()
    const [item, tag] = [await mkItem(space), await mkTag(space, 'urgent')]
    const url = `/items/${item.id}/tags/${tag.id}`
    expect((await call(ada, 'PUT', url)).body).toEqual({ item_id: item.id, tag_ids: [tag.id] })
    expect((await call(ada, 'PUT', url)).body.tag_ids).toEqual([tag.id])
    expect((await apiAs(ada, `/items/${item.id}/tags`)).body.tag_ids).toEqual([tag.id])
    expect((await apiAs(ada, `/tags/${tag.id}/items`)).body.item_ids).toEqual([item.id])
    expect((await call(ada, 'DELETE', url)).body.tag_ids).toEqual([])
    expect((await call(ada, 'DELETE', url)).status).toBe(200)
    // one event per real change: created x2 (item, tag), tagged, untagged
    expect((await events(space)).map((e) => e.type)).toEqual(['item.created', 'tag.created', 'item.tagged', 'item.untagged'])
  })

  it('refuses a tag from another space (400), unknown ids (404) and non-members (403)', async () => {
    const a = await newSpace()
    const b = await newSpace()
    const item = await mkItem(a)
    const foreign = await mkTag(b, 'foreign')
    expect((await call(ada, 'PUT', `/items/${item.id}/tags/${foreign.id}`)).status).toBe(400)
    expect((await call(ada, 'PUT', `/items/${item.id}/tags/${crypto.randomUUID()}`)).status).toBe(404)
    expect((await call(ada, 'PUT', `/items/${crypto.randomUUID()}/tags/${foreign.id}`)).status).toBe(404)
    const tag = await mkTag(a, 'ok')
    expect((await call(outsider, 'PUT', `/items/${item.id}/tags/${tag.id}`)).status).toBe(403)
    expect((await apiAs(outsider, `/items/${item.id}/tags`)).status).toBe(403)
    expect((await apiAs(outsider, `/tags/${tag.id}/items`)).status).toBe(403)
  })

  it('goes away with the item or the tag', async () => {
    const space = await newSpace()
    const [i1, i2] = [await mkItem(space, 'one'), await mkItem(space, 'two')]
    const [keep, drop] = [await mkTag(space, 'keep'), await mkTag(space, 'drop')]
    for (const i of [i1, i2]) for (const t of [keep, drop]) await call(ada, 'PUT', `/items/${i.id}/tags/${t.id}`)
    await call(ada, 'DELETE', `/items/${i1.id}`) // deleting the item removes its links
    expect((await apiAs(ada, `/tags/${keep.id}/items`)).body.item_ids).toEqual([i2.id])
    const del = await call(ada, 'DELETE', `/tags/${drop.id}`)
    expect(del.body).toEqual({ deleted_id: drop.id, unlinked_item_ids: [i2.id] })
    expect((await apiAs(ada, `/items/${i2.id}/tags`)).body.tag_ids).toEqual([keep.id])
    expect((await apiAs(ada, `/tags/${drop.id}/items`)).status).toBe(404)
    expect((await events(space)).filter((e) => e.type === 'tag.deleted')).toHaveLength(1)
  })
})

describe('the layer is an add-on', () => {
  it('shows up in GET /api/v1 and registers its own actions and event types', async () => {
    const { body } = await apiAs(undefined, '')
    const tags = body.modules.find((m: Json) => m.name === 'tags')
    expect(tags).toMatchObject({ depends_on: ['workspace', 'events', 'items'], missing_dependencies: [], route_count: 7 })
    expect(tags.event_types).toContain('item.tagged')
    const spec = (await apiAs(undefined, '/openapi.json')).body
    expect(Object.keys(spec.paths)).toEqual(expect.arrayContaining(['/tags', '/tags/{id}', '/items/{id}/tags/{tag_id}']))
  })
})

describe('simultaneous requests (separate connections, one server)', () => {
  it('two creates of the same name: one 201, one 409', async () => {
    const space = await newSpace()
    const results = await Promise.all([1, 2, 3, 4].map(() => call(ada, 'POST', '/tags', { space_id: space, name: 'race' })))
    expect(results.map((r) => r.status).sort()).toEqual([201, 409, 409, 409])
    expect((await apiAs(ada, `/spaces/${space}/tags`)).body.data).toHaveLength(1)
  })

  it('many identical links make one link and one event', async () => {
    const space = await newSpace()
    const [item, tag] = [await mkItem(space), await mkTag(space, 'once')]
    const results = await Promise.all(Array.from({ length: 6 }, () => call(ada, 'PUT', `/items/${item.id}/tags/${tag.id}`)))
    expect(results.every((r) => r.status === 200 && r.body.tag_ids.length === 1)).toBe(true)
    expect((await events(space)).filter((e) => e.type === 'item.tagged')).toHaveLength(1)
  })

  it('a link racing a tag delete ends as 200/404 answers, never a 500, and leaves no orphan link', async () => {
    const space = await newSpace()
    const item = await mkItem(space)
    const tag = await mkTag(space, 'fleeting')
    const results = await Promise.all([call(ada, 'PUT', `/items/${item.id}/tags/${tag.id}`), call(ada, 'DELETE', `/tags/${tag.id}`)])
    for (const r of results) expect([200, 404]).toContain(r.status)
    expect((await apiAs(ada, `/items/${item.id}/tags`)).body.tag_ids).toEqual([])
  })
})
