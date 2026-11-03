# Prototyping Platform: Technical Documentation

Welcome to the technical documentation for `tc-proto-docker`, the containerized Nuxt 4 prototyping platform.

This platform provides an orchestrated Docker environment supporting multiple concurrent, isolated Nuxt 4 prototype runs backed by shared PostgreSQL 16 and MongoDB 7 database engines.

It serves both as an engineering testbed for full-stack prototype exploration and as an **educational curriculum** for software engineers transitioning from systems programming (C/C++ in the 42 curriculum) to modern full-stack web architectures (Nuxt 4, Vue 3, Nitro, TypeScript, Docker, PostgreSQL, and MongoDB).

---

## Infrastructure Deep-Dive Guides

The container infrastructure is documented across focused deep-dive guides:

| Document | Core Systems Focus | Key Concepts Covered |
|---|---|---|
| **[1. Container Architecture](docker/architecture.md)** | Service topology & Docker Compose | Linux namespaces vs. VMs, service extension (`extends`), profiles, network isolation |
| **[2. Node.js & Package Virtualization](docker/pnpm-and-volumes.md)** | Memory, ABIs & filesystem layers | Mach-O vs. ELF binaries, `glibc` boundaries, Docker volume masking, pnpm CAS named store |
| **[3. Networking, Ports & Vite HMR](docker/networking-and-ports.md)** | Sockets & protocol handshakes | NAT port forwarding, host port 5433 conflict resolution, Vite WebSocket HMR single-port mapping |
| **[4. Hybrid Database Architecture](docker/databases.md)** | Multi-model persistence & provisioning | SQL vs. Document split, environment inheritance, dynamic URL assembly, the Postgres `initdb` trap |
| **[5. Control Plane Operations](docker/control-plane.md)** | Makefile automation & developer CLI | Lifecycle management, scaffolding, programmatic seeding contract (`pnpm db:seed`), troubleshooting |

---

## Prototype Run Documentation Architecture

To maintain a clean separation between application code and documentation, **all prototype runs write their documentation directly into the root `docs/` tree**:

```text
docs/
├── README.md                      # This documentation hub and sitemap
├── docker/                        # Platform and container architecture deep dives
│   ├── architecture.md
│   ├── pnpm-and-volumes.md
│   ├── networking-and-ports.md
│   ├── databases.md
│   └── control-plane.md
├── template/                      # Starter templates for prototype documentation
│   ├── design.md
│   ├── frontend.md
│   ├── backend.md
│   └── NOTES.md
└── run-XX/                        # Dedicated documentation for prototype run-XX
    ├── design.md                  # High-level architecture and Mermaid data flow
    ├── frontend.md                # UI state management, components, and re-render triggers
    ├── backend.md                 # Server endpoints, database queries, and payload schemas
    └── NOTES.md                   # Standardized run summary, findings, cuts, and timings
```

### Prototype Documentation Contracts

Every prototype run (e.g. `prototypes/run-01/`) has a matching documentation directory (`docs/run-01/`). When an agent or developer works on a prototype, they must maintain the four canonical documents:

1. **`design.md`**: High-level architectural narrative with a Mermaid flowchart showing the complete request/response data flow:
   `Host Browser -> Nuxt SSR/Client -> Nitro API -> Database Engine`.
2. **`frontend.md`**: Detailed breakdown of client-side architecture: reactive state stores, Vue component trees, hydration boundaries, and re-render triggers.
3. **`backend.md`**: Server-side architecture: Nitro event handlers (`server/api/`), input validation schemas, database models (SQL queries or MongoDB aggregation pipelines), and error responses.
4. **`NOTES.md`**: The standard wrap-up post-mortem following the 7-section format:
   - **Run**: Brief ID, assigned port, seeding command.
   - **What it shows**: 2-3 sentences summarizing the outcome.
   - **Open questions touched**: Spec questions explored and answers found.
   - **Added**: New fixtures, models, or fields introduced.
   - **Stack assumptions**: Databases, drivers, or libraries chosen.
   - **Cut**: Scope trimmed to fit within timebox.
   - **Numbers**: Benchmark timings, query latencies, or payload measurements.

