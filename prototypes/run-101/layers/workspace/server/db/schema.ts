// Server-only table definitions, read by the app and by drizzle-kit to generate migrations.
import { sql } from 'drizzle-orm'
import { check, index, pgEnum, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core'
import { sortKey } from '../../../core/server/db/columns'
import { ACTOR_KINDS, ITEM_STATES, SPACE_TYPES } from '../../shared/workspace'

export const spaceType = pgEnum('space_type', SPACE_TYPES)
export const actorKind = pgEnum('actor_kind', ACTOR_KINDS)
export const itemState = pgEnum('item_state', ITEM_STATES)

export const spaces = pgTable('spaces', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  type: spaceType('type').notNull(),
}, table => [
  check('spaces_name_not_blank', sql`btrim(${table.name}) <> ''`),
])

export const actors = pgTable('actors', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  kind: actorKind('kind').notNull(),
}, table => [
  check('actors_name_not_blank', sql`btrim(${table.name}) <> ''`),
])

export const memberships = pgTable('memberships', {
  spaceId: uuid('space_id').notNull().references(() => spaces.id),
  actorId: uuid('actor_id').notNull().references(() => actors.id),
}, table => [
  primaryKey({ columns: [table.spaceId, table.actorId] }),
  // The primary key finds the members of a space. This finds the spaces of an actor.
  index('memberships_actor_idx').on(table.actorId),
])

// The space's shared workflow. A state may have several columns (In progress, Review), and every item is in one.
// Discarded items sit in a column too, which the board hides, so items.column_id never has to be null.
export const columns = pgTable('columns', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id').notNull().references(() => spaces.id),
  name: text('name').notNull(),
  state: itemState('state').notNull(),
  position: sortKey('position').notNull(),
}, table => [
  // Not needed for uniqueness (id already is): a composite foreign key can only point at a unique constraint.
  unique('columns_space_id_id_state_key').on(table.spaceId, table.id, table.state),
  check('columns_name_not_blank', sql`btrim(${table.name}) <> ''`),
])
