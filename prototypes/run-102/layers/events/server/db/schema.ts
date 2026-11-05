// Table owned by the events layer: the append-only log of changes.
import { sql } from 'drizzle-orm'
import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'
import { actors, spaces } from '../../../workspace/server/db/schema'

export const events = pgTable(
  'events',
  {
    // Identity column: ids only go up, so "everything after id N" is a reliable replay point.
    id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    // Optional: some events belong to no space. No cascade: events outlive what they describe.
    spaceId: uuid('space_id').references(() => spaces.id, { onDelete: 'restrict' }),
    // Open strings, registered by the layer that writes them (for example `item.created`).
    type: text('type').notNull(),
    actorId: uuid('actor_id').notNull().references(() => actors.id, { onDelete: 'restrict' }),
    targetKind: text('target_kind').notNull(),
    // No foreign key: the target can be any table, and may be deleted later.
    targetId: uuid('target_id').notNull(),
    // { field: { from, to } } for each changed field.
    changes: jsonb('changes').notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    index('events_target_idx').on(t.targetKind, t.targetId),
    index('events_space_id_idx').on(t.spaceId, t.id),
  ],
)

export type Event = typeof events.$inferSelect
export type NewEvent = typeof events.$inferInsert
