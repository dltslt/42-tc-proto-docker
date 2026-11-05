// Nitro plugin: registers the `tags` layer at server start. This file and the folder are the whole
// integration: no other layer lists tags anywhere.
import { registerModule } from '#layers/core/server/lib/registry'
import { tagActions, tagContracts, tagEventTypes } from '../contracts'

export default defineNitroPlugin(() => {
  registerModule({ name: 'tags', dependsOn: ['workspace', 'events', 'items'], routes: tagContracts, actions: tagActions, eventTypes: tagEventTypes })
})
