// Smoke test of the seeded fixtures (run `make seed RUN=100` first).
import { describe, expect, it } from 'vitest'
import { api, type Item } from './helpers'

describe('seeded data', () => {
  it('exposes both spaces and the four actors with their memberships', async () => {
    const { status, body } = await api('/api/actors', { actor: null })
    expect(status).toBe(200)
    expect(body.spaces.map((s: any) => s.id).sort()).toEqual(['space-acme', 'space-ada'])
    expect(body.actors).toHaveLength(4)
    const ada = body.actors.find((a: any) => a.id === 'actor-ada')
    expect(ada.space_ids.sort()).toEqual(['space-acme', 'space-ada'])
    expect(body.actors.find((a: any) => a.id === 'actor-ben').space_ids).toEqual(['space-acme'])
  })

  it('keeps the recursive hierarchy: project > epic > story > task > subtask', async () => {
    const { body } = await api<Item[]>('/api/items?space_id=space-acme')
    const byId = new Map(body.map(i => [i.id, i]))
    const chain = ['item-validation', 'item-inputs', 'item-components', 'item-design', 'item-web']
    chain.forEach((id, n) => {
      if (n < chain.length - 1) expect(byId.get(id)?.parent_id).toBe(chain[n + 1])
    })
    expect(byId.get('item-web')?.parent_id).toBeNull()
  })

  it('returns items ordered by column, then position', async () => {
    const { body } = await api<Item[]>('/api/items?space_id=space-acme')
    const rank = (c: string) => ['backlog', 'in_progress', 'done'].indexOf(c)
    for (let i = 1; i < body.length; i++) {
      const [a, b] = [body[i - 1]!, body[i]!]
      expect(rank(a.board_column) <= rank(b.board_column)).toBe(true)
      if (a.board_column === b.board_column) expect(a.position).toBeLessThanOrEqual(b.position)
    }
  })

  it('keeps columns and states consistent in the fixtures', async () => {
    const { body } = await api<Item[]>('/api/items?space_id=space-acme')
    const expected: Record<string, string> = { backlog: 'unstarted', in_progress: 'started', done: 'done' }
    for (const item of body) expect(item.state).toBe(expected[item.board_column])
  })
})
