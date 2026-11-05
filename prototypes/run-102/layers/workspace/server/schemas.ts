// What the workspace routes send back: Zod schemas (the contract) and the functions that turn
// database rows into them. JSON is snake_case with ISO 8601 times; rows are camelCase with Dates.
import { z } from 'zod'
import { ACTOR_KINDS, SPACE_TYPES, STATES, type Actor, type Column, type Space } from './db/schema'

const times = { created_at: z.iso.datetime(), updated_at: z.iso.datetime() }

export const ActorSchema = z.object({ id: z.uuid(), name: z.string(), kind: z.enum(ACTOR_KINDS), ...times })
export const SpaceSchema = z.object({ id: z.uuid(), name: z.string(), type: z.enum(SPACE_TYPES), ...times })
export const ColumnSchema = z.object({
  id: z.uuid(),
  space_id: z.uuid(),
  name: z.string(),
  state: z.enum(STATES),
  position: z.string(),
  ...times,
})

type Dto<S extends z.ZodType> = z.input<S>
const iso = (d: Date) => d.toISOString()

export const toActorDto = (a: Actor): Dto<typeof ActorSchema> => ({
  id: a.id, name: a.name, kind: a.kind, created_at: iso(a.createdAt), updated_at: iso(a.updatedAt),
})
export const toSpaceDto = (s: Space): Dto<typeof SpaceSchema> => ({
  id: s.id, name: s.name, type: s.type, created_at: iso(s.createdAt), updated_at: iso(s.updatedAt),
})
export const toColumnDto = (c: Column): Dto<typeof ColumnSchema> => ({
  id: c.id, space_id: c.spaceId, name: c.name, state: c.state, position: c.position,
  created_at: iso(c.createdAt), updated_at: iso(c.updatedAt),
})
