#!/usr/bin/env node
// A client that lives outside Nuxt and knows the API only from GET /api/v1/openapi.json.
// It reads the document, finds every GET operation, calls each one with ids it discovered along the way,
// and checks each answer against the schema the document promises.
//   node scripts/openapi-smoke.mjs [base-url] [--write]
// With --write it also runs one round trip of every write verb (create, edit, move, tag, untag, delete) on
// throwaway data it creates itself, then removes it. The data is gone afterwards, but the writes stay in the
// append-only event log for good, so use --write on a development database only.
import { check } from './openapi-lite.mjs'

const args = process.argv.slice(2)
const write = args.includes('--write')
const base = (args.find((a) => !a.startsWith('--')) ?? 'http://localhost:3102') + '/api/v1'

const send = async (method, path, actor, body) => {
  const res = await fetch(base + path, {
    method,
    headers: { ...(actor ? { 'x-actor-id': actor } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  return { status: res.status, body: await res.json() }
}
const get = (path, actor) => send('GET', path, actor)

const { body: doc } = await get('/openapi.json')
let failed = 0
const report = (ok, label, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'}   ${label}${detail ? '  ' + detail : ''}`)
  if (!ok) failed++
}

// One call, checked against the document: the route must exist there, the status must be documented, and
// the body must fit the schema documented for that status. `template` is the path as the document writes it.
async function call(method, template, path, actor, body, expected) {
  const op = doc.paths[template]?.[method.toLowerCase()]
  if (!op) { report(false, `${method} ${template}`, 'not in the OpenAPI document'); return undefined }
  const res = await send(method, path, actor, body)
  const schema = op.responses[String(res.status)]?.content?.['application/json']?.schema
  const problems = res.status !== expected ? [`status ${res.status}, expected ${expected}`]
    : !schema ? [`status ${res.status} is not documented`] : check(schema, res.body, '$', doc)
  report(problems.length === 0, `${method} ${template}`, problems.slice(0, 3).join('; '))
  return problems.length === 0 ? res.body : undefined
}

// ---- Discover ids by following the document's own list routes: actors -> a member's spaces -> items -> tags.
const actor = (await get('/actors')).body.data[0].id
const spaces = (await get('/spaces', actor)).body.data
let space = spaces[0].id
for (const s of spaces) {
  if ((await get(`/spaces/${s.id}/tags?limit=1`, actor)).body.data.length > 0) { space = s.id; break }
}
const item = (await get(`/items?space_id=${space}&limit=1`, actor)).body.data[0]?.id
const tag = (await get(`/spaces/${space}/tags?limit=1`, actor)).body.data[0]?.id

// ---- Reads: every GET operation in the document.
for (const [template, ops] of Object.entries(doc.paths)) {
  if (!ops.get) continue
  // `{id}` means a space, an item or a tag depending on the path; the path says which.
  const id = template.startsWith('/spaces') ? space : template.startsWith('/tags') ? tag : item
  if (template.includes('{id}') && !id) { console.log(`skip   GET ${template} (no data to fill {id})`); continue }
  let path = template.replace('{id}', id)
  if (template === '/items') path += `?space_id=${space}`
  await call('GET', template, path, actor, undefined, 200)
}

// ---- Writes: one round trip on data this script creates and removes itself.
if (write) {
  const lastEvent = (await get(`/spaces/${space}/events?limit=200`, actor)).body.data.at(-1)?.id ?? 0
  const columns = (await get(`/spaces/${space}/columns`, actor)).body.data
  const started = columns.find((c) => c.state === 'started')

  const newTag = await call('POST', '/tags', '/tags', actor, { space_id: space, name: `smoke-${Date.now()}` }, 201)
  const newItem = await call('POST', '/items', '/items', actor, { space_id: space, title: 'Smoke test item' }, 201)
  if (newTag && newItem) {
    await call('PATCH', '/items/{id}', `/items/${newItem.id}`, actor, { title: 'Smoke test, edited', expected_version: newItem.version }, 200)
    await call('PATCH', '/items/{id}', `/items/${newItem.id}`, actor, { title: 'stale', expected_version: newItem.version }, 409)
    await call('POST', '/items/{id}/move', `/items/${newItem.id}/move`, actor, { column_id: started.id }, 200)
    const linked = await call('PUT', '/items/{id}/tags/{tag_id}', `/items/${newItem.id}/tags/${newTag.id}`, actor, undefined, 200)
    report(linked?.tag_ids.includes(newTag.id) === true, 'the link is visible in the answer')
    const back = await call('GET', '/tags/{id}/items', `/tags/${newTag.id}/items`, actor, undefined, 200)
    report(back?.item_ids.includes(newItem.id) === true, 'GET /tags/{id}/items lists the item')
    await call('DELETE', '/items/{id}/tags/{tag_id}', `/items/${newItem.id}/tags/${newTag.id}`, actor, undefined, 200)
  }
  // Clean up whatever was created, even if a step above failed.
  if (newItem) await call('DELETE', '/items/{id}', `/items/${newItem.id}`, actor, undefined, 200)
  if (newTag) await call('DELETE', '/tags/{id}', `/tags/${newTag.id}`, actor, undefined, 200)

  // The event log must tell the same story, in order.
  const log = (await get(`/spaces/${space}/events?after=${lastEvent}&limit=200`, actor)).body.data.map((e) => e.type)
  const expected = ['tag.created', 'item.created', 'item.updated', 'item.moved', 'item.tagged', 'item.untagged', 'item.deleted', 'tag.deleted']
  report(JSON.stringify(log) === JSON.stringify(expected), 'the event log recorded exactly these writes', JSON.stringify(log) === JSON.stringify(expected) ? '' : log.join(', '))
}

process.exit(failed ? 1 : 0)
