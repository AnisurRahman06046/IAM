#!/bin/bash
#
# Start Keycloak in dev mode (local, not Docker)
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
KC_DIR="$PROJECT_DIR/keycloak-26.5.4"

# Source env if exists
if [ -f "$PROJECT_DIR/.env" ]; then
  export $(grep -v '^#' "$PROJECT_DIR/.env" | grep -v '^$' | xargs)
fi

echo "Starting Keycloak 26.5.4 in dev mode..."
echo "  Database: $KC_DB_URL"
echo "  Admin UI: http://localhost:8080"
echo ""

exec "$KC_DIR/bin/kc.sh" start-dev
