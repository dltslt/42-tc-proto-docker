// Tables owned by the tags layer. They point at workspace and items tables, never the other way round.
import { sql } from 'drizzle-orm'
import { foreignKey, index, pgTable, primaryKey, text, timestamp, unique, uniqueIndex, uuid } from 'drizzle-orm/pg-core'
import { createdAt, id, updatedAt } from '../../../core/server/db/columns'
import { spaces } from '../../../workspace/server/db/schema'
import { items } from '../../../items/server/db/schema'

export const tags = pgTable(
  'tags',
  {
    id: id(),
    spaceId: uuid('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    // "Bug" and "bug" are the same tag inside one space.
    uniqueIndex('tags_space_lower_name_unique').on(t.spaceId, sql`lower(${t.name})`),
    // Target of the link table's foreign key, so a link can prove tag and item share a space.
    unique('tags_space_id_unique').on(t.spaceId, t.id),
  ],
)

// A link says "this item has this tag". Both sides must live in the link's space (composite foreign keys).
export const itemTags = pgTable(
  'item_tags',
  {
    spaceId: uuid('space_id').notNull(),
    itemId: uuid('item_id').notNull(),
    tagId: uuid('tag_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'item_tags_pk', columns: [t.itemId, t.tagId] }),
    foreignKey({ name: 'item_tags_item_same_space_fk', columns: [t.spaceId, t.itemId], foreignColumns: [items.spaceId, items.id] }).onDelete('cascade'),
    foreignKey({ name: 'item_tags_tag_same_space_fk', columns: [t.spaceId, t.tagId], foreignColumns: [tags.spaceId, tags.id] }).onDelete('cascade'),
    index('item_tags_tag_idx').on(t.tagId),
  ],
)

export type Tag = typeof tags.$inferSelect
export type ItemTag = typeof itemTags.$inferSelect
