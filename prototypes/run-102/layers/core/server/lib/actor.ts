// Who is calling. `core` defines the shape and a hook; the workspace layer, which knows the actors
// table, plugs `getActor` into the hook at server start. This keeps the dependency pointing one way:
// workspace builds on core, never the reverse.
import type { H3Event } from 'h3'

export interface ActorRef {
  id: string
  name: string
  kind: 'human' | 'agent'
}

export type ActorResolver = (event: H3Event) => Promise<ActorRef>

let resolver: ActorResolver | undefined

export function setActorResolver(fn: ActorResolver): void {
  resolver = fn
}

export function resolveActor(event: H3Event): Promise<ActorRef> {
  if (!resolver) throw new Error('No actor resolver registered: the workspace layer is not loaded')
  return resolver(event)
}
