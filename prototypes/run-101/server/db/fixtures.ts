// Server-only: the starting data for this run. Run by the seed script and by the tests, never by the app.
import { createHash } from 'node:crypto'
import { generateNKeysBetween } from 'fractional-indexing'
import type { Queryable } from '../../layers/core/server/db/client'
import { events, type EventChanges } from '../../layers/core/server/db/schema'
import { items } from '../../layers/items/server/db/schema'
import type { ItemType } from '../../layers/items/shared/items'
import { actors, columns, memberships, spaces } from '../../layers/workspace/server/db/schema'
import type { ItemState } from '../../layers/workspace/shared/workspace'

// The same name always gives the same id, which is what lets a second seed recognise its rows.
// The version and variant bits make it a valid UUID v5, because zod's uuid check rejects other values.
export function fixtureId(name: string): string {
  const hash = createHash('sha1').update(`lerch-run-101:${name}`).digest().subarray(0, 16)
  hash[6] = (hash[6]! & 0x0f) | 0x50
  hash[8] = (hash[8]! & 0x3f) | 0x80
  const hex = hash.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

interface ColumnFixture { slug: string, name: string, state: ItemState }

interface ItemFixture {
  slug: string
  title: string
  column: string
  type?: ItemType
  lead?: string
  description?: string
  children?: ItemFixture[]
}

interface SpaceFixture {
  slug: string
  name: string
  type: 'personal' | 'organization'
  members: string[]
  columns: ColumnFixture[]
  items: ItemFixture[]
}

const ACTORS = [
  { slug: 'ada', name: 'Ada', kind: 'human' },
  { slug: 'ben', name: 'Ben', kind: 'human' },
  { slug: 'cleo', name: 'Cleo', kind: 'human' },
  { slug: 'lurch', name: 'Lurch', kind: 'agent' },
] as const

const DEFAULT_COLUMNS: ColumnFixture[] = [
  { slug: 'backlog', name: 'Backlog', state: 'unstarted' },
  { slug: 'in-progress', name: 'In progress', state: 'started' },
  { slug: 'done', name: 'Done', state: 'done' },
  { slug: 'discarded', name: 'Discarded', state: 'discarded' },
]

const SPACES: SpaceFixture[] = [
  {
    slug: 'team',
    name: 'Lerch Team',
    type: 'organization',
    members: ['ada', 'ben', 'lurch'],
    // A custom column: two columns can map to the same state.
    columns: [
      DEFAULT_COLUMNS[0]!,
      DEFAULT_COLUMNS[1]!,
      { slug: 'review', name: 'Review', state: 'started' },
      DEFAULT_COLUMNS[2]!,
      DEFAULT_COLUMNS[3]!,
    ],
    items: [
      {
        slug: 'foundation',
        title: 'Build the foundation',
        type: 'project',
        column: 'in-progress',
        lead: 'ada',
        children: [
          {
            slug: 'backend',
            title: 'Backend',
            type: 'epic',
            column: 'in-progress',
            lead: 'ben',
            children: [
              {
                slug: 'items-api',
                title: 'Items API',
                type: 'story',
                column: 'in-progress',
                lead: 'ben',
                children: [
                  { slug: 'list-route', title: 'List route', column: 'done', lead: 'lurch' },
                  {
                    slug: 'move-route',
                    title: 'Move route',
                    column: 'in-progress',
                    lead: 'ben',
                    // A task under a task is a subtask.
                    children: [{ slug: 'cycle-check', title: 'Reject cycles', column: 'backlog' }],
                  },
                ],
              },
              { slug: 'migrations', title: 'Write the migrations', column: 'done', lead: 'lurch' },
            ],
          },
          {
            slug: 'interface',
            title: 'Interface',
            type: 'epic',
            column: 'backlog',
            children: [
              { slug: 'board-view', title: 'Board view', column: 'review', lead: 'ada' },
              { slug: 'tree-view', title: 'Tree view', column: 'backlog' },
              { slug: 'old-mockups', title: 'Clean up old mockups', column: 'discarded' },
            ],
          },
        ],
      },
      {
        slug: 'guide',
        title: 'Write the onboarding guide',
        column: 'in-progress',
        lead: 'ada',
        description: 'Explain how to start the stack and where each feature lives.',
      },
      { slug: 'team-name', title: 'Pick a team name', column: 'backlog' },
    ],
  },
  {
    slug: 'dinner',
    name: 'Dinner Club',
    type: 'organization',
    members: ['ada', 'cleo'],
    columns: DEFAULT_COLUMNS,
    items: [
      {
        slug: 'friday',
        title: 'Friday dinner',
        type: 'project',
        column: 'in-progress',
        lead: 'cleo',
        children: [
          { slug: 'bread', title: 'Buy bread', column: 'done', lead: 'ada' },
          { slug: 'knife', title: 'Sharpen the bread knife', column: 'in-progress', lead: 'cleo' },
          { slug: 'table', title: 'Book a table', column: 'discarded' },
        ],
      },
    ],
  },
  {
    slug: 'ada-personal',
    name: 'Ada personal',
    type: 'personal',
    members: ['ada'],
    columns: DEFAULT_COLUMNS,
    items: [{ slug: 'passport', title: 'Renew passport', column: 'backlog', lead: 'ada' }],
  },
  {
    slug: 'ben-personal',
    name: 'Ben personal',
    type: 'personal',
    members: ['ben'],
    columns: DEFAULT_COLUMNS,
    items: [{ slug: 'bike', title: 'Fix the bike', column: 'in-progress', lead: 'ben' }],
  },
]

function itemRows(space: SpaceFixture) {
  const rows: (typeof items.$inferInsert)[] = []
  const stateOf = new Map(space.columns.map(column => [column.slug, column.state]))

  // Parents are pushed first. Each group of siblings gets its own sort keys.
  const visit = (siblings: ItemFixture[], parentId: string | null) => {
    const keys = generateNKeysBetween(null, null, siblings.length)
    siblings.forEach((fixture, index) => {
      const id = fixtureId(`item:${space.slug}:${fixture.slug}`)
      rows.push({
        id,
        spaceId: fixtureId(`space:${space.slug}`),
        parentId,
        type: fixture.type ?? 'task',
        title: fixture.title,
        description: fixture.description ?? '',
        // State comes from the column, so a fixture cannot disagree with it.
        state: stateOf.get(fixture.column)!,
        columnId: fixtureId(`column:${space.slug}:${fixture.column}`),
        position: keys[index]!,
        leadId: fixture.lead ? fixtureId(`actor:${fixture.lead}`) : null,
      })
      visit(fixture.children ?? [], id)
    })
  }
  visit(space.items, null)
  return rows
}

export interface SeedResult { spaces: number, actors: number, memberships: number, columns: number, items: number }

// Takes an open transaction from the caller. ON CONFLICT DO NOTHING keeps rows that already exist, so a second
// run inserts nothing and keeps any edits. A fixture deleted through the app comes back, with a new event.
export async function seedFixtures(tx: Queryable): Promise<SeedResult> {
  const result: SeedResult = { spaces: 0, actors: 0, memberships: 0, columns: 0, items: 0 }

  const newActors = await tx.insert(actors)
    .values(ACTORS.map(({ slug, ...actor }) => ({ id: fixtureId(`actor:${slug}`), ...actor })))
    .onConflictDoNothing().returning({ id: actors.id })
  result.actors = newActors.length

  for (const space of SPACES) {
    const spaceId = fixtureId(`space:${space.slug}`)

    const newSpaces = await tx.insert(spaces)
      .values({ id: spaceId, name: space.name, type: space.type })
      .onConflictDoNothing().returning({ id: spaces.id })
    result.spaces += newSpaces.length

    const newMemberships = await tx.insert(memberships)
      .values(space.members.map(member => ({ spaceId, actorId: fixtureId(`actor:${member}`) })))
      .onConflictDoNothing().returning({ actorId: memberships.actorId })
    result.memberships += newMemberships.length

    const columnKeys = generateNKeysBetween(null, null, space.columns.length)
    const newColumns = await tx.insert(columns)
      .values(space.columns.map((column, index) => ({
        id: fixtureId(`column:${space.slug}:${column.slug}`),
        spaceId,
        name: column.name,
        state: column.state,
        position: columnKeys[index]!,
      })))
      .onConflictDoNothing().returning({ id: columns.id })
    result.columns += newColumns.length

    const newItems = await tx.insert(items).values(itemRows(space)).onConflictDoNothing().returning()
    result.items += newItems.length

    // Events are written only for items this run really inserted, so a second run adds none.
    if (newItems.length > 0) {
      await tx.insert(events).values(newItems.map(item => ({
        spaceId,
        targetKind: 'item',
        targetId: item.id,
        actorId: fixtureId('actor:lurch'),
        type: 'item.created',
        changes: createdChanges(item),
      })))
    }
  }
  return result
}

function createdChanges(item: typeof items.$inferSelect): EventChanges {
  const { title, description, type, state, columnId, parentId, position, leadId } = item
  const fields = { title, description, type, state, column_id: columnId, parent_id: parentId, position, lead_id: leadId }
  return Object.fromEntries(Object.entries(fields).map(([field, value]) => [field, { old: null, new: value }]))
}
