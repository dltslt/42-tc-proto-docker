<script setup lang="ts">
// Progressive creation: one line is enough. Enter creates, the field clears and stays focused.
defineProps<{ placeholder?: string, size?: 'sm' | 'md' | 'lg' }>()
// defineEmits: typed custom events this component sends to its parent (like a callback signature).
const emit = defineEmits<{ add: [title: string] }>()

// ref(): reactive box; read/write through `.value` in script, auto-unwrapped in the template.
const title = ref('')

function submit() {
  const value = title.value.trim()
  if (!value) return
  emit('add', value)
  title.value = ''
}
</script>

<template>
  <UInput
    v-model="title"
    :placeholder="placeholder ?? 'Add an item and press Enter'"
    :size="size ?? 'md'"
    icon="i-lucide-plus"
    class="w-full"
    @keydown.enter="submit"
  />
</template>
