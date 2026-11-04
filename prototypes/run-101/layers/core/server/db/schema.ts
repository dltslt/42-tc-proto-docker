// Server-only table definition, read by the app and by drizzle-kit to generate migrations.
import { sql } from 'drizzle-orm'
import { bigint, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

// The old and new value of every changed field. A created row has old = null.
export type EventChanges = Record<string, { old: unknown, new: unknown }>

// Append-only log of every write. A database trigger rejects UPDATE, DELETE and TRUNCATE.
// target_kind and type are free text, so a new module adds event kinds without a migration.
// target_id has no foreign key because a target can be any table and its events outlive it.
// space_id and actor_id do have foreign keys, in a hand-written migration: core must not import workspace.
export const events = pgTable('events', {
  // An identity column, unlike a UUID, also records the order of events within one transaction.
  id: bigint('id', { mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
  spaceId: uuid('space_id'),
  targetKind: text('target_kind').notNull(),
  targetId: text('target_id').notNull(),
  actorId: uuid('actor_id').notNull(),
  type: text('type').notNull(),
  changes: jsonb('changes').$type<EventChanges>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  index('events_target_idx').on(table.targetKind, table.targetId, table.id),
  index('events_space_idx').on(table.spaceId, table.id),
])
