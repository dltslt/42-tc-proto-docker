// What the event route sends back and accepts, plus the row-to-JSON mapping.
import { z } from 'zod'
import { PageParams } from '#layers/core/server/lib/pagination'
import type { Event } from './db/schema'

export const EventSchema = z.object({
  id: z.number().int().describe('Ever-growing; the replay point for ?after='),
  space_id: z.uuid().nullable(),
  type: z.string().describe('For example "item.created"; registered by the layer that writes it'),
  actor_id: z.uuid(),
  target_kind: z.string(),
  target_id: z.uuid(),
  changes: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })),
  created_at: z.iso.datetime(),
})

export const toEventDto = (e: Event): z.input<typeof EventSchema> => ({
  id: e.id,
  space_id: e.spaceId,
  type: e.type,
  actor_id: e.actorId,
  target_kind: e.targetKind,
  target_id: e.targetId,
  changes: e.changes as Record<string, { from: unknown; to: unknown }>,
  created_at: e.createdAt.toISOString(),
})

// The log is read oldest first and has no sort option. Instead of an opaque cursor it pages by event id:
// `next_cursor` is the id of the last event returned, and goes back as `?after=`.
export const ListEventsQuery = PageParams.omit({ cursor: true }).extend({
  after: z.coerce.number().int().min(0).default(0).describe('Only events with an id greater than this'),
  type: z.string().min(1).optional().describe('Exact event type, like "item.moved"'),
  target_kind: z.string().min(1).optional(),
  target_id: z.uuid().optional(),
})
export type ListEventsQuery = z.output<typeof ListEventsQuery>
