// Server-only Nitro route: DELETE /api/v1/items/:id
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { deleteItemContract } from '../../../contracts'
import { deleteItem } from '../../../services/write'

export default defineRoute(deleteItemContract, ({ actor, params, query }) => {
  authorize(actor, 'item.delete', { id: params.id })
  return deleteItem(getDb(), actor, params.id, query)
})
