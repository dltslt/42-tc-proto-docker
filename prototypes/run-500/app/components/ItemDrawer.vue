<script setup lang="ts">
// Universal Vue component: runs on server during SSR and hydrates in client browser
// Auto-imported composables: ref, computed, watch, onMounted, onUnmounted

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
}

const props = defineProps<{
  item: Item | null
  isOpen: boolean
  source: 'postgres' | 'mongo'
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'item-created', newItem: any): void
}>()

// Nuxt auto-import: reactive state proxies
const isCreatingChild = ref(false)
const childTitle = ref('')
const childDescription = ref('')
const childTags = ref('')
const isSubmitting = ref(false)
const createFeedback = ref<string | null>(null)

// Handle keyboard escape for accessibility
function handleKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.isOpen) {
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})

async function submitChild() {
  if (!childTitle.value.trim() || !props.item) return
  isSubmitting.value = true
  createFeedback.value = null

  try {
    const rawTags = childTags.value
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)

    const res = await $fetch<{ item: any; timings: { postgresMs: number; mongoMs: number } }>('/api/items', {
      method: 'POST',
      body: {
        space_id: props.item.space_id,
        parent_id: props.item.id,
        title: childTitle.value.trim(),
        description: childDescription.value.trim(),
        tags: rawTags,
        state: 'unstarted',
      },
    })

    createFeedback.value = `Created in both DBs! (PG: ${res.timings.postgresMs}ms, Mongo: ${res.timings.mongoMs}ms)`
    emit('item-created', res.item)
    childTitle.value = ''
    childDescription.value = ''
    childTags.value = ''
    setTimeout(() => {
      isCreatingChild.value = false
      createFeedback.value = null
    }, 2000)
  } catch (err: any) {
    createFeedback.value = `Failed: ${err.message || 'Error creating item'}`
  } finally {
    isSubmitting.value = false
  }
}
</script>

<template>
  <div v-if="isOpen && item" class="drawer-overlay" @click.self="emit('close')">
    <aside
      class="drawer-sheet"
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      :aria-label="item.title"
    >
      <!-- Drawer Header -->
      <header class="drawer-header">
        <div class="header-titles">
          <span class="space-badge">{{ item.space_id }}</span>
          <span class="state-pill" :class="item.state">{{ item.state }}</span>
          <h2 class="item-title">{{ item.title }}</h2>
          <span class="item-id">ID: <code>{{ item.id }}</code></span>
        </div>
        <button
          class="close-btn"
          aria-label="Close details"
          @click="emit('close')"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20">
            <path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
          </svg>
        </button>
      </header>

      <!-- Drawer Body -->
      <div class="drawer-body">
        <!-- Tags Section -->
        <div v-if="item.tags && item.tags.length" class="tags-row">
          <span v-for="tag in item.tags" :key="tag" class="tag-badge">
            #{{ tag }}
          </span>
        </div>

        <!-- Educational Explanation Card -->
        <section class="concept-card">
          <h3 class="section-heading">
            <span class="heading-icon">📖</span> Concept & Mechanics
          </h3>
          <p class="concept-text">
            {{ item.description || 'No detailed technical explanation provided for this item.' }}
          </p>
        </section>

        <!-- C/C++ Systems Analogy Section -->
        <section class="analogy-card">
          <h3 class="section-heading">
            <span class="heading-icon">⚡</span> C/C++ Systems Perspective
          </h3>
          <div class="analogy-content">
            <div class="comparison-row">
              <div class="engine-box pg">
                <span class="engine-tag">PostgreSQL (Relational)</span>
                <p class="engine-desc">
                  Stored as a slotted row tuple in an 8KB heap page. Child/parent relations use <code>parent_id</code> pointer indirection requiring B-Tree index traversal (O(log N)). Normalized tags live in a separate <code>item_tags</code> table, joined via pointer lookups at query time.
                </p>
              </div>
              <div class="engine-box mongo">
                <span class="engine-tag">MongoDB (Document)</span>
                <p class="engine-desc">
                  Stored as a polymorphic BSON payload inside a collection. Tags are embedded directly as a contiguous string vector inside the document (zero joins, single disk seek). Hierarchy uses <code>parent_id</code> traversed via the <code>$graphLookup</code> aggregation pipeline.
                </p>
              </div>
            </div>
          </div>
        </section>

        <!-- Hierarchy Context -->
        <section class="hierarchy-card">
          <h3 class="section-heading">
            <span class="heading-icon">🌲</span> Hierarchy Context
          </h3>
          <div class="hierarchy-meta">
            <div><strong>Depth:</strong> {{ item.depth ?? 0 }}</div>
            <div><strong>Parent ID:</strong> {{ item.parent_id || 'None (Root Node)' }}</div>
            <div v-if="item.child_count !== undefined">
              <strong>Direct Children:</strong> {{ item.child_count }}
            </div>
          </div>
        </section>

        <!-- Add Child Node Form -->
        <section class="child-creator-section">
          <div class="child-creator-header">
            <h3>Add Child Node to "{{ item.title }}"</h3>
            <button
              v-if="!isCreatingChild"
              class="add-btn"
              @click="isCreatingChild = true"
            >
              + Add Sub-item
            </button>
          </div>

          <form v-if="isCreatingChild" class="child-form" @submit.prevent="submitChild">
            <div class="form-group">
              <label for="child-title">Child Title *</label>
              <input
                id="child-title"
                v-model="childTitle"
                type="text"
                placeholder="e.g. Slotted Page Headers in C..."
                required
              />
            </div>

            <div class="form-group">
              <label for="child-desc">Technical Explanation</label>
              <textarea
                id="child-desc"
                v-model="childDescription"
                rows="3"
                placeholder="Explain the systems or database mechanism..."
              ></textarea>
            </div>

            <div class="form-group">
              <label for="child-tags">Tags (comma-separated)</label>
              <input
                id="child-tags"
                v-model="childTags"
                type="text"
                placeholder="memory-layout, disk-io, architecture"
              />
            </div>

            <div class="form-actions">
              <button
                type="button"
                class="cancel-btn"
                :disabled="isSubmitting"
                @click="isCreatingChild = false"
              >
                Cancel
              </button>
              <button type="submit" class="submit-btn" :disabled="isSubmitting">
                {{ isSubmitting ? 'Persisting to both DBs...' : 'Save Child Item' }}
              </button>
            </div>

            <div v-if="createFeedback" class="feedback-msg">
              {{ createFeedback }}
            </div>
          </form>
        </section>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.drawer-overlay {
  position: fixed;
  inset: 0;
  background-color: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  z-index: 1000;
  display: flex;
  justify-content: flex-end;
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

.drawer-sheet {
  width: min(650px, 92vw);
  height: 100%;
  background-color: #0f172a;
  color: #f1f5f9;
  border-left: 1px solid #334155;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  outline: none;
  overflow-y: auto;
  animation: slideIn 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes slideIn {
  from { transform: translateX(100%); }
  to { transform: translateX(0); }
}

.drawer-header {
  padding: 1.5rem;
  border-bottom: 1px solid #334155;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  position: sticky;
  top: 0;
  background-color: #0f172a;
  z-index: 10;
}

.header-titles {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.space-badge {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #38bdf8;
  font-weight: 600;
}

.state-pill {
  display: inline-block;
  align-self: flex-start;
  font-size: 0.7rem;
  font-weight: 600;
  text-transform: uppercase;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
}
.state-pill.done { background-color: #065f46; color: #34d399; }
.state-pill.started { background-color: #1e3a8a; color: #60a5fa; }
.state-pill.unstarted { background-color: #334155; color: #94a3b8; }
.state-pill.discarded { background-color: #450a0a; color: #f87171; }

.item-title {
  margin: 0.25rem 0 0 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: #f8fafc;
  line-height: 1.3;
}

.item-id {
  font-size: 0.75rem;
  color: #64748b;
}

.item-id code {
  color: #94a3b8;
  font-family: monospace;
}

.close-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  padding: 0.5rem;
  border-radius: 0.375rem;
  transition: all 0.15s;
}
.close-btn:hover {
  color: #f8fafc;
  background-color: #1e293b;
}

.drawer-body {
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.tags-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.tag-badge {
  font-size: 0.75rem;
  background-color: #1e293b;
  border: 1px solid #334155;
  color: #38bdf8;
  padding: 0.2rem 0.6rem;
  border-radius: 0.25rem;
  font-family: monospace;
}

.concept-card, .analogy-card, .hierarchy-card, .child-creator-section {
  background-color: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  padding: 1.25rem;
}

.section-heading {
  margin: 0 0 0.75rem 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.heading-icon {
  font-size: 1.1rem;
}

.concept-text {
  margin: 0;
  line-height: 1.6;
  color: #e2e8f0;
  font-size: 0.925rem;
}

.comparison-row {
  display: grid;
  grid-template-columns: 1fr;
  gap: 0.75rem;
}

.engine-box {
  padding: 0.85rem;
  border-radius: 0.375rem;
  border: 1px solid transparent;
}
.engine-box.pg {
  background-color: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.3);
}
.engine-box.mongo {
  background-color: rgba(16, 185, 129, 0.08);
  border-color: rgba(16, 185, 129, 0.3);
}

.engine-tag {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  margin-bottom: 0.4rem;
}
.engine-box.pg .engine-tag { color: #818cf8; }
.engine-box.mongo .engine-tag { color: #34d399; }

.engine-desc {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #cbd5e1;
}

.engine-desc code {
  background-color: rgba(0, 0, 0, 0.3);
  padding: 0.1rem 0.3rem;
  border-radius: 0.2rem;
  font-size: 0.8rem;
  color: #f1f5f9;
}

.hierarchy-meta {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.75rem;
  font-size: 0.85rem;
  color: #94a3b8;
}

.hierarchy-meta strong {
  color: #e2e8f0;
}

.child-creator-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.child-creator-header h3 {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 600;
  color: #e2e8f0;
}

.add-btn {
  background-color: #2563eb;
  color: white;
  border: none;
  padding: 0.4rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s;
}
.add-btn:hover {
  background-color: #1d4ed8;
}

.child-form {
  margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.form-group label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
}

.form-group input, .form-group textarea {
  background-color: #0f172a;
  border: 1px solid #334155;
  color: #f8fafc;
  padding: 0.5rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  outline: none;
}
.form-group input:focus, .form-group textarea:focus {
  border-color: #38bdf8;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.5rem;
}

.cancel-btn {
  background-color: transparent;
  color: #94a3b8;
  border: 1px solid #334155;
  padding: 0.4rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  cursor: pointer;
}
.cancel-btn:hover {
  background-color: #334155;
  color: #f1f5f9;
}

.submit-btn {
  background-color: #059669;
  color: white;
  border: none;
  padding: 0.4rem 0.85rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}
.submit-btn:hover {
  background-color: #047857;
}

.feedback-msg {
  font-size: 0.8rem;
  color: #34d399;
  margin-top: 0.5rem;
}
</style>
