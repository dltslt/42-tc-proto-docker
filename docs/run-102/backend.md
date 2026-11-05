# Backend Architecture: run-102

## Server Endpoints
All routes live under `/api/v1`. Route files are in `layers/<name>/server/api/v1/`; the file path decides the URL.

| Route | Layer | Purpose |
|---|---|---|
| `GET /api/v1` | core | Contract version and the layers that are loaded |
| `GET /api/v1/health` | core | `{ "status": "ok" }` |
| `GET /api/v1/openapi.json` | core | The API described in OpenAPI 3.0, built from the contracts |

Any other `/api/v1` request gets the error shape: 405 with an `Allow` header when the path exists for other methods, 404 when it does not.

## How a request flows
1. `layers/core/server/middleware/api-v1.ts` runs first. It looks the method and path up in the registry (`matchRoute`).
2. A match continues to the route file. No match ends the request with a 405 (path known, other method) or 404.
3. `defineRoute` validates params, query and body with the contract's Zod schemas, calls the handler, then checks the handler's result against the response schema.

## Database Integration
None yet. Task 2 adds Drizzle and PostgreSQL.

## Validation & Error Handling
- Input is validated by the contract's Zod schemas. All problems are reported together as a 400, with a field path such as `query.limit`.
- One error shape for every failure: `{ "error": { "code", "message", "fields" } }`. Codes: `invalid_input` 400, `unauthenticated` 401, `forbidden` 403, `not_found` 404, `method_not_allowed` 405, `conflict` 409.
- Anything unexpected becomes a plain 500 with a generic message. The detail goes to the server log only.
- A response that does not match its contract is a server bug and becomes a 500, never a wrong body.

## Code map (`layers/core/server/`)
- `lib/errors.ts`: error class, shared body schema, `toErrorResponse`.
- `lib/contract.ts`: `defineContract`, `validateInput`, `CONTRACT_VERSION`.
- `lib/registry.ts`: `registerModule`, `listModules`, `matchRoute`.
- `lib/openapi.ts`: `buildOpenApi`.
- `lib/define-route.ts`: the Nitro glue.
- `contracts.ts`, `plugins/core.module.ts`, `middleware/api-v1.ts`, `api/v1/*`.

## Tests
`pnpm test` runs Vitest inside the container. Unit tests (`layers/core/tests/lib.test.ts`) need no server. HTTP tests call the running server on `localhost:$PORT`, so start it with `make up RUN=102` first.
