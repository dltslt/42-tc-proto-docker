<script setup lang="ts">
// One kanban card. Pure presentation: the drag behaviour is wired by BoardView.
defineProps<{ item: Item, parentTitle: string | null }>()
const lead = useActorName()
</script>

<template>
  <div
    class="cursor-grab space-y-1.5 rounded-lg border border-default bg-default p-3 shadow-xs hover:border-primary active:cursor-grabbing"
    draggable="true"
  >
    <p class="text-sm font-medium">{{ item.title }}</p>
    <p v-if="parentTitle" class="truncate text-xs text-muted">in {{ parentTitle }}</p>
    <div class="flex items-center gap-2">
      <UBadge :color="TYPE_COLOR[item.type]" variant="subtle" size="sm">{{ item.type }}</UBadge>
      <span v-if="lead(item.lead_id)" class="ml-auto text-xs text-muted">{{ lead(item.lead_id) }}</span>
    </div>
  </div>
</template>
