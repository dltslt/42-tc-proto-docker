// Identity and the workspace read services, against a throwaway database with controlled data.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ApiError } from '../../core/server/lib/errors'
import { createTestDatabase, type TestDatabase } from '../../core/tests/test-db'
import { findActor, requireSpaceAccess } from '../server/services/identity'
import { listActors, listColumns, listSpacesOf } from '../server/services/read'
import { makeActor, makeColumns, makeMember, makeSpace } from './builders'

let t: TestDatabase
beforeAll(async () => { t = await createTestDatabase() })
afterAll(async () => { await t.drop() })

const statusOf = async (run: () => Promise<unknown>) => {
  try {
    await run()
  } catch (err) {
    if (err instanceof ApiError) return err.status
    throw err
  }
  return 200
}

describe('findActor', () => {
  it('returns the actor named by the header', async () => {
    const ada = await makeActor(t.db, { name: 'Ada' })
    expect(await findActor(t.db, ada.id)).toEqual({ id: ada.id, name: 'Ada', kind: 'human' })
  })

  it('answers 401 for a missing, malformed or unknown id, never a 500', async () => {
    expect(await statusOf(() => findActor(t.db, undefined))).toBe(401)
    expect(await statusOf(() => findActor(t.db, ''))).toBe(401)
    expect(await statusOf(() => findActor(t.db, 'not-a-uuid'))).toBe(401)
    expect(await statusOf(() => findActor(t.db, "'; drop table actors; --"))).toBe(401)
    expect(await statusOf(() => findActor(t.db, crypto.randomUUID()))).toBe(401)
  })
})

describe('requireSpaceAccess', () => {
  it('lets a member in, refuses a non-member (403) and an unknown space (404)', async () => {
    const space = await makeSpace(t.db)
    const member = await makeActor(t.db)
    const outsider = await makeActor(t.db)
    await makeMember(t.db, space.id, member.id)
    expect((await requireSpaceAccess(t.db, member.id, space.id)).id).toBe(space.id)
    expect(await statusOf(() => requireSpaceAccess(t.db, outsider.id, space.id))).toBe(403)
    expect(await statusOf(() => requireSpaceAccess(t.db, member.id, crypto.randomUUID()))).toBe(404)
  })
})

describe('listSpacesOf', () => {
  it('lists only the spaces the actor belongs to, by name, and pages through them', async () => {
    const me = await makeActor(t.db)
    const other = await makeActor(t.db)
    for (const name of ['Delta', 'Alpha', 'Charlie', 'Bravo']) await makeMember(t.db, (await makeSpace(t.db, { name })).id, me.id)
    await makeMember(t.db, (await makeSpace(t.db, { name: 'Secret' })).id, other.id)

    const first = await listSpacesOf(t.db, me.id, { limit: 3, sort: 'name' })
    expect(first.data.map((s) => s.name)).toEqual(['Alpha', 'Bravo', 'Charlie'])
    const second = await listSpacesOf(t.db, me.id, { limit: 3, sort: 'name', cursor: first.next_cursor! })
    expect(second.data.map((s) => s.name)).toEqual(['Delta'])
    expect(second.next_cursor).toBeNull()
    const reversed = await listSpacesOf(t.db, me.id, { limit: 10, sort: '-name' })
    expect(reversed.data.map((s) => s.name)).toEqual(['Delta', 'Charlie', 'Bravo', 'Alpha'])
  })
})

describe('listActors', () => {
  it('pages through every actor exactly once', async () => {
    const seen: string[] = []
    let cursor: string | undefined
    do {
      const page = await listActors(t.db, { limit: 2, sort: 'name', cursor })
      seen.push(...page.data.map((a) => a.id))
      cursor = page.next_cursor ?? undefined
    } while (cursor)
    expect(new Set(seen).size).toBe(seen.length)
    expect(seen.length).toBeGreaterThanOrEqual(3)
  })
})

describe('listColumns', () => {
  it('returns the columns of one space in board order', async () => {
    const space = await makeSpace(t.db)
    await makeColumns(t.db, space.id)
    await makeColumns(t.db, (await makeSpace(t.db)).id)
    const page = await listColumns(t.db, space.id, { limit: 50, sort: 'position' })
    expect(page.data.map((c) => c.state)).toEqual(['unstarted', 'started', 'done', 'discarded'])
    expect(page.data.every((c) => c.space_id === space.id)).toBe(true)
  })
})
