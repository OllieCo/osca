# Dispatcher — Disaster Recovery Runbook

**Story 2.1 / 2.2 — Defined RPO/RTO + Cold-restore runbook**

> **RPO = 1 hour** (worst-case data loss — hourly WAL PITR window)  
> **RTO = 4 hours** (target time from incident declaration to service restored)  
> Tier-2 buyer-facing commitment: *"best effort within 4 business hours"*

This runbook can be executed by any engineer with production credentials.  
No tribal knowledge required. Work through steps sequentially.  
Estimated time: 2–3 hours for a complete cold restore.

---

## 0. Before you start

### 0.1 Credentials you need

| Credential | Where to find it |
|---|---|
| `DATABASE_URL` (production) | Doppler `prod` environment — `DATABASE_URL` |
| `BACKUP_ENCRYPTION_KEY` | Doppler `prod` — `BACKUP_ENCRYPTION_KEY` |
| `BACKUP_DEST_PATH` | Doppler `prod` — `BACKUP_DEST_PATH` (AU-resident bucket) |
| Cloudflare DNS token | Doppler `prod` — `CF_DNS_TOKEN` |
| TLS cert authority | Let's Encrypt via certbot (credentials in Doppler `prod` — `CF_API_TOKEN`) |
| Admin Console credentials | Doppler `prod` — `ADMIN_INITIAL_PASSWORD` |
| Slack incident channel | `#dispatcher-incidents` |

### 0.2 Declare an incident

1. Post in `#dispatcher-incidents`: "🔴 Incident declared — [brief description]. Incident commander: @you. Starting DR runbook."
2. Set a Sentry alert as `ongoing` so it doesn't page repeatedly.
3. If data loss is confirmed or suspected: notify Ollie immediately — OAIC notification may be required within 72 hours (see §7).

---

## 1. Assess and contain

**Time budget: 30 min**

- [ ] 1.1 Identify the failure mode: DB corruption? Server failure? Accidental delete? Network partition?
- [ ] 1.2 Stop write traffic to prevent further corruption: disable the Cloudflare health-check route (`/health`) or set Cloudflare to maintenance mode if available.
- [ ] 1.3 Note the exact time of last known good state (check OBS → Grafana → `dispatcher_api_requests_total` drop time).
- [ ] 1.4 Capture a snapshot of the current (broken) state if the server is still partially up: `pg_dump --schema-only` to preserve any schema drift for post-mortem.

---

## 2. Provision a replacement server (if server is lost)

**Time budget: 30 min**

> Skip to §3 if the server is intact and only the database needs restoring.

- [ ] 2.1 Provision a new VM at the same AU-region as the original (consult Hosting & Residency decision — Ollie's project, see the Decision Log).
- [ ] 2.2 Install required packages:
  ```bash
  apt-get update && apt-get install -y \
    postgresql-client nodejs npm redis-tools \
    openssl certbot python3-certbot-dns-cloudflare
  ```
- [ ] 2.3 Clone the repo at the release tag that was running before the incident (`git describe --tags` from the old server's logs or CI):
  ```bash
  git clone https://github.com/<org>/dispatcher.git /opt/dispatcher
  cd /opt/dispatcher && git checkout <release-tag>
  ```
- [ ] 2.4 Install Doppler CLI and log in:
  ```bash
  curl -Ls https://cli.doppler.com/install.sh | sh
  doppler login
  doppler setup --project dispatcher --config prod
  ```

---

## 3. Restore Postgres from backup

**Time budget: 45 min**

### 3.1 Locate the backup

```bash
# Source env from Doppler (or .env on the server)
export BACKUP_DEST_PATH="$(doppler secrets get BACKUP_DEST_PATH --plain)"
export BACKUP_ENCRYPTION_KEY="$(doppler secrets get BACKUP_ENCRYPTION_KEY --plain)"

ls -lht "${BACKUP_DEST_PATH}/pg/" | head -10
# Identify the backup immediately before the incident timestamp.
# Example: dispatcher_20260715T020001Z.pgdump.enc
```

### 3.2 Verify checksum

```bash
TARGET="${BACKUP_DEST_PATH}/pg/dispatcher_<TIMESTAMP>.pgdump.enc"

# Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "env:BACKUP_ENCRYPTION_KEY" \
  -in  "$TARGET" \
  -out /tmp/dispatcher_restore.pgdump

# Verify checksum (written alongside the encrypted file at backup time)
sha256sum --check "${TARGET%.enc}.sha256" --status \
  && echo "✅ checksum OK" \
  || { echo "❌ checksum MISMATCH — backup may be corrupted"; exit 1; }
```

### 3.3 Restore to the target Postgres instance

```bash
export DATABASE_URL="$(doppler secrets get DATABASE_URL --plain)"
PG_BASE="${DATABASE_URL%/*}"

# Drop the broken DB (DANGER — confirm you have the backup before this step)
psql "${PG_BASE}/postgres" -c "DROP DATABASE IF EXISTS dispatcher_prod;"
psql "${PG_BASE}/postgres" -c "CREATE DATABASE dispatcher_prod;"

pg_restore \
  --dbname="$DATABASE_URL" \
  --no-owner \
  --no-privileges \
  /tmp/dispatcher_restore.pgdump

echo "Restore complete"
```

### 3.4 Validate restore

```bash
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM schools;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM users;"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM audit_logs;"
psql "$DATABASE_URL" -c "SELECT MAX(created_at) FROM audit_logs;"
# Confirm the latest audit_log timestamp matches expectations (within RPO window)
```

### 3.5 Clean up plaintext

```bash
rm /tmp/dispatcher_restore.pgdump
```

---

## 4. Restore Redis / Bull queue state

**Time budget: 15 min**

> If the Bull queue was empty at time of failure (likely for a dev incident), skip to §5.

```bash
export REDIS_URL="$(doppler secrets get REDIS_URL --plain)"
export BACKUP_ENCRYPTION_KEY="$(doppler secrets get BACKUP_ENCRYPTION_KEY --plain)"

LATEST_REDIS="${BACKUP_DEST_PATH}/redis/$(ls -t "${BACKUP_DEST_PATH}/redis/" | head -1)"
echo "Restoring Bull state from: $LATEST_REDIS"

# Decrypt
openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "env:BACKUP_ENCRYPTION_KEY" \
  -in  "$LATEST_REDIS" \
  -out /tmp/bull_restore.json

# Verify checksum
sha256sum --check "${LATEST_REDIS%.enc}.sha256" --status \
  && echo "✅ checksum OK"

# Flush Bull keys only (not the whole Redis instance — rate-limit data is ephemeral)
redis-cli -u "$REDIS_URL" --scan --pattern "bull:*" | xargs redis-cli -u "$REDIS_URL" DEL

# Re-import (manual — Bull jobs should be re-queued by the application on restart
# rather than imported from the JSON snapshot, which may have stale state).
# Log the snapshot for audit purposes:
cp /tmp/bull_restore.json /var/log/dispatcher/bull_restore_$(date -u +"%Y%m%dT%H%M%SZ").json

rm /tmp/bull_restore.json
echo "Redis restore note: jobs re-queued by app on startup. Snapshot archived."
```

---

## 5. DNS failover (if server was replaced)

**Time budget: 15 min**

- [ ] 5.1 Get the new server's IP address.
- [ ] 5.2 Update the Cloudflare A record for `dispatcher.app` and `api.dispatcher.app`:
  ```bash
  # Using the Cloudflare API
  export CF_ZONE_ID="<zone-id-from-cloudflare>"
  export CF_DNS_TOKEN="$(doppler secrets get CF_DNS_TOKEN --plain)"
  export NEW_IP="<new-server-ip>"

  for record in "dispatcher.app" "api.dispatcher.app"; do
    RECORD_ID=$(curl -s "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records?name=$record" \
      -H "Authorization: Bearer $CF_DNS_TOKEN" | jq -r '.result[0].id')
    curl -s -X PUT "https://api.cloudflare.com/client/v4/zones/$CF_ZONE_ID/dns_records/$RECORD_ID" \
      -H "Authorization: Bearer $CF_DNS_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"type\":\"A\",\"name\":\"$record\",\"content\":\"$NEW_IP\",\"proxied\":true}"
    echo "Updated DNS for $record → $NEW_IP"
  done
  ```
- [ ] 5.3 Verify propagation: `dig +short dispatcher.app` → should return new IP within 1 min (Cloudflare proxied, TTL 300s).

---

## 6. TLS certificate re-issuance (if server was replaced)

**Time budget: 10 min**

```bash
export CF_API_TOKEN="$(doppler secrets get CF_API_TOKEN --plain)"

certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d dispatcher.app \
  -d "*.dispatcher.app" \
  --agree-tos \
  --non-interactive

# Reload nginx/caddy to pick up the new cert
systemctl reload nginx  # or: systemctl reload caddy
```

---

## 7. Secret rotation (Admin Console)

**Time budget: 10 min**

If credentials may have been exposed during the incident:

- [ ] 7.1 Rotate `BACKUP_ENCRYPTION_KEY` in Doppler and re-encrypt the next backup (existing backups remain decryptable with the old key — document in post-mortem).
- [ ] 7.2 Rotate `DATABASE_URL` password via `ALTER USER dispatcher PASSWORD 'newpassword';` and update Doppler.
- [ ] 7.3 Rotate any API keys that were visible in logs or error messages (Stripe, Resend, Grafana tokens).
- [ ] 7.4 Notify the Admin Console (once live) to invalidate all active sessions.

---

## 8. Smoke test and re-enable traffic

**Time budget: 15 min**

```bash
# Start the server
cd /opt/dispatcher/server
doppler run -- node dist/index.js &

# Smoke test the health endpoint
curl -s https://dispatcher.app/health | jq .
# Expected: { "status": "ok", "db": "ok", "redis": "ok" }
```

- [ ] Re-enable the Cloudflare health-check route.
- [ ] Monitor Grafana for 15 minutes: `ospa_api_requests_total` should resume.
- [ ] Post in `#dispatcher-incidents`: "✅ Service restored at [time]. RTO: [X] minutes."

---

## 9. OAIC notification (data-breach incidents only)

If the incident involved unauthorised access to personal data:

- [ ] Notify Ollie immediately — OAIC notification is required within **72 hours** of becoming aware.
- [ ] Draft notification per [OAIC guidance](https://www.oaic.gov.au/privacy/notifiable-data-breaches).
- [ ] Notify affected users by email (Resend template — coordinate with Ollie).

---

## 10. Post-mortem

Within 48 hours of resolution:

- [ ] Document in Notion: timeline, root cause, recovery steps taken, actual RTO achieved.
- [ ] Update this runbook if any step was inaccurate or missing.
- [ ] File a backlog Story if tooling would have reduced RTO.
- [ ] Schedule next tabletop drill within 6 months.

---

*Last updated: 2026-04-28 · Next scheduled drill: 2026-10-28*  
*RPO: 1 hour | RTO: 4 hours | Tier-2 SLA: best effort within 4 business hours*
