// Unit tests for the pure helpers in core. They need no server and no database.
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { defineContract, errorStatuses, validateInput } from '../server/lib/contract'
import { ApiError, ErrorBodySchema, notFound, toErrorResponse } from '../server/lib/errors'
import { buildOpenApi } from '../server/lib/openapi'
import { decodeCursor, encodeCursor, toPage } from '../server/lib/pagination'
import { authorize, can } from '../server/lib/policy'
import { allowedMethods, allRoutes, listModules, matchRoute, registerModule, resetRegistry } from '../server/lib/registry'

const getThing = defineContract({
  method: 'get',
  path: '/things/{id}',
  summary: 'One thing',
  tag: 'demo',
  params: z.object({ id: z.uuid() }),
  query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }),
  response: z.object({ id: z.string() }),
  errors: [404],
})

const createThing = defineContract({
  method: 'post',
  path: '/things',
  summary: 'Create a thing',
  tag: 'demo',
  body: z.object({ title: z.string().min(1) }),
  response: z.object({ id: z.string() }),
  status: 201,
})

describe('error shape', () => {
  it('maps an ApiError to its status and the shared body', () => {
    const { status, body } = toErrorResponse(notFound('No such thing'))
    expect(status).toBe(404)
    expect(body).toEqual({ error: { code: 'not_found', message: 'No such thing', fields: {} } })
    expect(ErrorBodySchema.safeParse(body).success).toBe(true)
  })

  it('maps a framework error with a 4xx statusCode', () => {
    const { status, body } = toErrorResponse({ statusCode: 409, message: 'Taken' })
    expect(status).toBe(409)
    expect(body.error.code).toBe('conflict')
  })

  it('turns an unknown error into a 500 that leaks nothing', () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const { status, body } = toErrorResponse(new Error('secret detail'))
    log.mockRestore()
    expect(status).toBe(500)
    expect(body.error.message).toBe('Internal server error')
  })
})

describe('validateInput', () => {
  const id = '0b7f2f6e-1c3a-4a53-9f55-0d3c0c1d9a11'

  it('returns parsed and defaulted values', () => {
    const input = validateInput(getThing, { params: { id }, query: { limit: '5' } })
    expect(input.params.id).toBe(id)
    expect(input.query.limit).toBe(5)
    expect(validateInput(getThing, { params: { id }, query: {} }).query.limit).toBe(50)
  })

  it('reports every bad part together under dotted paths, as a 400', () => {
    try {
      validateInput(getThing, { params: { id: 'nope' }, query: { limit: '0' } })
      expect.unreachable()
    } catch (err) {
      expect(err).toBeInstanceOf(ApiError)
      const { status, body } = toErrorResponse(err)
      expect(status).toBe(400)
      expect(Object.keys(body.error.fields).sort()).toEqual(['params.id', 'query.limit'])
    }
  })

  it('rejects a missing body', () => {
    expect(() => validateInput(createThing, {})).toThrow(ApiError)
  })
})

describe('registry', () => {
  beforeEach(resetRegistry)

  it('lists layers lowest first and flags a missing dependency', () => {
    registerModule({ name: 'items', dependsOn: ['workspace'], routes: [] })
    registerModule({ name: 'core', dependsOn: [], routes: [getThing] })
    expect(listModules().map((m) => m.name)).toEqual(['core', 'items'])
    expect(listModules()[1]!.missing_dependencies).toEqual(['workspace'])
    expect(allRoutes()).toEqual([getThing])
  })

  it('replaces a module registered twice instead of duplicating it', () => {
    registerModule({ name: 'core', dependsOn: [], routes: [] })
    registerModule({ name: 'core', dependsOn: [], routes: [getThing] })
    expect(listModules()).toHaveLength(1)
    expect(listModules()[0]!.route_count).toBe(1)
  })
})

describe('OpenAPI', () => {
  const doc = buildOpenApi([getThing, createThing])

  it('describes paths, parameters, bodies and responses from the schemas', () => {
    const get = doc.paths['/things/{id}'].get
    expect(get.parameters.map((p: any) => [p.name, p.in, p.required])).toEqual([
      ['id', 'path', true],
      ['limit', 'query', false],
    ])
    expect(Object.keys(get.responses)).toEqual(['200', '400', '401', '404'])
    expect(get.security).toEqual([{ ActorHeader: [] }])
    const post = doc.paths['/things'].post
    expect(post.requestBody.content['application/json'].schema.required).toEqual(['title'])
    expect(Object.keys(post.responses)).toEqual(['201', '400', '401'])
  })

  it('shares one Error schema for every error response', () => {
    expect(doc.components.schemas.Error.properties.error.required).toContain('code')
    expect(doc.paths['/things'].post.responses['400'].content['application/json'].schema).toEqual({
      $ref: '#/components/schemas/Error',
    })
  })

  it('lists 400 only for routes that take input, and 401 only for routes that need an actor', () => {
    expect(errorStatuses(createThing)).toEqual([400, 401])
    expect(errorStatuses({ ...createThing, auth: 'none' })).toEqual([400])
    expect(errorStatuses({ ...createThing, body: undefined, auth: 'none' })).toEqual([])
  })

  it('declares the actor header as the security scheme, and leaves public routes open', () => {
    expect(doc.components.securitySchemes.ActorHeader).toEqual({ type: 'apiKey', in: 'header', name: 'X-Actor-Id' })
    const open = buildOpenApi([{ ...createThing, auth: 'none' }])
    expect(open.paths['/things'].post.security).toBeUndefined()
  })
})

describe('matchRoute', () => {
  beforeEach(resetRegistry)

  it('matches method and path, including path parameters and a trailing slash', () => {
    registerModule({ name: 'core', dependsOn: [], routes: [getThing, createThing] })
    expect(matchRoute('GET', '/things/abc')).toBe(getThing)
    expect(matchRoute('get', '/things/abc/')).toBe(getThing)
    expect(matchRoute('POST', '/things')).toBe(createThing)
  })

  it('rejects the wrong method, a missing parameter and an unknown path', () => {
    registerModule({ name: 'core', dependsOn: [], routes: [getThing, createThing] })
    expect(matchRoute('DELETE', '/things/abc')).toBeUndefined()
    expect(matchRoute('GET', '/things/')).toBeUndefined()
    expect(matchRoute('GET', '/other')).toBeUndefined()
  })
})

describe('allowedMethods', () => {
  beforeEach(resetRegistry)

  it('lists the methods registered for a path, so a caller can tell "wrong method" from "no such path"', () => {
    const patchThing = { ...getThing, method: 'patch' as const }
    registerModule({ name: 'core', dependsOn: [], routes: [getThing, patchThing, createThing] })
    expect(allowedMethods('/things/abc')).toEqual(['GET', 'PATCH'])
    expect(allowedMethods('/things')).toEqual(['POST'])
    expect(allowedMethods('/other')).toEqual([])
  })
})

describe('can', () => {
  beforeEach(resetRegistry)
  const actor = { id: '0b7f2f6e-1c3a-4a53-9f55-0d3c0c1d9a11', name: 'Test', kind: 'human' as const }

  it('allows a registered action', () => {
    registerModule({ name: 'core', dependsOn: [], routes: [], actions: ['thing.read'] })
    expect(can(actor, 'thing.read', { spaceId: 'x' })).toBe(true)
    expect(() => authorize(actor, 'thing.read')).not.toThrow()
  })

  it('fails loudly on an action no layer registered, so a typo is never quietly allowed', () => {
    registerModule({ name: 'core', dependsOn: [], routes: [], actions: ['thing.read'] })
    expect(() => can(actor, 'thing.raed')).toThrow(/Unknown action/)
  })
})

describe('pagination', () => {
  it('round-trips a cursor and rejects one made for another sort', () => {
    const cursor = encodeCursor('position', ['a1', '0b7f2f6e-1c3a-4a53-9f55-0d3c0c1d9a11'])
    expect(decodeCursor(cursor, 'position')).toEqual(['a1', '0b7f2f6e-1c3a-4a53-9f55-0d3c0c1d9a11'])
    expect(() => decodeCursor(cursor, '-created_at')).toThrow(ApiError)
    expect(decodeCursor(undefined, 'position')).toBeUndefined()
  })

  it('rejects garbage as a 400 on query.cursor', () => {
    for (const bad of ['not a cursor', Buffer.from('{"sort":"position"}').toString('base64url')]) {
      try {
        decodeCursor(bad, 'position')
        expect.unreachable()
      } catch (err) {
        const { status, body } = toErrorResponse(err)
        expect(status).toBe(400)
        expect(Object.keys(body.error.fields)).toEqual(['query.cursor'])
      }
    }
  })

  it('has a next cursor only when a row beyond the limit came back', () => {
    const rows = ['a', 'b', 'c'].map((key, i) => ({ key, id: String(i) }))
    const cursorOf = (r: { key: string; id: string }): [string, string] => [r.key, r.id]
    const first = toPage(rows, 2, 'position', (r) => r.key, cursorOf)
    expect(first.data).toEqual(['a', 'b'])
    expect(decodeCursor(first.next_cursor!, 'position')).toEqual(['b', '1'])
    expect(toPage(rows.slice(0, 2), 2, 'position', (r) => r.key, cursorOf).next_cursor).toBeNull()
  })
})
