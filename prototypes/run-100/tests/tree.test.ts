// Unit tests for the pure tree helpers (no server needed).
import { describe, expect, it } from 'vitest'
import { buildChildMap, descendantsOf } from '../shared/utils/tree'
import type { Item } from './helpers'

const item = (id: string, parent_id: string | null, created_at: string): Item & { created_at: string } =>
  ({ id, parent_id, created_at, space_id: 's', type: 'task', title: id, description: '', state: 'unstarted', board_column: 'backlog', position: 0, lead_id: null })

// a (root)
// ├─ b ── d ── e
// └─ c
// z (second root)
const items = [
  item('c', 'a', '2026-01-03'), item('a', null, '2026-01-01'), item('b', 'a', '2026-01-02'),
  item('d', 'b', '2026-01-04'), item('e', 'd', '2026-01-05'), item('z', null, '2026-01-06'),
] as any[]

describe('buildChildMap', () => {
  it('groups children by parent and uses "" for roots', () => {
    const map = buildChildMap(items)
    expect(map[''].map(i => i.id)).toEqual(['a', 'z'])
    expect(map.b!.map(i => i.id)).toEqual(['d'])
  })

  it('orders siblings oldest first', () => {
    expect(buildChildMap(items).a!.map(i => i.id)).toEqual(['b', 'c'])
  })
})

describe('descendantsOf', () => {
  const map = buildChildMap(items)

  it('returns all levels below the root, excluding the root', () => {
    expect(descendantsOf(map, 'a').map(i => i.id).sort()).toEqual(['b', 'c', 'd', 'e'])
  })

  it('returns an empty list for a leaf or an unknown id', () => {
    expect(descendantsOf(map, 'e')).toEqual([])
    expect(descendantsOf(map, 'nope')).toEqual([])
  })

  it('does not leak into sibling trees', () => {
    expect(descendantsOf(map, 'z')).toEqual([])
    expect(descendantsOf(map, 'b').map(i => i.id).sort()).toEqual(['d', 'e'])
  })

  it('terminates on a corrupt parent cycle', () => {
    const cyc = buildChildMap([item('x', 'y', '1'), item('y', 'x', '2')] as any[])
    expect(descendantsOf(cyc, 'x').map(i => i.id)).toEqual(['y'])
  })
})
