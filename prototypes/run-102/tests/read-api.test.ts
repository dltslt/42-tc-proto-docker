// The read API as a client sees it, over HTTP, against the seeded demo database (see global-setup.ts).
// Ids come from the seed's fixtureId, so these tests know exactly what should be there.
import { describe, expect, it } from 'vitest'
import { ErrorBodySchema } from '#layers/core/server/lib/errors'
import { api, apiAs } from '#layers/core/tests/http'
import { fixtureId, itemFixtures } from '../server/seed/fixtures'

const ada = fixtureId('ada')
const cleo = fixtureId('cleo')
const lurch = fixtureId('lurch')
const dinner = fixtureId('dinner')
const studio = fixtureId('studio')
const dinnerItems = itemFixtures.filter((i) => i.space === 'dinner')

type Item = { id: string; title: string; space_id: string; position: string; state: string }
const titles = (body: { data: { title: string }[] }) => body.data.map((i) => i.title).sort()

// Follow next_cursor to the end and return everything that came back, in order.
async function walk(actor: string, query: string) {
  const all: Item[] = []
  let cursor = ''
  for (let guard = 0; guard < 50; guard++) {
    const { status, body } = await apiAs(actor, `/items?${query}${cursor}`)
    expect(status).toBe(200)
    all.push(...body.data)
    if (!body.next_cursor) return all
    cursor = `&cursor=${body.next_cursor}`
  }
  throw new Error('pagination did not end')
}

describe('who is calling', () => {
  const routes = ['/spaces', `/spaces/${dinner}/columns`, `/items?space_id=${dinner}`, `/items/${fixtureId('host-dinner')}`]

  it('answers 401 in the error shape when no actor is sent', async () => {
    for (const path of routes) {
      const { status, body } = await apiAs(undefined, path)
      expect(status, path).toBe(401)
      expect(ErrorBodySchema.parse(body).error.code).toBe('unauthenticated')
    }
  })

  it('answers 401 for an unknown or malformed actor id', async () => {
    for (const bad of [crypto.randomUUID(), 'not-a-uuid', '1; drop table actors']) {
      expect((await apiAs(bad, '/spaces')).status, bad).toBe(401)
    }
  })

  it('does not ask for an actor on the open routes', async () => {
    for (const path of ['', '/health', '/openapi.json', '/actors']) expect((await api(path)).status, path).toBe(200)
  })
})

describe('GET /actors', () => {
  it('lists the actors so a client can choose who to act as', async () => {
    const { body } = await api('/actors')
    expect(body.data.map((a: { name: string }) => a.name)).toEqual(['Ada', 'Ben', 'Cleo', 'Lurch'])
    expect(body.data.find((a: { name: string }) => a.name === 'Lurch').kind).toBe('agent')
    expect(body.next_cursor).toBeNull()
  })
})

describe('GET /spaces', () => {
  it('shows each actor only the spaces they belong to', async () => {
    const names = async (actor: string) => (await apiAs(actor, '/spaces')).body.data.map((s: { name: string }) => s.name)
    expect(await names(ada)).toEqual(['Ada', 'Dinner party'])
    expect(await names(cleo)).toEqual(['Cleo', 'Studio'])
    expect(await names(lurch)).toEqual(['Dinner party']) // an agent is an actor like any other
  })
})

describe('GET /spaces/:id/columns', () => {
  it('returns the four columns in board order', async () => {
    const { status, body } = await apiAs(ada, `/spaces/${dinner}/columns`)
    expect(status).toBe(200)
    expect(body.data.map((c: { state: string }) => c.state)).toEqual(['unstarted', 'started', 'done', 'discarded'])
  })

  it('refuses a space the actor is not in (403) and answers 404 for an unknown one', async () => {
    expect((await apiAs(ada, `/spaces/${studio}/columns`)).status).toBe(403)
    expect((await apiAs(ada, `/spaces/${crypto.randomUUID()}/columns`)).status).toBe(404)
    expect((await apiAs(ada, '/spaces/nope/columns')).status).toBe(400)
  })
})

describe('space isolation', () => {
  it('never shows items of one space in another, and refuses the attempt', async () => {
    const { body } = await apiAs(ada, `/items?space_id=${dinner}&limit=200`)
    expect(body.data).toHaveLength(dinnerItems.length)
    expect(body.data.every((i: Item) => i.space_id === dinner)).toBe(true)

    expect((await apiAs(ada, `/items?space_id=${studio}`)).status).toBe(403)
    expect((await apiAs(ada, `/items/${fixtureId('pick-photos')}`)).status).toBe(403)
    expect((await apiAs(cleo, `/items/${fixtureId('pick-photos')}`)).status).toBe(200)
    // Ben is in Dinner party but not in Ada's personal space
    expect((await apiAs(fixtureId('ben'), `/items/${fixtureId('renew-passport')}`)).status).toBe(403)
  })
})

describe('GET /items/:id', () => {
  it('returns one item with every field of the contract', async () => {
    const { status, body } = await apiAs(ada, `/items/${fixtureId('buy-wine')}`)
    expect(status).toBe(200)
    expect(body).toMatchObject({
      title: 'Buy wine', type: 'task', state: 'unstarted', description: '', version: 1,
      space_id: dinner, parent_id: fixtureId('shop'), lead_id: ada,
    })
    expect(Object.keys(body).sort()).toEqual(
      ['column_id', 'created_at', 'description', 'id', 'lead_id', 'parent_id', 'position', 'space_id', 'state', 'title', 'type', 'updated_at', 'version'],
    )
  })

  it('answers 404 for an unknown id and 400 for a malformed one', async () => {
    expect((await apiAs(ada, `/items/${crypto.randomUUID()}`)).status).toBe(404)
    expect((await apiAs(ada, '/items/nope')).status).toBe(400)
  })
})

describe('GET /items: filters', () => {
  const list = async (extra: string) => (await apiAs(ada, `/items?space_id=${dinner}&limit=200&${extra}`)).body

  it('filters by state, type, lead, column and parent', async () => {
    expect(titles(await list('state=done'))).toEqual(['Choose a starter', 'Send the invitations'])
    expect(titles(await list('type=story'))).toEqual(['Do the shopping', 'Plan the menu'])
    expect(titles(await list(`lead_id=${ada}`))).toEqual(['Buy wine', 'Host the dinner', 'Send the invitations'])
    expect(titles(await list(`column_id=${fixtureId('dinner:discarded')}`))).toEqual(['Add a fish course'])
    expect(titles(await list('parent_id=null'))).toEqual(['Host the dinner'])
    expect(titles(await list(`parent_id=${fixtureId('shop')}`))).toEqual(['Buy vegetables', 'Buy wine'])
  })

  it('searches the title and description without regard to case, and combines with filters', async () => {
    expect(titles(await list('q=WINE'))).toEqual(['Buy wine'])
    expect(titles(await list('q=weeknight'))).toEqual(['Add a fish course']) // found in the description
    expect(titles(await list('q=buy&state=unstarted'))).toEqual(['Buy vegetables', 'Buy wine'])
    expect((await list('q=%25')).data).toEqual([]) // a literal %, not a wildcard
  })

  it('returns discarded items too: hiding them is the client\'s choice', async () => {
    expect((await list('')).data.some((i: Item) => i.state === 'discarded')).toBe(true)
  })
})

describe('GET /items: pagination and sorting', () => {
  it('visits every item exactly once, whatever the page size or sort', async () => {
    for (const sort of ['position', '-position', 'created_at', '-created_at']) {
      for (const limit of [1, 3, 4, 200]) {
        const all = await walk(ada, `space_id=${dinner}&limit=${limit}&sort=${sort}`)
        expect(all, `${sort} limit ${limit}`).toHaveLength(dinnerItems.length)
        expect(new Set(all.map((i) => i.id)).size).toBe(dinnerItems.length)
      }
    }
  })

  it('sorts by position, and the reverse sort is exactly the reverse', async () => {
    const asc = await walk(ada, `space_id=${dinner}&sort=position&limit=4`)
    const desc = await walk(ada, `space_id=${dinner}&sort=-position&limit=4`)
    expect(asc.map((i) => i.position)).toEqual([...asc.map((i) => i.position)].sort())
    expect(desc.map((i) => i.id)).toEqual([...asc.map((i) => i.id)].reverse())
  })

  it('returns next_cursor only while there is more', async () => {
    const small = await apiAs(ada, `/items?space_id=${dinner}&limit=2`)
    expect(small.body.data).toHaveLength(2)
    expect(typeof small.body.next_cursor).toBe('string')
    const exact = await apiAs(ada, `/items?space_id=${dinner}&limit=${dinnerItems.length}`)
    expect(exact.body.next_cursor).toBeNull()
  })
})

describe('GET /items: invalid input is a 400, never a 500', () => {
  const bad: [string, string][] = [
    ['no space_id', ''],
    ['space_id not a uuid', 'space_id=nope'],
    ['limit 0', `space_id=${dinner}&limit=0`],
    ['limit too large', `space_id=${dinner}&limit=201`],
    ['limit not a number', `space_id=${dinner}&limit=ten`],
    ['unknown sort', `space_id=${dinner}&sort=title`],
    ['unknown state', `space_id=${dinner}&state=blocked`],
    ['parent_id not a uuid', `space_id=${dinner}&parent_id=root`],
    ['empty q', `space_id=${dinner}&q=`],
    ['forged cursor', `space_id=${dinner}&cursor=forged`],
    ['repeated parameter', `space_id=${dinner}&state=done&state=started`],
  ]
  it.each(bad)('%s', async (_name, query) => {
    const { status, body } = await apiAs(ada, `/items?${query}`)
    expect(status).toBe(400)
    const parsed = ErrorBodySchema.parse(body)
    expect(parsed.error.code).toBe('invalid_input')
    expect(Object.keys(parsed.error.fields).length).toBeGreaterThan(0)
  })

  it('names the field to blame', async () => {
    const { body } = await apiAs(ada, `/items?space_id=${dinner}&limit=0&state=blocked`)
    expect(Object.keys(body.error.fields).sort()).toEqual(['query.limit', 'query.state'])
  })

  it('rejects a cursor made for another sort order', async () => {
    const first = await apiAs(ada, `/items?space_id=${dinner}&limit=2&sort=position`)
    const { status } = await apiAs(ada, `/items?space_id=${dinner}&sort=-position&cursor=${first.body.next_cursor}`)
    expect(status).toBe(400)
  })
})

describe('the contract', () => {
  it('lists the read routes with their security and error responses', async () => {
    const { body } = await api('/openapi.json')
    expect(Object.keys(body.paths)).toEqual(
      expect.arrayContaining(['/actors', '/spaces', '/spaces/{id}/columns', '/items', '/items/{id}']),
    )
    const items = body.paths['/items'].get
    expect(items.security).toEqual([{ ActorHeader: [] }])
    expect(Object.keys(items.responses)).toEqual(['200', '400', '401', '403', '404'])
    expect(body.paths['/actors'].get.security).toBeUndefined()
    const names = items.parameters.map((p: { name: string }) => p.name)
    expect(names).toEqual(expect.arrayContaining(['space_id', 'state', 'parent_id', 'q', 'limit', 'cursor', 'sort']))
  })

  it('lists the layers with the actions each one checks', async () => {
    const { body } = await api('')
    const byName = Object.fromEntries(body.modules.map((m: { name: string; actions: string[] }) => [m.name, m.actions]))
    expect(byName.items).toEqual(['item.list', 'item.read'])
    expect(byName.workspace).toEqual(['space.list', 'column.list'])
    expect(byName.core).toEqual([])
  })
})
