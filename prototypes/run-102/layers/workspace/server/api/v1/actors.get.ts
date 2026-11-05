// Server-only Nitro route: GET /api/v1/actors (open: it is how a client finds out who it can act as)
import { defineRoute } from '#layers/core/server/lib/define-route'
import { getDb } from '#layers/core/server/db/client'
import { listActorsContract } from '../../contracts'
import { listActors } from '../../services/read'

export default defineRoute(listActorsContract, ({ query }) => listActors(getDb(), query))
