// Nitro plugin: registers the `workspace` layer at server start. It has no routes yet.
import { registerModule } from '#layers/core/server/lib/registry'

export default defineNitroPlugin(() => {
  registerModule({ name: 'workspace', dependsOn: ['core'], routes: [] })
})
