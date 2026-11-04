// Create and update behaviour of /api/items.
import { describe, expect, it } from 'vitest'
import { api, cleanupCreatedItems, createItem, type Item } from './helpers'

cleanupCreatedItems()
const SPACE = 'space-ada'
const patch = (id: string, body: unknown) => api<Item>(`/api/items/${id}`, { method: 'PATCH', body })
const listIds = async (column: string) =>
  (await api<Item[]>(`/api/items?space_id=${SPACE}`)).body.filter(i => i.board_column === column).map(i => i.id)

describe('POST /api/items (progressive creation)', () => {
  it('needs only a title: trimmed, unstarted, first column, type task', async () => {
    const item = await createItem({ space_id: SPACE, title: '  Water plants  ' })
    expect(item).toMatchObject({ title: 'Water plants', state: 'unstarted', board_column: 'backlog', type: 'task', parent_id: null })
  })

  it('derives the child type from the parent', async () => {
    const epic = await createItem({ space_id: 'space-acme', title: 'test epic', parent_id: 'item-web' })
    expect(epic.type).toBe('epic')
    const story = await createItem({ space_id: 'space-acme', title: 'test story', parent_id: epic.id })
    expect(story.type).toBe('story')
  })

  it('honours an explicit column and derives the state from it', async () => {
    const item = await createItem({ space_id: SPACE, title: 'already going', board_column: 'in_progress' })
    expect(item.state).toBe('started')
  })

  it('appends to the end of its column', async () => {
    const a = await createItem({ space_id: SPACE, title: 'first' })
    const b = await createItem({ space_id: SPACE, title: 'second' })
    expect(b.position).toBeGreaterThan(a.position)
  })

  it.each([
    ['empty title', { space_id: SPACE, title: '   ' }, /title/],
    ['missing space', { title: 'x' }, /space_id/],
    ['bad type', { space_id: SPACE, title: 'x', type: 'saga' }, /type/],
    ['bad column', { space_id: SPACE, title: 'x', board_column: 'later' }, /board_column/],
    ['too long title', { space_id: SPACE, title: 'x'.repeat(201) }, /title/],
  ])('rejects %s with a readable 400', async (_name, body, message) => {
    const res = await api('/api/items', { body })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(message)
  })

  it('rejects invalid JSON with 400', async () => {
    expect((await api('/api/items', { rawBody: '{bad' })).status).toBe(400)
  })
})

describe('PATCH /api/items/:id', () => {
  it('edits title, description and type', async () => {
    const item = await createItem({ space_id: SPACE, title: 'old' })
    const res = await patch(item.id, { title: 'new', description: 'details', type: 'story' })
    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({ title: 'new', description: 'details', type: 'story' })
  })

  it('moving to a column sets the matching state', async () => {
    const item = await createItem({ space_id: SPACE, title: 'mover' })
    expect((await patch(item.id, { board_column: 'done' })).body).toMatchObject({ board_column: 'done', state: 'done' })
    expect((await patch(item.id, { board_column: 'in_progress' })).body).toMatchObject({ state: 'started' })
  })

  it('changing the state moves the card; discarded stays in its column', async () => {
    const item = await createItem({ space_id: SPACE, title: 'stateful' })
    expect((await patch(item.id, { state: 'started' })).body).toMatchObject({ board_column: 'in_progress' })
    expect((await patch(item.id, { state: 'discarded' })).body).toMatchObject({ state: 'discarded', board_column: 'in_progress' })
  })

  it('drops a card before another one in the same column', async () => {
    const a = await createItem({ space_id: SPACE, title: 'A' })
    const b = await createItem({ space_id: SPACE, title: 'B' })
    const c = await createItem({ space_id: SPACE, title: 'C' })
    await patch(c.id, { board_column: 'backlog', before_id: a.id })
    const ids = await listIds('backlog')
    expect(ids.indexOf(c.id)).toBeLessThan(ids.indexOf(a.id))
    expect(ids.indexOf(a.id)).toBeLessThan(ids.indexOf(b.id))
  })

  it('drops a card between two others across columns', async () => {
    const a = await createItem({ space_id: SPACE, title: 'A', board_column: 'done' })
    const b = await createItem({ space_id: SPACE, title: 'B', board_column: 'done' })
    const mover = await createItem({ space_id: SPACE, title: 'mover' })
    const res = await patch(mover.id, { board_column: 'done', before_id: b.id })
    expect(res.body.state).toBe('done')
    expect(res.body.position).toBeGreaterThan(a.position)
    expect(res.body.position).toBeLessThan(b.position)
  })

  it('sets and clears the lead, only for members of the space', async () => {
    const item = await createItem({ space_id: SPACE, title: 'led' })
    expect((await patch(item.id, { lead_id: 'actor-ada' })).body.lead_id).toBe('actor-ada')
    expect((await patch(item.id, { lead_id: null })).body.lead_id).toBeNull()
    const res = await patch(item.id, { lead_id: 'actor-ben' }) // Ben is not in Ada's personal space
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/lead_id/)
  })

  it.each([
    ['unknown state', { state: 'nope' }, /state/],
    ['unknown key', { foo: 1 }, /foo/],
    ['empty body', {}, /nothing to update/],
    ['empty title', { title: '' }, /title/],
  ])('rejects %s with a readable 400', async (_name, body, message) => {
    const item = await createItem({ space_id: SPACE, title: 'victim' })
    const res = await patch(item.id, body)
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(message)
  })

  it('returns 404 for an unknown item', async () => {
    expect((await patch('does-not-exist', { title: 'x' })).status).toBe(404)
  })
})
