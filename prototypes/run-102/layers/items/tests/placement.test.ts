// The order-key helpers, including the case the library cannot handle by itself: tied keys.
import { describe, expect, it } from 'vitest'
import { keysBetween, placeAfter, placeFirst, placeLast, staysBetween } from '../server/lib/placement'

type Row = { id: string; key: string }

// Read a sibling list the way the database does: by key (byte order), then id.
const order = (rows: Row[]) =>
  [...rows].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.id < b.id ? -1 : 1)).map((r) => r.id)

// Apply a placement to a list: rewrite the tied rows it names, then add the new item.
const apply = (rows: Row[], id: string, p: { key: string; rewrites: Row[] }): Row[] => [
  ...rows.map((r) => ({ ...r, key: p.rewrites.find((w) => w.id === r.id)?.key ?? r.key })),
  { id, key: p.key },
]

describe('placing between different keys', () => {
  it('needs no rewrite and lands strictly between', () => {
    const p = placeAfter('a0', [], 'a1')
    expect(p.rewrites).toEqual([])
    expect(p.key > 'a0' && p.key < 'a1').toBe(true)
  })

  it('works at both ends of a list', () => {
    expect(placeFirst('a0').key < 'a0').toBe(true)
    expect(placeLast('a0').key > 'a0').toBe(true)
    expect(placeFirst(null).key).toBe(placeLast(null).key) // an empty list has one possible first key
  })
})

describe('placing into a tie', () => {
  it('puts the new item right after the anchor even though later siblings share its key', () => {
    // a, b and c all have the key "a1" and read as a, b, c. Drop the new item right after a.
    const rows: Row[] = [{ id: 'a', key: 'a1' }, { id: 'b', key: 'a1' }, { id: 'c', key: 'a1' }, { id: 'd', key: 'a2' }]
    const p = placeAfter('a1', ['b', 'c'], 'a2')
    expect(p.rewrites.map((r) => r.id)).toEqual(['b', 'c']) // only the tied rows after the anchor change
    expect(order(apply(rows, 'new', p))).toEqual(['a', 'new', 'b', 'c', 'd'])
  })

  it('works when the tied rows are the last in the list', () => {
    const rows: Row[] = [{ id: 'a', key: 'a1' }, { id: 'b', key: 'a1' }]
    expect(order(apply(rows, 'new', placeAfter('a1', ['b'], null)))).toEqual(['a', 'new', 'b'])
  })

  it('leaves tied rows that sort before the anchor alone', () => {
    // a and b share a key and read a, b (by id). Dropping after b has no tied rows after it to rewrite.
    const rows: Row[] = [{ id: 'a', key: 'a1' }, { id: 'b', key: 'a1' }, { id: 'z', key: 'a2' }]
    const p = placeAfter('a1', [], 'a2')
    expect(p.rewrites).toEqual([])
    expect(order(apply(rows, 'new', p))).toEqual(['a', 'b', 'new', 'z'])
  })
})

describe('placing again and again into the same gap', () => {
  it('keeps every item in order and never creates a tie', () => {
    let rows: Row[] = [{ id: 'first', key: 'a0' }, { id: 'last', key: 'a1' }]
    const expected = ['first', 'last']
    for (let i = 0; i < 60; i++) {
      // always drop right after "first": the gap shrinks every time
      const next = rows.filter((r) => r.key > 'a0').map((r) => r.key).sort()[0] ?? null
      rows = apply(rows, `n${i}`, placeAfter('a0', [], next))
      expected.splice(1, 0, `n${i}`)
    }
    expect(order(rows)).toEqual(expected)
    expect(new Set(rows.map((r) => r.key)).size).toBe(rows.length)
  })
})

describe('byte order', () => {
  it('makes keys before "a0" start with an uppercase letter, which the C-collated column sorts first', () => {
    expect(placeFirst('a0').key).toMatch(/^[A-Z]/)
  })
})

describe('keysBetween and staysBetween', () => {
  it('returns increasing keys strictly inside the bounds', () => {
    const keys = keysBetween('a0', 'a1', 5)
    expect(keys).toHaveLength(5)
    expect([...keys].sort()).toEqual(keys)
    expect(keys.every((k) => k > 'a0' && k < 'a1')).toBe(true)
    expect(keysBetween('a0', null, 0)).toEqual([])
  })

  it('recognises an item that is already in place', () => {
    expect(staysBetween('a1', 'a0', 'a2')).toBe(true)
    expect(staysBetween('a1', null, null)).toBe(true)
    expect(staysBetween('a1', 'a1', 'a2')).toBe(false) // equal to the lower bound: a tie, so reposition
    expect(staysBetween('a2', 'a0', 'a2')).toBe(false)
  })
})
