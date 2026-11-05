// Nitro middleware: runs before routing, for every request (pages and API alike).
// An /api/v1 request that matches no registered contract gets our error shape: 405 when the path
// exists for other methods, 404 otherwise. Nitro's router would otherwise let a wrong method fall
// through to the page renderer.
import { methodNotAllowed, notFound, toErrorResponse } from '../lib/errors'
import { allowedMethods, matchRoute } from '../lib/registry'

const BASE = '/api/v1'

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname // Nitro auto-import (h3)
  if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return // not ours: continue to the router
  const path = pathname.slice(BASE.length) || '/'
  if (matchRoute(event.method, path)) return

  const allowed = allowedMethods(path)
  const error =
    allowed.length > 0
      ? methodNotAllowed(`${event.method} is not allowed here; use ${allowed.join(', ')}`)
      : notFound(`No route ${event.method} ${pathname}`)
  if (allowed.length > 0) setResponseHeader(event, 'Allow', allowed.join(', '))
  const { status, body } = toErrorResponse(error)
  setResponseStatus(event, status)
  return body // returning a value ends the request here
})
