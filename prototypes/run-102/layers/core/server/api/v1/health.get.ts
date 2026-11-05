// Server-only Nitro route: GET /api/v1/health
import { healthContract } from '../../contracts'
import { defineRoute } from '../../lib/define-route'

export default defineRoute(healthContract, () => ({ status: 'ok' as const }))
