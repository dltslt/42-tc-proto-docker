<script setup lang="ts">
// File-based route: GET /. Runs on the server first, so the redirect is a real HTTP redirect.
const firstView = listViews()[0]
if (firstView) await navigateTo(`/${firstView.id}`, { replace: true })
</script>

<template>
  <p class="p-6 text-muted">No views are installed.</p>
</template>
