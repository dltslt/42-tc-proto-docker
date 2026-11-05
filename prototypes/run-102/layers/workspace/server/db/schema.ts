// Tables owned by the workspace layer: spaces, actors, memberships and the columns of each space's workflow.
// Server-only. `drizzle-kit generate` reads this file (see ../../../../drizzle.config.ts) and writes the SQL.
import { check, index, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, oneOf, orderKey, updatedAt } from '../../../core/server/db/columns'

export const SPACE_TYPES = ['personal', 'organization'] as const
export const ACTOR_KINDS = ['human', 'agent'] as const
// The item lifecycle. Every column maps to exactly one of these.
export const STATES = ['unstarted', 'started', 'done', 'discarded'] as const

export const spaces = pgTable(
  'spaces',
  {
    id: id(),
    name: text('name').notNull(),
    type: text('type', { enum: SPACE_TYPES }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('spaces_type_check', oneOf(t.type, SPACE_TYPES))],
)

export const actors = pgTable(
  'actors',
  {
    id: id(),
    name: text('name').notNull(),
    kind: text('kind', { enum: ACTOR_KINDS }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [check('actors_kind_check', oneOf(t.kind, ACTOR_KINDS))],
)

// A join table: it has no `id` of its own, the pair is the key.
export const memberships = pgTable(
  'memberships',
  {
    spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').notNull().references(() => actors.id, { onDelete: 'cascade' }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.spaceId, t.actorId] }), index('memberships_actor_idx').on(t.actorId)],
)

export const columns = pgTable(
  'columns',
  {
    id: id(),
    spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    state: text('state', { enum: STATES }).notNull(),
    position: orderKey('position').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('columns_state_check', oneOf(t.state, STATES)),
    unique('columns_space_name_unique').on(t.spaceId, t.name),
    // Targets of foreign keys from items: they make "same space" and "same state" a database rule.
    unique('columns_space_id_unique').on(t.spaceId, t.id),
    unique('columns_space_id_state_unique').on(t.spaceId, t.id, t.state),
    index('columns_space_position_idx').on(t.spaceId, t.position),
  ],
)

export type Space = typeof spaces.$inferSelect
export type Actor = typeof actors.$inferSelect
export type Column = typeof columns.$inferSelect
