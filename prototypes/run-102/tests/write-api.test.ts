// The write API as a client sees it: plain HTTP against the test server, which reads a throwaway database.
// Each group works in a space of its own (made directly in the database, since v1 has no create-space route),
// so these tests never disturb the read tests that look at the seeded Dinner party.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, databaseUrl } from '#layers/core/server/db/client'
import { ErrorBodySchema } from '#layers/core/server/lib/errors'
import { api, apiAs } from '#layers/core/tests/http'
import { makeActor, makeColumns, makeMember, makeSpace } from '#layers/workspace/tests/builders'
import { TEST_DB } from './test-server'

const { db, pool } = createDb(databaseUrl(TEST_DB))
afterAll(async () => { await pool.end() })

// Actors made for these tests. Using the seeded Ada, Ben and Cleo would add them to every space made here
// and change what the read tests see.
const ada = (await makeActor(db, { name: 'Writer Ada' })).id
const ben = (await makeActor(db, { name: 'Writer Ben' })).id
const cleo = (await makeActor(db, { name: 'Writer Cleo' })).id

// A fresh space whose members are the given actors, with the four columns.
async function newSpace(...members: string[]) {
  const space = await makeSpace(db)
  const cols = await makeColumns(db, space.id)
  for (const m of members) await makeMember(db, space.id, m)
  return { id: space.id, cols }
}

type Json = Record<string, any>
const send = (actor: string | undefined, method: string, path: string, body?: unknown) =>
  apiAs(actor, path, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  })
const post = (actor: string | undefined, path: string, body?: unknown) => send(actor, 'POST', path, body)
const patch = (actor: string | undefined, path: string, body?: unknown) => send(actor, 'PATCH', path, body)

async function create(space: string, title: string, extra: Json = {}, actor = ada): Promise<Json> {
  const { status, body } = await post(actor, '/items', { space_id: space, title, ...extra })
  expect(status, `creating "${title}": ${JSON.stringify(body)}`).toBe(201)
  return body
}
// Titles of a space's items under one parent, in order.
async function titlesUnder(space: string, parent: string | null, actor = ada) {
  const { body } = await apiAs(actor, `/items?space_id=${space}&parent_id=${parent ?? 'null'}&limit=200`)
  return body.data.map((i: Json) => i.title)
}

describe('every write needs an actor', () => {
  it('answers 401 in the error shape for POST, PATCH, move and DELETE', async () => {
    const id = crypto.randomUUID()
    const calls = [post(undefined, '/items', {}), patch(undefined, `/items/${id}`, {}), post(undefined, `/items/${id}/move`, {}), send(undefined, 'DELETE', `/items/${id}`)]
    for (const { status, body } of await Promise.all(calls)) {
      expect(status).toBe(401)
      expect(ErrorBodySchema.parse(body).error.code).toBe('unauthenticated')
    }
  })

  it('answers 405 with the methods that do exist when the method is wrong', async () => {
    const { headers, status } = await apiAs(ada, `/items/${crypto.randomUUID()}`, { method: 'PUT' })
    expect(status).toBe(405)
    expect(headers.get('allow')).toBe('DELETE, GET, PATCH')
  })
})

describe('POST /items', () => {
  it('creates an item from a title alone: 201, in the first unstarted column, readable at once', async () => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'Buy milk')
    expect(item).toMatchObject({ title: 'Buy milk', type: 'task', state: 'unstarted', column_id: space.cols.unstarted.id, space_id: space.id, parent_id: null, lead_id: null, version: 1, description: '' })
    expect((await apiAs(ada, `/items/${item.id}`)).body).toEqual(item)
    expect(await titlesUnder(space.id, null)).toEqual(['Buy milk'])
  })

  it('takes the optional fields: type, description, state, parent and lead', async () => {
    const space = await newSpace(ada, ben)
    const parent = await create(space.id, 'Parent', { type: 'project' })
    const child = await create(space.id, 'Child', { parent_id: parent.id, state: 'started', description: '# Notes', lead_id: ben })
    expect(child).toMatchObject({ parent_id: parent.id, state: 'started', column_id: space.cols.started.id, description: '# Notes', lead_id: ben })
  })

  it('trims the title and keeps it to one line', async () => {
    const space = await newSpace(ada)
    expect((await create(space.id, '  Padded  ')).title).toBe('Padded')
  })

  const space = { id: crypto.randomUUID() } // only used by cases that fail before the space matters
  const invalid: [string, Json][] = [
    ['no title', { space_id: space.id }],
    ['empty title', { space_id: space.id, title: '   ' }],
    ['a title over two lines', { space_id: space.id, title: 'one\ntwo' }],
    ['a title that is too long', { space_id: space.id, title: 'x'.repeat(201) }],
    ['no space_id', { title: 'x' }],
    ['space_id not a uuid', { space_id: 'nope', title: 'x' }],
    ['a field the API does not know', { space_id: space.id, title: 'x', titel: 'typo' }],
    ['type outside the list', { space_id: space.id, title: 'x', type: 'saga' }],
    ['state outside the list', { space_id: space.id, title: 'x', state: 'blocked' }],
    ['title not a string', { space_id: space.id, title: 42 }],
    ['parent_id not a uuid', { space_id: space.id, title: 'x', parent_id: 'root' }],
  ]
  it.each(invalid)('answers 400 with the field named for %s', async (_name, body) => {
    const { status, body: error } = await post(ada, '/items', body)
    expect(status).toBe(400)
    const parsed = ErrorBodySchema.parse(error)
    expect(parsed.error.code).toBe('invalid_input')
    expect(Object.keys(parsed.error.fields).length).toBeGreaterThan(0)
    expect(Object.keys(parsed.error.fields).every((f) => f.startsWith('body'))).toBe(true)
  })

  it('answers 400 for a body that is not JSON, not an object, or missing', async () => {
    for (const body of ['{not json', '[]', '"text"', undefined]) {
      expect((await post(ada, '/items', body)).status, String(body)).toBe(400)
    }
  })

  it('answers 400 for a bad reference, 403 for a stranger, 404 for an unknown space', async () => {
    const mine = await newSpace(ada)
    const theirs = await newSpace(cleo)
    expect((await post(ada, '/items', { space_id: mine.id, title: 'x', parent_id: crypto.randomUUID() })).status).toBe(400)
    expect((await post(ada, '/items', { space_id: mine.id, title: 'x', column_id: theirs.cols.done.id })).status).toBe(400)
    expect((await post(ada, '/items', { space_id: mine.id, title: 'x', lead_id: ben })).status).toBe(400) // Ben is not in this space
    expect((await post(ada, '/items', { space_id: theirs.id, title: 'x' })).status).toBe(403)
    expect((await post(ada, '/items', { space_id: crypto.randomUUID(), title: 'x' })).status).toBe(404)
  })

  it('shows the new item to members of its space only', async () => {
    const space = await newSpace(ada, ben)
    const item = await create(space.id, 'Shared')
    expect((await apiAs(ben, `/items/${item.id}`)).status).toBe(200)
    expect((await apiAs(cleo, `/items/${item.id}`)).status).toBe(403)
  })
})

describe('PATCH /items/:id', () => {
  it('saves a text edit with the version it started from, and raises the version', async () => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'Draft')
    const { status, body } = await patch(ada, `/items/${item.id}`, { title: 'Final', description: 'Done.', expected_version: 1 })
    expect(status).toBe(200)
    expect(body).toMatchObject({ title: 'Final', description: 'Done.', version: 2 })
    expect(body.updated_at >= item.updated_at).toBe(true)
  })

  it('answers 400 when a text field is sent without expected_version, and names it', async () => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'Draft')
    const { status, body } = await patch(ada, `/items/${item.id}`, { title: 'No version' })
    expect(status).toBe(400)
    expect(Object.keys(body.error.fields)).toEqual(['body.expected_version'])
  })

  it('answers 409 with the stored item when the version is stale, and keeps the stored text', async () => {
    const space = await newSpace(ada, ben)
    const item = await create(space.id, 'Shared description')
    await patch(ada, `/items/${item.id}`, { description: "Ada's text", expected_version: 1 })
    const { status, body } = await patch(ben, `/items/${item.id}`, { description: "Ben's text", expected_version: 1 })
    expect(status).toBe(409)
    expect(ErrorBodySchema.parse(body).error.code).toBe('conflict')
    expect(body.error.current).toMatchObject({ id: item.id, description: "Ada's text", version: 2 })
    expect((await apiAs(ben, `/items/${item.id}`)).body.description).toBe("Ada's text") // nothing of Ben's was saved
  })

  it('of two simultaneous edits from the same version, saves one and answers 409 to the other', async () => {
    const space = await newSpace(ada, ben)
    const item = await create(space.id, 'Race')
    const [one, two] = await Promise.all([
      patch(ada, `/items/${item.id}`, { description: 'Ada', expected_version: 1 }),
      patch(ben, `/items/${item.id}`, { description: 'Ben', expected_version: 1 }),
    ])
    expect([one.status, two.status].sort()).toEqual([200, 409])
    expect((await apiAs(ada, `/items/${item.id}`)).body.version).toBe(2)
  })

  it('changes the state without a version, by moving the item to the first column of that state', async () => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'Task')
    const { status, body } = await patch(ada, `/items/${item.id}`, { state: 'done' })
    expect(status).toBe(200)
    expect(body).toMatchObject({ state: 'done', column_id: space.cols.done.id, version: 1 })
  })

  it('sets and clears the lead', async () => {
    const space = await newSpace(ada, ben)
    const item = await create(space.id, 'Led')
    const led = await patch(ada, `/items/${item.id}`, { lead_id: ben, expected_version: 1 })
    expect(led.body.lead_id).toBe(ben)
    const cleared = await patch(ada, `/items/${item.id}`, { lead_id: null, expected_version: 2 })
    expect(cleared.body).toMatchObject({ lead_id: null, version: 3 })
  })

  const invalid: [string, Json][] = [
    ['an empty body', {}],
    ['only expected_version', { expected_version: 1 }],
    ['an unknown field', { state: 'done', colour: 'red' }],
    ['an empty title', { title: '', expected_version: 1 }],
    ['version 0', { title: 'x', expected_version: 0 }],
    ['a version that is not a number', { title: 'x', expected_version: 'one' }],
    ['a null title', { title: null, expected_version: 1 }],
    ['an unknown state', { state: 'blocked' }],
  ]
  it.each(invalid)('answers 400 for %s', async (_name, body) => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'Target')
    const res = await patch(ada, `/items/${item.id}`, body)
    expect(res.status).toBe(400)
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('invalid_input')
  })

  it('answers 404 for an unknown item, 403 for a stranger, 400 for a malformed id', async () => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'Private')
    expect((await patch(ada, `/items/${crypto.randomUUID()}`, { state: 'done' })).status).toBe(404)
    expect((await patch(cleo, `/items/${item.id}`, { state: 'done' })).status).toBe(403)
    expect((await patch(ada, '/items/nope', { state: 'done' })).status).toBe(400)
  })
})

describe('POST /items/:id/move', () => {
  it('places an item before or after a sibling', async () => {
    const space = await newSpace(ada)
    const [a, b, c] = [await create(space.id, 'A'), await create(space.id, 'B'), await create(space.id, 'C')]
    await post(ada, `/items/${c.id}/move`, { before_id: a.id })
    expect(await titlesUnder(space.id, null)).toEqual(['C', 'A', 'B'])
    await post(ada, `/items/${c.id}/move`, { after_id: b.id })
    expect(await titlesUnder(space.id, null)).toEqual(['A', 'B', 'C'])
  })

  it('changes column and parent in one request, and returns the moved item', async () => {
    const space = await newSpace(ada)
    const parent = await create(space.id, 'Parent')
    const item = await create(space.id, 'Mover')
    const { status, body } = await post(ada, `/items/${item.id}/move`, { parent_id: parent.id, column_id: space.cols.done.id })
    expect(status).toBe(200)
    expect(body).toMatchObject({ parent_id: parent.id, column_id: space.cols.done.id, state: 'done', version: 1 })
    expect(await titlesUnder(space.id, parent.id)).toEqual(['Mover'])
    expect((await post(ada, `/items/${item.id}/move`, { parent_id: null })).body.parent_id).toBeNull()
  })

  it('answers 409 when the move would put an item under itself or a descendant', async () => {
    const space = await newSpace(ada)
    const a = await create(space.id, 'A')
    const b = await create(space.id, 'B', { parent_id: a.id })
    for (const under of [a.id, b.id]) {
      const res = await post(ada, `/items/${a.id}/move`, { parent_id: under })
      expect(res.status).toBe(409)
      expect(ErrorBodySchema.parse(res.body).error.code).toBe('conflict')
    }
    expect((await apiAs(ada, `/items/${a.id}`)).body.parent_id).toBeNull()
  })

  it('of two simultaneous opposite moves, makes one and refuses the other', async () => {
    const space = await newSpace(ada, ben)
    for (let round = 0; round < 5; round++) {
      const a = await create(space.id, `A${round}`)
      const b = await create(space.id, `B${round}`)
      const [one, two] = await Promise.all([post(ada, `/items/${a.id}/move`, { parent_id: b.id }), post(ben, `/items/${b.id}/move`, { parent_id: a.id })])
      expect([one.status, two.status].sort()).toEqual([200, 409])
    }
  })

  it('does not conflict with a text edit sent at the same moment', async () => {
    const space = await newSpace(ada, ben)
    const item = await create(space.id, 'Both')
    const [edit, move] = await Promise.all([
      patch(ada, `/items/${item.id}`, { title: 'Renamed', expected_version: 1 }),
      post(ben, `/items/${item.id}/move`, { column_id: space.cols.started.id }),
    ])
    expect([edit.status, move.status]).toEqual([200, 200])
    expect((await apiAs(ada, `/items/${item.id}`)).body).toMatchObject({ title: 'Renamed', state: 'started', version: 2 })
  })

  const invalid: [string, Json][] = [
    ['an empty body', {}],
    ['both after_id and before_id', { after_id: crypto.randomUUID(), before_id: crypto.randomUUID() }],
    ['an unknown field', { parent: null }],
    ['parent_id not a uuid', { parent_id: 'root' }],
    ['after_id not a uuid', { after_id: 'first' }],
  ]
  it.each(invalid)('answers 400 for %s', async (_name, body) => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'Target')
    const res = await post(ada, `/items/${item.id}/move`, body)
    expect(res.status).toBe(400)
    expect(ErrorBodySchema.parse(res.body).error.code).toBe('invalid_input')
  })

  it('answers 400 for a neighbour that is not a sibling and for a parent or column from another space', async () => {
    const space = await newSpace(ada)
    const other = await newSpace(ada)
    const a = await create(space.id, 'A')
    const child = await create(space.id, 'Child', { parent_id: a.id })
    const b = await create(space.id, 'B')
    const foreign = await create(other.id, 'Foreign')
    expect((await post(ada, `/items/${b.id}/move`, { after_id: child.id })).status).toBe(400)
    expect((await post(ada, `/items/${b.id}/move`, { parent_id: foreign.id })).status).toBe(400)
    expect((await post(ada, `/items/${b.id}/move`, { column_id: other.cols.done.id })).status).toBe(400)
  })

  it('answers 404 for an unknown item and 403 for a stranger', async () => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'A')
    expect((await post(ada, `/items/${crypto.randomUUID()}/move`, { parent_id: null })).status).toBe(404)
    expect((await post(cleo, `/items/${item.id}/move`, { parent_id: null })).status).toBe(403)
  })
})

describe('DELETE /items/:id', () => {
  it('deletes a leaf and lists the id; the item is gone afterwards', async () => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'Leaf')
    const { status, body } = await send(ada, 'DELETE', `/items/${item.id}`)
    expect([status, body]).toEqual([200, { deleted_ids: [item.id], lifted_ids: [] }])
    expect((await apiAs(ada, `/items/${item.id}`)).status).toBe(404)
  })

  it('answers 409 for an item with children and no mode, and deletes nothing', async () => {
    const space = await newSpace(ada)
    const parent = await create(space.id, 'Parent')
    const child = await create(space.id, 'Child', { parent_id: parent.id })
    const { status, body } = await send(ada, 'DELETE', `/items/${parent.id}`)
    expect(status).toBe(409)
    expect(body.error.message).toContain('mode=')
    expect((await apiAs(ada, `/items/${child.id}`)).status).toBe(200)
  })

  it('mode=subtree deletes the whole subtree', async () => {
    const space = await newSpace(ada)
    const root = await create(space.id, 'Root')
    const mid = await create(space.id, 'Mid', { parent_id: root.id })
    const leaf = await create(space.id, 'Leaf', { parent_id: mid.id })
    const { body } = await send(ada, 'DELETE', `/items/${root.id}?mode=subtree`)
    expect([...body.deleted_ids].sort()).toEqual([root.id, mid.id, leaf.id].sort())
    expect(body.lifted_ids).toEqual([])
    expect((await apiAs(ada, `/items/${leaf.id}`)).status).toBe(404)
  })

  it('mode=lift moves the children up one level into the place the item had', async () => {
    const space = await newSpace(ada)
    await create(space.id, 'Before')
    const parent = await create(space.id, 'Parent')
    await create(space.id, 'After')
    const c1 = await create(space.id, 'Child 1', { parent_id: parent.id })
    const c2 = await create(space.id, 'Child 2', { parent_id: parent.id })
    const { body } = await send(ada, 'DELETE', `/items/${parent.id}?mode=lift`)
    expect(body).toEqual({ deleted_ids: [parent.id], lifted_ids: [c1.id, c2.id] })
    expect(await titlesUnder(space.id, null)).toEqual(['Before', 'Child 1', 'Child 2', 'After'])
  })

  it('answers 400 for an unknown mode, 404 for an unknown item, 403 for a stranger', async () => {
    const space = await newSpace(ada)
    const item = await create(space.id, 'Keep')
    expect((await send(ada, 'DELETE', `/items/${item.id}?mode=everything`)).status).toBe(400)
    expect((await send(ada, 'DELETE', `/items/${crypto.randomUUID()}`)).status).toBe(404)
    expect((await send(cleo, 'DELETE', `/items/${item.id}`)).status).toBe(403)
    expect((await apiAs(ada, `/items/${item.id}`)).status).toBe(200)
  })
})

describe('the contract', () => {
  it('describes the write routes: bodies, the 201, and the errors a client can expect', async () => {
    const { body } = await api('/openapi.json')
    const create = body.paths['/items'].post
    expect(Object.keys(create.responses)).toEqual(['201', '400', '401', '403', '404', '409'])
    expect(create.requestBody.content['application/json'].schema.required).toEqual(['space_id', 'title'])
    expect(create.requestBody.content['application/json'].schema.additionalProperties).toBe(false)
    expect(body.paths['/items/{id}'].patch.requestBody).toBeDefined()
    expect(body.paths['/items/{id}'].delete.parameters.map((p: Json) => p.name)).toEqual(['id', 'mode'])
    expect(body.paths['/items/{id}/move'].post.requestBody.content['application/json'].schema.properties).toHaveProperty('after_id')
  })

  it('lists the write actions and event types in the layer list', async () => {
    const items = (await api('')).body.modules.find((m: Json) => m.name === 'items')
    expect(items.actions).toEqual(expect.arrayContaining(['item.create', 'item.update', 'item.move', 'item.delete']))
    expect(items.event_types).toEqual(['item.created', 'item.updated', 'item.moved', 'item.deleted'])
  })
})
