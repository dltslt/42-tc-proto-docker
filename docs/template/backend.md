# Backend Architecture: {{RUN}}

## Server Endpoints
Documentation of Nitro server event handlers in `server/api/`:
- `GET /api/...`: Description, query parameters, response payload.
- `POST /api/...`: Description, body schema, status codes.

## Database Integration
- **PostgreSQL Schemas & Queries**:
  - Tables utilized: e.g. `spaces`, `members`, `actors`.
  - Indexes and constraints.
- **MongoDB Collections & Pipelines**:
  - Collections utilized: e.g. `tasks`, `events`, `blockers`.
  - Aggregation pipelines and document structures.

## Validation & Error Handling
- Input validation mechanics (e.g. `readBody`, schemas).
- HTTP error codes returned (`createError`).

