// Server-only Nitro route: GET /api/v1/items
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { listItemsContract } from '../../contracts'
import { listItems } from '../../services/read'

export default defineRoute(listItemsContract, ({ actor, query }) => {
  authorize(actor, 'item.list', { spaceId: query.space_id })
  return listItems(getDb(), actor.id, query)
})
