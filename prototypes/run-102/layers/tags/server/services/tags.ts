// Services of the tags layer. Server-only. Writes are one transaction: the change and its event together.
// Items are reached through the items layer's service (getItem), never by reading its table.
import { and, asc, desc, eq, sql } from 'drizzle-orm'
import type { Database, Tx } from '#layers/core/server/db/client'
import { PG, pgError } from '#layers/core/server/db/errors'
import { keysetAfter, keysetOrder, type Keyset } from '#layers/core/server/db/keyset'
import type { ActorRef } from '#layers/core/server/lib/actor'
import { badRequest, conflict, notFound } from '#layers/core/server/lib/errors'
import { decodeCursor, toPage } from '#layers/core/server/lib/pagination'
import { recordEvent } from '#layers/events/server/services/record'
import { getItem } from '#layers/items/server/services/read'
import { requireSpaceAccess, type Db } from '#layers/workspace/server/services/identity'
import { lockSpace } from '#layers/workspace/server/services/lock'
import { itemTags, tags, type Tag } from '../db/schema'
import { toTagDto, type CreateTagBody, type ListTagsQuery } from '../schemas'

const inTransaction = <T>(db: Db, fn: (tx: Tx) => Promise<T>): Promise<T> => (db as Database).transaction(fn)

async function loadTag(db: Db, id: string): Promise<Tag> {
  const [row] = await db.select().from(tags).where(eq(tags.id, id))
  if (!row) throw notFound('Tag not found')
  return row
}

export async function listTags(db: Db, spaceId: string, q: ListTagsQuery) {
  const keyset: Keyset = { key: sql`lower(${tags.name})`, keyText: sql<string>`lower(${tags.name})`, cast: 'text', id: tags.id, dir: q.sort.startsWith('-') ? 'desc' : 'asc' }
  const rows = await db
    .select({ row: tags, k: keyset.keyText })
    .from(tags)
    .where(and(eq(tags.spaceId, spaceId), keysetAfter(keyset, decodeCursor(q.cursor, q.sort))))
    .orderBy(...keysetOrder(keyset))
    .limit(q.limit + 1)
  return toPage(rows, q.limit, q.sort, (r) => toTagDto(r.row), (r) => [r.k, r.row.id])
}

export async function createTag(db: Db, actor: ActorRef, body: CreateTagBody) {
  await requireSpaceAccess(db, actor.id, body.space_id)
  return inTransaction(db, async (tx) => {
    await lockSpace(tx, body.space_id)
    const [same] = await tx.select({ id: tags.id }).from(tags).where(and(eq(tags.spaceId, body.space_id), sql`lower(${tags.name}) = lower(${body.name})`))
    if (same) throw conflict(`This space already has a tag named "${body.name}"`)
    const [row] = await tx.insert(tags).values({ spaceId: body.space_id, name: body.name }).returning()
    await recordEvent(tx, {
      spaceId: body.space_id, type: 'tag.created', actorId: actor.id, targetKind: 'tag', targetId: row!.id,
      changes: { name: { from: null, to: row!.name } },
    })
    return toTagDto(row!)
  })
}

export async function deleteTag(db: Db, actor: ActorRef, id: string) {
  const found = await loadTag(db, id)
  await requireSpaceAccess(db, actor.id, found.spaceId)
  return inTransaction(db, async (tx) => {
    await lockSpace(tx, found.spaceId)
    // Links go away with the tag (ON DELETE CASCADE). Read them first so the answer can name them.
    const links = await tx.select({ itemId: itemTags.itemId }).from(itemTags).where(eq(itemTags.tagId, id)).orderBy(asc(itemTags.itemId))
    const removed = await tx.delete(tags).where(eq(tags.id, id)).returning({ id: tags.id })
    if (removed.length === 0) throw notFound('Tag not found') // deleted by a write that ran before ours
    await recordEvent(tx, {
      spaceId: found.spaceId, type: 'tag.deleted', actorId: actor.id, targetKind: 'tag', targetId: id,
      changes: { name: { from: found.name, to: null } },
    })
    return { deleted_id: id, unlinked_item_ids: links.map((l) => l.itemId) }
  })
}

export async function tagItems(db: Db, actor: ActorRef, id: string) {
  const tag = await loadTag(db, id)
  await requireSpaceAccess(db, actor.id, tag.spaceId)
  const rows = await db.select({ itemId: itemTags.itemId }).from(itemTags).where(eq(itemTags.tagId, id)).orderBy(asc(itemTags.itemId))
  return { tag_id: id, item_ids: rows.map((r) => r.itemId) }
}

export async function itemTagIds(db: Db, actor: ActorRef, itemId: string) {
  await getItem(db, actor.id, itemId) // 404 unknown item, 403 other space
  const rows = await db.select({ tagId: itemTags.tagId }).from(itemTags).where(eq(itemTags.itemId, itemId)).orderBy(asc(itemTags.tagId))
  return { item_id: itemId, tag_ids: rows.map((r) => r.tagId) }
}

// Add or remove one link. Doing it twice is not an error and writes no second event.
export async function setLink(db: Db, actor: ActorRef, itemId: string, tagId: string, linked: boolean) {
  const item = await getItem(db, actor.id, itemId)
  const tag = await loadTag(db, tagId)
  if (tag.spaceId !== item.space_id) throw badRequest('The tag belongs to another space than the item', { 'params.tag_id': ['Not a tag of the item\'s space'] })
  return inTransaction(db, async (tx) => {
    await lockSpace(tx, item.space_id)
    const where = and(eq(itemTags.itemId, itemId), eq(itemTags.tagId, tagId))
    let changed: boolean
    try {
      changed = linked
        ? (await tx.insert(itemTags).values({ spaceId: item.space_id, itemId, tagId }).onConflictDoNothing().returning({ t: itemTags.tagId })).length > 0
        : (await tx.delete(itemTags).where(where).returning({ t: itemTags.tagId })).length > 0
    } catch (err) {
      // The item or the tag was deleted between the checks above (made before the lock) and the write:
      // the same-space foreign keys refuse the link. Only that case is "not found"; any other failure
      // (lost connection, timeout, deadlock) keeps its real status.
      const pg = pgError(err)
      if (pg?.code === PG.foreignKeyViolation && /^item_tags_(item|tag)_same_space_fk$/.test(pg.constraint ?? '')) {
        throw notFound('Item or tag not found')
      }
      throw err
    }
    if (changed) {
      await recordEvent(tx, {
        spaceId: item.space_id, type: linked ? 'item.tagged' : 'item.untagged', actorId: actor.id, targetKind: 'item', targetId: itemId,
        changes: { tag_id: linked ? { from: null, to: tagId } : { from: tagId, to: null } },
      })
    }
    const rows = await tx.select({ tagId: itemTags.tagId }).from(itemTags).where(eq(itemTags.itemId, itemId)).orderBy(asc(itemTags.tagId))
    return { item_id: itemId, tag_ids: rows.map((r) => r.tagId) }
  })
}
