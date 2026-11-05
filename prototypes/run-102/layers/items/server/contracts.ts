// Contracts of the routes the items layer owns.
import { z } from 'zod'
import { defineContract } from '#layers/core/server/lib/contract'
import { pageOf } from '#layers/core/server/lib/pagination'
import { ItemSchema, ListItemsQuery } from './schemas'

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

export const itemContracts = [listItemsContract, getItemContract]
// Permission names this layer checks with can().
export const itemActions = ['item.list', 'item.read']
