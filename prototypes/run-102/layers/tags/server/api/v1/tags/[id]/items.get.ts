// Server-only Nitro route: GET /api/v1/tags/:id/items
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { tagItemsContract } from '../../../../contracts'
import { tagItems } from '../../../../services/tags'

export default defineRoute(tagItemsContract, ({ actor, params }) => {
  authorize(actor, 'tag.read', { id: params.id })
  return tagItems(getDb(), actor, params.id)
})
