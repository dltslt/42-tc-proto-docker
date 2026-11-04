// Layer "core": what every other layer may use. It depends on no other layer.
// Owns the view registry now; the database client, getActor(), can() and the event writer come in later tasks.
export default defineNuxtConfig({})
