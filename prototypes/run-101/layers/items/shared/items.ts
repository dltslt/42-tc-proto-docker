// Universal: plain values with no database code, safe to import in the server and the browser.
export const ITEM_TYPES = ['project', 'epic', 'story', 'task'] as const

export type ItemType = (typeof ITEM_TYPES)[number]
