// Server-only Nitro route: GET /api/v1/openapi.json, built from every registered route contract
import { openapiContract } from '../../contracts'
import { defineRoute } from '../../lib/define-route'
import { buildOpenApi } from '../../lib/openapi'
import { allRoutes } from '../../lib/registry'

export default defineRoute(openapiContract, () => buildOpenApi(allRoutes()))
