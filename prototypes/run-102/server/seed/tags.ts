// Demo tags and links, loaded after the core fixtures. Kept apart from `load.ts` so the seed of the core
// layers still works if the `tags` layer is removed (see tests/removal.test.ts): only `seed.ts` imports both.
// Same rules as `load.ts`: idempotent inserts, and an event only for a row this run really inserted.
import type { Tx } from '../../layers/core/server/db/client'
import { events } from '../../layers/events/server/db/schema'
import { itemTags, tags } from '../../layers/tags/server/db/schema'
import { fixtureId, spaceFixtures } from './fixtures'

export const tagFixtures = [
  { space: 'dinner', name: 'urgent' },
  { space: 'dinner', name: 'shopping' },
  { space: 'dinner', name: 'kitchen' },
  { space: 'studio', name: 'launch' },
] as const

// [item slug, tag key as `space:name`]. An item and its tag must be in the same space.
export const linkFixtures = [
  ['buy-wine', 'dinner:shopping'],
  ['buy-vegetables', 'dinner:shopping'],
  ['choose-main', 'dinner:kitchen'],
  ['set-table', 'dinner:urgent'],
  ['host-dinner', 'dinner:urgent'],
  ['launch-site', 'studio:launch'],
] as const

const tagKey = (space: string, name: string) => `tag:${space}:${name}`

export async function loadTagFixtures(tx: Tx): Promise<{ tags: number; links: number; events: number }> {
  const inserted = { tags: 0, links: 0, events: 0 }
  const creator = (space: string) => fixtureId(spaceFixtures.find((s) => s.slug === space)!.members[0])

  for (const t of tagFixtures) {
    const id = fixtureId(tagKey(t.space, t.name))
    const rows = await tx.insert(tags).values({ id, spaceId: fixtureId(t.space), name: t.name }).onConflictDoNothing().returning({ id: tags.id })
    inserted.tags += rows.length
    if (rows.length > 0) {
      await tx.insert(events).values({ spaceId: fixtureId(t.space), type: 'tag.created', actorId: creator(t.space), targetKind: 'tag', targetId: id, changes: { name: { from: null, to: t.name } } })
      inserted.events++
    }
  }

  for (const [itemSlug, key] of linkFixtures) {
    const [space, name] = key.split(':') as [string, string]
    const itemId = fixtureId(itemSlug)
    const tagId = fixtureId(tagKey(space, name))
    const rows = await tx.insert(itemTags).values({ spaceId: fixtureId(space), itemId, tagId }).onConflictDoNothing().returning({ t: itemTags.tagId })
    inserted.links += rows.length
    if (rows.length > 0) {
      await tx.insert(events).values({ spaceId: fixtureId(space), type: 'item.tagged', actorId: creator(space), targetKind: 'item', targetId: itemId, changes: { tag_id: { from: null, to: tagId } } })
      inserted.events++
    }
  }
  return inserted
}
