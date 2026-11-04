// File-based routing: the [id] folder-name syntax becomes a route param (PATCH /api/items/:id).
export default defineEventHandler(async (event) => {
  const patch = parse(patchBody, await readBody(event))
  const item = await findItem(getRouterParam(event, 'id') ?? '')
  const actorId = getActorId(event)
  // Answer 404 (not 403) for foreign spaces so ids from other spaces are not revealed.
  if (!item || !(await isMember(actorId, item.space_id))) {
    throw createError({ statusCode: 404, message: 'Item not found' })
  }
  if (!can({ id: actorId }, 'item:update', item)) throw createError({ statusCode: 403 })
  return updateItem(item, patch)
})
