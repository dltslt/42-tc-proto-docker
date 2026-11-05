// Pure TypeScript: the list envelope and opaque cursors shared by every list route.
// Lists answer { data, next_cursor }. Pass `next_cursor` back as ?cursor= for the next page; null means the end.
import { z } from 'zod'
import { badRequest } from './errors'

export const PageParams = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50).describe('Page size, 1 to 200'),
  cursor: z.string().min(1).optional().describe('`next_cursor` from the previous page'),
})

export const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({ data: z.array(item), next_cursor: z.string().nullable() })

// The position after the last row of a page: the sort key as text, and the id that breaks ties.
export type CursorValues = [key: string, id: string]

// Clients treat the cursor as opaque. It names the sort so a cursor cannot be reused under another one.
export function encodeCursor(sort: string, values: CursorValues): string {
  return Buffer.from(JSON.stringify({ sort, values })).toString('base64url')
}

export function decodeCursor(cursor: string | undefined, sort: string): CursorValues | undefined {
  if (cursor === undefined) return undefined
  const invalid = (why: string) => badRequest('Invalid cursor', { 'query.cursor': [why] })
  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'))
  } catch {
    throw invalid('Not a cursor from this API')
  }
  const { sort: cursorSort, values } = (parsed ?? {}) as { sort?: unknown; values?: unknown }
  if (!Array.isArray(values) || values.length !== 2 || !values.every((v) => typeof v === 'string')) {
    throw invalid('Not a cursor from this API')
  }
  if (cursorSort !== sort) throw invalid('This cursor belongs to a different sort order')
  return values as CursorValues
}

// Queries fetch `limit + 1` rows. An extra row means there is a next page, starting after the last kept row.
export function toPage<R, T>(
  rows: R[],
  limit: number,
  sort: string,
  map: (row: R) => T,
  cursorOf: (row: R) => CursorValues,
): { data: T[]; next_cursor: string | null } {
  const kept = rows.slice(0, limit)
  const last = kept[kept.length - 1]
  return {
    data: kept.map(map),
    next_cursor: rows.length > limit && last ? encodeCursor(sort, cursorOf(last)) : null,
  }
}
