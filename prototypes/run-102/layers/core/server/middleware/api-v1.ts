// Nitro middleware: runs before routing, for every request (pages and API alike).
// An /api/v1 request that matches no registered contract gets our 404 shape. This also covers a
// wrong method on a real path: Nitro's router would otherwise fall through to the page renderer.
import { notFound, toErrorResponse } from '../lib/errors'
import { matchRoute } from '../lib/registry'

const BASE = '/api/v1'

export default defineEventHandler((event) => {
  const pathname = getRequestURL(event).pathname // Nitro auto-import (h3)
  if (pathname !== BASE && !pathname.startsWith(`${BASE}/`)) return // not ours: continue to the router
  if (matchRoute(event.method, pathname.slice(BASE.length) || '/')) return
  const { status, body } = toErrorResponse(notFound(`No route ${event.method} ${pathname}`))
  setResponseStatus(event, status)
  return body // returning a value ends the request here
})
