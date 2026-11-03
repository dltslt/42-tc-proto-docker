# `ft_transcendence` Prototypes (Docker)

This repository is `tc-proto-docker`. It provides an orchestrated, containerized prototyping environment for building and evaluating prototypes of **Lerch**, a team-first task and project management tool moving toward product stage.

```text
.
├── AGENTS.md       the rule every prototype agent follows, including how to commit
├── README.md       this file
├── PROMPT.md       the harness prompt that starts a run; names a run and a brief
├── briefs/         one brief per prototype; a run does not receive a copy
├── template/       the Nuxt app every run copies; do not build a prototype here
├── .agents/        agent skills for git commits and modern web guidance
└── <run-dir>/      one prototype run (e.g. run-01/, proto-01/)
```

---

## Requirements

- Docker & Docker Compose
- Node.js `^22.22.3`, `^24.15.0`, or `26` or newer (for local tooling)
- pnpm `12.16.1` or newer

> [!NOTE]
> *[Stub / Incomplete: Engine versions, base container images, and Compose prerequisites will be pinned as the Docker stack is finalized.]*

---

## After the Clone

### Create a new run
*[Follows as soon as the Docker scaffolding script / make command is finalized]*

### Initialize an existing run
*[Follows as soon as Docker Compose service configuration and port mappings are finalized]*

---

## Database

Prototypes evaluate both relational and document-oriented models using centralized containerized database engines (e.g., PostgreSQL, MongoDB) with dedicated logical databases per prototype.

The core domain consists of 11 entities: `actors`, `spaces`, `members`, `columns`, `tasks`, `relations`, `tags`, `item_tags`, `blockers`, `artifacts`, `item_artifacts`, and `events`.

> [!NOTE]
> *[Stub / Incomplete: Container connection URLs, database initialization scripts, and programmatic seeding contracts (e.g. `pnpm db:seed`) will be documented here once the Docker database services are active.]*

---

## Runs

| Run | Brief | Seed | Question |
|---|---|---|---|
| run-01 | fast-01-create-and-close | 100 | how few steps from a title to done |
| run-02 | fast-02-storage-sql | 10,000 | the data model as tables, ten queries timed |
| run-03 | fast-03-storage-document | 10,000 | the same model and queries as documents |
| run-04 | fast-04-one-item-many-views | 100 | list, board, calendar on one shared store |
| run-05 | fast-05-gantt-variants | 100 | gantt by hierarchy, by contributor, by blocker chain, and filtering |
| run-06 | fast-06-zoom-interface | 100 | zoom into items, notebook tabs, Ctrl+P (the interface idea from the 29 Oct notes) |
| run-07 | fast-07-nesting-displays | 100 | outline, drill-down, nested boxes, columns for one deep tree |
| run-08 | fast-08-relationship-graph | 100 | one item's neighbourhood as a graph and a mind map |
| run-09 | fast-09-widget-dashboard | 100 | widgets on a grid, a morning screen, per space and per person |
| run-10 | fast-10-space-and-members | 100 | sign-up, a space, members, two policies, a shared task |
| run-11 | proper-01-data-model-and-storage | 10,000 | the model and storage to build on |
| run-12 | proper-02-space-boundary | 100 | the space with policies as the security boundary |
| run-13 | proper-03-content-relations | 100 | related items by text and by embeddings, kept in scope |
| run-14 | proper-04-lerch-shell | 100 | the application frame that views and widgets live in |

---

## Concept Index

| Exploration Area | Primary Briefs |
|---|---|
| **Data Modelling & Queries** | `fast-02-storage-sql`, `fast-03-storage-document`, `proper-01-data-model-and-storage` |
| **SQL vs. NoSQL Tradeoffs** | `fast-02-storage-sql` vs. `fast-03-storage-document` |
| **Scalable Retrieval (10k items)** | `fast-02-storage-sql`, `fast-03-storage-document`, `proper-01-data-model-and-storage` |
| **Workspaces & Access Control** | `fast-10-space-and-members`, `proper-02-space-boundary` |
| **User Workflows (Fast entry)** | `fast-01-create-and-close` |
| **Multi-View Synchronization** | `fast-04-one-item-many-views` |
| **Hierarchies & Nesting** | `fast-07-nesting-displays`, `fast-06-zoom-interface` |
| **Dependency & Blocker Graphs** | `fast-08-relationship-graph`, `fast-05-gantt-variants` |
| **Dashboards & Metric Widgets** | `fast-09-widget-dashboard`, `proper-04-lerch-shell` |
| **Semantic Similarity & Embeddings** | `proper-03-content-relations` |
