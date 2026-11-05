// Contracts of the routes the items layer owns.
import { z } from 'zod'
import { defineContract } from '#layers/core/server/lib/contract'
import { pageOf } from '#layers/core/server/lib/pagination'
import { CreateItemBody, DeleteItemQuery, DeleteResult, ItemSchema, ListItemsQuery, MoveItemBody, PatchItemBody } from './schemas'

export const listItemsContract = defineContract({
  method: 'get',
  path: '/items',
  summary: 'List the items of a space, with filters, search and cursor pagination',
  tag: 'items',
  query: ListItemsQuery,
  response: pageOf(ItemSchema),
  errors: [403, 404],
})

export const getItemContract = defineContract({
  method: 'get',
  path: '/items/{id}',
  summary: 'One item',
  tag: 'items',
  params: z.object({ id: z.uuid() }),
  response: ItemSchema,
  errors: [403, 404],
})

export const createItemContract = defineContract({
  method: 'post',
  path: '/items',
  summary: 'Create an item. A title (and the space) is enough',
  tag: 'items',
  body: CreateItemBody,
  response: ItemSchema,
  status: 201,
  errors: [403, 404, 409],
})

export const patchItemContract = defineContract({
  method: 'patch',
  path: '/items/{id}',
  summary: 'Edit fields. Send only what changed; title, description, type and lead need expected_version',
  tag: 'items',
  params: z.object({ id: z.uuid() }),
  body: PatchItemBody,
  response: ItemSchema,
  // 409: someone else changed the item first. The error carries the stored item in `error.current`.
  errors: [403, 404, 409],
})

export const moveItemContract = defineContract({
  method: 'post',
  path: '/items/{id}/move',
  summary: 'Change parent, column and place among the siblings in one step',
  tag: 'items',
  params: z.object({ id: z.uuid() }),
  body: MoveItemBody,
  response: ItemSchema,
  // 409: the move would put the item under itself or one of its descendants.
  errors: [403, 404, 409],
})

export const deleteItemContract = defineContract({
  method: 'delete',
  path: '/items/{id}',
  summary: 'Delete an item. With children, choose mode=subtree or mode=lift',
  tag: 'items',
  params: z.object({ id: z.uuid() }),
  query: DeleteItemQuery,
  response: DeleteResult,
  // 409: the item has children and no mode was given.
  errors: [403, 404, 409],
})

export const itemContracts = [listItemsContract, getItemContract, createItemContract, patchItemContract, moveItemContract, deleteItemContract]
// Permission names this layer checks with can().
export const itemActions = ['item.list', 'item.read', 'item.create', 'item.update', 'item.move', 'item.delete']
// Event types this layer writes.
export const itemEventTypes = ['item.created', 'item.updated', 'item.moved', 'item.deleted']
