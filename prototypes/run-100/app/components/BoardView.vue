<script setup lang="ts">
// Kanban board using native HTML5 drag-and-drop (browser-only events; nothing runs on the server).
// Flow: dragstart remembers the card -> dragover marks a column as a target -> drop emits `move`.
// The page turns `move` into PATCH /api/items/:id; the server decides state and position.
defineProps<{ byColumn: Record<ColumnKey, Item[]>, titleOf: (id: string | null) => string | null }>()
const emit = defineEmits<{
  open: [id: string]
  move: [id: string, column: ColumnKey, beforeId?: string]
  add: [column: ColumnKey, title: string]
}>()

const dragging = ref<string | null>(null) // id of the card being dragged
const overColumn = ref<ColumnKey | null>(null) // column currently highlighted as drop target

function onDragStart(event: DragEvent, item: Item) {
  dragging.value = item.id
  event.dataTransfer?.setData('text/plain', item.id) // required by Firefox to start a drag
  if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
}

function onDrop(column: ColumnKey, beforeId?: string) {
  const id = dragging.value
  dragging.value = overColumn.value = null
  if (id && id !== beforeId) emit('move', id, column, beforeId)
}
</script>

<template>
  <div class="grid gap-4 md:grid-cols-3">
    <section
      v-for="col in COLUMNS"
      :key="col.key"
      class="flex min-h-64 flex-col gap-3 rounded-xl border bg-elevated/50 p-3 transition-colors"
      :class="overColumn === col.key ? 'border-primary bg-primary/5' : 'border-default'"
      @dragover.prevent="overColumn = col.key"
      @dragleave.self="overColumn = null"
      @drop.prevent="onDrop(col.key)"
    >
      <header class="flex items-center justify-between px-1">
        <h2 class="text-sm font-semibold">{{ col.label }}</h2>
        <UBadge color="neutral" variant="subtle" size="sm">{{ byColumn[col.key].length }}</UBadge>
      </header>

      <!-- Dropping on a card (.stop) inserts before it; dropping on empty column space appends. -->
      <ItemCard
        v-for="item in byColumn[col.key]"
        :key="item.id"
        :item="item"
        :parent-title="titleOf(item.parent_id)"
        @click="emit('open', item.id)"
        @dragstart="onDragStart($event, item)"
        @dragend="dragging = overColumn = null"
        @dragover.prevent
        @drop.prevent.stop="onDrop(col.key, item.id)"
      />

      <QuickAdd size="sm" :placeholder="`Add to ${col.label}`" @add="title => emit('add', col.key, title)" />
    </section>
  </div>
</template>
