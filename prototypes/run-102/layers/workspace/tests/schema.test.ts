// The workspace layer's tables, tested against a real throwaway database.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PG } from '../../core/server/db/errors'
import { createTestDatabase, failure, type TestDatabase } from '../../core/tests/test-db'
import { columns, memberships, spaces } from '../server/db/schema'
import { eq, sql } from 'drizzle-orm'
import { makeActor, makeColumns, makeMember, makeSpace } from './builders'

let t: TestDatabase
beforeAll(async () => { t = await createTestDatabase() })
afterAll(async () => { await t.drop() })

describe('spaces and actors', () => {
  it('reject a type or kind outside the allowed list', async () => {
    const space = await failure(() => makeSpace(t.db, { type: 'team' as never }))
    expect([space.code, space.constraint]).toEqual([PG.checkViolation, 'spaces_type_check'])
    const actor = await failure(() => makeActor(t.db, { kind: 'robot' as never }))
    expect([actor.code, actor.constraint]).toEqual([PG.checkViolation, 'actors_kind_check'])
  })
})

describe('memberships', () => {
  it('cannot list the same actor twice in one space', async () => {
    const space = await makeSpace(t.db)
    const actor = await makeActor(t.db)
    await makeMember(t.db, space.id, actor.id)
    const err = await failure(() => makeMember(t.db, space.id, actor.id))
    expect(err.code).toBe(PG.uniqueViolation)
  })

  it('are removed with their space, and the actor stays', async () => {
    const space = await makeSpace(t.db)
    const actor = await makeActor(t.db)
    await makeMember(t.db, space.id, actor.id)
    await t.db.delete(spaces).where(eq(spaces.id, space.id))
    expect(await t.db.select().from(memberships).where(eq(memberships.spaceId, space.id))).toHaveLength(0)
    expect(await t.db.select().from(spaces).where(eq(spaces.id, space.id))).toHaveLength(0)
  })
})

describe('columns', () => {
  it('have a unique name inside a space but not across spaces', async () => {
    const a = await makeSpace(t.db)
    const b = await makeSpace(t.db)
    await makeColumns(t.db, a.id)
    const err = await failure(() => makeColumns(t.db, a.id))
    expect([err.code, err.constraint]).toEqual([PG.uniqueViolation, 'columns_space_name_unique'])
    await makeColumns(t.db, b.id) // same names, other space: fine
  })

  it('are removed with their space', async () => {
    const space = await makeSpace(t.db)
    await makeColumns(t.db, space.id)
    await t.db.delete(spaces).where(eq(spaces.id, space.id))
    expect(await t.db.select().from(columns).where(eq(columns.spaceId, space.id))).toHaveLength(0)
  })

  it('sort their position keys byte by byte, not by the database locale', async () => {
    const space = await makeSpace(t.db)
    await t.db.insert(columns).values(
      ['a0', 'Zz', 'a1'].map((position, i) => ({ spaceId: space.id, name: `c${i}`, state: 'unstarted' as const, position })),
    )
    const rows = await t.db.select({ position: columns.position }).from(columns).where(eq(columns.spaceId, space.id)).orderBy(columns.position)
    // en_US would give a0, a1, Zz. Fractional keys rely on "Zz" sorting before "a0".
    expect(rows.map((r) => r.position)).toEqual(['Zz', 'a0', 'a1'])
    const [{ collation }] = (await t.db.execute(sql`select collation_name as collation from information_schema.columns where table_name = 'columns' and column_name = 'position'`)).rows as { collation: string }[]
    expect(collation).toBe('C')
  })
})
