// Server-only Nitro route: GET /api/v1/spaces (only the caller's own spaces)
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { listSpacesContract } from '../../contracts'
import { listSpacesOf } from '../../services/read'

export default defineRoute(listSpacesContract, ({ actor, query }) => {
  authorize(actor, 'space.list')
  return listSpacesOf(getDb(), actor.id, query)
})
