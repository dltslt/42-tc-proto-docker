// Server-only Nitro route: DELETE /api/v1/items/:id/tags/:tag_id
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { unlinkTagContract } from '../../../../../contracts'
import { setLink } from '../../../../../services/tags'

export default defineRoute(unlinkTagContract, ({ actor, params }) => {
  authorize(actor, 'tag.unlink', { id: params.id })
  return setLink(getDb(), actor, params.id, params.tag_id, false)
})
