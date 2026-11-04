<script setup lang="ts">
// File-based routing: app/pages/index.vue is the route "/".
const { actor, space, roster } = useIdentity()
const { items, childMap, projects, scopeId, scopeProject, byColumn, titleOf, create, update, remove } = useItems()

const view = ref<'board' | 'tree'>('board')
const viewTabs = [
  { label: 'Board', value: 'board', icon: 'i-lucide-columns-3' },
  { label: 'Tree', value: 'tree', icon: 'i-lucide-list-tree' },
]

// Tree roots: the scoped project, or every top-level item.
const roots = computed(() => scopeProject.value ? [scopeProject.value] : childMap.value[''] ?? [])

// Scope selector: USelect cannot hold null, so "all items" gets a sentinel value.
const ALL = '__all'
const scopeItems = computed(() => [
  { label: 'All items', value: ALL, icon: 'i-lucide-layers' },
  ...projects.value.map(p => ({ label: p.title, value: p.id, icon: 'i-lucide-folder' })),
])
const scope = computed({
  get: () => scopeId.value ?? ALL,
  set: (v: string) => { scopeId.value = v === ALL ? null : v },
})

// New items created while a project is in scope become its children (one step, no parent picker).
const createHere = (title: string, extra: { parent_id?: string, board_column?: ColumnKey } = {}) =>
  create(title, { parent_id: scopeId.value ?? undefined, ...extra })

// Editor dialog: open when an item id is selected.
const selectedId = ref<string | null>(null)
const selected = computed(() => items.value.find(i => i.id === selectedId.value) ?? null)
const members = computed(() => roster.value.actors.filter(a => space.value?.member_ids.includes(a.id)))

// Checking a box is the fastest state change: done <-> unstarted. The API keeps column in sync.
const toggle = (item: Item, done: boolean) => update(item.id, { state: done ? 'done' : 'unstarted' })
const move = (id: string, board_column: ColumnKey, before_id?: string) => update(id, { board_column, before_id })
const save = (id: string, patch: Record<string, unknown>) => update(id, patch)

// Editor extras: items that may become the parent (not itself, not below itself) and the subtree size.
const selectedDescendants = computed(() => selected.value ? descendantsOf(childMap.value, selected.value.id) : [])
const parentOptions = computed(() => {
  const blocked = new Set([selected.value?.id, ...selectedDescendants.value.map(i => i.id)])
  return items.value.filter(i => !blocked.has(i.id))
})
</script>

<template>
  <main class="mx-auto max-w-7xl space-y-4 px-4 py-6">
    <div class="flex flex-wrap items-center gap-4">
      <div class="min-w-64 flex-1">
        <QuickAdd size="lg" :placeholder="scopeProject ? `Add to ${scopeProject.title} and press Enter` : undefined" @add="title => createHere(title)" />
      </div>
      <USelect v-model="scope" :items="scopeItems" class="w-56" aria-label="Project scope" />
      <!-- :content="false": tabs act as a plain switch; the content is rendered below. -->
      <UTabs v-model="view" :items="viewTabs" :content="false" class="w-56" />
    </div>

    <p v-if="!items.length" class="py-12 text-center text-muted">
      Nothing here yet{{ actor ? `, ${actor.name}` : '' }}. Type a title above to create the first item.
    </p>

    <BoardView
      v-else-if="view === 'board'"
      :by-column="byColumn"
      :title-of="titleOf"
      @open="selectedId = $event"
      @move="move"
      @add="(board_column, title) => createHere(title, { board_column })"
    />

    <section v-else class="rounded-lg border border-default py-2">
      <TreeNode
        v-for="root in roots"
        :key="root.id"
        :item="root"
        :child-map="childMap"
        @open="selectedId = $event"
        @toggle="toggle"
        @add="(parentId, title) => create(title, { parent_id: parentId })"
      />
    </section>

    <ItemEditor
      :item="selected"
      :children="selected ? childMap[selected.id] ?? [] : []"
      :members="members"
      :parent-options="parentOptions"
      :descendant-count="selectedDescendants.length"
      @close="selectedId = null"
      @save="save"
      @remove="remove"
      @add-child="(parentId, title) => create(title, { parent_id: parentId })"
    />
  </main>
</template>
