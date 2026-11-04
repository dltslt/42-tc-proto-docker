// Server-only Nitro script: runs inside the Node container
// Programmatic contract: executed via `pnpm db:seed`
// Seeds PostgreSQL and MongoDB with identical domain entities and rich educational fixtures

import pg from 'pg'
import { MongoClient } from 'mongodb'

// Helpers to get DB configuration
function getConfig() {
  const user = process.env.DB_USER || 'lerch'
  const pass = process.env.DB_PASSWORD || 'lerch_secret'
  const pgHost = process.env.POSTGRES_HOST || 'postgres'
  const pgPort = process.env.POSTGRES_PORT || '5432'
  const mongoHost = process.env.MONGO_HOST || 'mongo'
  const mongoPort = process.env.MONGO_PORT || '27017'
  const dbName = process.env.DB_NAME || 'proto_run_500'

  return {
    pgUrl: process.env.POSTGRES_URL || `postgresql://${user}:${pass}@${pgHost}:${pgPort}/${dbName}`,
    mongoUrl: process.env.MONGO_URL || `mongodb://${user}:${pass}@${mongoHost}:${mongoPort}/${dbName}?authSource=admin`,
    dbName,
  }
}

interface FixtureItem {
  id: string
  spaceId: string
  title: string
  parentId: string | null
  state: 'unstarted' | 'started' | 'done' | 'discarded'
  position: number
  depth: number
  tags: string[]
  description: string
}

const spaces = [
  {
    id: 'space-db-fundamentals',
    name: 'Database Fundamentals',
    type: 'organization',
    description: 'Hardware boundaries, disk I/O, memory hierarchy, indexing algorithms, and ACID guarantees.',
  },
  {
    id: 'space-sql-mechanics',
    name: 'PostgreSQL Relational Mechanics',
    type: 'organization',
    description: 'Postgres internal architecture: heap pages, slotted tuples, MVCC, joins, and recursive CTEs.',
  },
  {
    id: 'space-nosql-mechanics',
    name: 'MongoDB Document Mechanics',
    type: 'organization',
    description: 'Document database mechanics: BSON serialized trees, embedded vs referenced relations, and aggregation pipelines.',
  },
]

const actors = [
  { id: 'actor-system', name: 'Antigravity Tutor', kind: 'agent' },
  { id: 'actor-dev', name: 'Systems Engineer', kind: 'human' },
]

const tags = [
  { id: 'architecture', name: 'architecture', color: 'blue' },
  { id: 'memory-layout', name: 'memory-layout', color: 'emerald' },
  { id: 'disk-io', name: 'disk-io', color: 'amber' },
  { id: 'traversal', name: 'traversal', color: 'purple' },
  { id: 'acid-transactions', name: 'acid-transactions', color: 'rose' },
  { id: 'document-model', name: 'document-model', color: 'cyan' },
  { id: 'relational-model', name: 'relational-model', color: 'indigo' },
  { id: 'nosql', name: 'nosql', color: 'teal' },
  { id: 'sql', name: 'sql', color: 'violet' },
]

const items: FixtureItem[] = [
  // -------------------------------------------------------------
  // SPACE 1: Database Fundamentals
  // -------------------------------------------------------------
  {
    id: 'item-db-root',
    spaceId: 'space-db-fundamentals',
    title: 'Database Storage Engine Fundamentals',
    parentId: null,
    state: 'started',
    position: 0,
    depth: 0,
    tags: ['architecture', 'memory-layout', 'disk-io'],
    description:
      'In C and systems engineering, data storage is governed by the hardware memory hierarchy: CPU registers (~1 cycle), L1-L3 caches (~4-40 cycles), DRAM (~100-200 cycles), and NVMe/SSD storage (~10,000 to 100,000 cycles). A database engine is essentially a specialized virtual memory manager designed to maximize sequential I/O and cache hits while ensuring durability across crashes.',
  },
  {
    id: 'item-db-memory',
    spaceId: 'space-db-fundamentals',
    title: 'Memory Hierarchy & Disk Pages',
    parentId: 'item-db-root',
    state: 'done',
    position: 0,
    depth: 1,
    tags: ['memory-layout', 'disk-io'],
    description:
      'Databases do not read or write single variables or structs. Both PostgreSQL and MongoDB chunk all disk I/O into fixed-size pages (typically 4KB, 8KB, or 16KB). When a query requests a single row or document, the entire page containing that record is transferred into DRAM.',
  },
  {
    id: 'item-db-pages',
    spaceId: 'space-db-fundamentals',
    title: 'Disk Blocks, OS Page Cache & Page Faults',
    parentId: 'item-db-memory',
    state: 'done',
    position: 0,
    depth: 2,
    tags: ['disk-io', 'memory-layout'],
    description:
      'In C terms, think of the database buffer pool as a custom mmap() or LRU ring buffer over raw storage. If a queried page is already in the buffer pool, retrieval is a DRAM pointer read (nanoseconds). If not, a synchronous page fault occurs, stalling the thread until the NVMe/SATA controller fills the buffer.',
  },
  {
    id: 'item-db-ram-cost',
    spaceId: 'space-db-fundamentals',
    title: 'Sequential vs Random I/O Cost',
    parentId: 'item-db-memory',
    state: 'done',
    position: 1,
    depth: 2,
    tags: ['disk-io'],
    description:
      'Sequential disk reads allow the storage controller and OS read-ahead algorithms to prefetch contiguous sectors. Random reads (e.g. following scattered pointers across fragmented pages) destroy cache lines and increase read amplification.',
  },
  {
    id: 'item-db-indexing',
    spaceId: 'space-db-fundamentals',
    title: 'Core Index Structures (B-Tree vs LSM)',
    parentId: 'item-db-root',
    state: 'started',
    position: 1,
    depth: 1,
    tags: ['architecture', 'memory-layout'],
    description:
      'An index is an auxiliary data structure built to reduce O(N) full-table scans to O(log N) or O(1). The two dominant structures in modern databases are B+ Trees and Log-Structured Merge (LSM) Trees.',
  },
  {
    id: 'item-db-btree',
    spaceId: 'space-db-fundamentals',
    title: 'B+ Tree (Postgres & MongoDB Default)',
    parentId: 'item-db-indexing',
    state: 'done',
    position: 0,
    depth: 2,
    tags: ['architecture', 'disk-io'],
    description:
      'A self-balancing N-ary search tree optimized for systems reading large blocks of memory. Unlike a binary search tree (std::map), B+ tree nodes contain hundreds of keys matching disk block boundaries (high fanout), keeping tree depth to 3 or 4 even for millions of rows. Leaf nodes form a doubly linked list for O(1) sequential range scans.',
  },
  {
    id: 'item-db-lsm',
    spaceId: 'space-db-fundamentals',
    title: 'LSM-Trees (Write-Optimized Storage)',
    parentId: 'item-db-indexing',
    state: 'unstarted',
    position: 1,
    depth: 2,
    tags: ['architecture', 'disk-io'],
    description:
      'Used by RocksDB, Cassandra, and SQLite4. All writes are appended sequentially to an in-memory MemTable (skip list or red-black tree) and a WAL. When full, MemTables are flushed to disk as immutable sorted string tables (SSTables). Reads require checking multiple levels with Bloom filters.',
  },
  {
    id: 'item-db-acid',
    spaceId: 'space-db-fundamentals',
    title: 'Transaction Guarantees: ACID vs BASE',
    parentId: 'item-db-root',
    state: 'started',
    position: 2,
    depth: 1,
    tags: ['acid-transactions'],
    description:
      'ACID is a pessimistic, strict invariant contract ensuring every operation maintains total system consistency across failures. BASE embraces distributed network partitions (CAP theorem) by sacrificing immediate consistency for high availability.',
  },
  {
    id: 'item-db-acid-def',
    spaceId: 'space-db-fundamentals',
    title: 'ACID Guarantees Explained in Systems Terms',
    parentId: 'item-db-acid',
    state: 'done',
    position: 0,
    depth: 2,
    tags: ['acid-transactions'],
    description:
      'Atomicity: All writes commit or abort cleanly (all-or-nothing rollback). Consistency: Data satisfies all schema constraints and foreign keys. Isolation: Concurrent transactions cannot observe partial intermediate states (implemented via lock managers or MVCC). Durability: Committed writes survive power loss via fsync() on write-ahead logs.',
  },
  {
    id: 'item-db-base-def',
    spaceId: 'space-db-fundamentals',
    title: 'BASE: Eventual Consistency Trade-offs',
    parentId: 'item-db-acid',
    state: 'unstarted',
    position: 1,
    depth: 2,
    tags: ['acid-transactions', 'nosql'],
    description:
      'Basically Available, Soft state, Eventual consistency. Instead of holding distributed locks across network clusters, writes accept immediate local acknowledgement and asynchronously replicate. Temporary stale reads are allowed in exchange for zero write stalls.',
  },

  // -------------------------------------------------------------
  // SPACE 2: PostgreSQL Relational Mechanics
  // -------------------------------------------------------------
  {
    id: 'item-sql-root',
    spaceId: 'space-sql-mechanics',
    title: 'PostgreSQL Relational Storage Architecture',
    parentId: null,
    state: 'started',
    position: 0,
    depth: 0,
    tags: ['architecture', 'sql', 'memory-layout'],
    description:
      'PostgreSQL models data as mathematical relations (tables) composed of typed tuples (rows). In C terms, a table is conceptually an array of uniform structs whose fields are strictly defined at compile-time (DDL). Physical storage separates schema definitions (catalogs) from row data (heap files).',
  },
  {
    id: 'item-sql-tuples',
    spaceId: 'space-sql-mechanics',
    title: 'Row Layout: Heap Pages & Slotted Tuples',
    parentId: 'item-sql-root',
    state: 'done',
    position: 0,
    depth: 1,
    tags: ['memory-layout', 'sql'],
    description:
      'In Postgres, an 8KB page begins with a PageHeaderData struct, followed by an array of itemId pointers growing forward from the top. The actual row tuples grow backward from the end of the page. An item pointer (ctid = page_number, offset) acts as a direct memory pointer to the tuple bytes.',
  },
  {
    id: 'item-sql-mvcc',
    spaceId: 'space-sql-mechanics',
    title: 'MVCC: Multi-Version Concurrency Control',
    parentId: 'item-sql-tuples',
    state: 'done',
    position: 0,
    depth: 2,
    tags: ['memory-layout', 'acid-transactions', 'sql'],
    description:
      'Every tuple header contains xmin (transaction that created it) and xmax (transaction that updated or deleted it). UPDATE in Postgres never modifies bytes in-place: it inserts a brand new tuple with a new xmin and marks the old tuple with xmax. Dead tuples remain until the VACUUM worker reclaims their disk space.',
  },
  {
    id: 'item-sql-relations',
    spaceId: 'space-sql-mechanics',
    title: 'Normalization: Eliminating Redundancy',
    parentId: 'item-sql-root',
    state: 'done',
    position: 1,
    depth: 1,
    tags: ['architecture', 'sql'],
    description:
      'Relational normalization (1NF, 2NF, 3NF) splits complex entities into discrete tables so that any fact is recorded exactly once. Tags do not live on the item: an items table and tags table are connected via an item_tags junction table (two foreign keys).',
  },
  {
    id: 'item-sql-fkeys',
    spaceId: 'space-sql-mechanics',
    title: 'Foreign Keys: Pointer Integrity at the Engine Level',
    parentId: 'item-sql-relations',
    state: 'done',
    position: 0,
    depth: 2,
    tags: ['sql', 'acid-transactions'],
    description:
      'In C, a dangling pointer causes segmentation faults or undefined behavior. In SQL, a Foreign Key constraint instructs the database engine to reject any INSERT or DELETE that would produce a dangling reference. This safety check requires index lookups on the target table during write operations.',
  },
  {
    id: 'item-sql-joins',
    spaceId: 'space-sql-mechanics',
    title: 'Join Algorithms: Rebuilding Objects at Query Time',
    parentId: 'item-sql-root',
    state: 'started',
    position: 2,
    depth: 1,
    tags: ['architecture', 'sql', 'traversal'],
    description:
      'Because normalized data is fragmented across tables, reading a composite object requires joining tables together at runtime. The PostgreSQL query planner selects between three fundamental C algorithms: Nested Loop, Hash Join, and Merge Join.',
  },
  {
    id: 'item-sql-nested-loop',
    spaceId: 'space-sql-mechanics',
    title: 'Nested Loop & Hash Join Execution',
    parentId: 'item-sql-joins',
    state: 'done',
    position: 0,
    depth: 2,
    tags: ['sql', 'memory-layout'],
    description:
      'Nested Loop: For each row in outer table, scan inner table via index (O(M * log N)). Hash Join: Allocates an in-memory hash table for the smaller table using work_mem, then streams the larger table probing the hash table (O(M + N)). If work_mem is exceeded, hash partitions spill to disk.',
  },
  {
    id: 'item-sql-cte',
    spaceId: 'space-sql-mechanics',
    title: 'Recursive CTE: Tree Traversal in SQL',
    parentId: 'item-sql-root',
    state: 'started',
    position: 3,
    depth: 1,
    tags: ['traversal', 'sql'],
    description:
      'Hierarchies in SQL use self-referencing parent_id columns. To traverse an entire branch (e.g. all subtasks of an epic), PostgreSQL uses WITH RECURSIVE. The engine creates an internal queue (the Working Table) and loops until no new descendants match, assembling the tree in a single query.',
  },

  // -------------------------------------------------------------
  // SPACE 3: MongoDB Document Mechanics
  // -------------------------------------------------------------
  {
    id: 'item-mongo-root',
    spaceId: 'space-nosql-mechanics',
    title: 'MongoDB Document Storage Architecture',
    parentId: null,
    state: 'started',
    position: 0,
    depth: 0,
    tags: ['architecture', 'nosql', 'memory-layout'],
    description:
      'MongoDB is a document database storing data as BSON (Binary JSON). Unlike relational tables where every row must adhere to a fixed column schema, MongoDB collections store polymorphic documents. A single document can contain nested sub-documents, dynamic maps, and arrays.',
  },
  {
    id: 'item-mongo-bson',
    spaceId: 'space-nosql-mechanics',
    title: 'BSON: Binary JSON Internal Memory Layout',
    parentId: 'item-mongo-root',
    state: 'done',
    position: 0,
    depth: 1,
    tags: ['memory-layout', 'nosql'],
    description:
      'BSON is not plain text JSON. It is a lightweight binary protocol where each field begins with an element type byte, a null-terminated UTF-8 field name, and the binary value payload. Numbers are stored as native IEEE 754 doubles or 32/64-bit signed integers, avoiding string parsing overhead.',
  },
  {
    id: 'item-mongo-wiredtiger',
    spaceId: 'space-nosql-mechanics',
    title: 'WiredTiger Storage Engine: Cache & Snappy Compression',
    parentId: 'item-mongo-bson',
    state: 'done',
    position: 0,
    depth: 2,
    tags: ['disk-io', 'memory-layout', 'nosql'],
    description:
      'MongoDB uses the WiredTiger engine. Data is stored on disk with Snappy or zlib compression, reducing I/O bandwidth. In DRAM, documents are unpacked into native memory structures. WiredTiger uses hazard pointers and lock-free concurrent skip lists for high-throughput multi-threaded operations.',
  },
  {
    id: 'item-mongo-embed-vs-ref',
    spaceId: 'space-nosql-mechanics',
    title: 'Data Modeling: Embedding vs Referencing',
    parentId: 'item-mongo-root',
    state: 'started',
    position: 1,
    depth: 1,
    tags: ['architecture', 'nosql'],
    description:
      'The core modeling decision in NoSQL: Do related entities live inside the document as an embedded array (Composition / Value Object), or do they reference other documents by ID (Pointer / Association)?',
  },
  {
    id: 'item-mongo-embed',
    spaceId: 'space-nosql-mechanics',
    title: 'Embedding: Zero-Join Single Disk Seeks',
    parentId: 'item-mongo-embed-vs-ref',
    state: 'done',
    position: 0,
    depth: 2,
    tags: ['memory-layout', 'nosql', 'disk-io'],
    description:
      'In C, embedding is like putting a struct array directly inside another struct (struct Item { Tag tags[4]; }). When you read an item from disk, its tags and metadata are loaded in the exact same contiguous disk read. There are ZERO joins and ZERO auxiliary index lookups. Drawback: Document size limit is 16MB.',
  },
  {
    id: 'item-mongo-ref',
    spaceId: 'space-nosql-mechanics',
    title: 'Referencing: Handling M-to-N Associations',
    parentId: 'item-mongo-embed-vs-ref',
    state: 'done',
    position: 1,
    depth: 2,
    tags: ['architecture', 'nosql'],
    description:
      'When data grows unboundedly (thousands of comments or audit logs), embedding causes document bloat and frequent disk reallocations. Referencing stores ObjectIds instead. Reading referenced entities requires multiple application queries or MongoDB $lookup aggregation stages (simulating left outer joins).',
  },
  {
    id: 'item-mongo-atomicity',
    spaceId: 'space-nosql-mechanics',
    title: 'Atomicity: Single-Document vs Multi-Document',
    parentId: 'item-mongo-root',
    state: 'started',
    position: 2,
    depth: 1,
    tags: ['acid-transactions', 'nosql'],
    description:
      'In MongoDB, writes to a single document are strictly atomic. Because an item and its tags/blockers can be embedded in one document, you achieve ACID-like consistency for composite operations without distributed transaction overhead. Multi-document transactions are supported since v4.0, but cost performance.',
  },
  {
    id: 'item-mongo-traversal',
    spaceId: 'space-nosql-mechanics',
    title: 'Hierarchical Traversal: $graphLookup Pipeline',
    parentId: 'item-mongo-root',
    state: 'started',
    position: 3,
    depth: 1,
    tags: ['traversal', 'nosql'],
    description:
      'To traverse parent-child relationships in MongoDB without manual application-level recursion, the aggregation pipeline provides $graphLookup. It performs a breadth-first search across documents matching connectFromField and connectToField, accumulating the entire tree into an array in a single query.',
  },
]

async function seedPostgres(url: string) {
  const pool = new pg.Pool({ connectionString: url })
  const client = await pool.connect()
  try {
    console.log('[seed] Initializing PostgreSQL schema in proto_run_500...')

    await client.query(`
      CREATE TABLE IF NOT EXISTS spaces (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(32) NOT NULL DEFAULT 'organization',
        description TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS actors (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        kind VARCHAR(32) NOT NULL DEFAULT 'human',
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS items (
        id VARCHAR(64) PRIMARY KEY,
        space_id VARCHAR(64) NOT NULL REFERENCES spaces(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        description TEXT,
        parent_id VARCHAR(64) REFERENCES items(id) ON DELETE SET NULL,
        state VARCHAR(32) NOT NULL DEFAULT 'unstarted',
        position INTEGER NOT NULL DEFAULT 0,
        depth INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS tags (
        id VARCHAR(64) PRIMARY KEY,
        name VARCHAR(64) NOT NULL UNIQUE,
        color VARCHAR(32) NOT NULL DEFAULT 'blue'
      );

      CREATE TABLE IF NOT EXISTS item_tags (
        item_id VARCHAR(64) NOT NULL REFERENCES items(id) ON DELETE CASCADE,
        tag_id VARCHAR(64) NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (item_id, tag_id)
      );

      CREATE INDEX IF NOT EXISTS idx_items_space_id ON items(space_id);
      CREATE INDEX IF NOT EXISTS idx_items_parent_id ON items(parent_id);
      CREATE INDEX IF NOT EXISTS idx_item_tags_tag_id ON item_tags(tag_id);
    `)

    // Seed Spaces idempotently
    for (const space of spaces) {
      await client.query(
        `INSERT INTO spaces (id, name, type, description)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description`,
        [space.id, space.name, space.type, space.description]
      )
    }

    // Seed Actors idempotently
    for (const actor of actors) {
      await client.query(
        `INSERT INTO actors (id, name, kind)
         VALUES ($1, $2, $3)
         ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name`,
        [actor.id, actor.name, actor.kind]
      )
    }

    // Seed Tags idempotently
    for (const tag of tags) {
      await client.query(
        `INSERT INTO tags (id, name, color)
         VALUES ($1, $2, $3)
         ON CONFLICT (name) DO UPDATE SET id = EXCLUDED.id, color = EXCLUDED.color`,
        [tag.id, tag.name, tag.color]
      )
    }

    // Seed Items idempotently (inserting roots first, then children by depth)
    const sortedItems = [...items].sort((a, b) => a.depth - b.depth)
    for (const item of sortedItems) {
      await client.query(
        `INSERT INTO items (id, space_id, title, description, parent_id, state, position, depth)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         ON CONFLICT (id) DO UPDATE SET
           title = EXCLUDED.title,
           description = EXCLUDED.description,
           parent_id = EXCLUDED.parent_id,
           state = EXCLUDED.state,
           position = EXCLUDED.position,
           depth = EXCLUDED.depth,
           updated_at = NOW()`,
        [item.id, item.spaceId, item.title, item.description, item.parentId, item.state, item.position, item.depth]
      )

      // Relational join table: item_tags
      for (const tagId of item.tags) {
        await client.query(
          `INSERT INTO item_tags (item_id, tag_id)
           VALUES ($1, $2)
           ON CONFLICT (item_id, tag_id) DO NOTHING`,
          [item.id, tagId]
        )
      }
    }

    console.log(`[seed] PostgreSQL seeded: ${spaces.length} spaces, ${tags.length} tags, ${items.length} items.`)
  } finally {
    client.release()
    await pool.end()
  }
}

async function seedMongo(url: string, dbName: string) {
  const client = new MongoClient(url)
  try {
    await client.connect()
    const db = client.db(dbName)
    console.log('[seed] Initializing MongoDB collections in proto_run_500...')

    const spacesCol = db.collection('spaces')
    const actorsCol = db.collection('actors')
    const tagsCol = db.collection('tags')
    const itemsCol = db.collection('items')

    // Ensure Indexes
    await itemsCol.createIndex({ space_id: 1 })
    await itemsCol.createIndex({ parent_id: 1 })
    await itemsCol.createIndex({ tags: 1 })

    // Upsert Spaces
    for (const space of spaces) {
      await spacesCol.updateOne(
        { _id: space.id as any },
        { $set: { name: space.name, type: space.type, description: space.description, updated_at: new Date() } },
        { upsert: true }
      )
    }

    // Upsert Actors
    for (const actor of actors) {
      await actorsCol.updateOne(
        { _id: actor.id as any },
        { $set: { name: actor.name, kind: actor.kind, updated_at: new Date() } },
        { upsert: true }
      )
    }

    // Upsert Tags
    for (const tag of tags) {
      await tagsCol.updateOne(
        { _id: tag.id as any },
        { $set: { name: tag.name, color: tag.color, updated_at: new Date() } },
        { upsert: true }
      )
    }

    // Upsert Items with EMBEDDED tags array
    for (const item of items) {
      await itemsCol.updateOne(
        { _id: item.id as any },
        {
          $set: {
            space_id: item.spaceId,
            title: item.title,
            description: item.description,
            parent_id: item.parentId,
            state: item.state,
            position: item.position,
            depth: item.depth,
            tags: item.tags, // Embedded array of tag keys (demonstrating document modeling)
            updated_at: new Date(),
          },
          $setOnInsert: {
            created_at: new Date(),
          },
        },
        { upsert: true }
      )
    }

    console.log(`[seed] MongoDB seeded: ${spaces.length} spaces, ${tags.length} tags, ${items.length} items.`)
  } finally {
    await client.close()
  }
}

async function runSeed() {
  const { pgUrl, mongoUrl, dbName } = getConfig()
  console.log('[seed] Starting full database seeding...')

  await seedPostgres(pgUrl)
  await seedMongo(mongoUrl, dbName)

  console.log('[seed] All seed operations completed successfully.')
}

runSeed().catch((err) => {
  console.error('[seed] Fatal error during seed execution:', err)
  process.exit(1)
})
