// Who is calling, and which spaces they may see. Server-only.
// `getActor` is the ONLY place that knows how a caller is identified. Today it reads a header that
// anyone can set, so it is not security. Real login or API keys replace this one function.
import { eq, and } from 'drizzle-orm'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { getDb, type Database, type Tx } from '#layers/core/server/db/client'
import type { ActorRef } from '#layers/core/server/lib/actor'
import { forbidden, notFound, unauthenticated } from '#layers/core/server/lib/errors'
import { actors, memberships, spaces, type Space } from '../db/schema'

export type Db = Database | Tx

// The database half of getActor, so tests can call it without an HTTP request.
export async function findActor(db: Db, header: string | undefined): Promise<ActorRef> {
  if (!header) throw unauthenticated()
  // Check the shape first: Postgres answers a malformed uuid with an error, which would become a 500.
  if (!z.uuid().safeParse(header).success) throw unauthenticated('X-Actor-Id is not a valid actor id')
  const [row] = await db.select().from(actors).where(eq(actors.id, header))
  if (!row) throw unauthenticated('Unknown actor')
  return { id: row.id, name: row.name, kind: row.kind }
}

// Plugged into core at server start (see plugins/workspace.module.ts).
export function getActor(event: H3Event): Promise<ActorRef> {
  // Nitro auto-import (h3): reads a request header
  return findActor(getDb(), getHeader(event, 'x-actor-id'))
}

// Space isolation: an actor only touches spaces they are a member of. This is a data rule the services
// always enforce, separate from can(), which is the policy hook.
// 404 for a space that does not exist, 403 for one that does but is not theirs. The difference tells a
// caller that a space id exists; the brief asks for 403 here, so that is the trade-off taken.
export async function requireSpaceAccess(db: Db, actorId: string, spaceId: string): Promise<Space> {
  const [space] = await db.select().from(spaces).where(eq(spaces.id, spaceId))
  if (!space) throw notFound('Space not found')
  const [member] = await db
    .select({ actorId: memberships.actorId })
    .from(memberships)
    .where(and(eq(memberships.spaceId, spaceId), eq(memberships.actorId, actorId)))
  if (!member) throw forbidden('You are not a member of this space')
  return space
}
