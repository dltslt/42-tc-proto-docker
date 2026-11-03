# Design: {{RUN}}

## Overview
A brief description of this prototype run, the scenario under evaluation from the assigned brief, and the primary technical questions being answered.

## System Data Flow

```mermaid
flowchart TD
    Browser["Host Browser (localhost:{{PORT}})"]
    
    subgraph Container["Nuxt 4 Container ({{RUN}})"]
        Universal["Universal SSR / Vue Client"]
        NitroAPI["Nitro Server API (server/api/)"]
    end
    
    subgraph Databases["Database Engines"]
        PG["PostgreSQL (postgres:5432 / {{DB_NAME}})"]
        Mongo["MongoDB (mongo:27017 / {{DB_NAME}})"]
    end

    Browser -->|HTTP Request / WebSocket HMR| Universal
    Universal -->|Internal $fetch| NitroAPI
    NitroAPI -->|pg Pool / SQL Query| PG
    NitroAPI -->|MongoClient / BSON| Mongo
```

## Architectural Decisions
- **Execution Boundaries**: Where specific logic lives (Client-only, Universal SSR, or Server-only Nitro).
- **Persistence Strategy**: Entities stored in PostgreSQL vs. MongoDB.
- **Key Trade-offs**: Trade-offs made in this prototype.

