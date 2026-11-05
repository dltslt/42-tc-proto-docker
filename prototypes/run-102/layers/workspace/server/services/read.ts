// Read services for actors, spaces and columns. Server-only. Each takes the database handle first,
// so a route passes the shared pool and a test passes a throwaway database.
import { eq, and, sql } from 'drizzle-orm'
import { keysetAfter, keysetOrder, type Keyset } from '#layers/core/server/db/keyset'
import { decodeCursor, toPage } from '#layers/core/server/lib/pagination'
import { actors, columns, memberships, spaces } from '../db/schema'
import { toActorDto, toColumnDto, toSpaceDto } from '../schemas'
import type { Db } from './identity'

export interface ListQuery<S extends string> {
  limit: number
  cursor?: string
  sort: S
}

const direction = (sort: string) => (sort.startsWith('-') ? ('desc' as const) : ('asc' as const))

export async function listActors(db: Db, q: ListQuery<'name' | '-name'>) {
  const keyset: Keyset = { key: actors.name, keyText: sql<string>`${actors.name}`, cast: 'text', id: actors.id, dir: direction(q.sort) }
  const rows = await db
    .select({ row: actors, k: keyset.keyText })
    .from(actors)
    .where(keysetAfter(keyset, decodeCursor(q.cursor, q.sort)))
    .orderBy(...keysetOrder(keyset))
    .limit(q.limit + 1)
  return toPage(rows, q.limit, q.sort, (r) => toActorDto(r.row), (r) => [r.k, r.row.id])
}

// Only the spaces this actor is a member of.
export async function listSpacesOf(db: Db, actorId: string, q: ListQuery<'name' | '-name'>) {
  const keyset: Keyset = { key: spaces.name, keyText: sql<string>`${spaces.name}`, cast: 'text', id: spaces.id, dir: direction(q.sort) }
  const rows = await db
    .select({ row: spaces, k: keyset.keyText })
    .from(spaces)
    .innerJoin(memberships, eq(memberships.spaceId, spaces.id))
    .where(and(eq(memberships.actorId, actorId), keysetAfter(keyset, decodeCursor(q.cursor, q.sort))))
    .orderBy(...keysetOrder(keyset))
    .limit(q.limit + 1)
  return toPage(rows, q.limit, q.sort, (r) => toSpaceDto(r.row), (r) => [r.k, r.row.id])
}

// The caller has already been checked for access to the space (requireSpaceAccess).
export async function listColumns(db: Db, spaceId: string, q: ListQuery<'position' | '-position'>) {
  const keyset: Keyset = { key: columns.position, keyText: sql<string>`${columns.position}`, cast: 'text', id: columns.id, dir: direction(q.sort) }
  const rows = await db
    .select({ row: columns, k: keyset.keyText })
    .from(columns)
    .where(and(eq(columns.spaceId, spaceId), keysetAfter(keyset, decodeCursor(q.cursor, q.sort))))
    .orderBy(...keysetOrder(keyset))
    .limit(q.limit + 1)
  return toPage(rows, q.limit, q.sort, (r) => toColumnDto(r.row), (r) => [r.k, r.row.id])
}
