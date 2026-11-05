// can(actor, action, resource): the one place that will decide "may this actor do this?".
// Today it allows everything. Real rules (roles, ownership) replace the body without touching any route.
// This is policy. Space isolation (an actor never sees another space's data) is not policy: the services
// always enforce it, whatever `can` says.
import type { ActorRef } from './actor'
import { forbidden } from './errors'
import { allActions } from './registry'

// What is being acted on. Fields are added as rules need them.
export interface Resource {
  spaceId?: string
  id?: string
}

export function can(_actor: ActorRef, action: string, _resource: Resource = {}): boolean {
  // A misspelled action is a bug in the calling layer, so fail loudly instead of quietly allowing it.
  if (!allActions().includes(action)) {
    throw new Error(`Unknown action "${action}": list it in the actions of the layer that checks it`)
  }
  return true
}

// can() or a 403.
export function authorize(actor: ActorRef, action: string, resource: Resource = {}): void {
  if (!can(actor, action, resource)) throw forbidden(`Not allowed: ${action}`)
}
