<script setup lang="ts">
// Universal code: runs on the server during SSR, then again in the browser to hydrate.
// `useFetch` is a Nuxt auto-import. On the server it calls the Nitro route in-process (no network hop).
const { data: index } = await useFetch('/api/v1')
const { data: spec } = await useFetch<{ paths: Record<string, Record<string, { summary: string; tags: string[] }>> }>(
  '/api/v1/openapi.json',
)

// Computed property: re-evaluated only when `spec` changes (Vue tracks the dependency).
const routes = computed(() =>
  Object.entries(spec.value?.paths ?? {}).flatMap(([path, methods]) =>
    Object.entries(methods).map(([method, op]) => ({ method: method.toUpperCase(), path, ...op })),
  ),
)
</script>

<template>
  <main>
    <h1>Lerch API <small>{{ index?.contract_version }}</small></h1>
    <p>Generated from the route contracts. <a href="/api/v1/openapi.json">openapi.json</a></p>

    <h2>Layers</h2>
    <ul>
      <li v-for="mod in index?.modules" :key="mod.name">
        <strong>{{ mod.name }}</strong>
        <span v-if="mod.depends_on.length"> builds on {{ mod.depends_on.join(', ') }}</span>
        · {{ mod.route_count }} routes
      </li>
    </ul>

    <h2>Routes</h2>
    <table>
      <!-- Explicit <tbody>: browsers insert one when parsing the server HTML, and Vue would see a mismatch -->
      <tbody>
        <tr v-for="r in routes" :key="r.method + r.path">
          <td>{{ r.method }}</td>
          <td><code>/api/v1{{ r.path === '/' ? '' : r.path }}</code></td>
          <td>{{ r.summary }}</td>
          <td>{{ r.tags.join(', ') }}</td>
        </tr>
      </tbody>
    </table>
  </main>
</template>

<style>
body { font-family: system-ui, sans-serif; margin: 0; background: #fafafa; color: #222; }
main { max-width: 52rem; margin: 2rem auto; padding: 0 1rem; }
small { color: #888; font-weight: normal; }
td { padding: 0.25rem 1rem 0.25rem 0; }
</style>
