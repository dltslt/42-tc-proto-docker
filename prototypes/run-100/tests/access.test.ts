// Identity and space isolation.
import { describe, expect, it } from 'vitest'
import { api, cleanupCreatedItems, createItem } from './helpers'

cleanupCreatedItems()

describe('identity and spaces', () => {
  it('rejects requests without an identity header (401)', async () => {
    expect((await api('/api/items?space_id=space-acme', { actor: null })).status).toBe(401)
  })

  it('refuses listing and creating in a space the actor does not belong to (403)', async () => {
    expect((await api('/api/items?space_id=space-ada', { actor: 'actor-ben' })).status).toBe(403)
    const res = await api('/api/items', { actor: 'actor-ben', body: { space_id: 'space-ada', title: 'sneaky' } })
    expect(res.status).toBe(403)
  })

  it('hides items of foreign spaces on PATCH (404, not 403)', async () => {
    const item = await createItem({ space_id: 'space-ada', title: 'private' })
    const res = await api(`/api/items/${item.id}`, { actor: 'actor-ben', method: 'PATCH', body: { title: 'hacked' } })
    expect(res.status).toBe(404)
  })

  it('never lists an item of one space in another', async () => {
    const item = await createItem({ space_id: 'space-ada', title: 'only in ada space' })
    const acme = await api<{ id: string }[]>('/api/items?space_id=space-acme')
    expect(acme.body.some(i => i.id === item.id)).toBe(false)
  })

  it('rejects a parent from another space (400)', async () => {
    const res = await api('/api/items', { body: { space_id: 'space-ada', title: 'x', parent_id: 'item-web' } })
    expect(res.status).toBe(400)
    expect(res.body.message).toMatch(/parent_id/)
  })
})
