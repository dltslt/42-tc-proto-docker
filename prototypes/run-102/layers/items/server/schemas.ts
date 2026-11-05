// What the items routes accept and send back, plus the row-to-JSON mapping.
import { z } from 'zod'
import { PageParams } from '#layers/core/server/lib/pagination'
import { STATES } from '#layers/workspace/server/db/schema'
import { ITEM_TYPES, type Item } from './db/schema'

export const ItemSchema = z.object({
  id: z.uuid(),
  space_id: z.uuid(),
  parent_id: z.uuid().nullable(),
  type: z.enum(ITEM_TYPES),
  title: z.string(),
  description: z.string(),
  state: z.enum(STATES),
  column_id: z.uuid(),
  position: z.string(),
  lead_id: z.uuid().nullable(),
  version: z.number().int(),
  created_at: z.iso.datetime(),
  updated_at: z.iso.datetime(),
})

export const toItemDto = (i: Item): z.input<typeof ItemSchema> => ({
  id: i.id,
  space_id: i.spaceId,
  parent_id: i.parentId,
  type: i.type,
  title: i.title,
  description: i.description,
  state: i.state,
  column_id: i.columnId,
  position: i.position,
  lead_id: i.leadId,
  version: i.version,
  created_at: i.createdAt.toISOString(),
  updated_at: i.updatedAt.toISOString(),
})

export const SORTS = ['position', '-position', 'created_at', '-created_at'] as const

// Query string of GET /items. Every filter is optional except the space.
export const ListItemsQuery = PageParams.extend({
  space_id: z.uuid().describe('The space to list; the caller must be a member'),
  sort: z.enum(SORTS).default('position').describe('Sort order; a leading "-" reverses it. Ties are broken by id'),
  state: z.enum(STATES).optional(),
  type: z.enum(ITEM_TYPES).optional(),
  column_id: z.uuid().optional(),
  parent_id: z.union([z.uuid(), z.literal('null')]).optional().describe('Children of this item, or "null" for root items'),
  lead_id: z.uuid().optional(),
  q: z.string().trim().min(1).max(200).optional().describe('Case-insensitive text found in the title or description'),
})
export type ListItemsQuery = z.output<typeof ListItemsQuery>

// ---- Write requests. `strictObject` rejects fields the API does not know, so a typo is a 400, not a silent no-op.

// One line of plain text. `trim()` runs first, so "  " counts as empty.
const Title = z.string().trim().min(1).max(200).regex(/^[^\r\n]+$/, 'Must be a single line')
const Description = z.string().max(50_000).describe('Markdown')

export const CreateItemBody = z.strictObject({
  space_id: z.uuid().describe('The space to create the item in; the caller must be a member'),
  title: Title.describe('The only required field besides the space'),
  description: Description.optional(),
  type: z.enum(ITEM_TYPES).optional().describe('Default "task"'),
  parent_id: z.uuid().nullable().optional().describe('Omit or null for a root item'),
  column_id: z.uuid().optional().describe('Default: the first column of the requested state'),
  state: z.enum(STATES).optional().describe('Default "unstarted". Must match the column when both are given'),
  lead_id: z.uuid().nullable().optional().describe('An actor who is a member of the space'),
})
export type CreateItemBody = z.output<typeof CreateItemBody>

// Fields where two people can overwrite each other's work. Changing one needs `expected_version`.
export const VERSIONED_FIELDS = ['title', 'description', 'type', 'lead_id'] as const

export const PatchItemBody = z
  .strictObject({
    title: Title.optional(),
    description: Description.optional(),
    type: z.enum(ITEM_TYPES).optional(),
    lead_id: z.uuid().nullable().optional().describe('null clears the lead'),
    state: z.enum(STATES).optional().describe('Moves the item to the first column of that state. Last write wins; no version needed'),
    expected_version: z.number().int().min(1).optional().describe('The `version` you started from. Required with title, description, type or lead_id; a mismatch is a 409'),
  })
  .superRefine((body, ctx) => {
    const fields = Object.keys(body).filter((k) => k !== 'expected_version')
    if (fields.length === 0) ctx.addIssue({ code: 'custom', message: 'Send at least one field to change', path: [] })
    if (VERSIONED_FIELDS.some((f) => body[f] !== undefined) && body.expected_version === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Required when changing title, description, type or lead_id', path: ['expected_version'] })
    }
  })
export type PatchItemBody = z.output<typeof PatchItemBody>

export const MoveItemBody = z
  .strictObject({
    parent_id: z.uuid().nullable().optional().describe('The new parent; null makes it a root item; omit to keep the parent'),
    column_id: z.uuid().optional().describe('The new column (the item takes its state); omit to keep the column'),
    after_id: z.uuid().optional().describe('Place right after this sibling'),
    before_id: z.uuid().optional().describe('Place right before this sibling'),
  })
  .superRefine((body, ctx) => {
    if (Object.keys(body).length === 0) ctx.addIssue({ code: 'custom', message: 'Send parent_id, column_id, after_id or before_id', path: [] })
    if (body.after_id && body.before_id) ctx.addIssue({ code: 'custom', message: 'Send after_id or before_id, not both', path: ['before_id'] })
  })
export type MoveItemBody = z.output<typeof MoveItemBody>

export const DELETE_MODES = ['subtree', 'lift'] as const
export const DeleteItemQuery = z.object({
  mode: z.enum(DELETE_MODES).optional().describe('Needed when the item has children: "subtree" deletes them too, "lift" moves them up one level'),
})
export type DeleteItemQuery = z.output<typeof DeleteItemQuery>

export const DeleteResult = z.object({
  deleted_ids: z.array(z.uuid()),
  lifted_ids: z.array(z.uuid()).describe('Children that moved up one level (mode "lift")'),
})
