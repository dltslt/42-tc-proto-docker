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

  const childMap = computed(() => buildChildMap(items.value))

  // Scope filter: focus the board/tree on one project. The choice lives in the URL (?project=<id>),
  // so it survives reloads and can be shared. useRoute() is reactive: it updates on navigation.
  const route = useRoute()
  const router = useRouter()
  const projects = computed(() => items.value.filter(i => i.type === 'project'))
  const scopeId = computed<string | null>({
    get() {
      const q = route.query.project
      return typeof q === 'string' && projects.value.some(p => p.id === q) ? q : null // unknown id: ignore
    },
    set(id) {
      router.replace({ query: id ? { project: id } : {} })
    },
  })
  const scopeProject = computed(() => projects.value.find(p => p.id === scopeId.value) ?? null)

  // Board shows the scoped project's descendants (or everything when unscoped).
  const scopedItems = computed(() =>
    scopeId.value ? descendantsOf(childMap.value, scopeId.value) : items.value,
  )

  // Board columns: discarded items leave the board; the API already sorted by position.
  const byColumn = computed(() => {
    const cols = Object.fromEntries(COLUMNS.map(c => [c.key, [] as Item[]])) as Record<ColumnKey, Item[]>
    for (const item of scopedItems.value) if (item.state !== 'discarded') cols[item.board_column].push(item)
    // scopedItems keeps list order only for the unscoped case; re-sort so scoped boards stay ordered too.
    for (const list of Object.values(cols)) list.sort((a, b) => a.position - b.position)
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

  // Deleting cascades to the subtree on the server; tell the user how much went away.
  const remove = async (id: string) => {
    const res = await call(() => $fetch<{ deleted: number }>(`/api/items/${id}`, { method: 'DELETE', headers: headers() }))
    if (res) toast.add({ title: res.deleted === 1 ? 'Item deleted' : `${res.deleted} items deleted`, color: 'neutral' })
  }

  return { items, childMap, projects, scopeId, scopeProject, byColumn, titleOf, create, update, remove }
}
