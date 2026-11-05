// Server-only Nitro route: GET /api/v1/spaces/:id/columns. `[id]` in the file name is the path parameter.
import { getDb } from '#layers/core/server/db/client'
import { defineRoute } from '#layers/core/server/lib/define-route'
import { authorize } from '#layers/core/server/lib/policy'
import { listColumnsContract } from '../../../../contracts'
import { requireSpaceAccess } from '../../../../services/identity'
import { listColumns } from '../../../../services/read'

export default defineRoute(listColumnsContract, async ({ actor, params, query }) => {
  const db = getDb()
  await requireSpaceAccess(db, actor.id, params.id) // 404 unknown space, 403 not a member
  authorize(actor, 'column.list', { spaceId: params.id })
  return listColumns(db, params.id, query)
})
