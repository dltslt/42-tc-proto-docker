// Server-only Nitro route: POST /api/v1/tags
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { createTagContract } from '../../contracts'
import { createTag } from '../../services/tags'

export default defineRoute(createTagContract, ({ actor, body }) => {
  authorize(actor, 'tag.create', { spaceId: body.space_id })
  return createTag(getDb(), actor, body)
})
