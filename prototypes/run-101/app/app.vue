<template>
  <!-- UApp provides what Nuxt UI needs globally (toasts, tooltips, overlays). -->
  <UApp>
    <NuxtRouteAnnouncer />
    <!-- NuxtLayout renders app/layouts/default.vue; NuxtPage renders the page matching the URL. -->
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
