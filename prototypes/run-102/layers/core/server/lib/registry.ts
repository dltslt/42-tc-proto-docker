// Pure TypeScript: the module registry. Each layer registers itself once at server start.
// Nothing central lists the layers, so adding a feature never edits an existing file.
import type { RouteContract } from './contract'

export interface ModuleDefinition {
  name: string
  // Names of the layers this one builds on. A layer never depends on one above it.
  dependsOn: string[]
  routes: RouteContract[]
}

export interface ModuleInfo {
  name: string
  depends_on: string[]
  missing_dependencies: string[]
  route_count: number
}

// Module-level state: one registry per server process, filled by the layers' Nitro plugins.
const modules = new Map<string, ModuleDefinition>()

// Registering the same name again replaces it, so dev-server reloads do not duplicate.
export function registerModule(definition: ModuleDefinition): void {
  modules.set(definition.name, definition)
}

export function resetRegistry(): void {
  modules.clear()
}

// How far a layer is from the bottom of the stack. `core` is 0.
function depth(name: string, seen: Set<string> = new Set()): number {
  const mod = modules.get(name)
  if (!mod || seen.has(name)) return 0
  seen.add(name)
  const deps = mod.dependsOn.filter((dep) => modules.has(dep))
  return deps.length === 0 ? 0 : 1 + Math.max(...deps.map((dep) => depth(dep, new Set(seen))))
}

// Loaded layers, lowest first, each with any dependency that is not loaded.
export function listModules(): ModuleInfo[] {
  return [...modules.values()]
    .sort((a, b) => depth(a.name) - depth(b.name) || a.name.localeCompare(b.name))
    .map((mod) => ({
      name: mod.name,
      depends_on: mod.dependsOn,
      missing_dependencies: mod.dependsOn.filter((dep) => !modules.has(dep)),
      route_count: mod.routes.length,
    }))
}

export function allRoutes(): RouteContract[] {
  return [...modules.values()].flatMap((mod) => mod.routes)
}
