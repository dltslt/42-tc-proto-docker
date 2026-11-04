// Input validation at the API boundary. Types in the browser are erased at runtime, so every
// request body/query is untrusted until zod has parsed it (think: validating a read() buffer).
import { z } from 'zod'

const title = z.string().trim().min(1, 'must not be empty').max(200, 'max 200 characters')
const id = z.string().min(1).max(100)

export const listQuery = z.object({ space_id: id })

export const createBody = z.object({
  space_id: id,
  title,
  parent_id: id.nullish(),
  type: z.enum(ITEM_TYPES).optional(),
  board_column: z.enum(COLUMN_KEYS).optional(),
})

export const patchBody = z.object({
  title: title.optional(),
  description: z.string().max(10_000).optional(),
  type: z.enum(ITEM_TYPES).optional(),
  state: z.enum(ITEM_STATES).optional(),
  board_column: z.enum(COLUMN_KEYS).optional(),
  before_id: id.optional(), // drop position: place the item right before this one
  lead_id: id.nullable().optional(),
  parent_id: id.nullable().optional(), // reparent; null makes the item a root
}).strict().refine(p => Object.keys(p).length > 0, 'nothing to update')

// Turns a zod failure into an HTTP 400 with a readable message (instead of a 500).
export function parse<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input)
  if (!result.success) {
    const message = result.error.issues
      .map(i => (i.path.length ? `${i.path.join('.')}: ${i.message}` : i.message))
      .join('; ')
    throw createError({ statusCode: 400, message })
  }
  return result.data
}
