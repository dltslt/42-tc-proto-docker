// A small JSON Schema checker for the OpenAPI 3.0 subset this API publishes: type, nullable, enum,
// properties, required, items. Plain JavaScript with no imports, so a script outside Nuxt (and the tests)
// can check a response using only the OpenAPI document. It ignores `format` and `pattern` on purpose.
// Returns a list of problems; an empty list means the value fits the schema.
export function check(schema, value, path = '$', doc = undefined) {
  if (schema.$ref) {
    const target = schema.$ref.replace('#/', '').split('/').reduce((node, key) => node?.[key], doc)
    return target ? check(target, value, path, doc) : [`${path}: unresolved ${schema.$ref}`]
  }
  if (value === null) return schema.nullable ? [] : [`${path}: null is not allowed`]
  if (schema.enum && !schema.enum.includes(value)) return [`${path}: ${JSON.stringify(value)} is not one of ${schema.enum.join(', ')}`]
  const kind = Array.isArray(value) ? 'array' : typeof value
  switch (schema.type) {
    case 'string': return kind === 'string' ? [] : [`${path}: expected string, got ${kind}`]
    case 'boolean': return kind === 'boolean' ? [] : [`${path}: expected boolean, got ${kind}`]
    case 'number': return kind === 'number' ? [] : [`${path}: expected number, got ${kind}`]
    case 'integer': return Number.isInteger(value) ? [] : [`${path}: expected integer, got ${JSON.stringify(value)}`]
    case 'array':
      if (kind !== 'array') return [`${path}: expected array, got ${kind}`]
      return schema.items ? value.flatMap((v, i) => check(schema.items, v, `${path}[${i}]`, doc)) : []
    case 'object': {
      if (kind !== 'object') return [`${path}: expected object, got ${kind}`]
      const problems = (schema.required ?? []).filter((k) => !(k in value)).map((k) => `${path}.${k}: missing`)
      for (const [k, sub] of Object.entries(schema.properties ?? {})) {
        if (k in value) problems.push(...check(sub, value[k], `${path}.${k}`, doc))
      }
      return problems
    }
    default: return [] // no `type`: any value (for example `from` and `to` in an event's changes)
  }
}
