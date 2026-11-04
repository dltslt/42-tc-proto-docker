// Product stubs (see AGENTS.md "Product Stubs"): business policy lives here, isolated from
// routes and SQL, so a real rule can replace each stub without touching anything else.
// `COLUMNS` and the types come from shared/ (auto-imported by Nitro).

export type Action = 'item:read' | 'item:create' | 'item:update' | 'item:delete'

// Permission check. Default: allow all. Real roles (admin/member) would be decided here.
export function can(_actor: { id: string }, _action: Action, _resource: unknown): boolean {
  return true
}

// Ordering policy: "what to show next". Default: board column order, then manual position.
export function orderItems(items: Item[]): Item[] {
  const rank = (i: Item) => COLUMNS.findIndex(c => c.key === i.board_column)
  return [...items].sort((a, b) => rank(a) - rank(b) || a.position - b.position)
}

// Default column placement for new items: the first column whose state is `unstarted`.
export function defaultColumn(): ColumnKey {
  return COLUMNS.find(c => c.state === 'unstarted')!.key
}

// A column suggests a state ...
export function stateForColumn(column: ColumnKey): ItemState {
  return COLUMNS.find(c => c.key === column)!.state
}

// ... and a state suggests a column. `discarded` has no column of its own, so it stays put.
export function columnForState(state: ItemState, current: ColumnKey): ColumnKey {
  return COLUMNS.find(c => c.state === state)?.key ?? current
}
