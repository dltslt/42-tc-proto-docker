// Pure tree helpers (no framework, no I/O). The DB stores only parent_id; these build and walk the tree.
// Shared util: Nuxt auto-imports it in the app, and vitest can import it directly.

// Flat list -> children grouped by parent id ('' = roots), siblings oldest first.
export function buildChildMap(items: Item[]): Record<string, Item[]> {
  const map: Record<string, Item[]> = {}
  for (const item of items) (map[item.parent_id ?? ''] ??= []).push(item)
  for (const list of Object.values(map)) list.sort((a, b) => a.created_at.localeCompare(b.created_at))
  return map
}

// Every item below `rootId` (children, grandchildren, ...), excluding the root itself.
export function descendantsOf(childMap: Record<string, Item[]>, rootId: string): Item[] {
  const out: Item[] = []
  const seen = new Set<string>([rootId]) // guards against a corrupt parent cycle
  const stack = [...(childMap[rootId] ?? [])]
  while (stack.length) {
    const item = stack.pop()!
    if (seen.has(item.id)) continue
    seen.add(item.id)
    out.push(item)
    stack.push(...(childMap[item.id] ?? []))
  }
  return out
}
