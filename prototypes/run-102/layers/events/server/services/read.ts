// Read service for the event log. Server-only. The caller has already been checked for access to the space.
import { and, asc, eq, gt } from 'drizzle-orm'
import type { Db } from '#layers/workspace/server/services/identity'
import { events } from '../db/schema'
import { toEventDto, type ListEventsQuery } from '../schemas'

export async function listEvents(db: Db, spaceId: string, q: ListEventsQuery) {
  const rows = await db
    .select()
    .from(events)
    .where(and(
      eq(events.spaceId, spaceId),
      gt(events.id, q.after),
      q.type ? eq(events.type, q.type) : undefined,
      q.target_kind ? eq(events.targetKind, q.target_kind) : undefined,
      q.target_id ? eq(events.targetId, q.target_id) : undefined,
    ))
    .orderBy(asc(events.id))
    .limit(q.limit + 1) // one extra row tells us whether another page exists
  const kept = rows.slice(0, q.limit)
  return {
    data: kept.map(toEventDto),
    next_cursor: rows.length > q.limit ? String(kept[kept.length - 1]!.id) : null,
  }
}
