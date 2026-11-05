// The v1 freeze: the live OpenAPI document must still honour the saved one (contract/v1.openapi.json).
// Adding is allowed: new paths, new methods, new response fields, new optional input. Everything a client
// of the saved contract could rely on must still be there:
//  - every path, method and response status
//  - every response field, with the same type, and still required if it was required
//  - every input parameter and field, and no new required input
//  - every enum value an input accepts
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { apiAs } from '#layers/core/tests/http'

type Json = Record<string, any>
const frozen: Json = JSON.parse(readFileSync(new URL('../contract/v1.openapi.json', import.meta.url), 'utf8'))
const live: Json = (await apiAs(undefined, '/openapi.json')).body

// Problems where `now` no longer fits what `then` promised. `side` says whether the schema describes input or output.
export function breaks(then: Json, now: Json | undefined, side: 'input' | 'output', path: string): string[] {
  if (!now) return [`${path}: removed`]
  const problems: string[] = []
  if (then.type !== now.type) problems.push(`${path}: type ${then.type} became ${now.type}`)
  if (then.nullable && !now.nullable && side === 'input') problems.push(`${path}: no longer accepts null`)
  if (!then.nullable && now.nullable && side === 'output') problems.push(`${path}: can now be null`)
  if (side === 'input' && then.enum) {
    for (const v of then.enum) if (!now.enum?.includes(v) && now.enum) problems.push(`${path}: input value ${v} removed`)
  }
  if (side === 'output' && then.enum && now.enum) {
    for (const v of now.enum) if (!then.enum.includes(v)) problems.push(`${path}: output can now be ${v}`)
  }
  if (then.items) problems.push(...breaks(then.items, now.items, side, `${path}[]`))
  const thenRequired: string[] = then.required ?? []
  const nowRequired: string[] = now.required ?? []
  for (const [key, sub] of Object.entries<Json>(then.properties ?? {})) {
    problems.push(...breaks(sub, now.properties?.[key], side, `${path}.${key}`))
  }
  if (side === 'input') for (const key of nowRequired) if (!thenRequired.includes(key)) problems.push(`${path}.${key}: new required input`)
  if (side === 'output') for (const key of thenRequired) if (!nowRequired.includes(key)) problems.push(`${path}.${key}: no longer always present`)
  return problems
}

const bodyOf = (res: Json | undefined) => res?.content?.['application/json']?.schema as Json | undefined

function compare(): string[] {
  const problems: string[] = []
  for (const [path, ops] of Object.entries<Json>(frozen.paths)) {
    for (const [method, op] of Object.entries<Json>(ops)) {
      const at = `${method.toUpperCase()} ${path}`
      const now = live.paths[path]?.[method]
      if (!now) { problems.push(`${at}: removed`); continue }
      for (const [status, res] of Object.entries<Json>(op.responses)) {
        const nowRes = now.responses[status]
        if (!nowRes) { problems.push(`${at} ${status}: removed`); continue }
        const schema = bodyOf(res)
        if (schema) problems.push(...breaks(schema, bodyOf(nowRes), 'output', `${at} ${status}`))
      }
      for (const p of op.parameters ?? []) {
        const same = (now.parameters ?? []).find((q: Json) => q.name === p.name && q.in === p.in)
        if (!same) problems.push(`${at}: parameter ${p.name} removed`)
        else problems.push(...breaks(p.schema, same.schema, 'input', `${at} ?${p.name}`))
      }
      for (const p of now.parameters ?? []) {
        const old = (op.parameters ?? []).find((q: Json) => q.name === p.name && q.in === p.in)
        if (!old && p.required) problems.push(`${at}: new required parameter ${p.name}`)
      }
      const bodyThen = op.requestBody?.content?.['application/json']?.schema
      if (bodyThen) problems.push(...breaks(bodyThen, now.requestBody?.content?.['application/json']?.schema, 'input', `${at} body`))
    }
  }
  return problems
}

describe('the v1 contract is frozen', () => {
  it('still honours everything in contract/v1.openapi.json', () => {
    expect(compare()).toEqual([])
  })

  it('catches the changes it is meant to catch', () => {
    const field = { type: 'object', required: ['a'], properties: { a: { type: 'string' }, b: { type: 'integer' } } }
    expect(breaks(field, { ...field, properties: { a: { type: 'string' } } }, 'output', '$')).toEqual(['$.b: removed'])
    expect(breaks(field, { ...field, properties: { ...field.properties, a: { type: 'integer' } } }, 'output', '$')).toEqual(['$.a: type string became integer'])
    expect(breaks(field, { ...field, required: ['a', 'b'] }, 'input', '$')).toEqual(['$.b: new required input'])
    expect(breaks(field, { ...field, required: [] }, 'output', '$')).toEqual(['$.a: no longer always present'])
    // Adding is fine.
    expect(breaks(field, { ...field, properties: { ...field.properties, c: { type: 'string' } } }, 'output', '$')).toEqual([])
  })
})
