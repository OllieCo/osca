#!/usr/bin/env bash
# server/scripts/backup/_lib.sh — Shared helpers for Dispatcher backup scripts.
#
# Source this at the top of each backup script:
#   source "$(dirname "$0")/_lib.sh"
#
# Note: these scripts target Linux (CI + production server).
#       They will not run natively on Windows developer machines.

set -euo pipefail

# ── Required environment variables ────────────────────────────────────────────
# DATABASE_URL              — postgresql://user:pass@host:port/dbname
# BACKUP_DEST_PATH          — local path for backup artefacts
#                             e.g. /mnt/backups   or an rclone-mounted bucket path
#                             Set to a real AU-resident bucket once hosting is decided (D-30).
# BACKUP_ENCRYPTION_KEY     — 32-byte passphrase (openssl rand -hex 32)
# REDIS_URL                 — redis://host:port

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_DEST_PATH:?BACKUP_DEST_PATH is required}"
: "${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"
: "${REDIS_URL:?REDIS_URL is required}"

# Optional
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
export TIMESTAMP

# ── SHA-256 checksum ──────────────────────────────────────────────────────────

# Write a .sha256 file alongside the artefact.
write_checksum() {
  local file="$1"
  sha256sum "$file" > "${file}.sha256"
  echo "[checksum] wrote ${file}.sha256"
}

# Verify the .sha256 file for an artefact. Exits 1 on mismatch.
verify_checksum() {
  local file="$1"
  if sha256sum --check "${file}.sha256" --status; then
    echo "[checksum] OK: $file"
  else
    echo "[checksum] MISMATCH: $file" >&2
    exit 1
  fi
}

# ── AES-256-CBC encryption (openssl) ─────────────────────────────────────────

# Encrypt $1 → ${1}.enc and print the output path.
# Uses PBKDF2 with 100 000 iterations — resistant to brute-force on the key.
encrypt_file() {
  local src="$1"
  local dst="${src}.enc"
  openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass "env:BACKUP_ENCRYPTION_KEY" \
    -in  "$src" \
    -out "$dst"
  echo "$dst"
}

# Decrypt ${1} → ${1%.enc} and print the output path.
decrypt_file() {
  local src="$1"
  local dst="${src%.enc}"
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -pass "env:BACKUP_ENCRYPTION_KEY" \
    -in  "$src" \
    -out "$dst"
  echo "$dst"
}

# ── Failure alerting ──────────────────────────────────────────────────────────

alert_failure() {
  local msg="$1"
  echo "[ERROR] $msg" >&2
  # Alert via Slack if configured
  if [[ -n "${SLACK_WEBHOOK_URL:-}" ]]; then
    curl -s -X POST "$SLACK_WEBHOOK_URL" \
      -H "Content-Type: application/json" \
      -d "{\"text\":\"🔴 Dispatcher backup failure: ${msg}\"}" || true
  fi
}

trap 'alert_failure "$(basename "$0") failed at line $LINENO — exit $?"' ERR
