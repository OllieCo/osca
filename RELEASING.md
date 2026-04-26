# Release Process

## Release tracks

| Track | Branch | Who approves | Cadence |
|---|---|---|---|
| Development | `develop` | Auto-merge on green CI | Continuous |
| Staging | `staging` | Developer self-approval | Per sprint |
| Production | `main` | Ollie (manual approval) | Per milestone |

## Version scheme

Dispatcher follows [Semantic Versioning](https://semver.org/):

```
v<major>.<minor>.<patch>
```

- **Major** — breaking API or schema change (requires migration guide)
- **Minor** — new feature, backwards-compatible
- **Patch** — bug fix, security patch, dependency update

Current version is tracked in `server/package.json`.

## Pre-release checklist

Before cutting any release tag:

- [ ] All CI checks green on the release branch
- [ ] `CHANGELOG.md` updated (see below)
- [ ] `server/package.json` version bumped
- [ ] Database migrations tested on a clean schema
- [ ] Security workflow (`security.yml`) passed in the last 24 hours
- [ ] No open `security` or `bug` GitHub Issues targeting this release

For **production** releases additionally:
- [ ] Staging environment smoke-tested by Ollie
- [ ] Ollie has approved the PR via GitHub review
- [ ] No active CVE advisories in `npm audit`

## Cutting a release

### 1. Bump the version

```bash
# In server/
npm version patch   # or minor / major
git push origin main --follow-tags
```

`npm version` updates `server/package.json`, commits the change, and creates a git tag (`v0.1.1`).

### 2. Create the GitHub Release

After pushing the tag:

1. Go to **GitHub → Releases → Draft a new release**
2. Select the tag you just pushed
3. Set the release title: `v0.1.1 — <one-line summary>`
4. Paste the relevant section from `CHANGELOG.md` as the release description
5. Attach any artefacts from the `build.yml` run for that commit
6. **For production releases**: mark as "Latest release"
7. **For pre-releases / RC**: tick "Set as a pre-release"

### 3. Deploy

Deployment is currently manual (v0.1.x). SSH into the server and:

```bash
cd /opt/dispatcher
git pull --ff-only
cd server && npm ci --omit=dev
npm run db:migrate:prod
pm2 restart dispatcher-server
```

Automated deployment (GitHub Actions → SSH deploy) is tracked in the CI/CD Epic 3 roadmap.

## Changelog

Maintain `CHANGELOG.md` at the repo root following [Keep a Changelog](https://keepachangelog.com/) format:

```markdown
## [0.1.1] — 2026-05-15

### Fixed
- Token refresh race condition in client auth flow (#42)

### Security
- Pinned rollup to >=4.22.4 to address GHSA-mw96-cpmx-2vgc
```

Categories: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`

## Hotfix process

1. Branch from `main`: `git checkout -b hotfix/describe-the-fix main`
2. Make the fix, add tests
3. Open a PR targeting `main` — include `[hotfix]` in the title
4. Ollie approves and merges
5. Cherry-pick to `develop` to keep branches in sync: `git cherry-pick <sha>`

## Promotion gates

### develop → staging

Automated. Triggered on merge to `main` when a release-please PR is merged:

1. All **Build & Test** checks green (`server`, `client`, `evals`, `docker-compose`, `commitlint`)
2. All **Security** checks green (CVE audit, licence, Semgrep, Gitleaks)
3. **Smoke test** passes on self-hosted runner (API + Postgres + Redis + Ollama health checks)

### staging → production

Manual gate. Requires:

1. Smoke test passed (see above)
2. One approving GitHub review from Ollie on the release PR
3. **For v2.1.0 and beyond:** external pen test pass certificate attached to the release

GitHub Environment protection rules enforce this: the `production` environment requires Ollie's approval before any deployment runs. Configure in **GitHub → Settings → Environments → production → Required reviewers: @Ollie**.

### Production rollback

```bash
# SSH into server
cd /opt/dispatcher
git fetch --tags
git checkout <previous-tag>
cd server && npm ci --omit=dev
npm run db:migrate:prod   # if migration is reversible
pm2 restart dispatcher-server
```

For data migrations that are not safely reversible, refer to the incident runbook (RELEASING.md § Hotfix process) and escalate to Ollie.

### Approver list

| Environment | Approver | Backup |
|---|---|---|
| Staging | Developer (self-approve) | — |
| Production | Ollie | — |
| Production (v2.1+ pen test) | External assessor certificate | Ollie ratifies |
