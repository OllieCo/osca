#!/usr/bin/env bash
# server/scripts/backup/pg-backup.sh
#
# Story 1.1 — Backup cadence & retention (AC 1.1.1)
#
# Produces a daily Postgres snapshot:
#   1. pg_dump --format=custom (compressed) → $BACKUP_DEST_PATH/pg/
#   2. SHA-256 checksum written alongside the dump
#   3. AES-256-CBC encrypted (plaintext removed after encryption)
#   4. Files older than BACKUP_RETENTION_DAYS pruned
#
# Schedule: daily at 02:00 AEST via cron or systemd timer.
# Example cron (crontab -e on the production server):
#   0 16 * * * BACKUP_DEST_PATH=/mnt/backups BACKUP_ENCRYPTION_KEY=... /opt/dispatcher/scripts/backup/pg-backup.sh >> /var/log/dispatcher/pg-backup.log 2>&1
#
# Required env: DATABASE_URL, BACKUP_DEST_PATH, BACKUP_ENCRYPTION_KEY
# Optional env: BACKUP_RETENTION_DAYS (default 30), SLACK_WEBHOOK_URL
#
# Dependencies: pg_dump (postgresql-client), openssl, sha256sum

source "$(dirname "$0")/_lib.sh"

BACKUP_DIR="${BACKUP_DEST_PATH}/pg"
mkdir -p "$BACKUP_DIR"

DUMP_FILE="${BACKUP_DIR}/dispatcher_${TIMESTAMP}.pgdump"

echo "[pg-backup] $(date -u) — starting dump"
echo "[pg-backup] destination: $DUMP_FILE"

# ── Dump ──────────────────────────────────────────────────────────────────────
pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --file="$DUMP_FILE"

echo "[pg-backup] dump complete ($(du -sh "$DUMP_FILE" | cut -f1))"

# ── Checksum (on plaintext before encryption) ─────────────────────────────────
write_checksum "$DUMP_FILE"

# ── Encrypt ───────────────────────────────────────────────────────────────────
ENC_FILE="$(encrypt_file "$DUMP_FILE")"
echo "[pg-backup] encrypted → $ENC_FILE"

# Remove plaintext dump now that encrypted copy exists
rm "$DUMP_FILE"

# ── Prune old backups ─────────────────────────────────────────────────────────
echo "[pg-backup] pruning artefacts older than ${BACKUP_RETENTION_DAYS} days"
find "$BACKUP_DIR" -name "*.pgdump.enc"  -mtime "+${BACKUP_RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -name "*.pgdump.sha256" -mtime "+${BACKUP_RETENTION_DAYS}" -delete

REMAINING=$(find "$BACKUP_DIR" -name "*.enc" | wc -l)
echo "[pg-backup] done — ${REMAINING} encrypted backup(s) on disk"
