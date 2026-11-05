// Nitro plugin: registers the `workspace` layer at server start, and tells core how to find the caller.
import { setActorResolver } from '#layers/core/server/lib/actor'
import { registerModule } from '#layers/core/server/lib/registry'
import { workspaceActions, workspaceContracts } from '../contracts'
import { getActor } from '../services/identity'

export default defineNitroPlugin(() => {
  registerModule({ name: 'workspace', dependsOn: ['core'], routes: workspaceContracts, actions: workspaceActions })
  // From here on, every route that needs an actor identifies it with getActor().
  setActorResolver(getActor)
})
