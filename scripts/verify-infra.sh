#!/bin/bash
#
# Verify all infrastructure services are running
#
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}[OK]${NC} $1"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; ERRORS=$((ERRORS+1)); }

ERRORS=0
echo "Checking Doer IAM Infrastructure..."
echo ""

# Keycloak
if curl -sf http://localhost:8080/ > /dev/null 2>&1; then
  pass "Keycloak          http://localhost:8080"
else
  fail "Keycloak          http://localhost:8080 (not responding)"
fi

# APISIX
if curl -sf http://localhost:9180/apisix/admin/routes -H "X-API-KEY: doer_apisix_admin_key_2026" > /dev/null 2>&1; then
  pass "APISIX            http://localhost:9080"
else
  fail "APISIX            http://localhost:9080 (not responding)"
fi

# Redis
if redis-cli -a doer_redis_2026 ping 2>/dev/null | grep -q PONG; then
  pass "Redis             localhost:6379"
else
  fail "Redis             localhost:6379 (not responding)"
fi

# PostgreSQL (keycloak)
if PGPASSWORD=keycloak_pass_2026 psql -U keycloak_user -h localhost -d keycloak -c "SELECT 1" > /dev/null 2>&1; then
  pass "PostgreSQL (KC)   localhost:5432/keycloak"
else
  fail "PostgreSQL (KC)   localhost:5432/keycloak (not responding)"
fi

# PostgreSQL (auth)
if PGPASSWORD=doer_auth_pass_2026 psql -U doer_auth_user -h localhost -d doer_auth -c "SELECT 1" > /dev/null 2>&1; then
  pass "PostgreSQL (Auth) localhost:5432/doer_auth"
else
  fail "PostgreSQL (Auth) localhost:5432/doer_auth (not responding)"
fi

# Prometheus
if curl -sf http://localhost:9090/-/ready > /dev/null 2>&1; then
  pass "Prometheus        http://localhost:9090"
else
  fail "Prometheus        http://localhost:9090 (not responding)"
fi

# Grafana
if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
  pass "Grafana           http://localhost:3000"
else
  fail "Grafana           http://localhost:3000 (not responding)"
fi

echo ""
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}All services are running!${NC}"
else
  echo -e "${RED}$ERRORS service(s) failed.${NC}"
  exit 1
fi
