#!/usr/bin/env bash
# server/scripts/backup/bull-backup.sh
#
# Story 1.1 — Backup cadence & retention (AC 1.1.2)
#
# Exports persistent Bull queue state from Redis.
# Volatile cache keys (rate-limit counters, session tokens, PII token cache)
# are intentionally excluded — they are ephemeral and must NOT be backed up.
#
# Only keys with TTL = -1 (no expiry) under the bull:* prefix are exported.
# These are the durable job records (waiting, delayed, completed, failed lists).
#
# Schedule: daily, shortly after pg-backup.sh.
# Required env: REDIS_URL, BACKUP_DEST_PATH, BACKUP_ENCRYPTION_KEY
# Optional env: BACKUP_RETENTION_DAYS (default 30), SLACK_WEBHOOK_URL
# Dependencies: redis-cli, openssl, sha256sum

source "$(dirname "$0")/_lib.sh"

# ── Parse Redis connection info ───────────────────────────────────────────────
# REDIS_URL format: redis://host:port  or  redis://:password@host:port
REDIS_HOST=$(echo "$REDIS_URL" | sed -E 's|redis://([^:@]*:?[^@]*)@([^:]+):([0-9]+).*|\2|; s|redis://([^:]+):([0-9]+).*|\1|')
REDIS_PORT=$(echo "$REDIS_URL" | sed -E 's|.*:([0-9]+)/?.*|\1|')
REDIS_PORT="${REDIS_PORT:-6379}"
REDIS_AUTH=""
if echo "$REDIS_URL" | grep -qE 'redis://:?[^@]+@'; then
  REDIS_AUTH=$(echo "$REDIS_URL" | sed -E 's|redis://:?([^@]+)@.*|\1|')
fi

REDIS_CLI_ARGS=(-h "$REDIS_HOST" -p "$REDIS_PORT")
[[ -n "$REDIS_AUTH" ]] && REDIS_CLI_ARGS+=(-a "$REDIS_AUTH")

BACKUP_DIR="${BACKUP_DEST_PATH}/redis"
mkdir -p "$BACKUP_DIR"

DUMP_FILE="${BACKUP_DIR}/bull_${TIMESTAMP}.json"

echo "[bull-backup] $(date -u) — starting Bull queue export"
echo "[bull-backup] Redis: $REDIS_HOST:$REDIS_PORT"

# ── Export persistent Bull keys ───────────────────────────────────────────────
{
  echo "["
  first=true

  while IFS= read -r key; do
    [[ -z "$key" ]] && continue

    ttl=$(redis-cli "${REDIS_CLI_ARGS[@]}" TTL "$key" 2>/dev/null | tr -d '\r')
    # Only export keys with no expiry (persistent job state)
    [[ "$ttl" != "-1" ]] && continue

    type=$(redis-cli "${REDIS_CLI_ARGS[@]}" TYPE "$key" 2>/dev/null | tr -d '\r')

    value="null"
    case "$type" in
      string)
        raw=$(redis-cli "${REDIS_CLI_ARGS[@]}" GET "$key" 2>/dev/null)
        value=$(printf '%s' "$raw" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || echo "null")
        ;;
      hash)
        # HGETALL returns alternating field/value lines
        value=$(redis-cli "${REDIS_CLI_ARGS[@]}" HGETALL "$key" 2>/dev/null \
          | awk 'NR%2==1{k=$0} NR%2==0{printf "%s\t%s\n", k, $0}' \
          | python3 -c 'import json,sys; d={}; [d.__setitem__(*l.rstrip("\n").split("\t",1)) for l in sys.stdin]; print(json.dumps(d))' 2>/dev/null || echo "null")
        ;;
      list)
        value=$(redis-cli "${REDIS_CLI_ARGS[@]}" LRANGE "$key" 0 -1 2>/dev/null \
          | python3 -c 'import json,sys; print(json.dumps([l.rstrip() for l in sys.stdin]))' 2>/dev/null || echo "null")
        ;;
      set)
        value=$(redis-cli "${REDIS_CLI_ARGS[@]}" SMEMBERS "$key" 2>/dev/null \
          | python3 -c 'import json,sys; print(json.dumps([l.rstrip() for l in sys.stdin]))' 2>/dev/null || echo "null")
        ;;
      zset)
        value=$(redis-cli "${REDIS_CLI_ARGS[@]}" ZRANGEBYSCORE "$key" -inf +inf WITHSCORES 2>/dev/null \
          | awk 'NR%2==1{m=$0} NR%2==0{printf "%s\t%s\n", m, $0}' \
          | python3 -c 'import json,sys; print(json.dumps([{"member":p[0],"score":float(p[1])} for p in (l.rstrip().split("\t") for l in sys.stdin)]))' 2>/dev/null || echo "null")
        ;;
      *) continue ;;
    esac

    [[ "$first" == "false" ]] && echo ","
    printf '{"key":%s,"type":%s,"value":%s}' \
      "$(printf '%s' "$key" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
      "$(printf '%s' "$type" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')" \
      "$value"
    first=false

  done < <(redis-cli "${REDIS_CLI_ARGS[@]}" KEYS "bull:*" 2>/dev/null | tr -d '\r' | sort)

  echo "]"
} > "$DUMP_FILE"

echo "[bull-backup] exported $(wc -c < "$DUMP_FILE") bytes"

# ── Checksum + encrypt ────────────────────────────────────────────────────────
write_checksum "$DUMP_FILE"
ENC_FILE="$(encrypt_file "$DUMP_FILE")"
rm "$DUMP_FILE"
echo "[bull-backup] encrypted → $ENC_FILE"

# ── Prune ─────────────────────────────────────────────────────────────────────
find "$BACKUP_DIR" -name "*.json.enc"   -mtime "+${BACKUP_RETENTION_DAYS}" -delete
find "$BACKUP_DIR" -name "*.json.sha256" -mtime "+${BACKUP_RETENTION_DAYS}" -delete

echo "[bull-backup] done"
