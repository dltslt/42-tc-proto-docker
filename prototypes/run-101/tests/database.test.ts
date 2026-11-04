// Runs against the real postgres container, so run it inside the prototype container: pnpm test.
// Each test works inside a transaction that is rolled back, so it leaves the seeded data untouched.
import pg from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { databaseUrl } from '../layers/core/server/db/client'
import { fixtureId, seedFixtures } from '../server/db/fixtures'
import { applyMigrations } from '../server/db/migrate'

const client = new pg.Client({ connectionString: databaseUrl() })
const db = drizzle(client)

const team = fixtureId('space:team')
const dinner = fixtureId('space:dinner')
const teamBacklog = fixtureId('column:team:backlog')
const dinnerBacklog = fixtureId('column:dinner:backlog')
const teamItem = fixtureId('item:team:guide')
const dinnerItem = fixtureId('item:dinner:friday')
const ada = fixtureId('actor:ada')
const cleo = fixtureId('actor:cleo') // member of Dinner Club, not of Lerch Team

const INSERT_ITEM = `
  INSERT INTO items (space_id, parent_id, title, state, column_id, position, lead_id)
  VALUES ($1, $2, $3, $4, $5, 'a0', $6)`

// Runs a statement that must fail. The savepoint keeps the surrounding transaction usable afterwards.
async function failure(sql: string, params: unknown[] = []) {
  await client.query('SAVEPOINT attempt')
  try {
    await client.query(sql, params)
    throw new Error(`expected this statement to fail: ${sql}`)
  }
  catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT attempt')
    return error as pg.DatabaseError
  }
}

async function rowCounts() {
  const { rows } = await client.query(`
    SELECT (SELECT count(*) FROM spaces) AS spaces, (SELECT count(*) FROM actors) AS actors,
           (SELECT count(*) FROM memberships) AS memberships, (SELECT count(*) FROM columns) AS columns,
           (SELECT count(*) FROM items) AS items, (SELECT count(*) FROM events) AS events`)
  return rows[0]
}

beforeAll(async () => {
  await client.connect()
  await applyMigrations(db)
})
afterAll(() => client.end())

beforeEach(async () => {
  await client.query('BEGIN')
  await seedFixtures(db)
})
afterEach(() => client.query('ROLLBACK'))

describe('seed', () => {
  it('inserts nothing on a repeated run', async () => {
    const before = await rowCounts()
    const second = await seedFixtures(db)
    expect(second).toEqual({ spaces: 0, actors: 0, memberships: 0, columns: 0, items: 0 })
    expect(await rowCounts()).toEqual(before)
  })

  it('keeps edits to existing rows', async () => {
    await client.query(`UPDATE items SET title = 'Edited' WHERE id = $1`, [teamItem])
    await seedFixtures(db)
    const { rows } = await client.query('SELECT title FROM items WHERE id = $1', [teamItem])
    expect(rows[0].title).toBe('Edited')
  })

  it('restores a deleted fixture and records a new event for it', async () => {
    const id = fixtureId('item:team:team-name')
    await client.query('DELETE FROM items WHERE id = $1', [id])
    const second = await seedFixtures(db)
    expect(second.items).toBe(1)
    const { rows } = await client.query('SELECT count(*) FROM events WHERE target_id = $1', [id])
    expect(rows[0].count).toBe('2')
  })

  it('records one created event for each item', async () => {
    const { rows } = await client.query(`
      SELECT i.id FROM items i
      WHERE (SELECT count(*) FROM events e
             WHERE e.target_kind = 'item' AND e.target_id = i.id::text AND e.type = 'item.created') <> 1`)
    expect(rows).toEqual([])
  })

  it('gives every space a column for every state', async () => {
    const { rows } = await client.query(`
      SELECT s.id FROM spaces s
      WHERE (SELECT count(DISTINCT c.state) FROM columns c WHERE c.space_id = s.id) <> 4`)
    expect(rows).toEqual([])
  })
})

describe('items', () => {
  it('needs only a title, a column and a position', async () => {
    const { rows } = await client.query(`
      INSERT INTO items (space_id, title, state, column_id, position)
      VALUES ($1, 'Just a title', 'unstarted', $2, 'a0') RETURNING type, description, version`, [team, teamBacklog])
    expect(rows[0]).toEqual({ type: 'task', description: '', version: 1 })
  })

  it('rejects a parent from another space', async () => {
    const error = await failure(INSERT_ITEM, [team, dinnerItem, 'x', 'unstarted', teamBacklog, null])
    expect(error.constraint).toBe('items_parent_fk')
  })

  it('rejects a column from another space', async () => {
    const error = await failure(INSERT_ITEM, [team, null, 'x', 'unstarted', dinnerBacklog, null])
    expect(error.constraint).toBe('items_column_fk')
  })

  it('rejects a state that differs from its column', async () => {
    const error = await failure(INSERT_ITEM, [team, null, 'x', 'done', teamBacklog, null])
    expect(error.constraint).toBe('items_column_fk')
  })

  it('rejects a lead who is not a member of the space', async () => {
    const error = await failure(INSERT_ITEM, [team, null, 'x', 'unstarted', teamBacklog, cleo])
    expect(error.constraint).toBe('items_lead_fk')
  })

  it('rejects being its own parent', async () => {
    const error = await failure('UPDATE items SET parent_id = id WHERE id = $1', [teamItem])
    expect(error.constraint).toBe('items_not_own_parent')
  })

  it('rejects a blank title', async () => {
    const error = await failure(INSERT_ITEM, [team, null, '   ', 'unstarted', teamBacklog, null])
    expect(error.constraint).toBe('items_title_not_blank')
  })

  it('rejects an unknown state', async () => {
    const error = await failure(INSERT_ITEM, [team, null, 'x', 'paused', teamBacklog, null])
    expect(error.code).toBe('22P02') // invalid_text_representation
  })
})

describe('sort keys', () => {
  it('compare by bytes in both tables', async () => {
    const { rows } = await client.query(`
      SELECT table_name, collation_name FROM information_schema.columns
      WHERE column_name = 'position' AND table_schema = 'public' ORDER BY table_name`)
    expect(rows).toEqual([
      { table_name: 'columns', collation_name: 'C' },
      { table_name: 'items', collation_name: 'C' },
    ])
    const sorted = await client.query(`
      SELECT position FROM (VALUES ('a0'::text COLLATE "C"), ('Zz'), ('a1')) AS keys (position) ORDER BY position`)
    expect(sorted.rows.map(row => row.position)).toEqual(['Zz', 'a0', 'a1'])
  })
})

describe('events', () => {
  const INSERT_EVENT = `
    INSERT INTO events (space_id, target_kind, target_id, actor_id, type)
    VALUES ($1, 'space', 'anything', $2, 'space.renamed')`

  it('can target anything, with or without a space', async () => {
    await client.query(INSERT_EVENT, [team, ada])
    await client.query(INSERT_EVENT, [null, ada])
  })

  it('keep their history after the target is deleted', async () => {
    const before = await client.query('SELECT count(*) FROM events WHERE target_id = $1', [fixtureId('item:team:team-name')])
    await client.query('DELETE FROM items WHERE id = $1', [fixtureId('item:team:team-name')])
    const after = await client.query('SELECT count(*) FROM events WHERE target_id = $1', [fixtureId('item:team:team-name')])
    expect(after.rows[0].count).toBe(before.rows[0].count)
  })

  it('reject an unknown actor or space', async () => {
    const unknown = fixtureId('nobody')
    expect((await failure(INSERT_EVENT, [team, unknown])).constraint).toBe('events_actor_fk')
    expect((await failure(INSERT_EVENT, [unknown, ada])).constraint).toBe('events_space_fk')
  })

  it.each(['UPDATE events SET type = \'x\'', 'DELETE FROM events', 'TRUNCATE events'])('reject %s', async (sql) => {
    const error = await failure(sql)
    expect(error.message).toMatch(/append-only/)
  })
})
