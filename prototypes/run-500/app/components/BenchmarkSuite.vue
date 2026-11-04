<script setup lang="ts">
// Universal Vue component: runs on server during SSR and hydrates in client browser
// Auto-imported composables: ref, onMounted

interface BenchmarkResult {
  id: string
  name: string
  description: string
  postgresMs: number
  mongoMs: number
  postgresQuery: string
  mongoQuery: string
  rowsMatched: number
}

const emit = defineEmits<{
  (e: 'data-generated'): void
}>()

// Nuxt auto-import: reactive state proxies
const isRunningAll = ref(false)
const runningQueryId = ref<string | null>(null)
const isGenerating = ref(false)
const generateResult = ref<string | null>(null)
const expandedQueryId = ref<string | null>(null)

const benchmarks = ref<BenchmarkResult[]>([])

// Run all benchmark queries on mount
onMounted(() => {
  runBenchmarks()
})

async function runBenchmarks(queryId?: string) {
  if (queryId) {
    runningQueryId.value = queryId
  } else {
    isRunningAll.value = true
  }

  try {
    const res = await $fetch<{ benchmarks: BenchmarkResult[] }>('/api/bench/run', {
      method: 'POST',
      body: { queryId },
    })

    if (queryId) {
      const idx = benchmarks.value.findIndex((b) => b.id === queryId)
      if (idx !== -1 && res.benchmarks.length > 0) {
        benchmarks.value[idx] = res.benchmarks[0]
      }
    } else {
      benchmarks.value = res.benchmarks
    }
  } catch (err: any) {
    console.error('Benchmark error:', err)
  } finally {
    isRunningAll.value = false
    runningQueryId.value = null
  }
}

async function generateDataset(count: number) {
  isGenerating.value = true
  generateResult.value = null

  try {
    const res = await $fetch<{ success: boolean; count: number; timings: { postgresMs: number; mongoMs: number } }>(
      '/api/bench/generate',
      {
        method: 'POST',
        body: { count },
      }
    )

    generateResult.value = `Inserted ${res.count} items into both DBs! (PG: ${res.timings.postgresMs}ms, Mongo: ${res.timings.mongoMs}ms)`
    emit('data-generated')
    // Re-run benchmarks on the new dataset
    await runBenchmarks()
  } catch (err: any) {
    generateResult.value = `Generation error: ${err.message}`
  } finally {
    isGenerating.value = false
  }
}

function getWinnerBadge(pgMs: number, mongoMs: number) {
  if (pgMs === mongoMs) return { text: 'Tie', class: 'tie' }
  if (pgMs < mongoMs) {
    const ratio = (mongoMs / (pgMs || 0.1)).toFixed(1)
    return { text: `PostgreSQL ${ratio}x faster`, class: 'pg-win' }
  } else {
    const ratio = (pgMs / (mongoMs || 0.1)).toFixed(1)
    return { text: `MongoDB ${ratio}x faster`, class: 'mongo-win' }
  }
}
</script>

<template>
  <div class="benchmark-suite-wrapper">
    <!-- Benchmark Controls & Scale Generator -->
    <div class="bench-hero-card">
      <div class="hero-left">
        <h2 class="hero-title">On-the-Fly SQL vs NoSQL Benchmark Lab</h2>
        <p class="hero-subtitle">
          Execute identical queries against PostgreSQL 16 (relational tables) and MongoDB 7 (document collections) in real-time.
        </p>
      </div>

      <div class="hero-actions">
        <div class="scale-buttons">
          <span class="scale-label">Generate Dataset:</span>
          <button
            class="scale-btn"
            :disabled="isGenerating"
            @click="generateDataset(1000)"
          >
            + 1,000 Items
          </button>
          <button
            class="scale-btn"
            :disabled="isGenerating"
            @click="generateDataset(5000)"
          >
            + 5,000 Items
          </button>
        </div>

        <button
          class="run-all-btn"
          :disabled="isRunningAll || isGenerating"
          @click="runBenchmarks()"
        >
          <span class="run-icon">▶</span>
          {{ isRunningAll ? 'Executing Query Suite...' : 'Run All 5 Benchmarks' }}
        </button>
      </div>
    </div>

    <!-- Status Feedback -->
    <div v-if="generateResult" class="feedback-banner">
      <span class="sparkle-icon">✨</span> {{ generateResult }}
    </div>

    <!-- 5 Benchmark Cards -->
    <div class="benchmarks-grid">
      <div
        v-for="bench in benchmarks"
        :key="bench.id"
        class="benchmark-card"
      >
        <div class="bench-header">
          <div class="bench-title-group">
            <h3 class="bench-name">{{ bench.name }}</h3>
            <span class="rows-pill">{{ bench.rowsMatched }} rows matched</span>
          </div>

          <div class="header-right">
            <span class="winner-badge" :class="getWinnerBadge(bench.postgresMs, bench.mongoMs).class">
              {{ getWinnerBadge(bench.postgresMs, bench.mongoMs).text }}
            </span>
            <button
              class="single-run-btn"
              :disabled="runningQueryId === bench.id || isRunningAll"
              @click="runBenchmarks(bench.id)"
            >
              {{ runningQueryId === bench.id ? 'Running...' : 'Re-run ↺' }}
            </button>
          </div>
        </div>

        <p class="bench-description">{{ bench.description }}</p>

        <!-- Comparative Metrics Bars -->
        <div class="metrics-comparison">
          <!-- PostgreSQL Metric -->
          <div class="engine-metric pg">
            <div class="metric-top">
              <span class="metric-engine">PostgreSQL (Relational)</span>
              <span class="metric-time">{{ bench.postgresMs }} ms</span>
            </div>
            <div class="progress-track">
              <div
                class="progress-fill pg-fill"
                :style="{ width: `${Math.min(100, Math.max(8, (bench.postgresMs / (bench.postgresMs + bench.mongoMs || 1)) * 100))}%` }"
              ></div>
            </div>
          </div>

          <!-- MongoDB Metric -->
          <div class="engine-metric mongo">
            <div class="metric-top">
              <span class="metric-engine">MongoDB (Document)</span>
              <span class="metric-time">{{ bench.mongoMs }} ms</span>
            </div>
            <div class="progress-track">
              <div
                class="progress-fill mongo-fill"
                :style="{ width: `${Math.min(100, Math.max(8, (bench.mongoMs / (bench.postgresMs + bench.mongoMs || 1)) * 100))}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- Query Toggle Button -->
        <button
          class="toggle-query-btn"
          @click="expandedQueryId = expandedQueryId === bench.id ? null : bench.id"
        >
          {{ expandedQueryId === bench.id ? 'Hide Raw Queries ▲' : 'Inspect Raw SQL vs MongoDB Queries ▼' }}
        </button>

        <!-- Expandable Raw Query Comparison -->
        <div v-if="expandedQueryId === bench.id" class="raw-queries-grid">
          <div class="query-column">
            <span class="column-title pg-title">PostgreSQL Query</span>
            <pre class="query-pre"><code>{{ bench.postgresQuery }}</code></pre>
          </div>
          <div class="query-column">
            <span class="column-title mongo-title">MongoDB Command</span>
            <pre class="query-pre"><code>{{ bench.mongoQuery }}</code></pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.benchmark-suite-wrapper {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  width: 100%;
}

.bench-hero-card {
  background-color: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.75rem;
  padding: 1.5rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1.25rem;
}

.hero-title {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #f8fafc;
}

.hero-subtitle {
  margin: 0.35rem 0 0 0;
  font-size: 0.875rem;
  color: #94a3b8;
  max-width: 600px;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 1rem;
}

.scale-buttons {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.scale-label {
  font-size: 0.75rem;
  color: #94a3b8;
  font-weight: 600;
  text-transform: uppercase;
}

.scale-btn {
  background-color: #0f172a;
  border: 1px solid #334155;
  color: #cbd5e1;
  padding: 0.45rem 0.75rem;
  border-radius: 0.375rem;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s;
}

.scale-btn:hover:not(:disabled) {
  border-color: #38bdf8;
  color: #38bdf8;
}

.scale-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.run-all-btn {
  background-color: #2563eb;
  color: white;
  border: none;
  padding: 0.6rem 1.25rem;
  border-radius: 0.375rem;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  transition: background 0.15s;
}

.run-all-btn:hover:not(:disabled) {
  background-color: #1d4ed8;
}

.run-all-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.run-icon {
  font-size: 0.8rem;
}

.feedback-banner {
  background-color: rgba(16, 185, 129, 0.15);
  border: 1px solid rgba(16, 185, 129, 0.4);
  color: #34d399;
  padding: 0.75rem 1.25rem;
  border-radius: 0.5rem;
  font-size: 0.875rem;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.benchmarks-grid {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.benchmark-card {
  background-color: #1e293b;
  border: 1px solid #334155;
  border-radius: 0.5rem;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.bench-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
}

.bench-title-group {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.bench-name {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
  color: #f8fafc;
}

.rows-pill {
  font-size: 0.75rem;
  background-color: #0f172a;
  border: 1px solid #334155;
  color: #94a3b8;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.winner-badge {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  border-radius: 9999px;
  text-transform: uppercase;
}
.winner-badge.pg-win { background-color: rgba(99, 102, 241, 0.2); color: #818cf8; border: 1px solid rgba(99, 102, 241, 0.4); }
.winner-badge.mongo-win { background-color: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); }
.winner-badge.tie { background-color: rgba(148, 163, 184, 0.2); color: #94a3b8; }

.single-run-btn {
  background-color: transparent;
  border: 1px solid #334155;
  color: #cbd5e1;
  font-size: 0.75rem;
  padding: 0.3rem 0.6rem;
  border-radius: 0.25rem;
  cursor: pointer;
}
.single-run-btn:hover:not(:disabled) {
  background-color: #334155;
  color: #f1f5f9;
}

.bench-description {
  margin: 0;
  font-size: 0.85rem;
  color: #cbd5e1;
  line-height: 1.5;
}

.metrics-comparison {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
  background-color: #0f172a;
  border: 1px solid #334155;
  padding: 1rem;
  border-radius: 0.5rem;
}

.engine-metric {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.metric-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.8rem;
}

.engine-metric.pg .metric-engine { color: #818cf8; font-weight: 600; }
.engine-metric.mongo .metric-engine { color: #34d399; font-weight: 600; }

.metric-time {
  font-size: 0.95rem;
  font-weight: 700;
  font-family: monospace;
  color: #f8fafc;
}

.progress-track {
  width: 100%;
  height: 8px;
  background-color: #1e293b;
  border-radius: 9999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  border-radius: 9999px;
  transition: width 0.3s ease;
}

.pg-fill {
  background: linear-gradient(90deg, #6366f1, #4f46e5);
}

.mongo-fill {
  background: linear-gradient(90deg, #10b981, #059669);
}

.toggle-query-btn {
  background: transparent;
  border: none;
  color: #38bdf8;
  font-size: 0.75rem;
  font-weight: 600;
  text-align: left;
  padding: 0;
  cursor: pointer;
  align-self: flex-start;
}
.toggle-query-btn:hover {
  text-decoration: underline;
}

.raw-queries-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-top: 0.5rem;
}

.query-column {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.column-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
}
.column-title.pg-title { color: #818cf8; }
.column-title.mongo-title { color: #34d399; }

.query-pre {
  margin: 0;
  background-color: #020617;
  border: 1px solid #334155;
  border-radius: 0.375rem;
  padding: 0.75rem;
  font-family: 'Fira Code', monospace;
  font-size: 0.75rem;
  color: #e2e8f0;
  overflow-x: auto;
  max-height: 200px;
  line-height: 1.4;
}
</style>
