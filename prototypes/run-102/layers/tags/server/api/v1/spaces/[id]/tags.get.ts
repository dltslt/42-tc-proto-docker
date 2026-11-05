// Server-only Nitro route: GET /api/v1/spaces/:id/tags
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { requireSpaceAccess } from '#layers/workspace/server/services/identity'
import { listTagsContract } from '../../../../contracts'
import { listTags } from '../../../../services/tags'

export default defineRoute(listTagsContract, async ({ actor, params, query }) => {
  const db = getDb()
  await requireSpaceAccess(db, actor.id, params.id)
  authorize(actor, 'tag.list', { spaceId: params.id })
  return listTags(db, params.id, query)
})
