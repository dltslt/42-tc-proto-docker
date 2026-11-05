// Pure TypeScript: build the OpenAPI 3.0 document from route contracts.
// Zod 4 turns a schema into JSON Schema itself, so no extra OpenAPI package is needed.
import { z } from 'zod'
import { CONTRACT_VERSION, errorStatuses, type RouteContract } from './contract'
import { ErrorBodySchema } from './errors'

type JsonSchema = Record<string, any>

const ERROR_TEXT: Record<number, string> = {
  400: 'Invalid input',
  401: 'No actor',
  403: 'Not allowed or wrong space',
  404: 'Not found',
  405: 'Method not allowed',
  409: 'Conflict',
}

// `input` describes what a client may send, `output` what the server returns.
const toSchema = (schema: z.ZodType, io: 'input' | 'output'): JsonSchema => {
  const { $schema: _unused, ...rest } = z.toJSONSchema(schema, { target: 'openapi-3.0', io }) as JsonSchema
  return rest
}

// Path params and query objects become one OpenAPI parameter per property.
function parametersOf(schema: z.ZodType, location: 'path' | 'query'): JsonSchema[] {
  const json = toSchema(schema, 'input')
  if (json.type !== 'object') throw new Error(`The ${location} schema must be an object`)
  const required: string[] = json.required ?? []
  return Object.entries<JsonSchema>(json.properties ?? {}).map(([name, prop]) => ({
    name,
    in: location,
    required: location === 'path' || required.includes(name),
    schema: prop,
  }))
}

function operationOf(route: RouteContract): JsonSchema {
  const responses: JsonSchema = {
    [route.status ?? 200]: {
      description: 'Success',
      content: { 'application/json': { schema: toSchema(route.response, 'output') } },
    },
  }
  for (const status of errorStatuses(route)) {
    responses[status] = {
      description: ERROR_TEXT[status] ?? 'Error',
      content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } },
    }
  }
  const operation: JsonSchema = { summary: route.summary, tags: [route.tag], responses }
  if (route.auth !== 'none') operation.security = [{ ActorHeader: [] }]
  const parameters = [
    ...(route.params ? parametersOf(route.params, 'path') : []),
    ...(route.query ? parametersOf(route.query, 'query') : []),
  ]
  if (parameters.length > 0) operation.parameters = parameters
  if (route.body) {
    operation.requestBody = {
      required: true,
      content: { 'application/json': { schema: toSchema(route.body, 'input') } },
    }
  }
  return operation
}

export function buildOpenApi(routes: RouteContract[]): JsonSchema {
  const paths: JsonSchema = {}
  for (const route of routes) {
    ;(paths[route.path] ??= {})[route.method] = operationOf(route)
  }
  return {
    openapi: '3.0.3',
    info: { title: 'Lerch API', version: CONTRACT_VERSION },
    // Paths are relative to this base, which is relative to where the document was fetched.
    servers: [{ url: '/api/v1' }],
    paths,
    components: {
      schemas: { Error: toSchema(ErrorBodySchema, 'output') },
      // Until real login exists the caller names itself in a header. One function reads it (getActor).
      securitySchemes: { ActorHeader: { type: 'apiKey', in: 'header', name: 'X-Actor-Id' } },
    },
  }
}
