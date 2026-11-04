// Server-only script run by `pnpm db:seed` (via `make seed RUN=100`) inside the Node container.
// Plain Node, not Nitro: no auto-imports here, so dependencies are imported explicitly.
// Idempotent: DDL uses IF NOT EXISTS, every INSERT uses ON CONFLICT DO NOTHING.
import { getPool } from './utils/db'
import { SCHEMA_SQL } from './utils/schema'

const spaces = [
  ['space-acme', 'Acme Team', 'organization'],
  ['space-ada', "Ada's Space", 'personal'],
]

const actors = [
  ['actor-ada', 'Ada', 'human'],
  ['actor-ben', 'Ben', 'human'],
  ['actor-cleo', 'Cleo', 'human'],
  ['actor-lurch', 'Lurch (agent)', 'agent'],
]

const memberships = [
  ['space-acme', 'actor-ada'],
  ['space-acme', 'actor-ben'],
  ['space-acme', 'actor-cleo'],
  ['space-acme', 'actor-lurch'],
  ['space-ada', 'actor-ada'],
]

// [id, space, parent, type, title, description, state, column, position, lead]
// Parents are listed before children so the self-referencing foreign key is satisfied.
type Row = [string, string, string | null, string, string, string, string, string, number, string | null]
const items: Row[] = [
  ['item-web', 'space-acme', null, 'project', 'Website relaunch', 'Replace the old marketing site.', 'started', 'in_progress', 1000, 'actor-ada'],
  ['item-design', 'space-acme', 'item-web', 'epic', 'Design system', '', 'started', 'in_progress', 2000, 'actor-ben'],
  ['item-palette', 'space-acme', 'item-design', 'story', 'Color palette', '', 'done', 'done', 1000, 'actor-cleo'],
  ['item-components', 'space-acme', 'item-design', 'story', 'Component library', '', 'started', 'in_progress', 3000, 'actor-ben'],
  ['item-buttons', 'space-acme', 'item-components', 'task', 'Button variants', '', 'done', 'done', 2000, 'actor-ben'],
  ['item-inputs', 'space-acme', 'item-components', 'task', 'Form inputs', '', 'started', 'in_progress', 4000, 'actor-lurch'],
  ['item-validation', 'space-acme', 'item-inputs', 'task', 'Validation states', 'Subtask: error, warning, success.', 'unstarted', 'backlog', 1000, null],
  ['item-content', 'space-acme', 'item-web', 'epic', 'Content migration', '', 'unstarted', 'backlog', 2000, null],
  ['item-inventory', 'space-acme', 'item-content', 'task', 'Inventory old pages', '', 'unstarted', 'backlog', 3000, 'actor-cleo'],
  ['item-copy', 'space-acme', 'item-content', 'task', 'Write new copy', '', 'unstarted', 'backlog', 4000, null],
  ['item-typo', 'space-acme', null, 'task', 'Fix typo on login page', '', 'unstarted', 'backlog', 5000, null],
  ['item-dinner', 'space-ada', null, 'project', 'Dinner party', '', 'started', 'in_progress', 1000, 'actor-ada'],
  ['item-menu', 'space-ada', 'item-dinner', 'task', 'Choose the menu', '', 'done', 'done', 1000, 'actor-ada'],
  ['item-invites', 'space-ada', 'item-dinner', 'task', 'Send invitations', '', 'started', 'in_progress', 2000, 'actor-ada'],
  ['item-allergies', 'space-ada', 'item-invites', 'task', 'Ask about allergies', '', 'unstarted', 'backlog', 1000, null],
  ['item-knife', 'space-ada', 'item-dinner', 'task', 'Buy a bread knife', '', 'unstarted', 'backlog', 2000, null],
]

async function runSeed() {
  const pool = getPool()
  try {
    await pool.query(SCHEMA_SQL)

    for (const row of spaces) {
      await pool.query('INSERT INTO spaces (id, name, type) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', row)
    }
    for (const row of actors) {
      await pool.query('INSERT INTO actors (id, name, kind) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', row)
    }
    for (const row of memberships) {
      await pool.query('INSERT INTO memberships (space_id, actor_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', row)
    }
    for (const row of items) {
      await pool.query(
        `INSERT INTO items (id, space_id, parent_id, type, title, description, state, board_column, position, lead_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
        row,
      )
    }

    const { rows } = await pool.query('SELECT (SELECT count(*) FROM spaces) AS spaces, (SELECT count(*) FROM actors) AS actors, (SELECT count(*) FROM items) AS items')
    console.log('[seed] OK:', rows[0])
  } finally {
    await pool.end()
  }
}

runSeed().catch((err) => {
  console.error('[seed] Fatal error during seed execution:', err)
  process.exit(1)
})
