#!/bin/bash
#
# Stop all infrastructure services
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Stopping Docker services ==="
cd "$PROJECT_DIR" && docker compose down

echo ""
echo "=== To stop Keycloak, press Ctrl+C in its terminal ==="
echo "=== Or: pkill -f 'kc.sh start-dev' ==="
