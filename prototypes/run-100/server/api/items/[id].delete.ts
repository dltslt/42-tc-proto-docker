// DELETE /api/items/:id removes the item and everything below it (the DB cascades along parent_id).
export default defineEventHandler(async (event) => {
  const item = await findItem(getRouterParam(event, 'id') ?? '')
  const actorId = getActorId(event)
  if (!item || !(await isMember(actorId, item.space_id))) {
    throw createError({ statusCode: 404, message: 'Item not found' })
  }
  if (!can({ id: actorId }, 'item:delete', item)) throw createError({ statusCode: 403 })
  return { deleted: await deleteItem(item.id) }
})
