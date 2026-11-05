// The seed, tested against throwaway databases: loads once, then changes nothing.
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createTestDatabase, type TestDatabase } from '#layers/core/tests/test-db'
import { fixtureId, itemFixtures, spaceFixtures } from '../server/seed/fixtures'
import { loadFixtures } from '../server/seed/load'
import { linkFixtures, loadTagFixtures, tagFixtures } from '../server/seed/tags'

const count = async (t: TestDatabase, query: string) =>
  Number(((await t.db.execute(sql.raw(query))).rows[0] as { n: string }).n)

describe('seed on a fresh database', () => {
  let t: TestDatabase
  beforeAll(async () => { t = await createTestDatabase() })
  afterAll(async () => { await t.drop() })

  it('inserts the demo set the first time', async () => {
    const { inserted } = await t.db.transaction((tx) => loadFixtures(tx))
    expect(inserted).toMatchObject({ actors: 4, spaces: spaceFixtures.length, items: itemFixtures.length })
  })

  it('inserts nothing, not even events, the second time', async () => {
    const before = await count(t, 'select count(*) as n from events')
    const { inserted } = await t.db.transaction((tx) => loadFixtures(tx))
    expect(Object.values(inserted).every((n) => n === 0)).toBe(true)
    expect(await count(t, 'select count(*) as n from events')).toBe(before)
  })

  it('gives every space a column for each state', async () => {
    const short = await count(t, `select count(*) as n from spaces s where (select count(distinct state) from columns c where c.space_id = s.id) < 4`)
    expect(short).toBe(0)
  })

  it('writes one event for every space and item it created', async () => {
    expect(await count(t, `select count(*) as n from events where type = 'space.created'`)).toBe(spaceFixtures.length)
    expect(await count(t, `select count(*) as n from events where type = 'item.created'`)).toBe(itemFixtures.length)
  })

  it('keeps siblings in a strict order', async () => {
    const ties = await count(t, `select count(*) as n from (select 1 from items group by space_id, parent_id, position having count(*) > 1) x`)
    expect(ties).toBe(0)
  })

  it('spreads items over every state and nests more than one level', async () => {
    expect(await count(t, 'select count(distinct state) as n from items')).toBe(4)
    const deep = await count(t, `select count(*) as n from items c join items p on c.parent_id = p.id join items g on p.parent_id = g.id`)
    expect(deep).toBeGreaterThan(0)
  })
})

describe('seed run twice at the same moment', () => {
  it('adds each row once', async () => {
    const t = await createTestDatabase()
    try {
      await Promise.all([t.db.transaction((tx) => loadFixtures(tx)), t.db.transaction((tx) => loadFixtures(tx))])
      expect(await count(t, 'select count(*) as n from items')).toBe(itemFixtures.length)
      expect(await count(t, 'select count(*) as n from events')).toBe(itemFixtures.length + spaceFixtures.length)
    } finally {
      await t.drop()
    }
  })
})

describe('fixtureId', () => {
  it('is stable and shaped like a uuid', () => {
    expect(fixtureId('ada')).toBe(fixtureId('ada'))
    expect(fixtureId('ada')).not.toBe(fixtureId('ben'))
    expect(fixtureId('ada')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('tag fixtures', () => {
  it('load once, link items of the same space, and change nothing the second time', async () => {
    const t = await createTestDatabase()
    try {
      await t.db.transaction((tx) => loadFixtures(tx))
      const first = await t.db.transaction((tx) => loadTagFixtures(tx))
      expect(first).toEqual({ tags: tagFixtures.length, links: linkFixtures.length, events: tagFixtures.length + linkFixtures.length })
      const second = await t.db.transaction((tx) => loadTagFixtures(tx))
      expect(second).toEqual({ tags: 0, links: 0, events: 0 })
      expect(await count(t, `select count(*) as n from events where type in ('tag.created', 'item.tagged')`)).toBe(first.events)
      // The database itself refuses a link across spaces, so the count below is also a check on the fixtures.
      expect(await count(t, 'select count(*) as n from item_tags')).toBe(linkFixtures.length)
    } finally {
      await t.drop()
    }
  })
})
