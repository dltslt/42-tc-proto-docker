// Pure TypeScript: a route contract is one object that says what a route accepts and returns.
// The same object validates requests at runtime and becomes the OpenAPI entry (see openapi.ts).
import type { z } from 'zod'
import { badRequest, fieldsFromZod, type ErrorFields } from './errors'

// Bumped only by a deliberate release, never by adding a field or a route.
export const CONTRACT_VERSION = 'v1'

export type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

export interface RouteContract {
  method: HttpMethod
  // Relative to /api/v1, in OpenAPI style: "/items/{id}". The file path of the route uses "[id]".
  path: string
  summary: string
  // Groups routes in the API reference; by convention the name of the owning layer.
  tag: string
  params?: z.ZodType
  query?: z.ZodType
  body?: z.ZodType
  response: z.ZodType
  // Who may call it. Default 'actor': the caller must send X-Actor-Id. 'none' is for routes that
  // must work before a caller has chosen who to be (health, the API description, the actor list).
  auth?: 'actor' | 'none'
  // Success status; default 200.
  status?: number
  // Error statuses a client can expect besides 400, which is implied by any input schema.
  errors?: number[]
}

// Identity function that keeps the exact schema types, so handlers get typed input.
export const defineContract = <C extends RouteContract>(contract: C): C => contract

// A schema that is present gives its parsed type; a missing one gives `undefined`.
type Parsed<S> = S extends z.ZodType ? z.output<S> : undefined
export interface ParsedInput<C extends RouteContract> {
  params: Parsed<C['params']>
  query: Parsed<C['query']>
  body: Parsed<C['body']>
}

export interface RawInput {
  params?: unknown
  query?: unknown
  body?: unknown
}

// Check path params, query and body against the contract. All problems are reported together.
export function validateInput<C extends RouteContract>(contract: C, raw: RawInput): ParsedInput<C> {
  const fields: ErrorFields = {}
  const out: Record<string, unknown> = {}
  for (const part of ['params', 'query', 'body'] as const) {
    const schema = contract[part]
    if (!schema) continue
    const result = schema.safeParse(raw[part])
    if (result.success) out[part] = result.data
    else Object.assign(fields, fieldsFromZod(result.error, part))
  }
  if (Object.keys(fields).length > 0) throw badRequest('Invalid input', fields)
  return out as unknown as ParsedInput<C>
}

// Statuses the OpenAPI document lists for a route.
export function errorStatuses(contract: RouteContract): number[] {
  const statuses = new Set(contract.errors ?? [])
  if (contract.params || contract.query || contract.body) statuses.add(400)
  if (contract.auth !== 'none') statuses.add(401)
  return [...statuses].sort()
}
