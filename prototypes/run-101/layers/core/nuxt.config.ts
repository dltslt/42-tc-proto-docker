// Layer "core": what every other layer may use. It depends on no other layer.
// Owns the view registry, the database client and the events table; can() and the event writer come in later tasks.
// getActor() is in workspace, not here: it reads the actors table, and core must not import workspace.
export default defineNuxtConfig({})
