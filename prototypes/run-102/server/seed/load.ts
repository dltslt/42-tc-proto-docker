// Server-only: write the fixtures into a database. Safe to run again and again.
// Idempotent by design: every insert says "do nothing if this id exists", and an event is written only
// for a row this run really inserted, so a second run adds nothing, not even events.
import { generateKeyBetween } from 'fractional-indexing'
import type { Tx } from '../../layers/core/server/db/client'
import { events } from '../../layers/events/server/db/schema'
import { items } from '../../layers/items/server/db/schema'
import { actors, columns, memberships, spaces } from '../../layers/workspace/server/db/schema'
import { actorFixtures, columnFixtures, fixtureId, itemFixtures, spaceFixtures } from './fixtures'

export interface SeedReport {
  inserted: Record<'actors' | 'spaces' | 'memberships' | 'columns' | 'items' | 'events', number>
}

// Ordering keys for `n` siblings: a0, a1, a2, ... (each sorts after the one before).
function orderKeys(n: number): string[] {
  const keys: string[] = []
  let previous: string | null = null
  for (let i = 0; i < n; i++) keys.push((previous = generateKeyBetween(previous, null)))
  return keys
}

export async function loadFixtures(tx: Tx): Promise<SeedReport> {
  const inserted = { actors: 0, spaces: 0, memberships: 0, columns: 0, items: 0, events: 0 }
  const logEvent = async (values: typeof events.$inferInsert) => {
    await tx.insert(events).values(values)
    inserted.events++
  }

  for (const a of actorFixtures) {
    const rows = await tx.insert(actors).values({ id: fixtureId(a.slug), name: a.name, kind: a.kind }).onConflictDoNothing().returning({ id: actors.id })
    inserted.actors += rows.length
  }

  const columnKeys = orderKeys(columnFixtures.length)
  for (const s of spaceFixtures) {
    const spaceId = fixtureId(s.slug)
    const rows = await tx.insert(spaces).values({ id: spaceId, name: s.name, type: s.type }).onConflictDoNothing().returning({ id: spaces.id })
    inserted.spaces += rows.length
    if (rows.length > 0) {
      await logEvent({ spaceId, type: 'space.created', actorId: fixtureId(s.members[0]), targetKind: 'space', targetId: spaceId, changes: { name: { from: null, to: s.name }, type: { from: null, to: s.type } } })
    }
    for (const member of s.members) {
      const m = await tx.insert(memberships).values({ spaceId, actorId: fixtureId(member) }).onConflictDoNothing().returning({ spaceId: memberships.spaceId })
      inserted.memberships += m.length
    }
    for (const [i, c] of columnFixtures.entries()) {
      const col = await tx.insert(columns).values({ id: fixtureId(`${s.slug}:${c.state}`), spaceId, name: c.name, state: c.state, position: columnKeys[i]! }).onConflictDoNothing().returning({ id: columns.id })
      inserted.columns += col.length
    }
  }

  // Sibling order: each item gets a key after the previous sibling under the same parent.
  const lastKey = new Map<string, string>()
  for (const it of itemFixtures) {
    const space = spaceFixtures.find((s) => s.slug === it.space)!
    const group = `${it.space}/${it.parent ?? ''}`
    const position = generateKeyBetween(lastKey.get(group) ?? null, null)
    lastKey.set(group, position)

    const itemId = fixtureId(it.slug)
    const rows = await tx
      .insert(items)
      .values({
        id: itemId,
        spaceId: fixtureId(it.space),
        parentId: it.parent ? fixtureId(it.parent) : null,
        type: it.type,
        title: it.title,
        description: it.description ?? '',
        state: it.state,
        columnId: fixtureId(`${it.space}:${it.state}`),
        position,
        leadId: it.lead ? fixtureId(it.lead) : null,
      })
      .onConflictDoNothing()
      .returning({ id: items.id })
    inserted.items += rows.length
    if (rows.length > 0) {
      await logEvent({
        spaceId: fixtureId(it.space),
        type: 'item.created',
        actorId: fixtureId(it.lead ?? space.members[0]),
        targetKind: 'item',
        targetId: itemId,
        changes: { title: { from: null, to: it.title }, state: { from: null, to: it.state }, type: { from: null, to: it.type } },
      })
    }
  }
  return { inserted }
}
