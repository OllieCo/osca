# Contributing to Dispatcher

## Prerequisites

- Node.js 20+
- npm 10+
- Docker Desktop (for local stack)
- Gitleaks ([install](https://github.com/gitleaks/gitleaks#installing))

## Local development

```bash
# Install all packages
cd server && npm ci && cd ..
cd client && npm ci && cd ..
cd evals  && npm ci && cd ..

# Start the server in watch mode
cd server && npm run dev
```

## Running CI locally

Before pushing, run the same checks that CI runs:

```bash
# Server
cd server
npm run ci          # typecheck → test → audit

# Client
cd client
npm run lint
npm run build       # includes tsc
npm test

# Evals
cd evals
npm run validate-cases
```

`npm run ci` chains all server gates in the same order as `build.yml`. A failure in any step stops execution immediately.

## Pre-push hook (recommended)

Install a pre-push git hook so `npm run ci` runs automatically before every push:

```bash
# From the repo root — creates .git/hooks/pre-push
cat > .git/hooks/pre-push << 'EOF'
#!/bin/sh
set -e
echo "[pre-push] Running server CI checks..."
cd server && npm run ci
echo "[pre-push] All checks passed."
EOF
chmod +x .git/hooks/pre-push
```

To bypass in an emergency: `git push --no-verify` (never bypass on main).

## Secret scanning

We use [Gitleaks](https://github.com/gitleaks/gitleaks) to scan for accidentally committed secrets.

**Run locally before pushing:**

```bash
gitleaks detect --config .gitleaks.toml --source . --verbose
```

If Gitleaks reports a false positive, add an allowance to `.gitleaks.toml` (see the `[allowlist]` section) and commit that change instead of bypassing the check.

**Never suppress with `--no-verify`** if the reason is a genuine secret. Rotate the secret first, then push.

## Commit messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat(server): add Redis session cache
fix(client): resolve token refresh race condition
chore(ci): pin Node.js to 20.x
```

Types: `feat`, `fix`, `perf`, `refactor`, `test`, `chore`, `ci`, `docs`

Scope is the package name (`server`, `client`, `evals`) or a cross-cutting concern (`ci`, `deps`).

## Licence policy

All dependencies must use a licence from this approved list:
`MIT`, `Apache-2.0`, `BSD-2-Clause`, `BSD-3-Clause`, `ISC`, `CC0-1.0`, `Unlicense`, `0BSD`

GPL, AGPL, LGPL, and proprietary licences are blocked at CI. If you need a package with a restricted licence, raise it for legal review before adding it.

## Branch protection

`main` requires:
- All CI checks to pass (Build & Test + Security workflows)
- At least one approving review
- No direct pushes (PRs only)
