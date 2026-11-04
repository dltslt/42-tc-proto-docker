// No real authentication yet: the browser's "current user" selector sends the persona id in
// the `x-actor-id` header. Swapping in sessions/JWT later only changes `getActorId`.
import type { H3Event } from 'h3'

export function getActorId(event: H3Event): string {
  const id = getHeader(event, 'x-actor-id')
  if (!id) throw createError({ statusCode: 401, message: 'Missing x-actor-id header' })
  return id
}

export async function isMember(actorId: string, spaceId: string): Promise<boolean> {
  const { rowCount } = await getPool().query(
    'SELECT 1 FROM memberships WHERE actor_id = $1 AND space_id = $2',
    [actorId, spaceId],
  )
  return (rowCount ?? 0) > 0
}

// Space isolation: every route that touches a space goes through here.
export async function requireMember(event: H3Event, spaceId: string): Promise<string> {
  const actorId = getActorId(event)
  if (!(await isMember(actorId, spaceId))) {
    throw createError({ statusCode: 403, message: 'Not a member of this space' })
  }
  return actorId
}
