// The event writer. Server-only. Every write in every layer ends by calling `recordEvent` inside its own
// transaction, so the change and its event are saved together or not at all.
// This layer sits below `items` (and every layer that writes), because they call it; it imports nothing from them.
import { allEventTypes } from '#layers/core/server/lib/registry'
import type { Db } from '#layers/workspace/server/services/identity'
import { events } from '../db/schema'

// One changed field: the value before and after. `null` stands for "did not exist" or "no longer exists".
export type Changes = Record<string, { from: unknown; to: unknown }>

export interface NewEvent {
  spaceId: string | null
  type: string
  actorId: string
  targetKind: string
  targetId: string
  changes?: Changes
}

// Returns the new event's id. Pass the transaction handle (`tx`), not the pool, so it joins the caller's transaction.
export async function recordEvent(db: Db, event: NewEvent): Promise<number> {
  // A misspelled type is a bug in the calling layer, so fail loudly instead of writing a log nobody can read.
  if (!allEventTypes().includes(event.type)) {
    throw new Error(`Unknown event type "${event.type}": list it in eventTypes of the layer that writes it`)
  }
  const [row] = await db
    .insert(events)
    .values({
      spaceId: event.spaceId,
      type: event.type,
      actorId: event.actorId,
      targetKind: event.targetKind,
      targetId: event.targetId,
      changes: event.changes ?? {},
    })
    .returning({ id: events.id })
  return row!.id
}

// The fields whose value really changed, as { from, to }. Compares with `===`: values are strings, numbers, null.
export function diffChanges<T extends Record<string, unknown>>(before: T, after: T, fields: readonly (keyof T & string)[]): Changes {
  const changes: Changes = {}
  for (const field of fields) {
    if (before[field] !== after[field]) changes[field] = { from: before[field] ?? null, to: after[field] ?? null }
  }
  return changes
}

// For a new row: every non-null field "changes" from nothing to its value.
export function createdChanges<T extends Record<string, unknown>>(row: T, fields: readonly (keyof T & string)[]): Changes {
  const changes: Changes = {}
  for (const field of fields) if (row[field] !== null && row[field] !== undefined && row[field] !== '') changes[field] = { from: null, to: row[field] }
  return changes
}

// For a removed row: every non-null field "changes" from its value to nothing.
export function removedChanges<T extends Record<string, unknown>>(row: T, fields: readonly (keyof T & string)[]): Changes {
  const changes: Changes = {}
  for (const field of fields) if (row[field] !== null && row[field] !== undefined && row[field] !== '') changes[field] = { from: row[field], to: null }
  return changes
}
