<script setup lang="ts">
// Universal (SSR + browser): the shell knows nothing about any single view, it lists what is registered.
// listViews() is auto-imported from layers/core/app/utils/views.ts.
const navItems = listViews().map(view => ({
  label: view.label,
  icon: view.icon,
  to: `/${view.id}`,
}))
</script>

<template>
  <div class="flex h-dvh flex-col">
    <header class="flex items-center gap-4 border-b border-default px-4 py-2">
      <NuxtLink to="/" class="font-semibold">Lerch</NuxtLink>
      <UNavigationMenu :items="navItems" aria-label="Views" />
    </header>
    <main class="min-h-0 flex-1 overflow-auto">
      <slot />
    </main>
  </div>
</template>
