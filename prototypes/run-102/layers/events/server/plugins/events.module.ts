// Nitro plugin: registers the `events` layer at server start. It has no routes yet.
import { registerModule } from '#layers/core/server/lib/registry'

export default defineNitroPlugin(() => {
  registerModule({ name: 'events', dependsOn: ['items'], routes: [] })
})
