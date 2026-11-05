// Contracts of the routes the core layer owns. The route files and the OpenAPI document share these.
import { z } from 'zod'
import { CONTRACT_VERSION, defineContract } from './lib/contract'

export const indexContract = defineContract({
  method: 'get',
  auth: 'none',
  path: '/',
  summary: 'Contract version and the layers that are loaded',
  tag: 'core',
  response: z.object({
    contract_version: z.literal(CONTRACT_VERSION),
    modules: z.array(
      z.object({
        name: z.string(),
        depends_on: z.array(z.string()),
        missing_dependencies: z.array(z.string()),
        route_count: z.number().int(),
        actions: z.array(z.string()),
      }),
    ),
  }),
})

export const healthContract = defineContract({
  method: 'get',
  auth: 'none',
  path: '/health',
  summary: 'Is the server up',
  tag: 'core',
  response: z.object({ status: z.literal('ok') }),
})

export const openapiContract = defineContract({
  method: 'get',
  auth: 'none',
  path: '/openapi.json',
  summary: 'This API, described in OpenAPI 3.0',
  tag: 'core',
  response: z.record(z.string(), z.unknown()),
})

export const coreContracts = [indexContract, healthContract, openapiContract]
