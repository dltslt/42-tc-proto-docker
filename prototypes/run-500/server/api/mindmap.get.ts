// Server-only Nitro route: runs in Node container with direct DB access (maps to GET /api/mindmap)
// Returns hierarchical tree assembled via SQL Recursive CTE or MongoDB $graphLookup

interface MindmapNode {
  id: string
  space_id: string
  title: string
  description: string
  parent_id: string | null
  state: string
  tags: string[]
  depth: number
  children: MindmapNode[]
}

export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const source = (query.source as string) || 'postgres'
  const rootId = query.root_id as string | undefined
  const spaceId = query.space_id as string || 'space-db-fundamentals'

  // If no rootId specified, find the root item for this space
  let targetRootId = rootId

  if (source === 'mongo') {
    const mongo = await getMongoDb()
    const itemsCol = mongo.collection('items')

    if (!targetRootId) {
      const rootDoc = await itemsCol.findOne({ space_id: spaceId, parent_id: null })
      targetRootId = rootDoc ? rootDoc._id.toString() : undefined
    }

    if (!targetRootId) {
      return { source: 'mongo', root: null, rawQuery: '$graphLookup', durationMs: 0 }
    }

    const start = performance.now()
    // MongoDB $graphLookup aggregation pipeline for recursive hierarchy traversal
    const pipeline = [
      { $match: { _id: targetRootId } },
      {
        $graphLookup: {
          from: 'items',
          startWith: '$_id',
          connectFromField: '_id',
          connectToField: 'parent_id',
          as: 'descendants',
          depthField: 'branch_depth',
        },
      },
    ]

    const result = await itemsCol.aggregate(pipeline).toArray()
    const durationMs = Number((performance.now() - start).toFixed(2))

    if (!result || result.length === 0) {
      return { source: 'mongo', root: null, rawQuery: JSON.stringify(pipeline, null, 2), durationMs }
    }

    const rootDoc = result[0]
    const allDocs = [rootDoc, ...(rootDoc.descendants || [])]

    // Build tree
    const nodeMap = new Map<string, MindmapNode>()
    for (const d of allDocs) {
      nodeMap.set(d._id.toString(), {
        id: d._id.toString(),
        space_id: d.space_id,
        title: d.title,
        description: d.description || '',
        parent_id: d.parent_id || null,
        state: d.state || 'unstarted',
        tags: Array.isArray(d.tags) ? d.tags : [],
        depth: d.depth || 0,
        children: [],
      })
    }

    let treeRoot: MindmapNode | null = null
    for (const node of nodeMap.values()) {
      if (node.id === targetRootId) {
        treeRoot = node
      } else if (node.parent_id && nodeMap.has(node.parent_id)) {
        nodeMap.get(node.parent_id)!.children.push(node)
      }
    }

    return {
      source: 'mongo',
      durationMs,
      nodeCount: allDocs.length,
      rawQuery: `db.items.aggregate([\n  { $match: { _id: "${targetRootId}" } },\n  {\n    $graphLookup: {\n      from: "items",\n      startWith: "$_id",\n      connectFromField: "_id",\n      connectToField: "parent_id",\n      as: "descendants",\n      depthField: "branch_depth"\n    }\n  }\n])`,
      root: treeRoot,
    }
  }

  // PostgreSQL Recursive CTE
  if (!targetRootId) {
    const rootRes = await queryPg<{ id: string }>(
      'SELECT id FROM items WHERE space_id = $1 AND parent_id IS NULL ORDER BY position ASC LIMIT 1',
      [spaceId]
    )
    targetRootId = rootRes.rows[0]?.id
  }

  if (!targetRootId) {
    return { source: 'postgres', root: null, rawQuery: 'WITH RECURSIVE ...', durationMs: 0 }
  }

  const sql = `
    WITH RECURSIVE item_tree AS (
      -- Anchor member: select the specified root item
      SELECT
        i.id,
        i.space_id,
        i.title,
        i.description,
        i.parent_id,
        i.state,
        i.position,
        i.depth,
        0 AS relative_depth
      FROM items i
      WHERE i.id = $1

      UNION ALL

      -- Recursive member: select children of current nodes
      SELECT
        c.id,
        c.space_id,
        c.title,
        c.description,
        c.parent_id,
        c.state,
        c.position,
        c.depth,
        t.relative_depth + 1
      FROM items c
      INNER JOIN item_tree t ON c.parent_id = t.id
    )
    SELECT
      t.id,
      t.space_id,
      t.title,
      t.description,
      t.parent_id,
      t.state,
      t.position,
      t.depth,
      t.relative_depth,
      COALESCE(
        ARRAY_AGG(tg.name) FILTER (WHERE tg.name IS NOT NULL),
        '{}'
      ) AS tags
    FROM item_tree t
    LEFT JOIN item_tags it ON t.id = it.item_id
    LEFT JOIN tags tg ON it.tag_id = tg.id
    GROUP BY t.id, t.space_id, t.title, t.description, t.parent_id, t.state, t.position, t.depth, t.relative_depth
    ORDER BY t.relative_depth ASC, t.position ASC;
  `

  const { rows, durationMs } = await queryPg(sql, [targetRootId])

  const nodeMap = new Map<string, MindmapNode>()
  for (const r of rows) {
    nodeMap.set(r.id, {
      id: r.id,
      space_id: r.space_id,
      title: r.title,
      description: r.description || '',
      parent_id: r.parent_id || null,
      state: r.state,
      tags: r.tags || [],
      depth: r.depth,
      children: [],
    })
  }

  let treeRoot: MindmapNode | null = null
  for (const node of nodeMap.values()) {
    if (node.id === targetRootId) {
      treeRoot = node
    } else if (node.parent_id && nodeMap.has(node.parent_id)) {
      nodeMap.get(node.parent_id)!.children.push(node)
    }
  }

  return {
    source: 'postgres',
    durationMs,
    nodeCount: rows.length,
    rawQuery: sql.trim(),
    root: treeRoot,
  }
})
