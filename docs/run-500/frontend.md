# Frontend Architecture: run-500

## User Interface & State Architecture

Run 500 implements a universal Vue 3 application built on Nuxt 4, designed to teach NoSQL vs SQL mechanics through interactive visualization and benchmarking.

### 1. View Breakdown

The interface is structured into three primary operational views managed in `app/app.vue`:

1. **Radial Mindmap (`components/RadialMindmap.vue`)**:
   - Computes a 360-degree radial layout from the active root item.
   - Root is centered at coordinate `(0, 0)`.
   - Level 1 branch nodes radiate at radius $R_1 = 220\text{px}$, distributed evenly across $2\pi$.
   - Level 2 leaf nodes fan out in angular sub-cones around their parent at radius $R_2 = 420\text{px}$.
   - Smooth curved SVG paths (`Q` quadratic Bezier curves) link parent to child nodes.
   - Interactive zoom & pan via SVG `viewBox` transformation.
   - Clicking any node opens the concept inspection drawer.
   - "Inspect DB Query" toggle displays the underlying SQL Recursive CTE or MongoDB `$graphLookup` command.

2. **Plain List View (`components/PlainListView.vue`)**:
   - Clean tabular display rendering items directly from the database.
   - Shows `Title & Concept`, `Depth / Parent ID`, `State`, `Tags`, `Children Count`, and `Inspect` actions.
   - Real-time client-side substring filter by title, description, or tag.
   - Demonstrates the difference between tabular row representation and relational/document graph structures.

3. **Live Benchmark Lab (`components/BenchmarkSuite.vue`)**:
   - On-the-fly execution suite testing 5 core operations against PostgreSQL and MongoDB concurrently.
   - Visual latency comparison bars with color coding (indigo for PostgreSQL, emerald for MongoDB).
   - "Generate Dataset" controls (1,000 and 5,000 synthetic items) to evaluate database performance at scale.
   - Side-by-side raw query inspector displaying raw SQL statements and MongoDB commands.

4. **Item Detail Drawer (`components/ItemDrawer.vue`)**:
   - Slide-over dialog detailing the technical mechanics of the selected concept.
   - Dedicated "C/C++ Systems Perspective" card explaining memory hierarchy, pointer chasing vs contiguous array layout, and cache lines.
   - Inline form to create child items simultaneously in both PostgreSQL and MongoDB via `POST /api/items`.

### 2. State & Reactivity Mechanics

- **Auto-imported Composables**: Vue's `ref()`, `computed()`, and Nuxt's `useFetch()` track reactivity automatically without explicit import statements.
- **Dual Query Drivers**: The global header toggles `activeSource` (`'postgres' | 'mongo'`). When changed, reactive `useFetch` composables automatically re-fetch `/api/items` and `/api/mindmap` from the newly selected database engine, highlighting response times and returned structures.
- **SSR & Hydration Boundary**: Initial markup is pre-rendered on the server (SSR), allowing immediate view of the concept trees before client hydration activates interactive canvas panning and zoom.
