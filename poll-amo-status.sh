#!/usr/bin/env bash
# Poll AMO review status and notify Slack on change
# Usage: source ~/.secrets/api_keys.sh && ./poll-amo-status.sh

set -euo pipefail

ADDON_SLUG="${ADDON_SLUG:-tethernet}"
POLL_INTERVAL="${POLL_INTERVAL:-300}"  # seconds (default: 5 min)
AMO_API="https://addons.mozilla.org/api/v5/addons/addon/${ADDON_SLUG}/"
STATE_FILE="${TMPDIR:-/tmp}/.amo-status-${ADDON_SLUG}"

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
  echo "Error: SLACK_WEBHOOK_URL not set. Load your secrets first: source ~/.secrets/api_keys.sh"
  exit 1
fi
if [ -z "${AMO_API_KEY:-}" ] || [ -z "${AMO_API_SECRET:-}" ]; then
  echo "Error: AMO_API_KEY and AMO_API_SECRET not set."
  echo "Get them at: https://addons.mozilla.org/en-US/developers/addon/api/key/"
  exit 1
fi

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }

slack() {
  local message="$1"
  curl -s -X POST "$SLACK_WEBHOOK_URL" \
    -H "Content-Type: application/json" \
    -d "{\"text\": \"$message\"}" \
    > /dev/null
}

make_jwt() {
  python3 - <<PYEOF
import hmac, hashlib, base64, json, time, uuid

key = "${AMO_API_KEY}"
secret = "${AMO_API_SECRET}"

header = base64.urlsafe_b64encode(json.dumps({"alg":"HS256","typ":"JWT"}).encode()).rstrip(b'=').decode()
now = int(time.time())
payload = base64.urlsafe_b64encode(json.dumps({"iss":key,"jti":str(uuid.uuid4()),"iat":now,"exp":now+60}).encode()).rstrip(b'=').decode()
sig_input = f"{header}.{payload}".encode()
sig = base64.urlsafe_b64encode(hmac.new(secret.encode(), sig_input, hashlib.sha256).digest()).rstrip(b'=').decode()
print(f"{header}.{payload}.{sig}")
PYEOF
}

fetch_status() {
  local jwt
  jwt=$(make_jwt)
  curl -s "$AMO_API" -H "Authorization: JWT ${jwt}" | python3 -c "
import json, sys
d = json.load(sys.stdin)
addon_status = d.get('status', 'unknown')
file_status = d.get('current_version', {}).get('file', {}).get('status', 'unknown')
version = d.get('current_version', {}).get('version', 'unknown')
print(f'{addon_status}|{file_status}|{version}')
"
}

status_label() {
  case "$1" in
    public)           echo "✅ Public (approved)" ;;
    nominated)        echo "⏳ Nominated (awaiting review)" ;;
    incomplete)       echo "⚠️ Incomplete" ;;
    disabled)         echo "🚫 Disabled" ;;
    approved)         echo "✅ Approved" ;;
    awaiting_review)  echo "⏳ Awaiting review" ;;
    *)                echo "❓ $1" ;;
  esac
}

log "Starting AMO status poller for '${ADDON_SLUG}' (every ${POLL_INTERVAL}s)"

# Load previous state
if [ -f "$STATE_FILE" ]; then
  PREV_STATE=$(cat "$STATE_FILE")
else
  PREV_STATE=""
fi

# Send startup message
slack ":eyes: AMO poller started for *${ADDON_SLUG}* — checking every $((POLL_INTERVAL / 60)) minutes."

while true; do
  CURRENT_STATE=$(fetch_status 2>/dev/null || echo "error|error|unknown")
  IFS='|' read -r ADDON_STATUS FILE_STATUS VERSION <<< "$CURRENT_STATE"

  if [ "$CURRENT_STATE" = "error|error|unknown" ]; then
    log "Failed to fetch status — will retry"
    sleep "$POLL_INTERVAL"
    continue
  fi

  log "addon=${ADDON_STATUS} file=${FILE_STATUS} version=${VERSION}"

  if [ "$CURRENT_STATE" != "$PREV_STATE" ]; then
    ADDON_LABEL=$(status_label "$ADDON_STATUS")
    FILE_LABEL=$(status_label "$FILE_STATUS")

    MSG=":bell: *AMO status changed* for *${ADDON_SLUG}* v${VERSION}\n"
    MSG+="• Add-on: ${ADDON_LABEL}\n"
    MSG+="• File: ${FILE_LABEL}"

    if [ "$ADDON_STATUS" = "public" ] || [ "$FILE_STATUS" = "approved" ]; then
      MSG=":tada: *${ADDON_SLUG}* v${VERSION} is *APPROVED* on AMO! ${MSG}"
    fi

    slack "$MSG"
    log "Status changed — Slack notified"
    echo "$CURRENT_STATE" > "$STATE_FILE"
    PREV_STATE="$CURRENT_STATE"
  fi

  sleep "$POLL_INTERVAL"
done
