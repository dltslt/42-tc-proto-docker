// DELETE /api/items/:id (cascading) and reparenting through PATCH parent_id.
import { describe, expect, it } from 'vitest'
import { api, cleanupCreatedItems, createItem, type Item } from './helpers'

cleanupCreatedItems()
const SPACE = 'space-ada'
const patch = (id: string, body: unknown, actor?: string) => api<Item>(`/api/items/${id}`, { method: 'PATCH', body, actor })
const del = (id: string, actor?: string | null) => api(`/api/items/${id}`, { method: 'DELETE', actor })
const ids = async () => (await api<Item[]>(`/api/items?space_id=${SPACE}`)).body.map(i => i.id)

describe('DELETE /api/items/:id', () => {
  it('deletes a leaf item', async () => {
    const item = await createItem({ space_id: SPACE, title: 'leaf' })
    const res = await del(item.id)
    expect(res).toMatchObject({ status: 200, body: { deleted: 1 } })
    expect(await ids()).not.toContain(item.id)
  })

  it('deletes the whole subtree and reports how many items went', async () => {
    const root = await createItem({ space_id: SPACE, title: 'root' })
    const child = await createItem({ space_id: SPACE, title: 'child', parent_id: root.id })
    const grandchild = await createItem({ space_id: SPACE, title: 'grandchild', parent_id: child.id })
    const sibling = await createItem({ space_id: SPACE, title: 'sibling' })
    expect((await del(root.id)).body).toEqual({ deleted: 3 })
    const left = await ids()
    expect(left).not.toContain(child.id)
    expect(left).not.toContain(grandchild.id)
    expect(left).toContain(sibling.id)
  })

  it('deleting a child keeps its parent', async () => {
    const parent = await createItem({ space_id: SPACE, title: 'parent' })
    const child = await createItem({ space_id: SPACE, title: 'child', parent_id: parent.id })
    await del(child.id)
    expect(await ids()).toContain(parent.id)
  })

  it('returns 404 for unknown items and for items of a foreign space', async () => {
    expect((await del('does-not-exist')).status).toBe(404)
    const item = await createItem({ space_id: SPACE, title: 'private' })
    expect((await del(item.id, 'actor-ben')).status).toBe(404)
    expect(await ids()).toContain(item.id)
  })

  it('returns 401 without identity', async () => {
    const item = await createItem({ space_id: SPACE, title: 'x' })
    expect((await del(item.id, null)).status).toBe(401)
  })
})

describe('PATCH parent_id (reparent)', () => {
  it('moves an item under another parent', async () => {
    const a = await createItem({ space_id: SPACE, title: 'a' })
    const b = await createItem({ space_id: SPACE, title: 'b' })
    expect((await patch(b.id, { parent_id: a.id })).body.parent_id).toBe(a.id)
  })

  it('moves a whole subtree along with its root', async () => {
    const target = await createItem({ space_id: SPACE, title: 'target' })
    const root = await createItem({ space_id: SPACE, title: 'root' })
    const child = await createItem({ space_id: SPACE, title: 'child', parent_id: root.id })
    await patch(root.id, { parent_id: target.id })
    const all = (await api<Item[]>(`/api/items?space_id=${SPACE}`)).body
    expect(all.find(i => i.id === child.id)?.parent_id).toBe(root.id)
    expect(all.find(i => i.id === root.id)?.parent_id).toBe(target.id)
  })

  it('null makes the item a root', async () => {
    const a = await createItem({ space_id: SPACE, title: 'a' })
    const b = await createItem({ space_id: SPACE, title: 'b', parent_id: a.id })
    expect((await patch(b.id, { parent_id: null })).body.parent_id).toBeNull()
  })

  it('does not touch column or state', async () => {
    const a = await createItem({ space_id: SPACE, title: 'a' })
    const b = await createItem({ space_id: SPACE, title: 'b', board_column: 'in_progress' })
    expect((await patch(b.id, { parent_id: a.id })).body).toMatchObject({ board_column: 'in_progress', state: 'started' })
  })

  it('rejects moving an item under itself', async () => {
    const a = await createItem({ space_id: SPACE, title: 'a' })
    const res = await patch(a.id, { parent_id: a.id })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/itself or its own descendants/)
  })

  it('rejects moving an item under its own descendant (cycle)', async () => {
    const a = await createItem({ space_id: SPACE, title: 'a' })
    const b = await createItem({ space_id: SPACE, title: 'b', parent_id: a.id })
    const c = await createItem({ space_id: SPACE, title: 'c', parent_id: b.id })
    const res = await patch(a.id, { parent_id: c.id })
    expect(res.status).toBe(400)
    expect((await api<Item[]>(`/api/items?space_id=${SPACE}`)).body.find(i => i.id === a.id)?.parent_id).toBeNull()
  })

  it('rejects an unknown parent and a parent from another space', async () => {
    const a = await createItem({ space_id: SPACE, title: 'a' })
    expect((await patch(a.id, { parent_id: 'does-not-exist' })).status).toBe(400)
    const foreign = await patch(a.id, { parent_id: 'item-web' })
    expect(foreign.status).toBe(400)
    expect(foreign.body.message).toMatch(/parent_id/)
  })
})
