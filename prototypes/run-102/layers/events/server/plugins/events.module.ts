// Nitro plugin: registers the `events` layer at server start. It has no routes yet (task 5 adds the read route).
// It builds on `workspace` only: the layers that write events build on it, not the other way round.
import { registerModule } from '#layers/core/server/lib/registry'

export default defineNitroPlugin(() => {
  registerModule({ name: 'events', dependsOn: ['workspace'], routes: [] })
})
