// Server-only Nitro route: POST /api/v1/items
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { createItemContract } from '../../contracts'
import { createItem } from '../../services/write'

export default defineRoute(createItemContract, ({ actor, body }) => {
  authorize(actor, 'item.create', { spaceId: body.space_id })
  return createItem(getDb(), actor, body)
})
