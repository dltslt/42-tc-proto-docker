// Server-only glue between a route contract and Nitro. Runs in the Node container, per request.
// Every route file is `export default defineRoute(contract, handler)`. Routes stay thin:
// identify the caller, validate, call a service, return data. Rules never live here.
import type { H3Event } from 'h3'
import type { z } from 'zod'
import { resolveActor, type ActorRef } from './actor'
import { validateInput, type ParsedInput, type RouteContract } from './contract'
import { badRequest, toErrorResponse } from './errors'

// A route that declared `auth: 'none'` gets no actor; every other route is guaranteed one.
type ActorFor<C extends RouteContract> = C['auth'] extends 'none' ? undefined : ActorRef
export type HandlerInput<C extends RouteContract> = ParsedInput<C> & { event: H3Event; actor: ActorFor<C> }

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
      // Who is calling comes first: an anonymous caller gets 401 and learns nothing about validation.
      const actor = contract.auth === 'none' ? undefined : await resolveActor(event)
      const input = validateInput(contract, {
        params: getRouterParams(event, { decode: true }),
        query: getQuery(event),
        body: contract.body ? await readJsonBody(event) : undefined,
      })
      const result = await handler({ ...input, event, actor } as HandlerInput<C>)
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
