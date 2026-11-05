// Nitro plugin: registers the `items` layer at server start. It has no routes yet.
import { registerModule } from '#layers/core/server/lib/registry'

export default defineNitroPlugin(() => {
  registerModule({ name: 'items', dependsOn: ['workspace'], routes: [] })
})
