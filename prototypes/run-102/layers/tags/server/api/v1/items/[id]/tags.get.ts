// Server-only Nitro route: GET /api/v1/items/:id/tags. Shares the `items/[id]/` folder name with the items
// layer; Nuxt merges the layers' server folders, so both layers' files appear under the same URL prefix.
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { itemTagsContract } from '../../../../contracts'
import { itemTagIds } from '../../../../services/tags'

export default defineRoute(itemTagsContract, ({ actor, params }) => {
  authorize(actor, 'tag.read', { id: params.id })
  return itemTagIds(getDb(), actor, params.id)
})
