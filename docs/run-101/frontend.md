# Frontend Architecture: run-101

## UI State Management
There is no shared state yet. The view registry in `layers/core/app/utils/views.ts` is a module-level `Map` holding
fixed definitions. It is not reactive, and it must never hold per-user data because the server shares it across requests.

## Component Breakdown
- `app/app.vue`: wraps the app in Nuxt UI's `UApp`, then renders the layout and page.
- `app/layouts/default.vue`: the shell. Its navigation comes from `listViews()`.
- `app/pages/index.vue`: redirects `/` to the first registered view.
- `app/pages/[view].vue`: renders the view named in the URL, or a 404 if none is registered.
- `layers/board` and `layers/tree`: view plug-ins. Each has a component and a plugin that registers it.

## Hydration & Re-render Triggers
- Plugins run per request on the server and once in the browser, so both sides see the same registry and hydration matches.
- `[view].vue` re-renders when `route.params.view` changes, through a `computed`.
