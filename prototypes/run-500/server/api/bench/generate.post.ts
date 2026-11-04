// Server-only Nitro route: runs in Node container with direct DB access (maps to POST /api/bench/generate)
// Generates synthetic hierarchical items in both PostgreSQL and MongoDB

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const count = Math.min(Number(body?.count) || 1000, 10000)
  const spaceId = 'space-bench-scale'

  const availableTags = ['memory-layout', 'disk-io', 'architecture', 'sql', 'nosql', 'traversal', 'acid-transactions']
  const states = ['unstarted', 'started', 'done']

  // 1. Ensure benchmark space exists in both DBs
  const pgPool = getPgPool()
  await pgPool.query(
    `INSERT INTO spaces (id, name, type, description)
     VALUES ($1, 'Benchmark Scale Dataset', 'organization', 'Synthetic high-volume dataset for performance profiling.')
     ON CONFLICT (id) DO NOTHING`,
    [spaceId]
  )

  const mongo = await getMongoDb()
  await mongo.collection('spaces').updateOne(
    { _id: spaceId as any },
    { $set: { name: 'Benchmark Scale Dataset', type: 'organization', description: 'Synthetic high-volume dataset for performance profiling.' } },
    { upsert: true }
  )

  // 2. Generate items in memory
  const items: any[] = []
  const rootId = `bench-root`
  items.push({
    id: rootId,
    space_id: spaceId,
    title: `Benchmark Root (Scale Test)`,
    description: `Root item anchoring ${count} synthetic child items.`,
    parent_id: null,
    state: 'started',
    position: 0,
    depth: 0,
    tags: ['architecture'],
  })

  // Build tree with branching factor ~5 to depth 4
  const parentPool = [rootId]
  for (let i = 1; i < count; i++) {
    const parentId = parentPool[Math.floor(Math.random() * parentPool.length)]
    const itemId = `bench-item-${i}`
    const tagCount = 1 + Math.floor(Math.random() * 3)
    const selectedTags = Array.from(new Set(Array.from({ length: tagCount }, () => availableTags[Math.floor(Math.random() * availableTags.length)])))
    const state = states[Math.floor(Math.random() * states.length)]

    items.push({
      id: itemId,
      space_id: spaceId,
      title: `Task #${i} - Buffer Page Flush ${i % 256}`,
      description: `Synthetic task record representing disk buffer page operation ${i}.`,
      parent_id: parentId,
      state,
      position: i,
      depth: 1, // simplified depth for benchmark
      tags: selectedTags,
    })

    if (parentPool.length < 150) {
      parentPool.push(itemId)
    }
  }

  // 3. Batch insert into PostgreSQL
  const pgStart = performance.now()
  const client = await pgPool.connect()
  try {
    await client.query('BEGIN')
    const chunkSize = 250
    for (let c = 0; c < items.length; c += chunkSize) {
      const chunk = items.slice(c, c + chunkSize)
      const valueClauses: string[] = []
      const params: any[] = []

      chunk.forEach((it, idx) => {
        const offset = idx * 8
        valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8})`)
        params.push(it.id, it.space_id, it.title, it.description, it.parent_id, it.state, it.position, it.depth)
      })

      await client.query(
        `INSERT INTO items (id, space_id, title, description, parent_id, state, position, depth)
         VALUES ${valueClauses.join(', ')}
         ON CONFLICT (id) DO NOTHING`,
        params
      )

      // Insert item_tags
      const tagValues: string[] = []
      const tagParams: any[] = []
      let tIdx = 0
      for (const it of chunk) {
        for (const t of it.tags) {
          tagValues.push(`($${tIdx * 2 + 1}, $${tIdx * 2 + 2})`)
          tagParams.push(it.id, t)
          tIdx++
        }
      }
      if (tagValues.length > 0) {
        await client.query(
          `INSERT INTO item_tags (item_id, tag_id)
           VALUES ${tagValues.join(', ')}
           ON CONFLICT DO NOTHING`,
          tagParams
        )
      }
    }
    await client.query('COMMIT')
  } catch (err) {
    await client.query('ROLLBACK')
    throw err
  } finally {
    client.release()
  }
  const pgDurationMs = Number((performance.now() - pgStart).toFixed(2))

  // 4. Batch insert into MongoDB
  const mongoStart = performance.now()
  const mongoItems = items.map((it) => ({
    _id: it.id,
    space_id: it.space_id,
    title: it.title,
    description: it.description,
    parent_id: it.parent_id,
    state: it.state,
    position: it.position,
    depth: it.depth,
    tags: it.tags, // Embedded array!
    created_at: new Date(),
    updated_at: new Date(),
  }))

  const itemsCol = mongo.collection('items')
  const mongoChunkSize = 500
  for (let c = 0; c < mongoItems.length; c += mongoChunkSize) {
    const chunk = mongoItems.slice(c, c + mongoChunkSize)
    await itemsCol.bulkWrite(
      chunk.map((doc) => ({
        updateOne: {
          filter: { _id: doc._id as any },
          update: { $set: doc },
          upsert: true,
        },
      }))
    )
  }
  const mongoDurationMs = Number((performance.now() - mongoStart).toFixed(2))

  return {
    success: true,
    count: items.length,
    timings: {
      postgresMs: pgDurationMs,
      mongoMs: mongoDurationMs,
    },
  }
})
