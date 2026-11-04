// Items of the current space, plus the actions that change them.
// The API is the single source of truth: every action calls it, then re-fetches the list.
export function useItems() {
  const { actor, space, ready } = useIdentity()
  const toast = useToast()
  const headers = () => ({ 'x-actor-id': actor.value?.id ?? '' })

  // useAsyncData: runs the handler on the server for SSR, then hydrates in the browser.
  // `watch` re-runs it whenever the current space or persona changes.
  // The handler first waits for the roster (it decides which space and persona we are).
  const { data, refresh } = useAsyncData<Item[]>(
    'items',
    async () => {
      await ready
      return space.value
        ? $fetch<Item[]>('/api/items', { query: { space_id: space.value.id }, headers: headers() })
        : []
    },
    { watch: [() => space.value?.id, () => actor.value?.id], default: () => [] },
  )
  const items = computed(() => data.value ?? [])

  // Flat list -> tree: the DB stores only parent_id, the UI groups children under their parent ('' = roots).
  const childMap = computed(() => {
    const map: Record<string, Item[]> = {}
    for (const item of items.value) (map[item.parent_id ?? ''] ??= []).push(item)
    for (const list of Object.values(map)) list.sort((a, b) => a.created_at.localeCompare(b.created_at))
    return map
  })

  // Board columns: discarded items leave the board; the API already sorted by position.
  const byColumn = computed(() => {
    const cols = Object.fromEntries(COLUMNS.map(c => [c.key, [] as Item[]])) as Record<ColumnKey, Item[]>
    for (const item of items.value) if (item.state !== 'discarded') cols[item.board_column].push(item)
    return cols
  })

  const titleOf = (id: string | null) => items.value.find(i => i.id === id)?.title ?? null

  // Run an API call; on a 4xx/5xx show the server's message as a toast instead of failing silently.
  async function call<T>(fn: () => Promise<T>): Promise<T | undefined> {
    try {
      return await fn()
    }
    catch (err: any) {
      toast.add({ title: 'Could not save', description: err?.data?.message ?? err?.message, color: 'error' })
    }
    finally {
      await refresh()
    }
  }

  const create = (title: string, extra: { parent_id?: string, board_column?: ColumnKey } = {}) =>
    call(() => $fetch('/api/items', {
      method: 'POST',
      headers: headers(),
      body: { space_id: space.value!.id, title, ...extra },
    }))

  const update = (id: string, patch: Record<string, unknown>) =>
    call(() => $fetch(`/api/items/${id}`, { method: 'PATCH', headers: headers(), body: patch }))

  return { items, childMap, byColumn, titleOf, create, update }
}
