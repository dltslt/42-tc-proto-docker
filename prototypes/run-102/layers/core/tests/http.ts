// Test helper: plain HTTP against a running server, like any other client would call it.
// Inside the container `PORT` is the dev server's port, so `pnpm test` needs `make up RUN=102` first.
const BASE = process.env.API_URL ?? `http://localhost:${process.env.PORT ?? 3000}`

export async function api(path: string, init?: RequestInit): Promise<{ status: number; body: any; headers: Headers }> {
  const res = await fetch(`${BASE}/api/v1${path}`, init)
  return { status: res.status, body: await res.json(), headers: res.headers }
}

// Same call, as a given actor: sends the X-Actor-Id header.
export const apiAs = (actorId: string | undefined, path: string, init: RequestInit = {}) =>
  api(path, { ...init, headers: { ...(actorId ? { 'x-actor-id': actorId } : {}), ...init.headers } })
