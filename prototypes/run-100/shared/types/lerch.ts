// Shared types: Nuxt 4 auto-imports everything under shared/types in BOTH the browser app and
// the Nitro server, so the API contract is declared once (like a header included by two binaries).
// Field names follow specs/data-foundation.md.
export type SpaceType = 'personal' | 'organization'
export type ActorKind = 'human' | 'agent'
export type ItemType = 'project' | 'epic' | 'story' | 'task'
export type ItemState = 'unstarted' | 'started' | 'done' | 'discarded'
export type ColumnKey = 'backlog' | 'in_progress' | 'done'

export interface Space { id: string; name: string; type: SpaceType; member_ids: string[] }
export interface Actor { id: string; name: string; kind: ActorKind; space_ids: string[] }

export interface Item {
  id: string
  space_id: string
  parent_id: string | null
  type: ItemType
  title: string
  description: string
  state: ItemState
  board_column: ColumnKey
  position: number
  lead_id: string | null
  created_at: string
  updated_at: string
}

export interface Roster { actors: Actor[]; spaces: Space[] }
