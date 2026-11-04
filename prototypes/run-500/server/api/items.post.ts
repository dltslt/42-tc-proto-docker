// Server-only Nitro route: runs in Node container with direct DB access (maps to POST /api/items)
// Dual-write endpoint: persists new item in PostgreSQL and MongoDB simultaneously

export default defineEventHandler(async (event) => {
  const body = await readBody(event)

  if (!body || !body.title) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Item title is required',
    })
  }

  const spaceId = body.space_id || 'space-db-fundamentals'
  const parentId = body.parent_id || null
  const title = body.title.trim()
  const description = body.description || ''
  const state = body.state || 'unstarted'
  const tags: string[] = Array.isArray(body.tags) ? body.tags : []
  const itemId = `item-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`

  // 1. Dual Write: PostgreSQL
  let pgDurationMs = 0
  try {
    const pgStart = performance.now()
    const pool = getPgPool()
    const client = await pool.connect()
    try {
      await client.query('BEGIN')

      // Get parent depth if parent exists
      let depth = 0
      if (parentId) {
        const parentRes = await client.query('SELECT depth FROM items WHERE id = $1', [parentId])
        if (parentRes.rows.length > 0) {
          depth = (parentRes.rows[0].depth || 0) + 1
        }
      }

      await client.query(
        `INSERT INTO items (id, space_id, title, description, parent_id, state, position, depth)
         VALUES ($1, $2, $3, $4, $5, $6, 0, $7)`,
        [itemId, spaceId, title, description, parentId, state, depth]
      )

      for (const tag of tags) {
        // Ensure tag exists in tags table
        await client.query(
          `INSERT INTO tags (id, name, color) VALUES ($1, $1, 'blue') ON CONFLICT (id) DO NOTHING`,
          [tag]
        )
        await client.query(
          `INSERT INTO item_tags (item_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
          [itemId, tag]
        )
      }

      await client.query('COMMIT')
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
    pgDurationMs = Number((performance.now() - pgStart).toFixed(2))
  } catch (err: any) {
    console.error('[items.post] PostgreSQL insert failed:', err)
  }

  // 2. Dual Write: MongoDB
  let mongoDurationMs = 0
  try {
    const mongoStart = performance.now()
    const mongo = await getMongoDb()
    const itemsCol = mongo.collection('items')

    let depth = 0
    if (parentId) {
      const parentDoc = await itemsCol.findOne({ _id: parentId as any })
      if (parentDoc) {
        depth = (parentDoc.depth || 0) + 1
      }
    }

    await itemsCol.insertOne({
      _id: itemId as any,
      space_id: spaceId,
      title,
      description,
      parent_id: parentId,
      state,
      position: 0,
      depth,
      tags, // Stored as embedded array
      created_at: new Date(),
      updated_at: new Date(),
    })
    mongoDurationMs = Number((performance.now() - mongoStart).toFixed(2))
  } catch (err: any) {
    console.error('[items.post] MongoDB insert failed:', err)
  }

  return {
    item: {
      id: itemId,
      space_id: spaceId,
      title,
      description,
      parent_id: parentId,
      state,
      tags,
    },
    timings: {
      postgresMs: pgDurationMs,
      mongoMs: mongoDurationMs,
    },
  }
})
