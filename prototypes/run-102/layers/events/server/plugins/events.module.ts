// Nitro plugin: registers the `events` layer at server start.
// It builds on `workspace` only: the layers that write events build on it, not the other way round.
import { registerModule } from '#layers/core/server/lib/registry'
import { eventActions, eventContracts } from '../contracts'

export default defineNitroPlugin(() => {
  registerModule({ name: 'events', dependsOn: ['workspace'], routes: eventContracts, actions: eventActions })
})
