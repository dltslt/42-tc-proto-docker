// Server-only Nitro route: runs in Node container with direct DB access (maps to GET /api/items)
// Nuxt auto-imports: defineEventHandler, getQuery, queryPg, getMongoDb

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = (query.source as string) || 'postgres'
  const spaceId = query.space_id as string | undefined
  const parentId = query.parent_id as string | undefined
  const search = query.search as string | undefined
  const limit = Math.min(Number(query.limit) || 1000, 5000)

  if (source === 'mongo') {
    const mongo = await getMongoDb()
    const filter: Record<string, any> = {}

    if (spaceId) {
      filter.space_id = spaceId
    }
    if (parentId !== undefined) {
      filter.parent_id = parentId === 'null' || parentId === 'root' ? null : parentId
    }
    if (search) {
      filter.title = { $regex: search, $options: 'i' }
    }

    const start = performance.now()
    const pipeline: any[] = [
      { $match: filter },
      { $sort: { depth: 1, position: 1, title: 1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'items',
          localField: '_id',
          foreignField: 'parent_id',
          as: 'children_docs',
        },
      },
      {
        $project: {
          _id: 1,
          space_id: 1,
          title: 1,
          description: 1,
          parent_id: 1,
          state: 1,
          position: 1,
          depth: 1,
          tags: 1,
          child_count: { $size: '$children_docs' },
          created_at: 1,
          updated_at: 1,
        },
      },
    ]

    const docs = await mongo.collection('items').aggregate(pipeline).toArray()
    const durationMs = Number((performance.now() - start).toFixed(2))

    return {
      source: 'mongo',
      durationMs,
      count: docs.length,
      items: docs.map((d) => ({
        id: d._id.toString(),
        space_id: d.space_id,
        title: d.title,
        description: d.description || '',
        parent_id: d.parent_id || null,
        state: d.state || 'unstarted',
        position: d.position || 0,
        depth: d.depth || 0,
        tags: Array.isArray(d.tags) ? d.tags : [],
        child_count: Number(d.child_count) || 0,
        created_at: d.created_at,
        updated_at: d.updated_at,
      })),
    }
  }

  // Default: PostgreSQL
  const conditions: string[] = []
  const params: any[] = []

  if (spaceId) {
    params.push(spaceId)
    conditions.push(`i.space_id = $${params.length}`)
  }
  if (parentId !== undefined) {
    if (parentId === 'null' || parentId === 'root') {
      conditions.push(`i.parent_id IS NULL`)
    } else {
      params.push(parentId)
      conditions.push(`i.parent_id = $${params.length}`)
    }
  }
  if (search) {
    params.push(`%${search}%`)
    conditions.push(`i.title ILIKE $${params.length}`)
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  params.push(limit)
  const limitClause = `LIMIT $${params.length}`

  const sql = `
    SELECT
      i.id,
      i.space_id,
      i.title,
      i.description,
      i.parent_id,
      i.state,
      i.position,
      i.depth,
      i.created_at,
      i.updated_at,
      COALESCE(
        ARRAY_AGG(t.name) FILTER (WHERE t.name IS NOT NULL),
        '{}'
      ) AS tags,
      (SELECT COUNT(*)::int FROM items c WHERE c.parent_id = i.id) AS child_count
    FROM items i
    LEFT JOIN item_tags it ON i.id = it.item_id
    LEFT JOIN tags t ON it.tag_id = t.id
    ${whereClause}
    GROUP BY i.id
    ORDER BY i.depth ASC, i.position ASC, i.title ASC
    ${limitClause}
  `

  const { rows, durationMs } = await queryPg(sql, params)

  return {
    source: 'postgres',
    durationMs,
    count: rows.length,
    items: rows.map((r: any) => ({
      id: r.id,
      space_id: r.space_id,
      title: r.title,
      description: r.description || '',
      parent_id: r.parent_id || null,
      state: r.state,
      position: r.position,
      depth: r.depth,
      tags: r.tags || [],
      child_count: Number(r.child_count) || 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
  }
})
