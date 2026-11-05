// Read services for items. Server-only. Take the database handle first, like every service.
import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm'
import { keysetAfter, keysetOrder, type Keyset } from '#layers/core/server/db/keyset'
import { notFound } from '#layers/core/server/lib/errors'
import { decodeCursor, toPage } from '#layers/core/server/lib/pagination'
import { requireSpaceAccess, type Db } from '#layers/workspace/server/services/identity'
import { items } from '../db/schema'
import { toItemDto, type ListItemsQuery } from '../schemas'

// Search text is data, not a pattern: neutralise the characters LIKE treats specially.
const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`)

export async function listItems(db: Db, actorId: string, q: ListItemsQuery) {
  await requireSpaceAccess(db, actorId, q.space_id) // 404 unknown space, 403 not a member

  const dir = q.sort.startsWith('-') ? ('desc' as const) : ('asc' as const)
  const keyset: Keyset = q.sort.endsWith('position')
    ? { key: items.position, keyText: sql<string>`${items.position}`, cast: 'text', id: items.id, dir }
    : { key: items.createdAt, keyText: sql<string>`${items.createdAt}::text`, cast: 'timestamptz', id: items.id, dir }

  const pattern = q.q ? `%${escapeLike(q.q)}%` : undefined
  const rows = await db
    .select({ row: items, k: keyset.keyText })
    .from(items)
    .where(
      and(
        eq(items.spaceId, q.space_id),
        q.state ? eq(items.state, q.state) : undefined,
        q.type ? eq(items.type, q.type) : undefined,
        q.column_id ? eq(items.columnId, q.column_id) : undefined,
        q.lead_id ? eq(items.leadId, q.lead_id) : undefined,
        q.parent_id === 'null' ? isNull(items.parentId) : q.parent_id ? eq(items.parentId, q.parent_id) : undefined,
        pattern ? or(ilike(items.title, pattern), ilike(items.description, pattern)) : undefined,
        keysetAfter(keyset, decodeCursor(q.cursor, q.sort)),
      ),
    )
    .orderBy(...keysetOrder(keyset))
    .limit(q.limit + 1) // one extra row tells us whether a next page exists
  return toPage(rows, q.limit, q.sort, (r) => toItemDto(r.row), (r) => [r.k, r.row.id])
}

export async function getItem(db: Db, actorId: string, id: string) {
  const [item] = await db.select().from(items).where(eq(items.id, id))
  if (!item) throw notFound('Item not found')
  await requireSpaceAccess(db, actorId, item.spaceId) // 403 if the item lives in a space the actor is not in
  return toItemDto(item)
}
