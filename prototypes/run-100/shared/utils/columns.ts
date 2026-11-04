// Shared util: Nuxt auto-imports exports from shared/utils in the app and in server code.
// Board columns group cards visually; each one *suggests* a lifecycle state but does not define it.
export const COLUMNS: { key: ColumnKey; label: string; state: ItemState }[] = [
  { key: 'backlog', label: 'Backlog', state: 'unstarted' },
  { key: 'in_progress', label: 'In progress', state: 'started' },
  { key: 'done', label: 'Done', state: 'done' },
]

export const ITEM_TYPES: ItemType[] = ['project', 'epic', 'story', 'task']
export const ITEM_STATES: ItemState[] = ['unstarted', 'started', 'done', 'discarded']

// Hierarchy hint for progressive creation: what a child of this type usually is.
export const CHILD_TYPE: Record<ItemType, ItemType> = {
  project: 'epic',
  epic: 'story',
  story: 'task',
  task: 'task', // task under task = subtask
}
