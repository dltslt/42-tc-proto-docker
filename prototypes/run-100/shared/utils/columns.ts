// Shared util: Nuxt auto-imports exports from shared/utils in the app and in server code.
// Board columns group cards visually; each one *suggests* a lifecycle state but does not define it.
export const COLUMNS: { key: ColumnKey; label: string; state: ItemState }[] = [
  { key: 'backlog', label: 'Backlog', state: 'unstarted' },
  { key: 'in_progress', label: 'In progress', state: 'started' },
  { key: 'done', label: 'Done', state: 'done' },
]

// `as const` keeps these as literal tuples so zod (server) and USelect (browser) can both consume them.
export const ITEM_TYPES = ['project', 'epic', 'story', 'task'] as const
export const ITEM_STATES = ['unstarted', 'started', 'done', 'discarded'] as const
export const COLUMN_KEYS = ['backlog', 'in_progress', 'done'] as const

// Hierarchy hint for progressive creation: what a child of this type usually is.
export const CHILD_TYPE: Record<ItemType, ItemType> = {
  project: 'epic',
  epic: 'story',
  story: 'task',
  task: 'task', // task under task = subtask
}
