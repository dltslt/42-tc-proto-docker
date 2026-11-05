// Pure TypeScript, no framework imports: the one error shape every route returns.
// Shape: { "error": { "code", "message", "fields" } } with status 400, 401, 403, 404, 405 or 409.
import { z } from 'zod'

export type ErrorCode =
  | 'invalid_input' // 400
  | 'unauthenticated' // 401
  | 'forbidden' // 403
  | 'not_found' // 404
  | 'method_not_allowed' // 405
  | 'conflict' // 409
  | 'internal' // 500, only for server bugs, never for bad input

const CODE_BY_STATUS: Record<number, ErrorCode> = {
  400: 'invalid_input',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  405: 'method_not_allowed',
  409: 'conflict',
}

// `fields` maps a field path (for example "body.title") to its messages. Empty when no field is to blame.
export type ErrorFields = Record<string, string[]>

// The same schema describes the body at runtime, in tests and in the OpenAPI document.
export const ErrorBodySchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    fields: z.record(z.string(), z.array(z.string())),
  }),
})
export type ErrorBody = z.infer<typeof ErrorBodySchema>

// Services and routes throw this. The route wrapper turns it into the error shape.
export class ApiError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 405 | 409,
    readonly code: ErrorCode,
    message: string,
    readonly fields: ErrorFields = {},
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const badRequest = (message: string, fields: ErrorFields = {}) =>
  new ApiError(400, 'invalid_input', message, fields)
export const unauthenticated = (message = 'No actor: send the X-Actor-Id header') =>
  new ApiError(401, 'unauthenticated', message)
export const forbidden = (message = 'Not allowed') => new ApiError(403, 'forbidden', message)
export const notFound = (message = 'Not found') => new ApiError(404, 'not_found', message)
export const methodNotAllowed = (message: string) => new ApiError(405, 'method_not_allowed', message)
export const conflict = (message: string) => new ApiError(409, 'conflict', message)

// Zod reports problems as a list of issues with a path. Group them by dotted path under a prefix.
export function fieldsFromZod(error: z.ZodError, prefix: string): ErrorFields {
  const fields: ErrorFields = {}
  for (const issue of error.issues) {
    const path = [prefix, ...issue.path.map(String)].join('.')
    ;(fields[path] ??= []).push(issue.message)
  }
  return fields
}

// Turn anything that was thrown into a status and a body. Unknown errors become a plain 500.
export function toErrorResponse(err: unknown): { status: number; body: ErrorBody } {
  if (err instanceof ApiError) {
    return { status: err.status, body: { error: { code: err.code, message: err.message, fields: err.fields } } }
  }
  // Errors thrown by the framework itself (h3 `createError`) carry a numeric `statusCode`.
  const statusCode = (err as { statusCode?: unknown } | null)?.statusCode
  if (typeof statusCode === 'number' && CODE_BY_STATUS[statusCode]) {
    const message = (err as { message?: string }).message || 'Request failed'
    return { status: statusCode, body: { error: { code: CODE_BY_STATUS[statusCode], message, fields: {} } } }
  }
  console.error('[api] unexpected error:', err)
  return { status: 500, body: { error: { code: 'internal', message: 'Internal server error', fields: {} } } }
}
