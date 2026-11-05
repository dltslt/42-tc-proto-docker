// Server-only Nitro route: PATCH /api/v1/items/:id (the `.patch` in the file name is the HTTP method)
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { patchItemContract } from '../../../contracts'
import { updateItem } from '../../../services/write'

export default defineRoute(patchItemContract, ({ actor, params, body }) => {
  authorize(actor, 'item.update', { id: params.id })
  return updateItem(getDb(), actor, params.id, body)
})
