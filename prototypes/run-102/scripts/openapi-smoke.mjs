#!/usr/bin/env node
// A client that lives outside Nuxt and knows the API only from GET /api/v1/openapi.json.
// It reads the document, finds every GET operation, calls each one with ids it discovered along the way,
// and checks each answer against the schema the document promises.
//   node scripts/openapi-smoke.mjs [http://localhost:3102]
import { check } from './openapi-lite.mjs'

const base = (process.argv[2] ?? 'http://localhost:3102') + '/api/v1'
const get = async (path, actor) => {
  const res = await fetch(base + path, { headers: actor ? { 'x-actor-id': actor } : {} })
  return { status: res.status, body: await res.json() }
}

const { body: doc } = await get('/openapi.json')
const gets = Object.entries(doc.paths).filter(([, ops]) => ops.get).map(([path]) => path)

// Discover ids by following the document's own list routes: actors -> a member's spaces -> items -> tags.
const actor = (await get('/actors')).body.data[0].id
const space = (await get('/spaces', actor)).body.data[0].id
const item = (await get(`/items?space_id=${space}&limit=1`, actor)).body.data[0]?.id
const tag = (await get(`/spaces/${space}/tags?limit=1`, actor)).body.data[0]?.id

let failed = 0
for (const template of gets) {
  // `{id}` means a space, an item or a tag depending on the path; the path says which.
  const id = template.startsWith('/spaces') ? space : template.startsWith('/tags') ? tag : item
  if (template.includes('{id}') && !id) { console.log(`skip   GET ${template} (no data to fill {id})`); continue }
  let path = template.replace('{id}', id)
  if (template === '/items') path += `?space_id=${space}`
  const { status, body } = await get(path, actor)
  const spec = doc.paths[template].get.responses['200']?.content?.['application/json']?.schema ?? {}
  const problems = status === 200 ? check(spec, body, '$', doc) : [`status ${status}`]
  console.log(`${problems.length ? 'FAIL' : 'ok  '}   GET ${template}${problems.length ? '  ' + problems.slice(0, 3).join('; ') : ''}`)
  failed += problems.length ? 1 : 0
}
process.exit(failed ? 1 : 0)
