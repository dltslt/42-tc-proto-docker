// Server-only Nitro route: POST /api/v1/items/:id/move. The folder `[id]/` plus `move.post.ts` is the path.
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { moveItemContract } from '../../../../contracts'
import { moveItem } from '../../../../services/write'

export default defineRoute(moveItemContract, ({ actor, params, body }) => {
  authorize(actor, 'item.move', { id: params.id })
  return moveItem(getDb(), actor, params.id, body)
})
