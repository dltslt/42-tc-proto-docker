<script setup lang="ts">
// Universal Vue component: runs on server during SSR and hydrates in client browser
// Auto-imported composables: ref, computed, watch, onMounted

interface MindmapNode {
  id: string
  space_id: string
  title: string
  description: string
  parent_id: string | null
  state: string
  tags: string[]
  depth: number
  children: MindmapNode[]
}

interface LayoutNode {
  data: MindmapNode
  x: number
  y: number
  angle: number
  depth: number
}

interface LayoutLink {
  source: LayoutNode
  target: LayoutNode
  path: string
}

const props = defineProps<{
  root: MindmapNode | null
  source: 'postgres' | 'mongo'
  durationMs: number
  rawQuery?: string
  nodeCount: number
}>()

const emit = defineEmits<{
  (e: 'select-item', item: MindmapNode): void
  (e: 'set-root', rootId: string): void
}>()

// Pan and Zoom reactive state proxies
const viewBoxX = ref(-500)
const viewBoxY = ref(-450)
const viewBoxWidth = ref(1000)
const viewBoxHeight = ref(900)
const isPanning = ref(false)
const startPanX = ref(0)
const startPanY = ref(0)
const showRawQuery = ref(false)

// Layout computation: radial positioning
const computedLayout = computed<{ nodes: LayoutNode[]; links: LayoutLink[] }>(() => {
  if (!props.root) return { nodes: [], links: [] }

  const nodes: LayoutNode[] = []
  const links: LayoutLink[] = []

  // Root node at (0, 0)
  const rootLayout: LayoutNode = {
    data: props.root,
    x: 0,
    y: 0,
    angle: 0,
    depth: 0,
  }
  nodes.push(rootLayout)

  const children = props.root.children || []
  const numChildren = children.length
  if (numChildren === 0) return { nodes, links }

  const radiusLevel1 = 220
  const radiusLevel2 = 420

  children.forEach((child, i) => {
    // Distribute children evenly around 2*PI
    const angle = (2 * Math.PI * i) / numChildren - Math.PI / 2
    const cx = radiusLevel1 * Math.cos(angle)
    const cy = radiusLevel1 * Math.sin(angle)

    const childLayout: LayoutNode = {
      data: child,
      x: cx,
      y: cy,
      angle,
      depth: 1,
    }
    nodes.push(childLayout)

    // Curved SVG connection
    links.push({
      source: rootLayout,
      target: childLayout,
      path: createCurvedPath(rootLayout.x, rootLayout.y, childLayout.x, childLayout.y),
    })

    // Sub-children (grandchildren)
    const subChildren = child.children || []
    const numSub = subChildren.length
    if (numSub > 0) {
      const coneWidth = (2 * Math.PI) / numChildren * 0.85
      subChildren.forEach((sub, j) => {
        const subAngle = angle - coneWidth / 2 + (coneWidth * (j + 0.5)) / numSub
        const gx = radiusLevel2 * Math.cos(subAngle)
        const gy = radiusLevel2 * Math.sin(subAngle)

        const subLayout: LayoutNode = {
          data: sub,
          x: gx,
          y: gy,
          angle: subAngle,
          depth: 2,
        }
        nodes.push(subLayout)

        links.push({
          source: childLayout,
          target: subLayout,
          path: createCurvedPath(childLayout.x, childLayout.y, subLayout.x, subLayout.y),
        })
      })
    }
  })

  return { nodes, links }
})

function createCurvedPath(x1: number, y1: number, x2: number, y2: number): string {
  const mx = (x1 + x2) / 2
  const my = (y1 + y2) / 2
  const dx = x2 - x1
  const dy = y2 - y1
  const normalX = -dy * 0.2
  const normalY = dx * 0.2
  const cx = mx + normalX
  const cy = my + normalY
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`
}

// Mouse Drag & Pan handlers
function startPan(e: MouseEvent) {
  isPanning.value = true
  startPanX.value = e.clientX
  startPanY.value = e.clientY
}

function onPan(e: MouseEvent) {
  if (!isPanning.value) return
  const dx = (e.clientX - startPanX.value) * (viewBoxWidth.value / 800)
  const dy = (e.clientY - startPanY.value) * (viewBoxHeight.value / 700)
  viewBoxX.value -= dx
  viewBoxY.value -= dy
  startPanX.value = e.clientX
  startPanY.value = e.clientY
}

function endPan() {
  isPanning.value = false
}

function onWheel(e: WheelEvent) {
  e.preventDefault()
  const factor = e.deltaY > 0 ? 1.1 : 0.9
  const newW = viewBoxWidth.value * factor
  const newH = viewBoxHeight.value * factor
  if (newW > 300 && newW < 3000) {
    viewBoxX.value += (viewBoxWidth.value - newW) / 2
    viewBoxY.value += (viewBoxHeight.value - newH) / 2
    viewBoxWidth.value = newW
    viewBoxHeight.value = newH
  }
}

function resetZoom() {
  viewBoxX.value = -500
  viewBoxY.value = -450
  viewBoxWidth.value = 1000
  viewBoxHeight.value = 900
}
</script>

<template>
  <div class="radial-mindmap-wrapper">
    <!-- Header Controls and Metrics Bar -->
    <div class="mindmap-toolbar">
      <div class="toolbar-left">
        <span class="toolbar-title">Radial Hierarchy Explorer (360°)</span>
        <span class="engine-badge" :class="source">
          Engine: <strong>{{ source === 'postgres' ? 'PostgreSQL (WITH RECURSIVE)' : 'MongoDB ($graphLookup)' }}</strong>
        </span>
        <span class="timing-badge">
          {{ nodeCount }} nodes in {{ durationMs }}ms
        </span>
      </div>

      <div class="toolbar-right">
        <button
          class="tool-btn"
          :class="{ active: showRawQuery }"
          @click="showRawQuery = !showRawQuery"
        >
          Inspect DB Query {{ showRawQuery ? '▲' : '▼' }}
        </button>
        <button class="tool-btn" @click="resetZoom">
          Reset View
        </button>
      </div>
    </div>

    <!-- Raw Query Inspector Drawer -->
    <div v-if="showRawQuery && rawQuery" class="raw-query-box">
      <div class="query-header">
        <span>{{ source === 'postgres' ? 'Raw SQL Recursive CTE Query' : 'Raw MongoDB Aggregation Pipeline' }}</span>
        <button class="close-query-btn" @click="showRawQuery = false">×</button>
      </div>
      <pre class="query-code"><code>{{ rawQuery }}</code></pre>
    </div>

    <!-- Interactive SVG Radial Graph Canvas -->
    <div
      class="svg-canvas-container"
      @mousedown="startPan"
      @mousemove="onPan"
      @mouseup="endPan"
      @mouseleave="endPan"
      @wheel="onWheel"
    >
      <svg
        class="mindmap-svg"
        :viewBox="`${viewBoxX} ${viewBoxY} ${viewBoxWidth} ${viewBoxHeight}`"
      >
        <defs>
          <linearGradient id="pgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#6366f1" />
            <stop offset="100%" stop-color="#4f46e5" />
          </linearGradient>
          <linearGradient id="mongoGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#10b981" />
            <stop offset="100%" stop-color="#059669" />
          </linearGradient>
          <filter id="nodeGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" flood-color="#000000" flood-opacity="0.5" />
          </filter>
        </defs>

        <!-- Concentric Radial Reference Rings -->
        <circle cx="0" cy="0" r="220" class="guide-ring" />
        <circle cx="0" cy="0" r="420" class="guide-ring outer" />

        <!-- Connecting Curved Links -->
        <g class="links-layer">
          <path
            v-for="(link, idx) in computedLayout.links"
            :key="idx"
            :d="link.path"
            class="tree-link"
            :class="{ depth2: link.target.depth === 2 }"
          />
        </g>

        <!-- Radial Nodes -->
        <g class="nodes-layer">
          <g
            v-for="node in computedLayout.nodes"
            :key="node.data.id"
            class="node-group"
            :class="[`depth-${node.depth}`, node.data.state]"
            :transform="`translate(${node.x}, ${node.y})`"
            @click.stop="emit('select-item', node.data)"
          >
            <!-- Center Node (Root) Card -->
            <template v-if="node.depth === 0">
              <rect
                x="-120"
                y="-45"
                width="240"
                height="90"
                rx="14"
                class="root-card-bg"
                :class="source"
                filter="url(#nodeGlow)"
              />
              <text x="0" y="-12" text-anchor="middle" class="root-node-title">
                {{ node.data.title }}
              </text>
              <text x="0" y="14" text-anchor="middle" class="root-node-subtitle">
                Root Concept • {{ (node.data.children || []).length }} Branches
              </text>
              <text x="0" y="32" text-anchor="middle" class="click-hint">
                (Click to inspect C/C++ details)
              </text>
            </template>

            <!-- Level 1 Branch Node Card -->
            <template v-else-if="node.depth === 1">
              <rect
                x="-100"
                y="-32"
                width="200"
                height="64"
                rx="10"
                class="branch-card-bg"
                filter="url(#nodeGlow)"
              />
              <circle cx="-85" cy="0" r="5" class="status-dot" :class="node.data.state" />
              <text x="-70" y="-5" class="branch-node-title">
                {{ node.data.title.length > 22 ? node.data.title.slice(0, 20) + '…' : node.data.title }}
              </text>
              <text x="-70" y="16" class="branch-node-meta">
                {{ (node.data.children || []).length }} sub-topics • #{{ node.data.tags[0] || 'core' }}
              </text>
            </template>

            <!-- Level 2 Leaf Node Card -->
            <template v-else>
              <rect
                x="-85"
                y="-25"
                width="170"
                height="50"
                rx="8"
                class="leaf-card-bg"
                filter="url(#nodeGlow)"
              />
              <circle cx="-72" cy="0" r="4" class="status-dot" :class="node.data.state" />
              <text x="-60" y="-2" class="leaf-node-title">
                {{ node.data.title.length > 20 ? node.data.title.slice(0, 18) + '…' : node.data.title }}
              </text>
              <text x="-60" y="14" class="leaf-node-meta">
                #{{ node.data.tags[0] || 'detail' }}
              </text>
            </template>
          </g>
        </g>
      </svg>

      <!-- Floating Canvas Navigation Hint -->
      <div class="canvas-hint">
        <span>Scroll to Zoom • Drag to Pan Canvas • Click Any Node to Inspect</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.radial-mindmap-wrapper {
  display: flex;
  flex-direction: column;
  height: 750px;
  background-color: #0b1120;
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  overflow: hidden;
  position: relative;
}

.mindmap-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1.25rem;
  background-color: #0f172a;
  border-bottom: 1px solid #1e293b;
  z-index: 5;
}

.toolbar-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.toolbar-title {
  font-weight: 600;
  font-size: 0.875rem;
  color: #f1f5f9;
}

.engine-badge {
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  background-color: #1e293b;
  color: #cbd5e1;
}
.engine-badge.postgres { border-left: 3px solid #6366f1; }
.engine-badge.mongo { border-left: 3px solid #10b981; }

.timing-badge {
  font-size: 0.75rem;
  color: #38bdf8;
  font-family: monospace;
}

.toolbar-right {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.tool-btn {
  background-color: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  font-size: 0.75rem;
  padding: 0.35rem 0.65rem;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s;
}

.tool-btn:hover {
  background-color: #334155;
  color: #f8fafc;
}

.tool-btn.active {
  background-color: #2563eb;
  border-color: #2563eb;
  color: white;
}

.raw-query-box {
  background-color: #020617;
  border-bottom: 1px solid #334155;
  padding: 1rem 1.25rem;
  max-height: 220px;
  overflow-y: auto;
  z-index: 10;
}

.query-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 600;
  color: #94a3b8;
  text-transform: uppercase;
  margin-bottom: 0.5rem;
}

.close-query-btn {
  background: transparent;
  border: none;
  color: #94a3b8;
  font-size: 1.1rem;
  cursor: pointer;
}

.query-code {
  margin: 0;
  font-family: 'Fira Code', monospace;
  font-size: 0.75rem;
  color: #a5f3fc;
  line-height: 1.45;
  white-space: pre-wrap;
}

.svg-canvas-container {
  flex: 1;
  width: 100%;
  height: 100%;
  cursor: grab;
  position: relative;
  user-select: none;
}
.svg-canvas-container:active {
  cursor: grabbing;
}

.mindmap-svg {
  width: 100%;
  height: 100%;
}

.guide-ring {
  fill: none;
  stroke: rgba(51, 65, 85, 0.4);
  stroke-dasharray: 4 6;
  stroke-width: 1;
}

.guide-ring.outer {
  stroke: rgba(51, 65, 85, 0.25);
}

.tree-link {
  fill: none;
  stroke: #475569;
  stroke-width: 2;
  opacity: 0.7;
  transition: all 0.2s;
}

.tree-link.depth2 {
  stroke: #334155;
  stroke-width: 1.5;
  opacity: 0.5;
}

.node-group {
  cursor: pointer;
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.node-group:hover {
  filter: brightness(1.2);
}

.root-card-bg {
  fill: #1e1b4b;
  stroke: #6366f1;
  stroke-width: 2;
}
.root-card-bg.mongo {
  fill: #064e3b;
  stroke: #10b981;
}

.root-node-title {
  fill: #f8fafc;
  font-size: 14px;
  font-weight: 700;
}

.root-node-subtitle {
  fill: #cbd5e1;
  font-size: 10px;
}

.click-hint {
  fill: #818cf8;
  font-size: 9px;
  font-style: italic;
}

.branch-card-bg {
  fill: #1e293b;
  stroke: #3b82f6;
  stroke-width: 1.5;
}

.branch-node-title {
  fill: #f1f5f9;
  font-size: 11px;
  font-weight: 600;
}

.branch-node-meta {
  fill: #94a3b8;
  font-size: 9px;
}

.leaf-card-bg {
  fill: #0f172a;
  stroke: #475569;
  stroke-width: 1;
}

.leaf-node-title {
  fill: #e2e8f0;
  font-size: 10px;
  font-weight: 500;
}

.leaf-node-meta {
  fill: #64748b;
  font-size: 8.5px;
}

.status-dot {
  fill: #64748b;
}
.status-dot.done { fill: #10b981; }
.status-dot.started { fill: #3b82f6; }
.status-dot.discarded { fill: #ef4444; }

.canvas-hint {
  position: absolute;
  bottom: 0.75rem;
  left: 50%;
  transform: translateX(-50%);
  background-color: rgba(15, 23, 42, 0.75);
  backdrop-filter: blur(4px);
  border: 1px solid rgba(51, 65, 85, 0.6);
  border-radius: 9999px;
  padding: 0.25rem 0.85rem;
  font-size: 0.75rem;
  color: #94a3b8;
  pointer-events: none;
}
</style>
