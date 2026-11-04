// Idempotent DDL (every statement is IF NOT EXISTS), executed by `server/seed.ts`.
// Baseline entities from specs/data-foundation.md: spaces, actors, memberships, items (+ parent_id hierarchy).
// Ids are text: seed fixtures use readable slugs, runtime inserts use UUIDs.
export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS spaces (
  id   text PRIMARY KEY,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('personal', 'organization'))
);

CREATE TABLE IF NOT EXISTS actors (
  id   text PRIMARY KEY,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('human', 'agent'))
);

CREATE TABLE IF NOT EXISTS memberships (
  space_id text NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES actors(id) ON DELETE CASCADE,
  PRIMARY KEY (space_id, actor_id)
);

CREATE TABLE IF NOT EXISTS items (
  id           text PRIMARY KEY,
  space_id     text NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
  parent_id    text REFERENCES items(id) ON DELETE CASCADE,
  type         text NOT NULL DEFAULT 'task' CHECK (type IN ('project', 'epic', 'story', 'task')),
  title        text NOT NULL,
  description  text NOT NULL DEFAULT '',
  state        text NOT NULL DEFAULT 'unstarted' CHECK (state IN ('unstarted', 'started', 'done', 'discarded')),
  board_column text NOT NULL DEFAULT 'backlog',
  position     double precision NOT NULL DEFAULT 0,
  lead_id      text REFERENCES actors(id) ON DELETE SET NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS items_space_idx  ON items (space_id);
CREATE INDEX IF NOT EXISTS items_parent_idx ON items (parent_id);
`
