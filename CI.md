# CI Pipeline Reference

Dispatcher uses GitHub Actions for all automated checks. Every commit to a PR or push to `main`/`develop` must pass both workflows before merging.

## Workflows

### `build.yml` — Build & Test

**Trigger:** Push to `main` or `develop`; pull requests targeting `main`

**Jobs:**

| Job | Working dir | Steps | Required check |
|---|---|---|---|
| `server` | `server/` | `npm ci` → `typecheck` → `test` → `build` → upload artefact | Yes |
| `client` | `client/` | `npm ci` → `lint` → `test` → `build` → upload artefact | Yes |
| `evals` | `evals/` | `npm ci` → `validate-cases` | Yes |

**Artefacts produced:**
- `server-dist-<sha>` — compiled `server/dist/` (7-day retention)
- `client-dist-<sha>` — compiled `client/dist/` (7-day retention)

---

### `security.yml` — Security Gates

**Trigger:** Push to `main` or `develop`; pull requests to `main`; weekly cron Saturday 02:00 UTC

**Jobs:**

| Job | What it does | Blocks merge? |
|---|---|---|
| `dependency-audit` | `npm audit --audit-level=high` across server, client, evals | Yes — fails on high/critical CVEs |
| `licence-check` | Scans dependency licences; rejects GPL/AGPL/LGPL/proprietary | Yes |
| `sbom` | Generates CycloneDX SBOM from server deps | No (main branch only) |
| `sast` | Semgrep OWASP Top-10 + TypeScript + Node.js rules on `server/src/` + `evals/` | Yes |
| `secret-scan` | Gitleaks full-history scan using `.gitleaks.toml` | Yes |

---

## Required checks (branch protection on `main`)

All five jobs must pass before a PR can merge:
1. `Server — typecheck / test / build`
2. `Client — lint / typecheck / test / build`
3. `Evals — validate cases`
4. `SAST (Semgrep)`
5. `Secret Scanning (Gitleaks)`

CVE Audit and Licence checks run on all branches but block PRs to main.

---

## Interpreting and fixing common failures

### TypeScript errors (`server` job — `typecheck` step)

```
src/lib/config.ts(42,7): error TS2322: Type 'string | undefined' is not assignable to type 'string'
```

Fix the type error in the source file. Never suppress with `// @ts-ignore` — use proper type guards or optional chaining instead.

### ESLint errors (`client` job — `lint` step)

```
src/components/Chat.tsx  12:3  error  no-explicit-any  ...
```

Fix the lint error. If it is a genuine false positive (rare), add an inline `// eslint-disable-next-line rule-name` with a comment explaining why.

### CVE blocking (`dependency-audit` job)

```
GHSA-xxxx-xxxx-xxxx: high severity in package-name@1.2.3
```

1. Check if a patched version exists: `npm audit fix --audit-level=high`
2. If no patch is available, add a `overrides` entry in `package.json` to pin a safe version
3. If the CVE is a false positive (not reachable in your code path), document it in a comment next to the override

### Gitleaks secret detection (`secret-scan` job)

```
WRN leaks found: 1
    ┌──────────────────────────────┐
    │  Secret: ghp_xxxxxxxxxxxxxxx │
    │  File: server/src/config.ts  │
```

1. If it is a real secret: **rotate the credential immediately**, then remove it from the file, rewrite git history if it has been pushed, and re-push
2. If it is a false positive: add an allowance to `.gitleaks.toml` under `[allowlist]`
3. Never bypass with `--no-verify` for a real secret

### Semgrep SAST failures (`sast` job)

Download the `semgrep-<sha>` artefact and review findings. Each finding includes the rule ID, severity, and file location. Findings are blocked at `error` level; `warning` level is informational.

---

## Running checks locally

See [CONTRIBUTING.md](CONTRIBUTING.md) for the `npm run ci` command and pre-push hook setup.

## Adding a new workflow

1. Add the workflow file to `.github/workflows/`
2. Document it in this file under **Workflows**
3. If it is a required check, update the **Required checks** section and ask Ollie to update the branch protection rules in GitHub Settings
