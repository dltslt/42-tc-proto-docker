// What the tags routes accept and send back, plus the row-to-JSON mapping.
import { z } from 'zod'
import { PageParams } from '#layers/core/server/lib/pagination'
import type { Tag } from './db/schema'

export const TagSchema = z.object({
  id: z.uuid(),
  space_id: z.uuid(),
  name: z.string(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})
export const toTagDto = (t: Tag): z.input<typeof TagSchema> => ({
  id: t.id, space_id: t.spaceId, name: t.name, created_at: t.createdAt.toISOString(), updated_at: t.updatedAt.toISOString(),
})

export const CreateTagBody = z.strictObject({
  space_id: z.uuid().describe('The space the tag belongs to; the caller must be a member'),
  name: z.string().trim().min(1).max(50).regex(/^[^\r\n]+$/, 'Must be a single line').describe('Unique in the space, ignoring case'),
})
export type CreateTagBody = z.output<typeof CreateTagBody>

export const ListTagsQuery = PageParams.extend({
  sort: z.enum(['name', '-name']).default('name').describe('Sort order; a leading "-" reverses it'),
})
export type ListTagsQuery = z.output<typeof ListTagsQuery>

export const DeleteTagResult = z.object({ deleted_id: z.uuid(), unlinked_item_ids: z.array(z.uuid()) })

// An item with its tag ids is the answer to "which tags does this item have".
export const ItemTagsSchema = z.object({ item_id: z.uuid(), tag_ids: z.array(z.uuid()) })
export const TagItemsSchema = z.object({ tag_id: z.uuid(), item_ids: z.array(z.uuid()) })
export const TagLinkParams = z.object({ id: z.uuid().describe('Item id'), tag_id: z.uuid() })
