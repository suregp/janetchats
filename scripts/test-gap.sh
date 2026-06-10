#!/usr/bin/env bash
set -euo pipefail

ROOT=$(cd "$(dirname "$0")/.." && pwd)
cd "$ROOT"

# Start server in background
node server.js &
PID=$!
echo "Started server (PID $PID)"

cleanup() {
  echo "Stopping server..."
  kill $PID 2>/dev/null || true
}
trap cleanup EXIT

# Wait for server to boot
sleep 1

API_BASE="http://localhost:8080/api"
CHAT_KEY="test-room"
USER_A="Alice"
USER_B="Bob"

# Ensure fresh database
rm -f database.json

# Set presence for Bob with a relType that does NOT match Alice's reciprocal
curl -s -X POST "$API_BASE/presence/update" -H 'Content-Type: application/json' -d \
  "{\"chatKey\": \"$CHAT_KEY\", \"userName\": \"$USER_B\", \"relType\": 2, \"label\": \"Parent\", \"band\": 1 }"

# Now call gap-detection as Alice with relType that expects reciprocal (e.g., 11 ↔ 2)
# Use relType 11 (CHILD) which expects reciprocal 2 (PARENT) — but Bob is PARENT (2) so this is fine.
# To trigger a gap, set Alice to relType 1 (ADOPTIVE_CHILD) whose reciprocal is 8.

curl -s -X POST "$API_BASE/gap-detection" -H 'Content-Type: application/json' -d \
  "{\"chatKey\": \"$CHAT_KEY\", \"userNodeData\": {\"userName\": \"$USER_A\", \"relType\": 1, \"band\": 4}}" -o /tmp/gap_result.json

cat /tmp/gap_result.json

# Inspect database.json for latticeVerification and wallet
if [ -f database.json ]; then
  echo "----- database.json -----"
  jq . database.json || cat database.json
else
  echo "database.json missing"
fi

# Fetch wallet balance for Alice
curl -s "$API_BASE/wallet/$CHAT_KEY/$USER_A" || true

echo "Test script completed"
