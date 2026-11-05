// Server-only Nitro route: GET /api/v1/items/:id
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { getItemContract } from '../../../contracts'
import { getItem } from '../../../services/read'

export default defineRoute(getItemContract, ({ actor, params }) => {
  authorize(actor, 'item.read', { id: params.id })
  return getItem(getDb(), actor.id, params.id)
})
