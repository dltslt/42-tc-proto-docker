<script setup lang="ts">
// Universal code (SSR + browser): the header is rendered on the server first, then hydrated.
const { roster, actor, spaces, space, selectActor, selectSpace } = useIdentity()

// USelect takes {label, value} items; computed() rebuilds them when the roster changes.
const actorItems = computed(() =>
  roster.value.actors.map(a => ({ label: a.name, value: a.id, icon: a.kind === 'agent' ? 'i-lucide-bot' : 'i-lucide-user' })),
)
const spaceItems = computed(() =>
  spaces.value.map(s => ({ label: s.name, value: s.id, icon: s.type === 'personal' ? 'i-lucide-house' : 'i-lucide-users' })),
)
</script>

<template>
  <!-- UApp is required by Nuxt UI: it hosts toasts, tooltips and modals. -->
  <UApp>
    <header class="border-b border-default bg-default">
      <div class="mx-auto flex max-w-7xl items-center gap-3 px-4 py-3">
        <span class="text-lg font-semibold tracking-tight">Lerch</span>
        <USelect
          :model-value="space?.id"
          :items="spaceItems"
          class="w-48"
          aria-label="Space"
          @update:model-value="selectSpace"
        />
        <div class="ml-auto flex items-center gap-2">
          <span class="text-sm text-muted">Acting as</span>
          <USelect
            :model-value="actor?.id"
            :items="actorItems"
            class="w-44"
            aria-label="Current user"
            @update:model-value="selectActor"
          />
        </div>
      </div>
    </header>
    <!-- NuxtPage renders the component of the current file-based route (app/pages/*.vue). -->
    <NuxtPage />
  </UApp>
</template>
