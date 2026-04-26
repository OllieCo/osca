# Contracts

API contracts and schema exports live here. Validated in CI by `scripts/validate-schema.js`.

## Schema versioning

The `SCHEMA_VERSION` constant (to be added in `server/src/types/index.ts` as part of the Data Migration & Schema Versioning project) is the source of truth for breaking schema changes. The `schema-version` file in this directory must match it.

## Files

| File | Description |
|---|---|
| `schema-version` | Current schema version string — must match `SCHEMA_VERSION` constant in server |
| `health.json` | OpenAPI-compatible response schema for `GET /api/health` |

## Adding a new contract

When a route's response shape changes:
1. Update the relevant `.json` contract file
2. Bump `schema-version` if it is a breaking change
3. Run `node scripts/validate-schema.js` locally before pushing
