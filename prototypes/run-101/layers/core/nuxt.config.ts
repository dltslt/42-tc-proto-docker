// Layer "core": what every other layer may use. It depends on no other layer.
// Owns the view registry, the database client and the events table; getActor(), can() and the event writer come in later tasks.
export default defineNuxtConfig({})
