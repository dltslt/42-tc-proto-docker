// Server-only Nitro route: runs in Node container with direct DB access (maps to POST /api/bench/run)
// Runs side-by-side SQL vs NoSQL benchmark operations and records query plans and latencies

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const targetQueryId = body?.queryId as string | undefined

  const pgPool = getPgPool()
  const mongo = await getMongoDb()
  const mongoItems = mongo.collection('items')

  const benchmarks = []

  // -------------------------------------------------------------
  // 1. Single Item Read with Tags
  // -------------------------------------------------------------
  if (!targetQueryId || targetQueryId === 'single-read') {
    const sampleId = 'item-db-memory'

    // PostgreSQL: JOIN items with item_tags and tags
    const pgSql = `
      SELECT i.*, ARRAY_AGG(t.name) AS tags
      FROM items i
      LEFT JOIN item_tags it ON i.id = it.item_id
      LEFT JOIN tags t ON it.tag_id = t.id
      WHERE i.id = $1
      GROUP BY i.id
    `
    const pgRes = await queryPg(pgSql, [sampleId])

    // MongoDB: single document seek with embedded tags
    const mongoStart = performance.now()
    const doc = await mongoItems.findOne({ _id: sampleId as any })
    const mongoMs = Number((performance.now() - mongoStart).toFixed(2))

    benchmarks.push({
      id: 'single-read',
      name: '1. Single Item Read with Relations',
      description: 'Fetch one composite item with its tags. SQL performs a multi-table JOIN; Mongo reads a single contiguous BSON document.',
      postgresMs: pgRes.durationMs,
      mongoMs: mongoMs,
      postgresQuery: pgSql.trim(),
      mongoQuery: `db.items.findOne({ _id: "${sampleId}" })`,
      rowsMatched: doc ? 1 : 0,
    })
  }

  // -------------------------------------------------------------
  // 2. Recursive Subtree Traversal
  // -------------------------------------------------------------
  if (!targetQueryId || targetQueryId === 'tree-traversal') {
    const rootId = 'item-db-root'

    // PostgreSQL: WITH RECURSIVE CTE
    const pgSql = `
      WITH RECURSIVE tree AS (
        SELECT id, parent_id, title, 0 AS lvl FROM items WHERE id = $1
        UNION ALL
        SELECT c.id, c.parent_id, c.title, t.lvl + 1
        FROM items c
        JOIN tree t ON c.parent_id = t.id
      )
      SELECT * FROM tree;
    `
    const pgRes = await queryPg(pgSql, [rootId])

    // MongoDB: $graphLookup aggregation
    const mongoPipeline = [
      { $match: { _id: rootId } },
      {
        $graphLookup: {
          from: 'items',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parent_id',
          as: 'descendants',
        },
      },
    ]
    const mongoStart = performance.now()
    const mongoRes = await mongoItems.aggregate(mongoPipeline).toArray()
    const mongoMs = Number((performance.now() - mongoStart).toFixed(2))

    benchmarks.push({
      id: 'tree-traversal',
      name: '2. Deep Recursive Tree Traversal',
      description: 'Traverse an entire hierarchical tree from a root node. SQL uses a Recursive CTE; MongoDB uses a $graphLookup pipeline.',
      postgresMs: pgRes.durationMs,
      mongoMs: mongoMs,
      postgresQuery: pgSql.trim(),
      mongoQuery: JSON.stringify(mongoPipeline, null, 2),
      rowsMatched: pgRes.rows.length,
    })
  }

  // -------------------------------------------------------------
  // 3. Status Count Aggregation
  // -------------------------------------------------------------
  if (!targetQueryId || targetQueryId === 'aggregation') {
    // PostgreSQL: COUNT(*) GROUP BY
    const pgSql = `
      SELECT state, COUNT(*)::int AS count
      FROM items
      GROUP BY state
    `
    const pgRes = await queryPg(pgSql)

    // MongoDB: $group aggregation pipeline
    const mongoPipeline = [
      {
        $group: {
          _id: '$state',
          count: { $sum: 1 },
        },
      },
    ]
    const mongoStart = performance.now()
    const mongoRes = await mongoItems.aggregate(mongoPipeline).toArray()
    const mongoMs = Number((performance.now() - mongoStart).toFixed(2))

    benchmarks.push({
      id: 'aggregation',
      name: '3. Grouped Status Aggregation',
      description: 'Compute item counts grouped by state across the entire database. SQL uses GROUP BY; Mongo uses the $group stage.',
      postgresMs: pgRes.durationMs,
      mongoMs: mongoMs,
      postgresQuery: pgSql.trim(),
      mongoQuery: JSON.stringify(mongoPipeline, null, 2),
      rowsMatched: pgRes.rows.length,
    })
  }

  // -------------------------------------------------------------
  // 4. Tag Filtering & Co-occurrence
  // -------------------------------------------------------------
  if (!targetQueryId || targetQueryId === 'tag-filter') {
    const targetTag = 'architecture'

    // PostgreSQL: JOIN junction table
    const pgSql = `
      SELECT i.id, i.title, i.state
      FROM items i
      JOIN item_tags it ON i.id = it.item_id
      WHERE it.tag_id = $1
      LIMIT 50;
    `
    const pgRes = await queryPg(pgSql, [targetTag])

    // MongoDB: Query indexed embedded array
    const mongoStart = performance.now()
    const mongoDocs = await mongoItems.find({ tags: targetTag }).limit(50).toArray()
    const mongoMs = Number((performance.now() - mongoStart).toFixed(2))

    benchmarks.push({
      id: 'tag-filter',
      name: '4. Tag Filter & Index Scan',
      description: 'Find all items carrying a specific tag. SQL queries a junction table index; Mongo queries an indexed document array.',
      postgresMs: pgRes.durationMs,
      mongoMs: mongoMs,
      postgresQuery: pgSql.trim(),
      mongoQuery: `db.items.find({ tags: "${targetTag}" }).limit(50)`,
      rowsMatched: mongoDocs.length,
    })
  }

  // -------------------------------------------------------------
  // 5. Batch Insert of 100 Items
  // -------------------------------------------------------------
  if (!targetQueryId || targetQueryId === 'batch-insert') {
    const batchSize = 100
    const timestamp = Date.now()

    // PostgreSQL: Multi-row transactional insert
    const pgStart = performance.now()
    const client = await pgPool.connect()
    try {
      await client.query('BEGIN')
      const valueClauses: string[] = []
      const params: any[] = []
      for (let i = 0; i < batchSize; i++) {
        const offset = i * 4
        valueClauses.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4})`)
        params.push(`test-pg-${timestamp}-${i}`, 'space-bench-scale', `Ephemeral Item ${i}`, 'unstarted')
      }
      await client.query(
        `INSERT INTO items (id, space_id, title, state) VALUES ${valueClauses.join(', ')}`,
        params
      )
      await client.query('COMMIT')
      // Immediately delete ephemeral test items to avoid polluting space
      await client.query(`DELETE FROM items WHERE id LIKE $1`, [`test-pg-${timestamp}-%`])
    } finally {
      client.release()
    }
    const pgMs = Number((performance.now() - pgStart).toFixed(2))

    // MongoDB: insertMany
    const mongoStart = performance.now()
    const testDocs = Array.from({ length: batchSize }, (_, i) => ({
      _id: `test-mongo-${timestamp}-${i}` as any,
      space_id: 'space-bench-scale',
      title: `Ephemeral Item ${i}`,
      state: 'unstarted',
      tags: ['benchmark'],
      created_at: new Date(),
    }))
    await mongoItems.insertMany(testDocs)
    // Clean up ephemeral test docs from MongoDB
    await mongoItems.deleteMany({ _id: { $regex: `^test-mongo-${timestamp}-` } as any })
    const mongoMs = Number((performance.now() - mongoStart).toFixed(2))

    benchmarks.push({
      id: 'batch-insert',
      name: '5. Bulk Batch Insert (100 Items)',
      description: 'Insert 100 records in a single batch. SQL executes a multi-row statement inside an explicit transaction; Mongo uses insertMany().',
      postgresMs: pgMs,
      mongoMs: mongoMs,
      postgresQuery: `BEGIN;\nINSERT INTO items (id, space_id, title, state) VALUES (... 100 rows ...);\nCOMMIT;`,
      mongoQuery: `db.items.insertMany([ ... 100 documents ... ])`,
      rowsMatched: batchSize,
    })
  }

  return {
    timestamp: new Date().toISOString(),
    benchmarks,
  }
})
