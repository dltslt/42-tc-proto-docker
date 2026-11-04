// Test helpers. Run inside the container (`make test RUN=100`): the dev server listens on $PORT there.
import { afterAll } from 'vitest'
import { getPool } from '../server/utils/db'

const BASE = `http://localhost:${process.env.PORT ?? 3100}`

export interface ApiResult<T = any> { status: number, body: T }

export async function api<T = any>(
  path: string,
  opts: { actor?: string | null, method?: string, body?: unknown, rawBody?: string } = {},
): Promise<ApiResult<T>> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  // Default persona is Ada; pass `actor: null` to send no identity header at all.
  if (opts.actor !== null) headers['x-actor-id'] = opts.actor ?? 'actor-ada'
  const res = await fetch(BASE + path, {
    method: opts.method ?? (opts.body !== undefined || opts.rawBody !== undefined ? 'POST' : 'GET'),
    headers,
    body: opts.rawBody ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}

// Items created by a test are tracked and removed straight from the DB afterwards,
// so the seeded fixtures stay exactly as `make seed` left them.
const created: string[] = []

export async function createItem(body: Record<string, unknown>, actor?: string): Promise<Item> {
  const res = await api<Item>('/api/items', { body, actor })
  if (res.status !== 201) throw new Error(`createItem failed: ${res.status} ${JSON.stringify(res.body)}`)
  created.push(res.body.id)
  return res.body
}

export function cleanupCreatedItems() {
  afterAll(async () => {
    const pool = getPool()
    await pool.query('DELETE FROM items WHERE id = ANY($1)', [created])
    await pool.end()
  })
}

// Same shape as the server's Item type (shared/types is auto-imported by Nuxt only, not by vitest).
export interface Item {
  id: string; space_id: string; parent_id: string | null; type: string; title: string; description: string
  state: string; board_column: string; position: number; lead_id: string | null
}
