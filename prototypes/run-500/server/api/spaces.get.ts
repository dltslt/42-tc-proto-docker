// Server-only Nitro route: runs in Node container with direct DB access (maps to GET /api/spaces)
// Nuxt file-based routing automatically registers this file handler

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = (query.source as string) || 'postgres'

  if (source === 'mongo') {
    const mongo = await getMongoDb()
    const start = performance.now()
    const spaces = await mongo.collection('spaces').find({}).toArray()
    const durationMs = Number((performance.now() - start).toFixed(2))

    return {
      source: 'mongo',
      durationMs,
      spaces: spaces.map((s) => ({
        id: s._id.toString(),
        name: s.name,
        type: s.type,
        description: s.description,
      })),
    }
  }

  // Default: PostgreSQL
  const { rows, durationMs } = await queryPg<{
    id: string
    name: string
    type: string
    description: string
  }>('SELECT id, name, type, description FROM spaces ORDER BY id ASC')

  return {
    source: 'postgres',
    durationMs,
    spaces: rows,
  }
})
