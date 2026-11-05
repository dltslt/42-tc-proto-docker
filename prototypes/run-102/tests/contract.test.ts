// The contract test: the OpenAPI document says which operations and statuses exist; this test makes every one
// of them happen over plain HTTP and checks each body against the schema in the document.
// The last test fails if the document promises a (route, status) pair that no call here produced.
import { afterAll, describe, expect, it } from 'vitest'
import { createDb, databaseUrl } from '#layers/core/server/db/client'
import { apiAs } from '#layers/core/tests/http'
import { makeActor, makeColumns, makeMember, makeSpace } from '#layers/workspace/tests/builders'
// Plain JavaScript shared with scripts/openapi-smoke.mjs, which runs outside Nuxt.
// @ts-expect-error no type declarations for the .mjs helper
import { check } from '../scripts/openapi-lite.mjs'
import { TEST_DB } from './test-server'

const { db, pool } = createDb(databaseUrl(TEST_DB))
afterAll(async () => { await pool.end() })

const { body: doc } = await apiAs(undefined, '/openapi.json')
const ada = (await makeActor(db, { name: 'Contract Ada' })).id
const eve = (await makeActor(db, { name: 'Contract Eve' })).id // member of nothing
const ghost = () => crypto.randomUUID()

type Json = Record<string, any>
const seen = new Set<string>()

// One call: send it, assert the status, and check the body against the document's schema for that status.
async function hit(op: string, status: number, actor: string | undefined, path: string, body?: unknown): Promise<Json> {
  const [method = 'GET'] = op.split(' ')
  const res = await apiAs(actor, path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  expect(res.status, `${op} -> ${JSON.stringify(res.body)}`).toBe(status)
  const [, template = ''] = op.split(' ')
  const schema = doc.paths[template]?.[method.toLowerCase()]?.responses?.[String(status)]?.content?.['application/json']?.schema
  expect(schema, `${op} documents status ${status}`).toBeDefined()
  expect(check(schema, res.body, '$', doc), `${op} ${status} body`).toEqual([])
  seen.add(`${op} ${status}`)
  return res.body
}

// A space with columns where ada is a member, plus an item and a tag in it.
async function fx() {
  const space = await makeSpace(db)
  const cols = await makeColumns(db, space.id)
  await makeMember(db, space.id, ada)
  const item = await hit('POST /items', 201, ada, '/items', { space_id: space.id, title: 'fixture' })
  const tag = await hit('POST /tags', 201, ada, '/tags', { space_id: space.id, name: `tag-${crypto.randomUUID().slice(0, 8)}` })
  return { space: space.id, cols, item, tag }
}

describe('open routes', () => {
  it('GET /, /health, /openapi.json, /actors', async () => {
    await hit('GET /', 200, undefined, '')
    await hit('GET /health', 200, undefined, '/health')
    await hit('GET /openapi.json', 200, undefined, '/openapi.json')
    await hit('GET /actors', 200, undefined, '/actors')
    await hit('GET /actors', 400, undefined, '/actors?limit=0')
  })
})

describe('workspace', () => {
  it('GET /spaces', async () => {
    await hit('GET /spaces', 200, ada, '/spaces')
    await hit('GET /spaces', 400, ada, '/spaces?limit=0')
    await hit('GET /spaces', 401, undefined, '/spaces')
  })
  for (const [route, sub] of [['/spaces/{id}/columns', 'columns'], ['/spaces/{id}/events', 'events'], ['/spaces/{id}/tags', 'tags']] as const) {
    it(`GET ${route}`, async () => {
      const f = await fx()
      await hit(`GET ${route}`, 200, ada, `/spaces/${f.space}/${sub}`)
      await hit(`GET ${route}`, 400, ada, `/spaces/not-a-uuid/${sub}`)
      await hit(`GET ${route}`, 401, undefined, `/spaces/${f.space}/${sub}`)
      await hit(`GET ${route}`, 403, eve, `/spaces/${f.space}/${sub}`)
      await hit(`GET ${route}`, 404, ada, `/spaces/${ghost()}/${sub}`)
    })
  }
})

describe('items', () => {
  it('GET /items', async () => {
    const f = await fx()
    await hit('GET /items', 200, ada, `/items?space_id=${f.space}`)
    await hit('GET /items', 400, ada, '/items')
    await hit('GET /items', 401, undefined, `/items?space_id=${f.space}`)
    await hit('GET /items', 403, eve, `/items?space_id=${f.space}`)
    await hit('GET /items', 404, ada, `/items?space_id=${ghost()}`)
  })

  it('POST /items', async () => {
    const f = await fx()
    await hit('POST /items', 201, ada, '/items', { space_id: f.space, title: 'new' })
    await hit('POST /items', 400, ada, '/items', {})
    await hit('POST /items', 401, undefined, '/items', { space_id: f.space, title: 'x' })
    await hit('POST /items', 403, eve, '/items', { space_id: f.space, title: 'x' })
    await hit('POST /items', 404, ada, '/items', { space_id: ghost(), title: 'x' })
    const bare = await makeSpace(db) // no columns: nowhere to put a new item
    await makeMember(db, bare.id, ada)
    await hit('POST /items', 409, ada, '/items', { space_id: bare.id, title: 'x' })
  })

  it('GET /items/{id}', async () => {
    const f = await fx()
    await hit('GET /items/{id}', 200, ada, `/items/${f.item.id}`)
    await hit('GET /items/{id}', 400, ada, '/items/nope')
    await hit('GET /items/{id}', 401, undefined, `/items/${f.item.id}`)
    await hit('GET /items/{id}', 403, eve, `/items/${f.item.id}`)
    await hit('GET /items/{id}', 404, ada, `/items/${ghost()}`)
  })

  it('PATCH /items/{id}', async () => {
    const f = await fx()
    const url = `/items/${f.item.id}`
    await hit('PATCH /items/{id}', 200, ada, url, { title: 'renamed', expected_version: 1 })
    await hit('PATCH /items/{id}', 400, ada, url, {})
    await hit('PATCH /items/{id}', 401, undefined, url, { state: 'done' })
    await hit('PATCH /items/{id}', 403, eve, url, { state: 'done' })
    await hit('PATCH /items/{id}', 404, ada, `/items/${ghost()}`, { state: 'done' })
    await hit('PATCH /items/{id}', 409, ada, url, { title: 'stale', expected_version: 1 })
  })

  it('POST /items/{id}/move', async () => {
    const f = await fx()
    const child = await hit('POST /items', 201, ada, '/items', { space_id: f.space, title: 'child', parent_id: f.item.id })
    const url = `/items/${f.item.id}/move`
    await hit('POST /items/{id}/move', 200, ada, url, { column_id: f.cols.started.id })
    await hit('POST /items/{id}/move', 400, ada, url, {})
    await hit('POST /items/{id}/move', 401, undefined, url, { column_id: f.cols.done.id })
    await hit('POST /items/{id}/move', 403, eve, url, { column_id: f.cols.done.id })
    await hit('POST /items/{id}/move', 404, ada, `/items/${ghost()}/move`, { column_id: f.cols.done.id })
    await hit('POST /items/{id}/move', 409, ada, url, { parent_id: child.id }) // under its own child: a cycle
  })

  it('DELETE /items/{id}', async () => {
    const f = await fx()
    const child = await hit('POST /items', 201, ada, '/items', { space_id: f.space, title: 'child', parent_id: f.item.id })
    await hit('DELETE /items/{id}', 400, ada, '/items/nope')
    await hit('DELETE /items/{id}', 401, undefined, `/items/${f.item.id}`)
    await hit('DELETE /items/{id}', 403, eve, `/items/${f.item.id}`)
    await hit('DELETE /items/{id}', 404, ada, `/items/${ghost()}`)
    await hit('DELETE /items/{id}', 409, ada, `/items/${f.item.id}`) // has a child and no mode
    await hit('DELETE /items/{id}', 200, ada, `/items/${f.item.id}?mode=lift`)
    expect(child.id).toBeTruthy()
  })
})

describe('tags', () => {
  it('POST /tags', async () => {
    const f = await fx()
    await hit('POST /tags', 400, ada, '/tags', { space_id: f.space })
    await hit('POST /tags', 401, undefined, '/tags', { space_id: f.space, name: 'x' })
    await hit('POST /tags', 403, eve, '/tags', { space_id: f.space, name: 'x' })
    await hit('POST /tags', 404, ada, '/tags', { space_id: ghost(), name: 'x' })
    await hit('POST /tags', 409, ada, '/tags', { space_id: f.space, name: f.tag.name.toUpperCase() })
  })

  it('GET /tags/{id}/items and GET /items/{id}/tags', async () => {
    const f = await fx()
    await hit('GET /tags/{id}/items', 200, ada, `/tags/${f.tag.id}/items`)
    await hit('GET /tags/{id}/items', 400, ada, '/tags/nope/items')
    await hit('GET /tags/{id}/items', 401, undefined, `/tags/${f.tag.id}/items`)
    await hit('GET /tags/{id}/items', 403, eve, `/tags/${f.tag.id}/items`)
    await hit('GET /tags/{id}/items', 404, ada, `/tags/${ghost()}/items`)
    await hit('GET /items/{id}/tags', 200, ada, `/items/${f.item.id}/tags`)
    await hit('GET /items/{id}/tags', 400, ada, '/items/nope/tags')
    await hit('GET /items/{id}/tags', 401, undefined, `/items/${f.item.id}/tags`)
    await hit('GET /items/{id}/tags', 403, eve, `/items/${f.item.id}/tags`)
    await hit('GET /items/{id}/tags', 404, ada, `/items/${ghost()}/tags`)
  })

  for (const [method, dir] of [['PUT', 'linking'], ['DELETE', 'unlinking']] as const) {
    it(`${method} /items/{id}/tags/{tag_id} (${dir})`, async () => {
      const f = await fx()
      const op = `${method} /items/{id}/tags/{tag_id}`
      const url = `/items/${f.item.id}/tags/${f.tag.id}`
      await hit(op, 200, ada, url)
      await hit(op, 400, ada, `/items/nope/tags/${f.tag.id}`)
      await hit(op, 401, undefined, url)
      await hit(op, 403, eve, url)
      await hit(op, 404, ada, `/items/${f.item.id}/tags/${ghost()}`)
    })
  }

  it('DELETE /tags/{id}', async () => {
    const f = await fx()
    await hit('DELETE /tags/{id}', 400, ada, '/tags/nope')
    await hit('DELETE /tags/{id}', 401, undefined, `/tags/${f.tag.id}`)
    await hit('DELETE /tags/{id}', 403, eve, `/tags/${f.tag.id}`)
    await hit('DELETE /tags/{id}', 404, ada, `/tags/${ghost()}`)
    await hit('DELETE /tags/{id}', 200, ada, `/tags/${f.tag.id}`)
  })
})

it('every (route, status) pair in the OpenAPI document was exercised', () => {
  const promised: string[] = []
  for (const [path, ops] of Object.entries<Json>(doc.paths)) {
    for (const [method, op] of Object.entries<Json>(ops)) {
      for (const status of Object.keys(op.responses)) promised.push(`${method.toUpperCase()} ${path} ${status}`)
    }
  }
  expect(promised.filter((p) => !seen.has(p))).toEqual([])
  expect([...seen].filter((s) => !promised.includes(s))).toEqual([])
})
