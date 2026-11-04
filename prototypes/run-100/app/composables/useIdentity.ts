// Composables in app/composables are auto-imported. This one runs in the universal context:
// on the server during SSR first, then again in the browser while the page hydrates.
// "Who am I / which space am I in" is lightweight state (no auth), kept in cookies so the
// server render and the browser agree on the very first paint.
export function useIdentity() {
  // useFetch: during SSR Nitro is called in-process (no network hop); the result is embedded in the
  // HTML payload so the browser does not repeat the request. `key` dedupes calls across components.
  // Deliberately NOT awaited: Nuxt composables only work synchronously inside setup() (after an
  // `await` the Nuxt context is gone), and SSR still waits for the request before rendering HTML.
  const request = useFetch<Roster>('/api/actors', {
    key: 'roster',
    default: () => ({ actors: [], spaces: [] }),
  })
  const data = request.data

  const cookieActor = useCookie<string | null>('lerch_actor')
  const cookieSpace = useCookie<string | null>('lerch_space')

  // useState: SSR-safe reactive state shared by every component that asks for the same key
  // (unlike a bare module-level ref, it is not shared between users' requests on the server).
  const actorId = useState<string | null>('lerch-actor', () => cookieActor.value ?? null)
  const spaceId = useState<string | null>('lerch-space', () => cookieSpace.value ?? null)

  // computed(): re-evaluated automatically when any reactive value read inside it changes.
  const actor = computed(() => data.value.actors.find(a => a.id === actorId.value) ?? data.value.actors[0] ?? null)
  const spaces = computed(() => data.value.spaces.filter(s => actor.value?.space_ids.includes(s.id)))
  const space = computed(() => spaces.value.find(s => s.id === spaceId.value) ?? spaces.value[0] ?? null)

  function selectActor(id: string) {
    actorId.value = id
    cookieActor.value = id
  }
  function selectSpace(id: string) {
    spaceId.value = id
    cookieSpace.value = id
  }

  return { roster: data, ready: request.then(() => undefined), actor, spaces, space, selectActor, selectSpace }
}

// Synchronous name lookup for any component, read from the already-fetched roster cache.
export function useActorName() {
  const { data } = useNuxtData<Roster>('roster')
  return (id: string | null) => data.value?.actors.find(a => a.id === id)?.name ?? null
}
