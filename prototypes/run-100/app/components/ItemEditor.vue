<script setup lang="ts">
// Edit dialog. Works on a local copy of the item; nothing is sent until "Save".
const props = defineProps<{ item: Item | null, children: Item[], members: Actor[], parentOptions: Item[], descendantCount: number }>()
const emit = defineEmits<{
  close: []
  save: [id: string, patch: Record<string, unknown>]
  addChild: [parentId: string, title: string]
  remove: [id: string]
}>()

const NO_LEAD = '__none' // USelect cannot hold null, so "no lead" gets a sentinel value
const NO_PARENT = '__root'
const form = reactive({ title: '', description: '', type: 'task' as ItemType, state: 'unstarted' as ItemState, lead: NO_LEAD, parent: NO_PARENT })
const confirmingDelete = ref(false) // two-step delete: first click arms it, second click deletes

// watch(): runs the callback whenever the watched source changes (here: a different item opens).
watch(() => props.item, (item) => {
  if (!item) return
  Object.assign(form, { title: item.title, description: item.description, type: item.type, state: item.state, lead: item.lead_id ?? NO_LEAD, parent: item.parent_id ?? NO_PARENT })
  confirmingDelete.value = false
}, { immediate: true })

const leadItems = computed(() => [
  { label: 'No lead', value: NO_LEAD },
  ...props.members.map(m => ({ label: m.name, value: m.id })),
])

// Candidate parents are pre-filtered by the page (no self, no descendants); the server re-checks anyway.
const parentItems = computed(() => [
  { label: 'No parent (top level)', value: NO_PARENT },
  ...props.parentOptions.map(p => ({ label: `${p.type}: ${p.title}`, value: p.id })),
])

function remove() {
  if (!props.item) return
  emit('remove', props.item.id)
  emit('close')
}

function save() {
  if (!props.item) return
  const patch: Record<string, unknown> = {}
  if (form.title !== props.item.title) patch.title = form.title
  if (form.description !== props.item.description) patch.description = form.description
  if (form.type !== props.item.type) patch.type = form.type
  if (form.state !== props.item.state) patch.state = form.state
  const lead = form.lead === NO_LEAD ? null : form.lead
  if (lead !== props.item.lead_id) patch.lead_id = lead
  const parent = form.parent === NO_PARENT ? null : form.parent
  if (parent !== props.item.parent_id) patch.parent_id = parent
  if (Object.keys(patch).length) emit('save', props.item.id, patch)
  emit('close')
}
</script>

<template>
  <!-- v-model:open is two-way binding; the parent owns visibility, we only request a close. -->
  <UModal :open="!!item" title="Edit item" @update:open="open => !open && emit('close')">
    <template #body>
      <form v-if="item" class="space-y-4" @submit.prevent="save">
        <UFormField label="Title">
          <UInput v-model="form.title" class="w-full" />
        </UFormField>
        <UFormField label="Description">
          <UTextarea v-model="form.description" :rows="4" class="w-full" placeholder="Details can wait until someone starts the work." />
        </UFormField>
        <div class="grid grid-cols-3 gap-3">
          <UFormField label="Type">
            <USelect v-model="form.type" :items="[...ITEM_TYPES]" class="w-full" />
          </UFormField>
          <UFormField label="State">
            <USelect v-model="form.state" :items="[...ITEM_STATES]" class="w-full" />
          </UFormField>
          <UFormField label="Lead">
            <USelect v-model="form.lead" :items="leadItems" class="w-full" />
          </UFormField>
        </div>

        <UFormField label="Parent">
          <USelect v-model="form.parent" :items="parentItems" class="w-full" />
        </UFormField>

        <div class="space-y-2">
          <h3 class="text-sm font-medium">Child items</h3>
          <ul v-if="children.length" class="space-y-1 text-sm">
            <li v-for="child in children" :key="child.id" class="flex items-center gap-2">
              <UBadge :color="TYPE_COLOR[child.type]" variant="subtle" size="sm">{{ child.type }}</UBadge>
              <span :class="{ 'line-through text-muted': child.state === 'done' }">{{ child.title }}</span>
            </li>
          </ul>
          <QuickAdd size="sm" placeholder="Add a child and press Enter" @add="title => emit('addChild', item!.id, title)" />
        </div>

        <div class="flex items-center justify-end gap-2 pt-2">
          <UButton v-if="!confirmingDelete" color="error" variant="ghost" icon="i-lucide-trash-2" class="mr-auto" @click="confirmingDelete = true">Delete</UButton>
          <template v-else>
            <span class="mr-auto text-sm text-error">
              {{ descendantCount ? `Delete this and ${descendantCount} nested item${descendantCount === 1 ? '' : 's'}?` : 'Delete this item?' }}
            </span>
            <UButton color="error" @click="remove">Yes, delete</UButton>
            <UButton color="neutral" variant="ghost" @click="confirmingDelete = false">Keep</UButton>
          </template>
          <UButton color="neutral" variant="ghost" @click="emit('close')">Cancel</UButton>
          <UButton type="submit">Save</UButton>
        </div>
      </form>
    </template>
  </UModal>
</template>
