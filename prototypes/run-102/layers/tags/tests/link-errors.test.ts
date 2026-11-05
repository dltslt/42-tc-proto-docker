// setLink only answers "not found" for the one failure that means it (the item or tag was deleted after the
// checks), and lets every other failure through with its real status. Real connections, throwaway database.
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createDb, type Database } from '../../core/server/db/client'
import { ApiError } from '../../core/server/lib/errors'
import { registerModule, resetRegistry } from '../../core/server/lib/registry'
import { createTestDatabase, type TestDatabase } from '../../core/tests/test-db'
import { items } from '../../items/server/db/schema'
import { lockSpace } from '../../workspace/server/services/lock'
import { makeActor, makeColumns, makeMember, makeSpace } from '../../workspace/tests/builders'
import { tagEventTypes } from '../server/contracts'
import { tags } from '../server/db/schema'
import { setLink } from '../server/services/tags'

let t: TestDatabase
let holder: ReturnType<typeof createDb> // a second, independent connection pool
beforeAll(async () => {
  t = await createTestDatabase()
  holder = createDb(t.url)
  resetRegistry()
  registerModule({ name: 'tags', dependsOn: [], routes: [], eventTypes: tagEventTypes })
})
afterAll(async () => {
  await holder.pool.end()
  await t.drop()
})

async function setup() {
  const space = await makeSpace(t.db)
  const cols = await makeColumns(t.db, space.id)
  const ada = await makeActor(t.db)
  await makeMember(t.db, space.id, ada.id)
  const [item] = await t.db.insert(items).values({ spaceId: space.id, title: 'x', state: 'unstarted', columnId: cols.unstarted.id, position: 'a0' }).returning()
  const [tag] = await t.db.insert(tags).values({ spaceId: space.id, name: `t-${crypto.randomUUID().slice(0, 6)}` }).returning()
  return { space, actor: { id: ada.id, name: ada.name, kind: ada.kind }, item: item!, tag: tag! }
}

// Start `setLink`, wait until it is blocked on the space lock, run `whileBlocked` on the other connection,
// then let the lock go. This is the "deleted after the checks, before the write" window, made to happen on purpose.
async function raceWithDelete(linked: boolean, whileBlocked: (tx: Parameters<Parameters<Database['transaction']>[0]>[0], ids: Awaited<ReturnType<typeof setup>>) => Promise<unknown>) {
  const ids = await setup()
  let release!: () => void
  const held = new Promise<void>((resolve) => (release = resolve))
  let locked!: () => void
  const lockTaken = new Promise<void>((resolve) => (locked = resolve))
  const holding = holder.db.transaction(async (tx) => {
    await lockSpace(tx, ids.space.id)
    locked()
    await held
    await whileBlocked(tx, ids)
  })
  await lockTaken
  const attempt = setLink(t.db, ids.actor, ids.item.id, ids.tag.id, linked).then(() => undefined, (err: unknown) => err)
  // Wait until setLink really waits for the lock (pg_stat_activity shows a Lock wait), so the order is certain.
  for (let i = 0; i < 100; i++) {
    const rows = await t.db.execute(`select 1 from pg_stat_activity where datname = current_database() and wait_event_type = 'Lock' and query ilike '%pg_advisory_xact_lock%'` as never)
    if (rows.rows.length > 0) break
    await new Promise((resolve) => setTimeout(resolve, 20))
  }
  release()
  await holding
  return { ids, error: await attempt }
}

describe('a link whose item or tag is deleted just before the write', () => {
  it('answers 404 when the tag was deleted', async () => {
    const { error } = await raceWithDelete(true, (tx, ids) => tx.delete(tags).where(eq(tags.id, ids.tag.id)))
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })

  it('answers 404 when the item was deleted', async () => {
    const { error } = await raceWithDelete(true, (tx, ids) => tx.delete(items).where(eq(items.id, ids.item.id)))
    expect(error).toBeInstanceOf(ApiError)
    expect((error as ApiError).status).toBe(404)
  })
})

// A database handle whose transaction fails at the statement we pick, the way a dropped connection would.
function failingAt(real: Database, method: 'insert' | 'delete', error: Error): Database {
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop !== 'transaction') return Reflect.get(target, prop, receiver)
      return (fn: (tx: unknown) => Promise<unknown>) =>
        target.transaction((tx) =>
          fn(new Proxy(tx, {
            get(txTarget, txProp) {
              if (txProp === method) return () => { throw error }
              const value = Reflect.get(txTarget, txProp)
              return typeof value === 'function' ? value.bind(txTarget) : value
            },
          })),
        )
    },
  })
}

describe('any other failure keeps its real status', () => {
  const cases: [string, Error][] = [
    ['an admin shutdown (57P01)', Object.assign(new Error('terminating connection due to administrator command'), { code: '57P01' })],
    ['a deadlock (40P01)', Object.assign(new Error('deadlock detected'), { code: '40P01' })],
    ['a foreign key of another table (23503)', Object.assign(new Error('violates foreign key constraint'), { code: '23503', constraint: 'items_parent_same_space_fk' })],
    ['a plain network error', new Error('connect ECONNRESET')],
  ]
  for (const [name, error] of cases) {
    for (const [linked, method] of [[true, 'insert'], [false, 'delete']] as const) {
      it(`${linked ? 'link' : 'unlink'}: ${name} is rethrown, not turned into 404`, async () => {
        const ids = await setup()
        const failing = failingAt(t.db, method, error)
        await expect(setLink(failing, ids.actor, ids.item.id, ids.tag.id, linked)).rejects.toBe(error)
      })
    }
  }
})
