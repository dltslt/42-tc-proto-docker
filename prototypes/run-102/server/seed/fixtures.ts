// Demo data for the seed. Plain data, no database calls.
// Every row has a readable slug. `fixtureId` turns a slug into the same uuid every time, which is
// what lets the seed run again without creating duplicates.
import { createHash } from 'node:crypto'

// Name-based uuid (the idea of uuid v5): the same slug always gives the same id.
export function fixtureId(slug: string): string {
  const hex = createHash('sha1').update(`lerch-run-102:${slug}`).digest('hex')
  const variant = ((parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80).toString(16)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-${variant}${hex.slice(18, 20)}-${hex.slice(20, 32)}`
}

export const actorFixtures = [
  { slug: 'ada', name: 'Ada', kind: 'human' },
  { slug: 'ben', name: 'Ben', kind: 'human' },
  { slug: 'cleo', name: 'Cleo', kind: 'human' },
  { slug: 'lurch', name: 'Lurch', kind: 'agent' },
] as const

// `members` come first-to-last; the first member is recorded as the creator in the event log.
export const spaceFixtures = [
  { slug: 'ada-personal', name: 'Ada', type: 'personal', members: ['ada'] },
  { slug: 'ben-personal', name: 'Ben', type: 'personal', members: ['ben'] },
  { slug: 'cleo-personal', name: 'Cleo', type: 'personal', members: ['cleo'] },
  { slug: 'dinner', name: 'Dinner party', type: 'organization', members: ['ada', 'ben', 'lurch'] },
  { slug: 'studio', name: 'Studio', type: 'organization', members: ['cleo'] },
] as const

// Every space gets one column per state, so any item can be created or moved to any state.
export const columnFixtures = [
  { name: 'Backlog', state: 'unstarted' },
  { name: 'In progress', state: 'started' },
  { name: 'Done', state: 'done' },
  { name: 'Discarded', state: 'discarded' },
] as const

type ItemFixture = {
  slug: string
  space: string
  parent?: string
  type: 'project' | 'epic' | 'story' | 'task'
  title: string
  state: 'unstarted' | 'started' | 'done' | 'discarded'
  lead?: string
  description?: string
}

// Parents come before their children. Siblings are ordered as they appear here.
export const itemFixtures: ItemFixture[] = [
  { slug: 'host-dinner', space: 'dinner', type: 'project', title: 'Host the dinner', state: 'started', lead: 'ada', description: 'Saturday, eight guests.' },
  { slug: 'plan-menu', space: 'dinner', parent: 'host-dinner', type: 'story', title: 'Plan the menu', state: 'started', lead: 'ben' },
  { slug: 'choose-starter', space: 'dinner', parent: 'plan-menu', type: 'task', title: 'Choose a starter', state: 'done' },
  { slug: 'choose-main', space: 'dinner', parent: 'plan-menu', type: 'task', title: 'Choose a main course', state: 'started', lead: 'ben' },
  { slug: 'dessert-idea', space: 'dinner', parent: 'plan-menu', type: 'task', title: 'Find a dessert idea', state: 'unstarted' },
  { slug: 'fish-course', space: 'dinner', parent: 'plan-menu', type: 'task', title: 'Add a fish course', state: 'discarded', description: 'Too risky for a weeknight.' },
  { slug: 'shop', space: 'dinner', parent: 'host-dinner', type: 'story', title: 'Do the shopping', state: 'unstarted' },
  { slug: 'buy-wine', space: 'dinner', parent: 'shop', type: 'task', title: 'Buy wine', state: 'unstarted', lead: 'ada' },
  { slug: 'buy-vegetables', space: 'dinner', parent: 'shop', type: 'task', title: 'Buy vegetables', state: 'unstarted' },
  { slug: 'set-table', space: 'dinner', parent: 'host-dinner', type: 'task', title: 'Set the table', state: 'unstarted', lead: 'lurch' },
  { slug: 'send-invitations', space: 'dinner', parent: 'host-dinner', type: 'task', title: 'Send the invitations', state: 'done', lead: 'ada' },

  { slug: 'renew-passport', space: 'ada-personal', type: 'task', title: 'Renew passport', state: 'unstarted' },
  { slug: 'book-dentist', space: 'ada-personal', type: 'task', title: 'Book the dentist', state: 'started' },

  { slug: 'learn-sourdough', space: 'ben-personal', type: 'project', title: 'Learn to bake sourdough', state: 'unstarted' },
  { slug: 'feed-starter', space: 'ben-personal', parent: 'learn-sourdough', type: 'task', title: 'Feed the starter daily', state: 'started' },

  { slug: 'plan-holiday', space: 'cleo-personal', type: 'task', title: 'Plan the summer holiday', state: 'unstarted' },

  { slug: 'launch-site', space: 'studio', type: 'project', title: 'Launch the new website', state: 'started', lead: 'cleo' },
  { slug: 'write-copy', space: 'studio', parent: 'launch-site', type: 'task', title: 'Write the landing page copy', state: 'unstarted' },
  { slug: 'pick-photos', space: 'studio', parent: 'launch-site', type: 'task', title: 'Pick the photos', state: 'unstarted' },
]
