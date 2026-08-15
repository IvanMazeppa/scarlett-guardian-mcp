#!/usr/bin/env bash
# Start ngrok pointing at Guardian :8790 with path-scoped Mission Control auth.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# Load .env if present (does not export into parent shell permanently)
if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

DOMAIN="${NGROK_STATIC_DOMAIN:-}"
POLICY_EXAMPLE="$ROOT/ngrok/traffic-policy.example.yml"
POLICY_LOCAL="$ROOT/ngrok/traffic-policy.local.yml"

if [[ -z "$DOMAIN" ]]; then
  echo "ERROR: NGROK_STATIC_DOMAIN is not set."
  echo ""
  echo "1. Open https://dashboard.ngrok.com/domains"
  echo "2. Create / reserve an ngrok-branded domain (Hobbyist: *.ngrok.app)"
  echo "3. Add to scarlett-guardian-mcp/.env:"
  echo "     NGROK_STATIC_DOMAIN=your-name.ngrok.app"
  echo ""
  echo "See docs/mission-control-ngrok.md for click-by-click steps."
  exit 1
fi

if [[ ! -f "$POLICY_LOCAL" ]]; then
  if [[ ! -f "$POLICY_EXAMPLE" ]]; then
    echo "ERROR: missing $POLICY_EXAMPLE"
    exit 1
  fi
  cp "$POLICY_EXAMPLE" "$POLICY_LOCAL"
  echo "Created $POLICY_LOCAL from example."
  echo "Edit it now: replace USER:PASSWORD with your Basic Auth credentials."
  echo "Then re-run: npm run tunnel"
  exit 1
fi

if grep -q 'USER:PASSWORD' "$POLICY_LOCAL"; then
  echo "ERROR: $POLICY_LOCAL still has placeholder USER:PASSWORD."
  echo "Replace with your real credentials, then re-run."
  exit 1
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ERROR: ngrok CLI not found on PATH."
  echo "Install: https://ngrok.com/download"
  exit 1
fi

PORT="${GUARDIAN_PORT:-8790}"

echo "Tunnel: https://${DOMAIN}  →  localhost:${PORT}"
echo "Mission Control: https://${DOMAIN}/dashboard  (Basic Auth)"
echo "MCP (no edge auth): https://${DOMAIN}/mcp"
echo "(Ctrl+C to stop)"
echo ""

exec ngrok http --url="$DOMAIN" "$PORT" --traffic-policy-file="$POLICY_LOCAL"
