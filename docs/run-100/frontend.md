# Frontend Architecture: run-100

## UI State Management
- **Identity** (`useIdentity`): the roster comes from `GET /api/actors` (`useFetch`). The current persona and
  space are `useState` values mirrored into cookies, so the server render and the browser agree.
- **Items** (`useItems`): `useAsyncData` loads the current space's items and re-runs when the persona or space
  changes. Every action (create, update, move) calls the API, then re-fetches. The server is the single
  source of truth; there is no client-side copy to drift.
- Derived data is `computed()`: `childMap` (tree), `byColumn` (board).
- **Project scope**: a selector next to the view tabs focuses the board and tree on one project. The choice is
  the URL query `?project=<id>` (reload-safe, shareable); unknown ids are ignored. While scoped, the board
  shows the project's descendants and new items become its children. Tree walking lives in the pure
  `shared/utils/tree.ts` (`buildChildMap`, `descendantsOf`), covered by `tests/tree.test.ts`.
- Composables are called synchronously at the top of `setup()`; Nuxt composables lose their context after an `await`.

## Component Breakdown
- `app/app.vue`: `UApp` shell, header with space switcher and "Acting as" selector, `<NuxtPage>`.
- `app/pages/index.vue`: quick-add input, Board/Tree switch, editor dialog; wires events to `useItems`.
- `BoardView.vue` + `ItemCard.vue`: three columns, native drag-and-drop, per-column quick add.
- `TreeNode.vue`: recursive node, done checkbox, inline child creation.
- `ItemEditor.vue`: dialog with a local form copy; sends only changed fields on Save.
- `QuickAdd.vue`: the one-line creation input used everywhere.

## Hydration & Re-render Triggers
- Header, board and tree are rendered on the server, then hydrated.
- Re-renders follow reactive changes: switching persona/space (watch in `useAsyncData`), any action's re-fetch,
  opening the editor (`selectedId`), and the view switch (`view`).
- Drag state (`dragging`, `overColumn`) is client-only and never serialized.
