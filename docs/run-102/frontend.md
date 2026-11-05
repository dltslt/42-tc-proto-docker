# Frontend Architecture: run-102

There is no product UI in this run. The only page is a generated API reference.

## UI State Management
No client state. `app/app.vue` loads two API responses with `useFetch` (Nuxt auto-import): `GET /api/v1` and `GET /api/v1/openapi.json`. On the server it calls the Nitro routes in-process. The result is embedded in the HTML and reused by the browser, so hydration makes no second request.

## Component Breakdown
- `app/app.vue`: the whole page. It lists the loaded layers and a table of routes read from the OpenAPI document.

## Hydration & Re-render Triggers
- The `routes` computed value is re-evaluated only when the fetched OpenAPI document changes, which happens once.
- The table has an explicit `<tbody>`. Without it a browser inserts one when parsing the server HTML, and Vue reports a hydration mismatch. This was found by loading the page in Chromium.
