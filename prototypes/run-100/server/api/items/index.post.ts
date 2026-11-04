// POST /api/items: progressive creation, `space_id` + `title` is the minimum body.
export default defineEventHandler(async (event) => {
  const body = parse(createBody, await readBody(event))
  const actorId = await requireMember(event, body.space_id)
  if (!can({ id: actorId }, 'item:create', body)) throw createError({ statusCode: 403 })
  setResponseStatus(event, 201)
  return createItem(body)
})
