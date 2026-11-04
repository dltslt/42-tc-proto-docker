// Server-only Nitro route: runs in the Node container with direct DB access (maps to GET /api/actors).
// The roster feeds the header's persona and space selectors; it needs no identity itself.
export default defineEventHandler(() => loadRoster())
