<script setup lang="ts">
// Recursive component: a node renders its children with <TreeNode> again (a component can
// refer to itself by its filename, like a recursive function). Data arrives as props (parent -> child),
// user actions leave as emits (child -> parent); nothing here talks to the API directly.
const props = defineProps<{ item: Item, childMap: Record<string, Item[]>, depth?: number }>()
const emit = defineEmits<{
  open: [id: string]
  toggle: [item: Item, done: boolean]
  add: [parentId: string, title: string]
}>()

const lead = useActorName()
const adding = ref(false)
const kids = computed(() => props.childMap[props.item.id] ?? [])
const depth = computed(() => props.depth ?? 0)
</script>

<template>
  <div>
    <!-- Inline style: the indent depends on a runtime value, which a static Tailwind class cannot express. -->
    <div
      class="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-elevated"
      :style="{ paddingLeft: `${depth * 1.5 + 0.5}rem` }"
    >
      <UCheckbox
        :model-value="item.state === 'done'"
        :disabled="item.state === 'discarded'"
        @update:model-value="emit('toggle', item, $event === true)"
      />
      <UBadge :color="TYPE_COLOR[item.type]" variant="subtle" size="sm" class="w-16 justify-center">
        {{ item.type }}
      </UBadge>
      <button
        class="flex-1 truncate text-left"
        :class="{ 'line-through text-muted': item.state === 'done' || item.state === 'discarded' }"
        @click="emit('open', item.id)"
      >
        {{ item.title }}
      </button>
      <span v-if="lead(item.lead_id)" class="text-xs text-muted">{{ lead(item.lead_id) }}</span>
      <UBadge v-if="item.state === 'started'" color="warning" variant="subtle" size="sm">started</UBadge>
      <UBadge v-else-if="item.state === 'discarded'" color="neutral" variant="outline" size="sm">discarded</UBadge>
      <UButton
        icon="i-lucide-plus"
        size="xs"
        color="neutral"
        variant="ghost"
        aria-label="Add child item"
        class="opacity-0 group-hover:opacity-100 focus:opacity-100"
        @click="adding = !adding"
      />
    </div>

    <div v-if="adding" class="py-1 pr-2" :style="{ paddingLeft: `${(depth + 1) * 1.5 + 0.5}rem` }">
      <QuickAdd
        size="sm"
        placeholder="Add a child and press Enter"
        @add="title => emit('add', item.id, title)"
      />
    </div>

    <TreeNode
      v-for="child in kids"
      :key="child.id"
      :item="child"
      :child-map="childMap"
      :depth="depth + 1"
      @open="emit('open', $event)"
      @toggle="(i, d) => emit('toggle', i, d)"
      @add="(p, t) => emit('add', p, t)"
    />
  </div>
</template>
