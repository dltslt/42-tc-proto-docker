<script setup lang="ts">
// Universal Vue component: runs on server during SSR and hydrates in client browser
// Auto-imported composables: ref, computed, watch

interface Item {
  id: string
  space_id: string
  title: string
  description?: string
  parent_id?: string | null
  state: string
  position?: number
  depth?: number
  tags?: string[]
  child_count?: number
  created_at?: string
  updated_at?: string
}

const props = defineProps<{
  items: Item[]
  spaceId: string
  source: 'postgres' | 'mongo'
  durationMs: number
}>()

const emit = defineEmits<{
  (e: 'select-item', item: Item): void
  (e: 'refresh'): void
}>()

// Nuxt auto-import: reactive state proxy
const searchQuery = ref('')
const selectedStateFilter = ref<string>('all')

const filteredItems = computed(() => {
  return props.items.filter((item) => {
    const matchesSearch =
      !searchQuery.value ||
      item.title.toLowerCase().includes(searchQuery.value.toLowerCase()) ||
      (item.description && item.description.toLowerCase().includes(searchQuery.value.toLowerCase())) ||
      (item.tags && item.tags.some((t) => t.toLowerCase().includes(searchQuery.value.toLowerCase())))

    const matchesState =
      selectedStateFilter.value === 'all' || item.state === selectedStateFilter.value

    return matchesSearch && matchesState
  })
})
</script>

<template>
  <div class="plain-list-container">
    <!-- Filter and Search Header -->
    <div class="list-controls">
      <div class="search-box">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" class="search-icon">
          <path fill="currentColor" d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
        </svg>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Filter items by title, description, or tag..."
          class="search-input"
        />
        <button v-if="searchQuery" class="clear-search" @click="searchQuery = ''">×</button>
      </div>

      <div class="filters-row">
        <div class="filter-item">
          <label for="state-filter">State:</label>
          <select id="state-filter" v-model="selectedStateFilter" class="select-control">
            <option value="all">All States</option>
            <option value="unstarted">Unstarted</option>
            <option value="started">Started</option>
            <option value="done">Done</option>
            <option value="discarded">Discarded</option>
          </select>
        </div>

        <div class="metrics-pill" :class="source">
          <span class="pulse-dot"></span>
          {{ items.length }} items fetched from <strong>{{ source === 'postgres' ? 'PostgreSQL' : 'MongoDB' }}</strong> in {{ durationMs }}ms
        </div>
      </div>
    </div>

    <!-- Tabular Data View -->
    <div class="table-card">
      <table class="data-table">
        <thead>
          <tr>
            <th class="col-title">Title & Concept</th>
            <th class="col-hierarchy">Depth / Parent</th>
            <th class="col-state">State</th>
            <th class="col-tags">Tags (Embedded vs Relational)</th>
            <th class="col-children">Children</th>
            <th class="col-actions">Inspect</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="item in filteredItems"
            :key="item.id"
            class="item-row"
            @click="emit('select-item', item)"
          >
            <td class="col-title">
              <div class="title-cell" :style="{ paddingLeft: `${(item.depth || 0) * 1.25}rem` }">
                <span v-if="(item.depth || 0) > 0" class="tree-line">└─</span>
                <span class="node-dot" :class="item.state"></span>
                <div class="title-meta">
                  <span class="title-text">{{ item.title }}</span>
                  <span class="id-subtext">{{ item.id }}</span>
                </div>
              </div>
            </td>
            <td class="col-hierarchy">
              <span class="depth-badge">Lvl {{ item.depth || 0 }}</span>
              <span v-if="item.parent_id" class="parent-ref" :title="`Parent: ${item.parent_id}`">
                ↑ {{ item.parent_id }}
              </span>
              <span v-else class="root-ref">Root</span>
            </td>
            <td class="col-state">
              <span class="state-pill" :class="item.state">{{ item.state }}</span>
            </td>
            <td class="col-tags">
              <div class="tags-list">
                <span v-for="tag in item.tags" :key="tag" class="tag-chip">
                  #{{ tag }}
                </span>
                <span v-if="!item.tags || item.tags.length === 0" class="no-tags">—</span>
              </div>
            </td>
            <td class="col-children">
              <span class="child-count-pill" :class="{ has_children: (item.child_count || 0) > 0 }">
                {{ item.child_count || 0 }}
              </span>
            </td>
            <td class="col-actions">
              <button class="inspect-btn" @click.stop="emit('select-item', item)">
                Details →
              </button>
            </td>
          </tr>

          <tr v-if="filteredItems.length === 0">
            <td colspan="6" class="empty-state">
              No items match the current query in this space.
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</template>

<style scoped>
.plain-list-container {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  width: 100%;
}

.list-controls {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 280px;
  max-width: 500px;
}

.search-icon {
  position: absolute;
  left: 0.85rem;
  color: #64748b;
  pointer-events: none;
}

.search-input {
  width: 100%;
  background-color: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.375rem;
  padding: 0.6rem 2rem 0.6rem 2.4rem;
  color: #f8fafc;
  font-size: 0.875rem;
  outline: none;
  transition: border-color 0.15s;
}

.search-input:focus {
  border-color: #38bdf8;
}

.clear-search {
  position: absolute;
  right: 0.75rem;
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.1rem;
  cursor: pointer;
}

.filters-row {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.filter-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.825rem;
  color: #94a3b8;
}

.select-control {
  background-color: #1e293b;
  border: 1px solid #334155;
  color: #f1f5f9;
  padding: 0.45rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.825rem;
  outline: none;
}

.metrics-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.8rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  background-color: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
}

.metrics-pill.postgres {
  border-color: rgba(99, 102, 241, 0.4);
}
.metrics-pill.mongo {
  border-color: rgba(16, 185, 129, 0.4);
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #38bdf8;
  animation: pulse 1.5s infinite;
}

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

.table-card {
  background-color: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  overflow-x: auto;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.2);
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.875rem;
}

.data-table th {
  background-color: #0f172a;
  color: #94a3b8;
  font-weight: 600;
  text-transform: uppercase;
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid #334155;
}

.item-row {
  border-bottom: 1px solid rgba(51, 65, 85, 0.5);
  cursor: pointer;
  transition: background-color 0.15s;
}

.item-row:hover {
  background-color: rgba(51, 65, 85, 0.4);
}

.data-table td {
  padding: 0.85rem 1rem;
  vertical-align: middle;
}

.title-cell {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.tree-line {
  color: #64748b;
  font-family: monospace;
}

.node-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}
.node-dot.done { background-color: #10b981; }
.node-dot.started { background-color: #3b82f6; }
.node-dot.unstarted { background-color: #64748b; }
.node-dot.discarded { background-color: #ef4444; }

.title-meta {
  display: flex;
  flex-direction: column;
}

.title-text {
  font-weight: 600;
  color: #f1f5f9;
}

.id-subtext {
  font-size: 0.7rem;
  color: #64748b;
  font-family: monospace;
}

.depth-badge {
  font-size: 0.75rem;
  font-weight: 600;
  color: #cbd5e1;
  background-color: #0f172a;
  padding: 0.15rem 0.45rem;
  border-radius: 0.25rem;
  margin-right: 0.4rem;
}

.parent-ref {
  font-size: 0.75rem;
  color: #94a3b8;
  font-family: monospace;
}

.root-ref {
  font-size: 0.75rem;
  color: #38bdf8;
  font-weight: 600;
}

.state-pill {
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  display: inline-block;
}
.state-pill.done { background-color: rgba(16, 185, 129, 0.15); color: #34d399; }
.state-pill.started { background-color: rgba(59, 130, 246, 0.15); color: #60a5fa; }
.state-pill.unstarted { background-color: rgba(148, 163, 184, 0.15); color: #94a3b8; }
.state-pill.discarded { background-color: rgba(239, 68, 68, 0.15); color: #f87171; }

.tags-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.tag-chip {
  font-size: 0.7rem;
  background-color: #0f172a;
  border: 1px solid #334155;
  color: #38bdf8;
  padding: 0.15rem 0.4rem;
  border-radius: 0.2rem;
  font-family: monospace;
}

.no-tags {
  color: #64748b;
  font-size: 0.8rem;
}

.child-count-pill {
  font-size: 0.75rem;
  font-weight: 600;
  background-color: #0f172a;
  color: #64748b;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  display: inline-block;
}
.child-count-pill.has_children {
  background-color: #1e3a8a;
  color: #60a5fa;
}

.inspect-btn {
  background-color: transparent;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 0.3rem 0.6rem;
  border-radius: 0.25rem;
  font-size: 0.75rem;
  cursor: pointer;
  transition: all 0.15s;
}

.inspect-btn:hover {
  background-color: #38bdf8;
  border-color: #38bdf8;
  color: #0f172a;
  font-weight: 600;
}

.empty-state {
  text-align: center;
  padding: 2.5rem;
  color: #64748b;
  font-style: italic;
}
</style>
