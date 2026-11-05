// Pure TypeScript: choose order keys when an item is placed among its siblings.
// Order is a fractional key (the `fractional-indexing` package): a string that sorts between two others,
// so placing an item rewrites only that item. Siblings are read in (position, id) order, which means two
// siblings with the same key still have one agreed order.
//
// The library cannot make a key between two EQUAL keys, and such ties can exist (for example when two
// clients placed items into the same gap before writes were serialised). The helpers here repair a tie
// by giving the tied siblings that come after the gap fresh keys, and say which rows they rewrote.
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

export interface Rewrite {
  id: string
  key: string
}

export interface Placement {
  // The key for the item being placed.
  key: string
  // Other siblings that had to get a new key to make room. Usually empty.
  rewrites: Rewrite[]
}

// Place right after an anchor sibling whose key is `anchorKey`.
//   tiedAfter:   ids of siblings that have the SAME key as the anchor but sort after it (by id), in order
//   nextGreater: the smallest key bigger than the anchor's, or null if there is none
export function placeAfter(anchorKey: string, tiedAfter: string[], nextGreater: string | null): Placement {
  if (tiedAfter.length === 0) return { key: generateKeyBetween(anchorKey, nextGreater), rewrites: [] }
  // Spread the new item and the tied siblings over the room between the anchor and the next bigger key.
  const [key, ...rest] = generateNKeysBetween(anchorKey, nextGreater, tiedAfter.length + 1) as [string, ...string[]]
  return { key, rewrites: tiedAfter.map((id, i) => ({ id, key: rest[i]! })) }
}

// Place before the first sibling, whose key is `firstKey`. Strictly smaller, so no tie can interfere.
export const placeFirst = (firstKey: string | null): Placement => ({ key: generateKeyBetween(null, firstKey), rewrites: [] })

// Place after every sibling, whose biggest key is `lastKey`.
export const placeLast = (lastKey: string | null): Placement => ({ key: generateKeyBetween(lastKey, null), rewrites: [] })

// `count` keys that keep their order, all strictly between `from` and `to`. Used to lift children into
// the place their parent had.
export const keysBetween = (from: string | null, to: string | null, count: number): string[] =>
  count === 0 ? [] : generateNKeysBetween(from, to, count)

// True when `current` already sits strictly between the bounds, so a move would change nothing.
export const staysBetween = (current: string, lo: string | null, hi: string | null): boolean =>
  (lo === null || lo < current) && (hi === null || current < hi)
