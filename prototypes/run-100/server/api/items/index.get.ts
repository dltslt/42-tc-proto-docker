// File-based routing: server/api/items/index.get.ts registers GET /api/items?space_id=...
export default defineEventHandler(async (event) => {
  const { space_id } = parse(listQuery, getQuery(event))
  const actorId = await requireMember(event, space_id)
  if (!can({ id: actorId }, 'item:read', { space_id })) throw createError({ statusCode: 403 })
  return listItems(space_id)
})
