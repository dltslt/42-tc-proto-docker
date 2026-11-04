// Universal: plain values with no database code, safe to import in the server and the browser.
export const SPACE_TYPES = ['personal', 'organization'] as const
export const ACTOR_KINDS = ['human', 'agent'] as const
export const ITEM_STATES = ['unstarted', 'started', 'done', 'discarded'] as const

export type ItemState = (typeof ITEM_STATES)[number]
