# OSPA — OneSchool Personal Assistant

AI-powered relief teacher supervision assistant for Queensland schools.

## Packages

| Package | Description |
|---|---|
| [`server/`](server/) | Express API — REST + WebSocket, Prisma, Redis, OTel |
| [`client/`](client/) | React SPA — staff-facing UI |
| [`extension/`](extension/) | Chrome extension — OneSchool integration |
| [`evals/`](evals/) | LLM evaluation harness |

## Quick start

```bash
# Start the full local stack
docker compose up

# Server dev mode (watch)
cd server && npm run dev

# Client dev mode
cd client && npm run dev
```

## CI

[![Build & Test](https://github.com/OllieCo/osca/actions/workflows/build.yml/badge.svg)](https://github.com/OllieCo/osca/actions/workflows/build.yml)
[![Security](https://github.com/OllieCo/osca/actions/workflows/security.yml/badge.svg)](https://github.com/OllieCo/osca/actions/workflows/security.yml)

See [CI.md](CI.md) for a full description of every workflow, required checks, and how to fix common failures.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) — includes local CI replication, pre-push hook setup, and the licence policy.

## Releasing

See [RELEASING.md](RELEASING.md) — version scheme, release checklist, and promotion gates.
