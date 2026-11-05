// Server-only Nitro route: GET /api/v1/spaces/:id/events. `[id]` in the folder name is the path parameter.
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { requireSpaceAccess } from '#layers/workspace/server/services/identity'
import { listEventsContract } from '../../../../contracts'
import { listEvents } from '../../../../services/read'

export default defineRoute(listEventsContract, async ({ actor, params, query }) => {
  const db = getDb()
  await requireSpaceAccess(db, actor.id, params.id) // 404 unknown space, 403 not a member
  authorize(actor, 'event.list', { spaceId: params.id })
  return listEvents(db, params.id, query)
})
