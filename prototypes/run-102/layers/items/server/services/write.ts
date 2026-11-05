// Write services for items. Server-only. Every function here is one transaction that saves the change
// and its event together. The route above it only validates input and calls one of these.
//
// Every write starts by taking the space lock (see workspace/server/services/lock.ts), so within one space
// writes happen one at a time. That is what makes the checks below safe without further tricks:
// "is there a cycle", "is the version still the one the client saw", "which keys are free".
import { and, asc, desc, eq, gt, inArray, isNull, lt, ne, or, sql, type SQL } from 'drizzle-orm'
import type { Database, Tx } from '#layers/core/server/db/client'
import type { ActorRef } from '#layers/core/server/lib/actor'
import { badRequest, conflict, notFound } from '#layers/core/server/lib/errors'
import { createdChanges, diffChanges, recordEvent, removedChanges } from '#layers/events/server/services/record'
import { columns, memberships, type Column } from '#layers/workspace/server/db/schema'
import { requireSpaceAccess, type Db } from '#layers/workspace/server/services/identity'
import { lockSpace } from '#layers/workspace/server/services/lock'
import { items, type Item } from '../db/schema'
import { keysBetween, placeAfter, placeFirst, placeLast, staysBetween, type Placement } from '../lib/placement'
import { toItemDto, VERSIONED_FIELDS, type CreateItemBody, type DeleteItemQuery, type MoveItemBody, type PatchItemBody } from '../schemas'

type State = Item['state']

// The fields recorded in events, named the way the API names them.
const snapshot = (r: Item) => ({
  title: r.title,
  description: r.description,
  type: r.type,
  state: r.state,
  parent_id: r.parentId,
  column_id: r.columnId,
  lead_id: r.leadId,
  position: r.position,
})
const CREATED_FIELDS = ['title', 'description', 'type', 'state', 'parent_id', 'column_id', 'lead_id'] as const

// Run `fn` in one transaction. Works on the pool and, as a savepoint, on a transaction handle.
const inTransaction = <T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> => (db as Database).transaction(fn)

// ---- small lookups that turn a bad reference into a readable 400 (the database would refuse it too)

const siblingsWhere = (spaceId: string, parentId: string | null) =>
  and(eq(items.spaceId, spaceId), parentId === null ? isNull(items.parentId) : eq(items.parentId, parentId))

async function requireItemInSpace(tx: Tx, spaceId: string, id: string, field: string, what: string): Promise<Item> {
  const [row] = await tx.select().from(items).where(and(eq(items.id, id), eq(items.spaceId, spaceId)))
  if (!row) throw badRequest(`${what} not found in this space`, { [`body.${field}`]: [`No item ${id} in this space`] })
  return row
}

async function requireColumnInSpace(tx: Tx, spaceId: string, id: string): Promise<Column> {
  const [row] = await tx.select().from(columns).where(and(eq(columns.id, id), eq(columns.spaceId, spaceId)))
  if (!row) throw badRequest('Column not found in this space', { 'body.column_id': [`No column ${id} in this space`] })
  return row
}

// A state change needs a column to go to: the first one (by board position) with that state.
async function firstColumnWithState(tx: Tx, spaceId: string, state: State): Promise<Column> {
  const [row] = await tx.select().from(columns).where(and(eq(columns.spaceId, spaceId), eq(columns.state, state))).orderBy(asc(columns.position), asc(columns.id)).limit(1)
  if (!row) throw conflict(`This space has no column for the state "${state}"`)
  return row
}

async function requireMember(tx: Tx, spaceId: string, actorId: string): Promise<void> {
  const [row] = await tx.select({ id: memberships.actorId }).from(memberships).where(and(eq(memberships.spaceId, spaceId), eq(memberships.actorId, actorId)))
  if (!row) throw badRequest('The lead must be a member of the space', { 'body.lead_id': ['Not a member of this space'] })
}

// Which space an item lives in, before we know which lock to take. 404 if it does not exist.
async function spaceOf(db: Db, id: string): Promise<string> {
  const [row] = await db.select({ spaceId: items.spaceId }).from(items).where(eq(items.id, id))
  if (!row) throw notFound('Item not found')
  return row.spaceId
}

async function loadItem(tx: Tx, id: string): Promise<Item> {
  const [row] = await tx.select().from(items).where(eq(items.id, id))
  if (!row) throw notFound('Item not found') // deleted by a write that ran before ours
  return row
}

// Would making `newParentId` the parent of `itemId` create a cycle? Walk up from the new parent to the root;
// if the walk meets the item, the new parent is the item itself or one of its descendants.
async function wouldCycle(tx: Tx, itemId: string, newParentId: string): Promise<boolean> {
  if (newParentId === itemId) return true
  const result = await tx.execute(sql`
    with recursive up as (
      select id, parent_id from items where id = ${newParentId}::uuid
      union all
      select i.id, i.parent_id from items i join up on i.id = up.parent_id
    )
    select 1 as hit from up where id = ${itemId}::uuid limit 1`)
  return result.rows.length > 0
}

// ---- create

export async function createItem(db: Db, actor: ActorRef, body: CreateItemBody) {
  await requireSpaceAccess(db, actor.id, body.space_id) // 404 unknown space, 403 not a member
  return inTransaction(db, async (tx) => {
    await lockSpace(tx, body.space_id)

    // The column decides the state. Given a state, use its first column; given neither, "unstarted".
    let column: Column
    if (body.column_id) {
      column = await requireColumnInSpace(tx, body.space_id, body.column_id)
      if (body.state && body.state !== column.state) {
        throw badRequest('state does not match the column', { 'body.state': [`That column is for "${column.state}" items`] })
      }
    } else {
      column = await firstColumnWithState(tx, body.space_id, body.state ?? 'unstarted')
    }
    const parentId = body.parent_id ?? null
    if (parentId) await requireItemInSpace(tx, body.space_id, parentId, 'parent_id', 'Parent')
    if (body.lead_id) await requireMember(tx, body.space_id, body.lead_id)

    // A new item goes to the end of its siblings.
    const [last] = await tx.select({ position: items.position }).from(items).where(siblingsWhere(body.space_id, parentId)).orderBy(desc(items.position), desc(items.id)).limit(1)
    const [row] = await tx
      .insert(items)
      .values({
        spaceId: body.space_id,
        parentId,
        type: body.type ?? 'task',
        title: body.title,
        description: body.description ?? '',
        state: column.state,
        columnId: column.id,
        position: placeLast(last?.position ?? null).key,
        leadId: body.lead_id ?? null,
      })
      .returning()
    await recordEvent(tx, {
      spaceId: body.space_id, type: 'item.created', actorId: actor.id, targetKind: 'item', targetId: row!.id,
      changes: createdChanges(snapshot(row!), CREATED_FIELDS),
    })
    return toItemDto(row!)
  })
}

// ---- edit

export async function updateItem(db: Db, actor: ActorRef, id: string, body: PatchItemBody) {
  const spaceId = await spaceOf(db, id)
  await requireSpaceAccess(db, actor.id, spaceId)
  return inTransaction(db, async (tx) => {
    await lockSpace(tx, spaceId)
    const cur = await loadItem(tx, id)

    // Text-like fields are checked against the version the client started from. Everything else is last write wins.
    const touchesVersioned = VERSIONED_FIELDS.some((f) => body[f] !== undefined)
    if (touchesVersioned && body.expected_version !== cur.version) {
      throw conflict(`This item changed since you loaded it (you have version ${body.expected_version}, it is now ${cur.version})`, toItemDto(cur))
    }

    const next: Partial<Pick<Item, 'title' | 'description' | 'type' | 'leadId' | 'state' | 'columnId'>> = {}
    if (body.title !== undefined) next.title = body.title
    if (body.description !== undefined) next.description = body.description
    if (body.type !== undefined) next.type = body.type
    if (body.lead_id !== undefined) {
      if (body.lead_id !== null && body.lead_id !== cur.leadId) await requireMember(tx, spaceId, body.lead_id)
      next.leadId = body.lead_id
    }
    if (body.state !== undefined && body.state !== cur.state) {
      const column = await firstColumnWithState(tx, spaceId, body.state)
      next.state = body.state
      next.columnId = column.id
    }

    // Keep only what really differs: saving the same value again changes nothing and writes no event.
    const changed = Object.fromEntries(Object.entries(next).filter(([key, value]) => cur[key as keyof Item] !== value)) as typeof next
    if (Object.keys(changed).length === 0) return toItemDto(cur)

    const versionedChanged = 'title' in changed || 'description' in changed || 'type' in changed || 'leadId' in changed
    const [row] = await tx
      .update(items)
      .set({ ...changed, ...(versionedChanged ? { version: cur.version + 1 } : {}) })
      .where(and(eq(items.id, id), eq(items.version, cur.version)))
      .returning()
    if (!row) throw conflict('This item changed while you were saving', toItemDto(await loadItem(tx, id)))

    await recordEvent(tx, {
      spaceId, type: 'item.updated', actorId: actor.id, targetKind: 'item', targetId: id,
      changes: diffChanges(snapshot(cur), snapshot(row), ['title', 'description', 'type', 'lead_id', 'state', 'column_id']),
    })
    return toItemDto(row)
  })
}

// ---- move

export async function moveItem(db: Db, actor: ActorRef, id: string, body: MoveItemBody) {
  const spaceId = await spaceOf(db, id)
  await requireSpaceAccess(db, actor.id, spaceId)
  return inTransaction(db, async (tx) => {
    await lockSpace(tx, spaceId)
    const cur = await loadItem(tx, id)

    // 1. Where does it go? An omitted field keeps its current value; a null parent_id means "root".
    const targetParent = body.parent_id !== undefined ? body.parent_id : cur.parentId
    const parentChanges = targetParent !== cur.parentId
    if (parentChanges && targetParent !== null) {
      await requireItemInSpace(tx, spaceId, targetParent, 'parent_id', 'Parent')
      if (await wouldCycle(tx, cur.id, targetParent)) {
        throw conflict('An item cannot be moved under itself or one of its own descendants')
      }
    }
    const column = body.column_id && body.column_id !== cur.columnId ? await requireColumnInSpace(tx, spaceId, body.column_id) : null

    // 2. Where among its new siblings? (the order key). `null` means the key stays as it is.
    const siblings = (extra?: SQL) => and(siblingsWhere(spaceId, targetParent), ne(items.id, cur.id), extra)
    const next = async (anchor: { id: string; position: string }) => {
      const tied = await tx.select({ id: items.id }).from(items).where(siblings(and(eq(items.position, anchor.position), gt(items.id, anchor.id)))).orderBy(asc(items.id))
      const [bigger] = await tx.select({ position: items.position }).from(items).where(siblings(gt(items.position, anchor.position))).orderBy(asc(items.position)).limit(1)
      return { tiedAfter: tied.map((r) => r.id), nextGreater: bigger?.position ?? null }
    }

    let placement: Placement | null = null
    let tiedKey: string | null = null // the key the rewritten siblings shared before
    const refId = body.after_id ?? body.before_id
    if (refId) {
      const field = body.after_id ? 'after_id' : 'before_id'
      const [ref] = await tx.select({ id: items.id, position: items.position }).from(items).where(siblings(eq(items.id, refId)))
      if (!ref) throw badRequest('The reference item must be a sibling', { [`body.${field}`]: ['Not an item with the same parent as the target, or the item itself'] })

      // "Before X" is "after the sibling that reads just before X", or "first" when there is none.
      let anchor: { id: string; position: string } | undefined = ref
      if (body.before_id) {
        const [prev] = await tx
          .select({ id: items.id, position: items.position }).from(items)
          .where(siblings(or(lt(items.position, ref.position), and(eq(items.position, ref.position), lt(items.id, ref.id)))))
          .orderBy(desc(items.position), desc(items.id)).limit(1)
        anchor = prev
      }
      if (!anchor) {
        if (parentChanges || !staysBetween(cur.position, null, ref.position)) placement = placeFirst(ref.position)
      } else {
        const { tiedAfter, nextGreater } = await next(anchor)
        const upper = tiedAfter.length > 0 ? anchor.position : nextGreater
        if (parentChanges || !staysBetween(cur.position, anchor.position, upper)) {
          placement = placeAfter(anchor.position, tiedAfter, nextGreater)
          tiedKey = anchor.position
        }
      }
    } else if (parentChanges || column) {
      // No neighbour named: go to the end of the siblings (the bottom of the column).
      const [last] = await tx.select({ position: items.position }).from(items).where(siblings()).orderBy(desc(items.position), desc(items.id)).limit(1)
      if (parentChanges || (last && cur.position <= last.position)) placement = placeLast(last?.position ?? null)
    }

    // 3. Write it, then the event.
    const set: Partial<Pick<Item, 'parentId' | 'columnId' | 'state' | 'position'>> = {}
    if (parentChanges) set.parentId = targetParent
    if (column) Object.assign(set, { columnId: column.id, state: column.state })
    if (placement) set.position = placement.key
    if (Object.keys(set).length === 0) return toItemDto(cur) // already exactly there

    const [row] = await tx.update(items).set(set).where(eq(items.id, id)).returning()
    await recordEvent(tx, {
      spaceId, type: 'item.moved', actorId: actor.id, targetKind: 'item', targetId: id,
      changes: diffChanges(snapshot(cur), snapshot(row!), ['parent_id', 'column_id', 'state', 'position']),
    })
    // Siblings that shared a key had to be spread out to make room. Their order is unchanged, but their key
    // is, so each gets an event of its own.
    for (const rewrite of placement?.rewrites ?? []) {
      await tx.update(items).set({ position: rewrite.key }).where(eq(items.id, rewrite.id))
      await recordEvent(tx, {
        spaceId, type: 'item.moved', actorId: actor.id, targetKind: 'item', targetId: rewrite.id,
        changes: { position: { from: tiedKey, to: rewrite.key } },
      })
    }
    return toItemDto(row!)
  })
}

// ---- delete

export async function deleteItem(db: Db, actor: ActorRef, id: string, query: DeleteItemQuery) {
  const spaceId = await spaceOf(db, id)
  await requireSpaceAccess(db, actor.id, spaceId)
  return inTransaction(db, async (tx) => {
    await lockSpace(tx, spaceId)
    const cur = await loadItem(tx, id)
    const children = await tx.select().from(items).where(eq(items.parentId, id)).orderBy(asc(items.position), asc(items.id))

    if (children.length > 0 && !query.mode) {
      throw conflict(`This item has ${children.length} child item${children.length === 1 ? '' : 's'}: send mode=subtree to delete them too, or mode=lift to move them up one level`)
    }

    const deletedEvent = (row: Item) =>
      recordEvent(tx, { spaceId, type: 'item.deleted', actorId: actor.id, targetKind: 'item', targetId: row.id, changes: removedChanges(snapshot(row), CREATED_FIELDS) })

    if (query.mode === 'lift' && children.length > 0) {
      // The children take the place the item had: same parent as the item, keys between the item's key and the next bigger one.
      const [bigger] = await tx
        .select({ position: items.position }).from(items)
        .where(and(siblingsWhere(spaceId, cur.parentId), ne(items.id, cur.id), gt(items.position, cur.position)))
        .orderBy(asc(items.position)).limit(1)
      const keys = keysBetween(cur.position, bigger?.position ?? null, children.length)
      for (const [i, child] of children.entries()) {
        await tx.update(items).set({ parentId: cur.parentId, position: keys[i]! }).where(eq(items.id, child.id))
        await recordEvent(tx, {
          spaceId, type: 'item.moved', actorId: actor.id, targetKind: 'item', targetId: child.id,
          changes: { parent_id: { from: cur.id, to: cur.parentId }, position: { from: child.position, to: keys[i]! } },
        })
      }
      await tx.delete(items).where(eq(items.id, id))
      await deletedEvent(cur)
      return { deleted_ids: [id], lifted_ids: children.map((c) => c.id) }
    }

    // A leaf, or mode=subtree: the foreign key removes every descendant with the item. Read them first, for the events.
    const found = await tx.execute(sql`
      with recursive sub as (
        select id from items where id = ${id}::uuid
        union all
        select i.id from items i join sub on i.parent_id = sub.id
      )
      select id from sub`)
    const ids = (found.rows as { id: string }[]).map((r) => r.id)
    const rows = await tx.select().from(items).where(inArray(items.id, ids))
    await tx.delete(items).where(eq(items.id, id))
    for (const row of [cur, ...rows.filter((r) => r.id !== id)]) await deletedEvent(row)
    return { deleted_ids: [id, ...ids.filter((x) => x !== id)], lifted_ids: [] as string[] }
  })
}
