// Data-access layer: ALL item SQL lives here. Routes stay thin and an ORM could replace
// this one file later. Queries are parameterized ($1, $2 ...): values never get spliced into SQL.
import { randomUUID } from 'node:crypto'
import type { z } from 'zod'

const COLS = 'id, space_id, parent_id, type, title, description, state, board_column, position, lead_id, created_at, updated_at'

export async function listItems(spaceId: string): Promise<Item[]> {
  const { rows } = await getPool().query<Item>(`SELECT ${COLS} FROM items WHERE space_id = $1`, [spaceId])
  return orderItems(rows)
}

export async function findItem(id: string): Promise<Item | null> {
  const { rows } = await getPool().query<Item>(`SELECT ${COLS} FROM items WHERE id = $1`, [id])
  return rows[0] ?? null
}

// Next free slot at the end of a column. Positions are spaced by 1000 so drops can fit between.
async function endPosition(spaceId: string, column: ColumnKey): Promise<number> {
  const { rows } = await getPool().query(
    'SELECT coalesce(max(position), 0) + 1000 AS pos FROM items WHERE space_id = $1 AND board_column = $2',
    [spaceId, column],
  )
  return rows[0].pos
}

// Drop position: halfway between the previous card and the card we are dropped before.
// (Known limit: repeated halving eventually runs out of float precision; production would rebalance.)
async function positionFor(item: Item, column: ColumnKey, beforeId?: string): Promise<number> {
  if (beforeId) {
    const pool = getPool()
    const before = await pool.query(
      'SELECT position FROM items WHERE id = $1 AND space_id = $2 AND board_column = $3',
      [beforeId, item.space_id, column],
    )
    if (before.rows[0]) {
      const p: number = before.rows[0].position
      const prev = await pool.query(
        'SELECT max(position) AS pos FROM items WHERE space_id = $1 AND board_column = $2 AND id <> $3 AND position < $4',
        [item.space_id, column, item.id, p],
      )
      return prev.rows[0].pos == null ? p - 1000 : (prev.rows[0].pos + p) / 2
    }
  }
  return endPosition(item.space_id, column)
}

// A new parent must exist in the same space and must not be the item itself or one of its descendants.
async function assertValidParent(item: Item, parentId: string): Promise<void> {
  const parent = await findItem(parentId)
  if (!parent || parent.space_id !== item.space_id) {
    throw createError({ statusCode: 400, message: 'parent_id: parent not found in this space' })
  }
  // Recursive CTE: walk from the new parent up to the root. If we meet the item, it would become its own ancestor.
  // (UNION, not UNION ALL, so the walk also terminates if the data were ever corrupt.)
  const { rowCount } = await getPool().query(
    `WITH RECURSIVE ancestors AS (
       SELECT id, parent_id FROM items WHERE id = $1
       UNION
       SELECT i.id, i.parent_id FROM items i JOIN ancestors a ON i.id = a.parent_id
     )
     SELECT 1 FROM ancestors WHERE id = $2`,
    [parentId, item.id],
  )
  if (rowCount) throw createError({ statusCode: 400, message: 'parent_id: an item cannot be moved under itself or its own descendants' })
}

export async function createItem(input: z.infer<typeof createBody>): Promise<Item> {
  let type = input.type
  if (input.parent_id) {
    const parent = await findItem(input.parent_id)
    if (!parent || parent.space_id !== input.space_id) {
      throw createError({ statusCode: 400, message: 'parent_id: parent not found in this space' })
    }
    type ??= CHILD_TYPE[parent.type] // progressive creation: the title alone is enough
  }
  const column = input.board_column ?? defaultColumn()
  const { rows } = await getPool().query<Item>(
    `INSERT INTO items (id, space_id, parent_id, type, title, state, board_column, position)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING ${COLS}`,
    [randomUUID(), input.space_id, input.parent_id ?? null, type ?? 'task', input.title,
      stateForColumn(column), column, await endPosition(input.space_id, column)],
  )
  return rows[0]!
}

export async function updateItem(current: Item, patch: z.infer<typeof patchBody>): Promise<Item> {
  const next: Record<string, unknown> = {}
  for (const key of ['title', 'description', 'type'] as const) {
    if (patch[key] !== undefined) next[key] = patch[key]
  }

  if (patch.lead_id !== undefined) {
    if (patch.lead_id && !(await isMember(patch.lead_id, current.space_id))) {
      throw createError({ statusCode: 400, message: 'lead_id: actor is not a member of this space' })
    }
    next.lead_id = patch.lead_id
  }

  if (patch.parent_id !== undefined) {
    if (patch.parent_id) await assertValidParent(current, patch.parent_id)
    next.parent_id = patch.parent_id
  }

  // Column and state move together: whichever one the client sent implies the other.
  let { state, board_column: column } = patch
  if (column && !state) state = stateForColumn(column)
  if (state && !column) column = columnForState(state, current.board_column)
  if (state) next.state = state
  if (column) next.board_column = column

  const target = column ?? (patch.before_id ? current.board_column : undefined)
  if (target && (target !== current.board_column || patch.before_id)) {
    next.position = await positionFor(current, target, patch.before_id)
  }

  // Keys come from the allow-list above (never from user input), so building the SET list is safe.
  const keys = Object.keys(next)
  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  const { rows } = await getPool().query<Item>(
    `UPDATE items SET ${sets}${keys.length ? ', ' : ''}updated_at = now() WHERE id = $${keys.length + 1} RETURNING ${COLS}`,
    [...keys.map(k => next[k]), current.id],
  )
  return rows[0]!
}

// Deletes the item and, through ON DELETE CASCADE on parent_id, its whole subtree.
// Returns how many items were removed so the UI can tell the user.
export async function deleteItem(id: string): Promise<number> {
  const { rows } = await getPool().query(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM items WHERE id = $1
       UNION
       SELECT i.id FROM items i JOIN subtree s ON i.parent_id = s.id
     ), gone AS (
       DELETE FROM items WHERE id = $1 RETURNING id
     )
     SELECT count(*)::int AS n FROM subtree`,
    [id],
  )
  return rows[0].n
}

export async function loadRoster(): Promise<Roster> {
  const pool = getPool()
  const [actors, spaces, members] = await Promise.all([
    pool.query('SELECT id, name, kind FROM actors ORDER BY name'),
    pool.query('SELECT id, name, type FROM spaces ORDER BY name'),
    pool.query('SELECT space_id, actor_id FROM memberships'),
  ])
  return {
    actors: actors.rows.map(a => ({ ...a, space_ids: members.rows.filter(m => m.actor_id === a.id).map(m => m.space_id) })),
    spaces: spaces.rows.map(s => ({ ...s, member_ids: members.rows.filter(m => m.space_id === s.id).map(m => m.actor_id) })),
  }
}
