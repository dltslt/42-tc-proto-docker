// Contract of the route the events layer owns.
import { z } from 'zod'
import { defineContract } from '#layers/core/server/lib/contract'
import { pageOf } from '#layers/core/server/lib/pagination'
import { EventSchema, ListEventsQuery } from './schemas'

export const listEventsContract = defineContract({
  method: 'get',
  path: '/spaces/{id}/events',
  summary: 'The event log of a space, oldest first. Use after=<id> to read only what is new',
  tag: 'events',
  params: z.object({ id: z.uuid() }),
  query: ListEventsQuery,
  response: pageOf(EventSchema),
  errors: [403, 404],
})

export const eventContracts = [listEventsContract]
// Permission names this layer checks with can().
export const eventActions = ['event.list']
