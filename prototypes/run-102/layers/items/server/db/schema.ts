// Table owned by the items layer. It points at workspace tables, never the other way round.
import { sql } from 'drizzle-orm'
import { check, foreignKey, index, integer, pgTable, text, unique, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, oneOf, orderKey, updatedAt } from '../../../core/server/db/columns'
import { actors, columns, spaces, STATES } from '../../../workspace/server/db/schema'

export const ITEM_TYPES = ['project', 'epic', 'story', 'task'] as const

export const items = pgTable(
  'items',
  {
    id: id(),
    spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    // null = root item. Children are the rows where parent_id matches; the parent stores no list.
    parentId: uuid('parent_id'),
    type: text('type', { enum: ITEM_TYPES }).notNull().default('task'),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    state: text('state', { enum: STATES }).notNull().default('unstarted'),
    columnId: uuid('column_id').notNull(),
    // Fractional key: order among siblings, so a move rewrites only the moved row.
    position: orderKey('position').notNull(),
    leadId: uuid('lead_id').references(() => actors.id, { onDelete: 'set null' }),
    // Goes up on every edit of a versioned field; writers say which version they expect.
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check('items_type_check', oneOf(t.type, ITEM_TYPES)),
    check('items_state_check', oneOf(t.state, STATES)),
    check('items_version_check', sql`${t.version} >= 1`),
    // The smallest possible cycle. Longer cycles are prevented by the move service, under the space lock.
    check('items_not_own_parent', sql`${t.parentId} <> ${t.id}`),
    // Target of foreign keys from other layers (tags, comments, ...) that must stay in the same space.
    unique('items_space_id_unique').on(t.spaceId, t.id),
    // The parent must be in the same space. A null parent_id skips the check (root items).
    foreignKey({
      name: 'items_parent_same_space_fk',
      columns: [t.spaceId, t.parentId],
      foreignColumns: [t.spaceId, t.id],
    }).onDelete('cascade'),
    // The column must be in the same space AND carry the item's state: one rule, enforced by Postgres.
    foreignKey({
      name: 'items_column_same_space_and_state_fk',
      columns: [t.spaceId, t.columnId, t.state],
      foreignColumns: [columns.spaceId, columns.id, columns.state],
    }).onDelete('restrict'),
    index('items_space_idx').on(t.spaceId),
    index('items_parent_position_idx').on(t.parentId, t.position),
    index('items_column_position_idx').on(t.spaceId, t.columnId, t.position),
    index('items_lead_idx').on(t.leadId),
  ],
)

export type Item = typeof items.$inferSelect
export type NewItem = typeof items.$inferInsert
