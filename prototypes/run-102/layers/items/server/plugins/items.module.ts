// Nitro plugin: registers the `items` layer at server start.
import { registerModule } from '#layers/core/server/lib/registry'
import { itemActions, itemContracts } from '../contracts'

export default defineNitroPlugin(() => {
  registerModule({ name: 'items', dependsOn: ['workspace', 'events'], routes: itemContracts, actions: itemActions })
})
