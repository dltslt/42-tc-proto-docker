// Server-only Nitro route: DELETE /api/v1/tags/:id
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { deleteTagContract } from '../../../contracts'
import { deleteTag } from '../../../services/tags'

export default defineRoute(deleteTagContract, ({ actor, params }) => {
  authorize(actor, 'tag.delete', { id: params.id })
  return deleteTag(getDb(), actor, params.id)
})
