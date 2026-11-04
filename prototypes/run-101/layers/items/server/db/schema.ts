// Server-only table definition, read by the app and by drizzle-kit to generate migrations.
import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core'
import { sortKey } from '../../../core/server/db/columns'
import { columns, itemState, memberships, spaces } from '../../../workspace/server/db/schema'
import { ITEM_TYPES } from '../../shared/items'

export const itemType = pgEnum('item_type', ITEM_TYPES)

export const items = pgTable('items', {
  id: uuid('id').primaryKey().defaultRandom(),
  spaceId: uuid('space_id').notNull().references(() => spaces.id),
  parentId: uuid('parent_id'),
  type: itemType('type').notNull().default('task'),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  state: itemState('state').notNull(),
  columnId: uuid('column_id').notNull(),
  position: sortKey('position').notNull(),
  leadId: uuid('lead_id'),
  // Goes up only when title or description changes: the check for simultaneous text edits.
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, table => [
  unique('items_space_id_key').on(table.spaceId, table.id),
  // Including space_id makes these keys reject a parent, column or lead from another space.
  foreignKey({
    name: 'items_parent_fk',
    columns: [table.spaceId, table.parentId],
    foreignColumns: [table.spaceId, table.id],
  }),
  // Including state means an item can only hold the state of its column: the two cannot drift apart.
  foreignKey({
    name: 'items_column_fk',
    columns: [table.spaceId, table.columnId, table.state],
    foreignColumns: [columns.spaceId, columns.id, columns.state],
  }),
  // A row with a null lead_id or parent_id skips its key, so both stay optional.
  foreignKey({
    name: 'items_lead_fk',
    columns: [table.spaceId, table.leadId],
    foreignColumns: [memberships.spaceId, memberships.actorId],
  }),
  check('items_title_not_blank', sql`btrim(${table.title}) <> ''`),
  check('items_not_own_parent', sql`${table.parentId} <> ${table.id}`),
  // Reads siblings in order. Postgres does not index foreign keys, so these also serve the checks above.
  index('items_siblings_idx').on(table.spaceId, table.parentId, table.position, table.id),
  index('items_column_idx').on(table.spaceId, table.columnId, table.state),
])
