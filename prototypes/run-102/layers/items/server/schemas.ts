// What the items routes accept and send back, plus the row-to-JSON mapping.
import { z } from 'zod'
import { PageParams } from '#layers/core/server/lib/pagination'
import { STATES } from '#layers/workspace/server/db/schema'
import { ITEM_TYPES, type Item } from './db/schema'

export const ItemSchema = z.object({
  id: z.uuid(),
  space_id: z.uuid(),
  parent_id: z.uuid().nullable(),
  type: z.enum(ITEM_TYPES),
  title: z.string(),
  description: z.string(),
  state: z.enum(STATES),
  column_id: z.uuid(),
  position: z.string(),
  lead_id: z.uuid().nullable(),
  version: z.number().int(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export const toItemDto = (i: Item): z.input<typeof ItemSchema> => ({
  id: i.id,
  space_id: i.spaceId,
  parent_id: i.parentId,
  type: i.type,
  title: i.title,
  description: i.description,
  state: i.state,
  column_id: i.columnId,
  position: i.position,
  lead_id: i.leadId,
  version: i.version,
  created_at: i.createdAt.toISOString(),
  updated_at: i.updatedAt.toISOString(),
})

export const SORTS = ['position', '-position', 'created_at', '-created_at'] as const

// Query string of GET /items. Every filter is optional except the space.
export const ListItemsQuery = PageParams.extend({
  space_id: z.uuid().describe('The space to list; the caller must be a member'),
  sort: z.enum(SORTS).default('position').describe('Sort order; a leading "-" reverses it. Ties are broken by id'),
  state: z.enum(STATES).optional(),
  type: z.enum(ITEM_TYPES).optional(),
  column_id: z.uuid().optional(),
  parent_id: z.union([z.uuid(), z.literal('null')]).optional().describe('Children of this item, or "null" for root items'),
  lead_id: z.uuid().optional(),
  q: z.string().trim().min(1).max(200).optional().describe('Case-insensitive text found in the title or description'),
})
export type ListItemsQuery = z.output<typeof ListItemsQuery>
