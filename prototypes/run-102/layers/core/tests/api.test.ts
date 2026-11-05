// HTTP tests for the routes the core layer owns, against the running server.
import { describe, expect, it } from 'vitest'
import { ErrorBodySchema } from '../server/lib/errors'
import { api } from './http'

describe('GET /api/v1', () => {
  it('reports the contract version and lists the core layer', async () => {
    const { status, body } = await api('')
    expect(status).toBe(200)
    expect(body.contract_version).toBe('v1')
    expect(body.modules.map((m: { name: string }) => m.name)).toContain('core')
  })
})

describe('GET /api/v1/health', () => {
  it('answers ok', async () => {
    const { status, body } = await api('/health')
    expect(status).toBe(200)
    expect(body).toEqual({ status: 'ok' })
  })
})

describe('GET /api/v1/openapi.json', () => {
  it('describes every registered route', async () => {
    const { status, body } = await api('/openapi.json')
    expect(status).toBe(200)
    expect(body.openapi).toBe('3.0.3')
    // Routes of other layers are listed too: the document describes whatever is loaded.
    expect(Object.keys(body.paths)).toEqual(expect.arrayContaining(['/', '/health', '/openapi.json']))
    expect(body.components.schemas.Error).toBeDefined()
  })
})

describe('unknown routes and wrong methods', () => {
  it('return 404 in the shared error shape', async () => {
    const { status, body } = await api('/nope')
    expect(status).toBe(404)
    expect(ErrorBodySchema.parse(body).error.code).toBe('not_found')
  })

  it('return 405 with an Allow header, not a page, for a wrong method on a real path', async () => {
    const { status, body, headers } = await api('/health', { method: 'POST' })
    expect(status).toBe(405)
    expect(headers.get('allow')).toBe('GET')
    expect(ErrorBodySchema.parse(body).error.code).toBe('method_not_allowed')
  })
})
