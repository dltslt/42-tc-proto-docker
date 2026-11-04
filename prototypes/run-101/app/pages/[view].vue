<script setup lang="ts">
// File-based route: /:view. [view] in the file name becomes route.params.view.
// validate runs before the page renders; returning false produces a 404.
definePageMeta({
  validate: route => getView(String(route.params.view)) !== undefined,
})

const route = useRoute()
// Nuxt auto-import: computed re-evaluates when route.params changes (browser navigation between views).
const view = computed(() => getView(String(route.params.view)))
</script>

<template>
  <!-- Vue's <component :is> renders whichever component the registry returned. -->
  <component :is="view?.component" />
</template>
