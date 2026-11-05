// Server-only Nitro route: file path = URL, so this answers GET /api/v1
import { indexContract } from '../../contracts'
import { CONTRACT_VERSION } from '../../lib/contract'
import { defineRoute } from '../../lib/define-route'
import { listModules } from '../../lib/registry'

export default defineRoute(indexContract, () => ({
  contract_version: CONTRACT_VERSION,
  modules: listModules(),
}))
