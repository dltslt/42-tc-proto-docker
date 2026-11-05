// Keyset pagination in SQL: "the rows after this one", without OFFSET. Stable while rows are added or removed,
// and fast on an index. Every list sorts by a key plus the id, so rows with equal keys still have one order.
import { asc, desc, sql, type SQL } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'
import type { CursorValues } from '../lib/pagination'

export interface Keyset {
  key: SQL | AnyPgColumn // what the list is sorted by
  keyText: SQL<string> // the same value as text, stored in the cursor
  // Type to read the cursor text back as. Timestamps travel as text with full microsecond precision;
  // a JavaScript Date would round them and a page boundary could skip or repeat rows.
  cast: 'text' | 'timestamptz'
  id: AnyPgColumn
  dir: 'asc' | 'desc'
}

export const keysetOrder = (k: Keyset) => (k.dir === 'asc' ? [asc(k.key), asc(k.id)] : [desc(k.key), desc(k.id)])

// Row comparison: (key, id) > (cursor key, cursor id). Postgres compares the pair like a sorted list.
export function keysetAfter(k: Keyset, cursor: CursorValues | undefined): SQL | undefined {
  if (!cursor) return undefined
  const op = sql.raw(k.dir === 'asc' ? '>' : '<')
  return sql`(${k.key}, ${k.id}) ${op} (${cursor[0]}::${sql.raw(k.cast)}, ${cursor[1]}::uuid)`
}
