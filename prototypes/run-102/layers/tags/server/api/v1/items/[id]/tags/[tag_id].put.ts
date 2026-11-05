// Server-only Nitro route: PUT /api/v1/items/:id/tags/:tag_id
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { linkTagContract } from '../../../../../contracts'
import { setLink } from '../../../../../services/tags'

export default defineRoute(linkTagContract, ({ actor, params }) => {
  authorize(actor, 'tag.link', { id: params.id })
  return setLink(getDb(), actor, params.id, params.tag_id, true)
})
