<script setup lang="ts">
// Universal Vue component: executes during SSR on Node container, hydrates in browser
// Nuxt auto-imports: ref, computed, watch, useFetch, definePageMeta

// Navigation and view state proxies
const activeView = ref<'mindmap' | 'list' | 'benchmark'>('mindmap')
const activeSource = ref<'postgres' | 'mongo'>('postgres')
const selectedSpaceId = ref<string>('space-db-fundamentals')

const isDrawerOpen = ref(false)
const selectedItem = ref<any | null>(null)

// Nuxt auto-import: useFetch reactive data fetcher
const { data: spacesData, refresh: refreshSpaces } = await useFetch('/api/spaces', {
  query: { source: activeSource },
})

const spaces = computed(() => spacesData.value?.spaces || [])

// Watch source and space to fetch items
const { data: itemsResult, refresh: refreshItems, pending: isItemsPending } = await useFetch('/api/items', {
  query: computed(() => ({
    space_id: selectedSpaceId.value,
    source: activeSource.value,
    limit: 1000,
  })),
  watch: [selectedSpaceId, activeSource],
})

// Watch source and space to fetch mindmap hierarchy
const { data: mindmapResult, refresh: refreshMindmap, pending: isMindmapPending } = await useFetch('/api/mindmap', {
  query: computed(() => ({
    space_id: selectedSpaceId.value,
    source: activeSource.value,
  })),
  watch: [selectedSpaceId, activeSource],
})

function openItemDrawer(item: any) {
  selectedItem.value = item
  isDrawerOpen.value = true
}

function handleItemCreated(newItem: any) {
  refreshItems()
  refreshMindmap()
  if (selectedItem.value && selectedItem.value.id === newItem.parent_id) {
    selectedItem.value.child_count = (selectedItem.value.child_count || 0) + 1
  }
}

function handleDataGenerated() {
  refreshSpaces()
  refreshItems()
  refreshMindmap()
}

function refreshData() {
  refreshItems()
  refreshMindmap()
}
</script>

<template>
  <div class="app-root">
    <!-- Top Global App Bar -->
    <header class="app-header">
      <div class="brand-group">
        <div class="brand-logo">L</div>
        <div>
          <h1 class="brand-title">Lerch <span class="run-tag">run-500</span></h1>
          <span class="brand-desc">SQL vs NoSQL Mechanical Exploration & Radial Mindmap</span>
        </div>
      </div>

      <!-- Controls: Space Picker & DB Source Switcher -->
      <div class="header-controls">
        <!-- Space Selector -->
        <div class="control-box">
          <label for="space-select" class="control-label">Active Space:</label>
          <select
            id="space-select"
            v-model="selectedSpaceId"
            class="header-select"
          >
            <option v-for="sp in spaces" :key="sp.id" :value="sp.id">
              {{ sp.name }}
            </option>
          </select>
        </div>

        <!-- Database Source Toggle -->
        <div class="control-box">
          <span class="control-label">Database Engine:</span>
          <div class="source-toggle">
            <button
              class="toggle-btn pg"
              :class="{ active: activeSource === 'postgres' }"
              @click="activeSource = 'postgres'"
            >
              PostgreSQL
            </button>
            <button
              class="toggle-btn mongo"
              :class="{ active: activeSource === 'mongo' }"
              @click="activeSource = 'mongo'"
            >
              MongoDB
            </button>
          </div>
        </div>
      </div>
    </header>

    <!-- Sub-header Navigation Tabs -->
    <nav class="view-tabs-bar">
      <div class="tabs-group">
        <button
          class="nav-tab"
          :class="{ active: activeView === 'mindmap' }"
          @click="activeView = 'mindmap'"
        >
          <span class="tab-icon">🕸️</span> Radial Mindmap
        </button>
        <button
          class="nav-tab"
          :class="{ active: activeView === 'list' }"
          @click="activeView = 'list'"
        >
          <span class="tab-icon">📋</span> Plain List View
        </button>
        <button
          class="nav-tab"
          :class="{ active: activeView === 'benchmark' }"
          @click="activeView = 'benchmark'"
        >
          <span class="tab-icon">⚡</span> Benchmark Lab
        </button>
      </div>

      <div class="live-indicator">
        <span class="status-pulse"></span>
        <span class="engine-live-text">
          Connected: <strong>{{ activeSource === 'postgres' ? 'PostgreSQL 16 (Port 5433)' : 'MongoDB 7 (Port 27017)' }}</strong>
        </span>
      </div>
    </nav>

    <!-- Main View Content Area -->
    <main class="main-content">
      <!-- 1. Radial Mindmap View -->
      <section v-if="activeView === 'mindmap'" class="view-panel">
        <RadialMindmap
          :root="mindmapResult?.root || null"
          :source="activeSource"
          :duration-ms="mindmapResult?.durationMs || 0"
          :raw-query="mindmapResult?.rawQuery"
          :node-count="mindmapResult?.nodeCount || 0"
          @select-item="openItemDrawer"
        />
      </section>

      <!-- 2. Plain List View -->
      <section v-else-if="activeView === 'list'" class="view-panel">
        <PlainListView
          :items="itemsResult?.items || []"
          :space-id="selectedSpaceId"
          :source="activeSource"
          :duration-ms="itemsResult?.durationMs || 0"
          @select-item="openItemDrawer"
          @refresh="refreshData"
        />
      </section>

      <!-- 3. Benchmark Lab View -->
      <section v-else-if="activeView === 'benchmark'" class="view-panel">
        <BenchmarkSuite @data-generated="handleDataGenerated" />
      </section>
    </main>

    <!-- Concept Explanation & Details Drawer -->
    <ItemDrawer
      :item="selectedItem"
      :is-open="isDrawerOpen"
      :source="activeSource"
      @close="isDrawerOpen = false"
      @item-created="handleItemCreated"
    />
  </div>
</template>

<style>
/* Global Resets & Typography */
html, body {
  margin: 0;
  padding: 0;
  background-color: #090d16;
  color: #f1f5f9;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

*, *::before, *::after {
  box-sizing: border-box;
}

code, pre {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
}
</style>

<style scoped>
.app-root {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

.app-header {
  background-color: #0f172a;
  border-bottom: 1px solid #1e293b;
  padding: 0.85rem 1.5rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.brand-group {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.brand-logo {
  width: 38px;
  height: 38px;
  background: linear-gradient(135deg, #3b82f6, #6366f1);
  color: white;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 800;
  font-size: 1.25rem;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.4);
}

.brand-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #f8fafc;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.run-tag {
  font-size: 0.75rem;
  background-color: #1e293b;
  border: 1px solid #334155;
  color: #38bdf8;
  padding: 0.1rem 0.45rem;
  border-radius: 0.25rem;
  font-family: monospace;
}

.brand-desc {
  font-size: 0.8rem;
  color: #94a3b8;
}

.header-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1.25rem;
}

.control-box {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.control-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
}

.header-select {
  background-color: #1e293b;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 0.45rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.85rem;
  outline: none;
}
.header-select:focus {
  border-color: #38bdf8;
}

.source-toggle {
  display: flex;
  background-color: #0b1120;
  border: 1px solid #334155;
  border-radius: 0.375rem;
  padding: 2px;
}

.toggle-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.toggle-btn.pg.active {
  background-color: #4f46e5;
  color: white;
}

.toggle-btn.mongo.active {
  background-color: #059669;
  color: white;
}

.view-tabs-bar {
  background-color: #0b1120;
  border-bottom: 1px solid #1e293b;
  padding: 0 1.5rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.tabs-group {
  display: flex;
  gap: 0.5rem;
}

.nav-tab {
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  color: #94a3b8;
  font-size: 0.875rem;
  font-weight: 600;
  padding: 0.85rem 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  transition: all 0.15s;
}

.nav-tab:hover {
  color: #f1f5f9;
}

.nav-tab.active {
  color: #38bdf8;
  border-bottom-color: #38bdf8;
}

.tab-icon {
  font-size: 1rem;
}

.live-indicator {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.8rem;
  color: #cbd5e1;
}

.status-pulse {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background-color: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.main-content {
  flex: 1;
  padding: 1.5rem;
  max-width: 1400px;
  width: 100%;
  margin: 0 auto;
}

.view-panel {
  width: 100%;
}
</style>
