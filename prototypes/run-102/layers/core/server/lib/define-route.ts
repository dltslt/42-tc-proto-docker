// Server-only glue between a route contract and Nitro. Runs in the Node container, per request.
// Every route file is `export default defineRoute(contract, handler)`. Routes stay thin:
// validate, call a service, return data. Rules never live here.
import type { H3Event } from 'h3'
import type { z } from 'zod'
import { validateInput, type ParsedInput, type RouteContract } from './contract'
import { badRequest, toErrorResponse } from './errors'

export type HandlerInput<C extends RouteContract> = ParsedInput<C> & { event: H3Event }

async function readJsonBody(event: H3Event): Promise<unknown> {
  try {
    // Nitro auto-import (h3): parses the request body as JSON
    return await readBody(event)
  } catch {
    throw badRequest('Request body is not valid JSON')
  }
}

export function defineRoute<C extends RouteContract>(
  contract: C,
  handler: (input: HandlerInput<C>) => z.input<C['response']> | Promise<z.input<C['response']>>,
) {
  // Nitro auto-import (h3): no `import` needed. The file path of the route decides its URL.
  return defineEventHandler(async (event) => {
    try {
      const input = validateInput(contract, {
        params: getRouterParams(event, { decode: true }),
        query: getQuery(event),
        body: contract.body ? await readJsonBody(event) : undefined,
      })
      const result = await handler({ ...input, event })
      // The response is checked against the contract too, so the contract is what clients really get.
      const checked = contract.response.safeParse(result)
      if (!checked.success) throw new Error(`Response does not match its contract: ${checked.error.message}`)
      setResponseStatus(event, contract.status ?? 200)
      return checked.data
    } catch (err) {
      const { status, body } = toErrorResponse(err)
      setResponseStatus(event, status)
      return body
    }
  })
}
