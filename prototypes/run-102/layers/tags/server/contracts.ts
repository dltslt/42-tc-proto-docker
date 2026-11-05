// Contracts of the routes the tags layer owns, and the names it registers with the other layers.
import { z } from 'zod'
import { defineContract } from '#layers/core/server/lib/contract'
import { pageOf } from '#layers/core/server/lib/pagination'
import { CreateTagBody, DeleteTagResult, ItemTagsSchema, ListTagsQuery, TagItemsSchema, TagLinkParams, TagSchema } from './schemas'

export const listTagsContract = defineContract({
  method: 'get', path: '/spaces/{id}/tags', summary: 'Tags of a space', tag: 'tags',
  params: z.object({ id: z.uuid() }), query: ListTagsQuery, response: pageOf(TagSchema), errors: [403, 404],
})
export const createTagContract = defineContract({
  method: 'post', path: '/tags', summary: 'Create a tag in a space', tag: 'tags',
  body: CreateTagBody, response: TagSchema, status: 201,
  // 409: the space already has a tag with this name.
  errors: [403, 404, 409],
})
export const deleteTagContract = defineContract({
  method: 'delete', path: '/tags/{id}', summary: 'Delete a tag and remove it from every item', tag: 'tags',
  params: z.object({ id: z.uuid() }), response: DeleteTagResult, errors: [403, 404],
})
export const tagItemsContract = defineContract({
  method: 'get', path: '/tags/{id}/items', summary: 'Ids of the items that have this tag', tag: 'tags',
  params: z.object({ id: z.uuid() }), response: TagItemsSchema, errors: [403, 404],
})
export const itemTagsContract = defineContract({
  method: 'get', path: '/items/{id}/tags', summary: 'Ids of the tags an item has', tag: 'tags',
  params: z.object({ id: z.uuid() }), response: ItemTagsSchema, errors: [403, 404],
})
export const linkTagContract = defineContract({
  method: 'put', path: '/items/{id}/tags/{tag_id}', summary: 'Give an item a tag. Repeating it changes nothing', tag: 'tags',
  params: TagLinkParams, response: ItemTagsSchema,
  // 400: the tag belongs to another space than the item.
  errors: [403, 404],
})
export const unlinkTagContract = defineContract({
  method: 'delete', path: '/items/{id}/tags/{tag_id}', summary: 'Remove a tag from an item. Repeating it changes nothing', tag: 'tags',
  params: TagLinkParams, response: ItemTagsSchema, errors: [403, 404],
})

export const tagContracts = [listTagsContract, createTagContract, deleteTagContract, tagItemsContract, itemTagsContract, linkTagContract, unlinkTagContract]
export const tagActions = ['tag.list', 'tag.create', 'tag.delete', 'tag.read', 'tag.link', 'tag.unlink']
export const tagEventTypes = ['tag.created', 'tag.deleted', 'item.tagged', 'item.untagged']
