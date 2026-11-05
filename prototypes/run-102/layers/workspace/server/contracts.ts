// Contracts of the routes the workspace layer owns.
import { z } from 'zod'
import { defineContract } from '#layers/core/server/lib/contract'
import { PageParams, pageOf } from '#layers/core/server/lib/pagination'
import { ActorSchema, ColumnSchema, SpaceSchema } from './schemas'

const nameSort = z.enum(['name', '-name']).default('name').describe('Sort order; a leading "-" reverses it')
const positionSort = z.enum(['position', '-position']).default('position').describe('Sort order; a leading "-" reverses it')

export const listActorsContract = defineContract({
  method: 'get',
  path: '/actors',
  summary: 'List actors, so a client can choose who to act as',
  tag: 'workspace',
  // Open on purpose: a client needs this list before it can send X-Actor-Id.
  auth: 'none',
  query: PageParams.extend({ sort: nameSort }),
  response: pageOf(ActorSchema),
})

export const listSpacesContract = defineContract({
  method: 'get',
  path: '/spaces',
  summary: 'Spaces the calling actor is a member of',
  tag: 'workspace',
  query: PageParams.extend({ sort: nameSort }),
  response: pageOf(SpaceSchema),
})

export const listColumnsContract = defineContract({
  method: 'get',
  path: '/spaces/{id}/columns',
  summary: 'Columns of a space, in board order',
  tag: 'workspace',
  params: z.object({ id: z.uuid() }),
  query: PageParams.extend({ sort: positionSort }),
  response: pageOf(ColumnSchema),
  errors: [403, 404],
})

export const workspaceContracts = [listActorsContract, listSpacesContract, listColumnsContract]
// Permission names this layer checks with can().
export const workspaceActions = ['space.list', 'column.list']
