// Server-only: column types shared by the schemas of several layers.
import { customType } from 'drizzle-orm/pg-core'

// Fractional sort key: inserting between two rows creates a new key, so a move rewrites only the moved row.
// COLLATE "C" compares bytes like strcmp(). A language collation would sort "a0" before "Zz" and break the order.
export const sortKey = customType<{ data: string }>({
  dataType: () => 'text COLLATE "C"',
})
