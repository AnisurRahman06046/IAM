#!/bin/bash
#
# Start all infrastructure services
#
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Starting Docker services (Redis, APISIX, etcd, Prometheus, Grafana) ==="
cd "$PROJECT_DIR" && docker compose up -d

echo ""
echo "=== Starting Keycloak (local) ==="
echo "Run in a separate terminal: ./scripts/start-keycloak.sh"
echo ""
echo "=== Service URLs ==="
echo "  Keycloak:   http://localhost:8080  (admin/admin)"
echo "  APISIX:     http://localhost:9080"
echo "  APISIX Admin: http://localhost:9180"
echo "  Redis:      localhost:6379"
echo "  Prometheus: http://localhost:9090"
echo "  Grafana:    http://localhost:3000  (admin/admin)"
