// Nitro plugin: runs once when the server process starts, before any request.
// Each layer has one like it, which is how the registry learns what is loaded. File names are unique
// per layer because two layers with the same file path would override each other.
import { coreContracts } from '../contracts'
import { registerModule } from '../lib/registry'

export default defineNitroPlugin(() => {
  registerModule({ name: 'core', dependsOn: [], routes: coreContracts })
})
