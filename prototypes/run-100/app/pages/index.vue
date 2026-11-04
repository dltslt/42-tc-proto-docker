<script setup lang="ts">
// File-based routing: app/pages/index.vue is the route "/".
const { actor, space, roster } = useIdentity()
const { items, childMap, byColumn, titleOf, create, update } = useItems()

const view = ref<'board' | 'tree'>('board')
const viewTabs = [
  { label: 'Board', value: 'board', icon: 'i-lucide-columns-3' },
  { label: 'Tree', value: 'tree', icon: 'i-lucide-list-tree' },
]

const roots = computed(() => childMap.value[''] ?? [])

// Editor dialog: open when an item id is selected.
const selectedId = ref<string | null>(null)
const selected = computed(() => items.value.find(i => i.id === selectedId.value) ?? null)
const members = computed(() => roster.value.actors.filter(a => space.value?.member_ids.includes(a.id)))

// Checking a box is the fastest state change: done <-> unstarted. The API keeps column in sync.
const toggle = (item: Item, done: boolean) => update(item.id, { state: done ? 'done' : 'unstarted' })
const move = (id: string, board_column: ColumnKey, before_id?: string) => update(id, { board_column, before_id })
const save = (id: string, patch: Record<string, unknown>) => update(id, patch)
</script>

<template>
  <main class="mx-auto max-w-7xl space-y-4 px-4 py-6">
    <div class="flex flex-wrap items-center gap-4">
      <div class="min-w-64 flex-1">
        <QuickAdd size="lg" @add="title => create(title)" />
      </div>
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
      @add="(board_column, title) => create(title, { board_column })"
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
      @close="selectedId = null"
      @save="save"
      @add-child="(parentId, title) => create(title, { parent_id: parentId })"
    />
  </main>
</template>
