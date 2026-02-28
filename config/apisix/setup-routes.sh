#!/usr/bin/env bash
#
# Doer IAM — APISIX Route Configuration
# Idempotent: safe to re-run (uses PUT with fixed route IDs)
#
set -euo pipefail

ADMIN_URL="${APISIX_ADMIN_URL:-http://localhost:9180}"
API_KEY="${APISIX_ADMIN_KEY:-doer_apisix_admin_key_2026}"

# Keycloak and Auth Service are on the host — APISIX also runs on host network
KC_HOST="localhost"
KC_PORT="8080"
AUTH_HOST="localhost"
AUTH_PORT="3001"

KC_DISCOVERY="http://${KC_HOST}:${KC_PORT}/realms/doer/.well-known/openid-configuration"

# Confidential client for APISIX JWT validation (bearer-only introspection)
OIDC_CLIENT_ID="${OIDC_CLIENT_ID:-doer-visa-backend}"
OIDC_CLIENT_SECRET="${OIDC_CLIENT_SECRET:-aaJBckTubuycgdQuW5u4hZsRZF6p22jr}"

put_route() {
  local id="$1"
  local data="$2"
  local resp
  resp=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    "${ADMIN_URL}/apisix/admin/routes/${id}" \
    -H "X-API-KEY: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$data")
  if [ "$resp" = "200" ] || [ "$resp" = "201" ]; then
    echo "  [OK] Route ${id} configured (HTTP ${resp})"
  else
    echo "  [FAIL] Route ${id} — HTTP ${resp}"
    curl -s -X PUT \
      "${ADMIN_URL}/apisix/admin/routes/${id}" \
      -H "X-API-KEY: ${API_KEY}" \
      -H "Content-Type: application/json" \
      -d "$data" 2>&1
    echo ""
  fi
}

put_global_rule() {
  local id="$1"
  local data="$2"
  local resp
  resp=$(curl -s -o /dev/null -w "%{http_code}" -X PUT \
    "${ADMIN_URL}/apisix/admin/global_rules/${id}" \
    -H "X-API-KEY: ${API_KEY}" \
    -H "Content-Type: application/json" \
    -d "$data")
  if [ "$resp" = "200" ] || [ "$resp" = "201" ]; then
    echo "  [OK] Global rule ${id} configured (HTTP ${resp})"
  else
    echo "  [FAIL] Global rule ${id} — HTTP ${resp}"
  fi
}

echo "============================================"
echo " Doer IAM — APISIX Route Setup"
echo "============================================"
echo ""
echo "Admin URL : ${ADMIN_URL}"
echo "Keycloak  : http://${KC_HOST}:${KC_PORT}"
echo "Auth Svc  : http://${AUTH_HOST}:${AUTH_PORT}"
echo ""

# ──────────────────────────────────────────────
# Global Rules
# ──────────────────────────────────────────────
echo "── Global Rules ──"

# Global: request-id on all routes
put_global_rule 1 '{
  "plugins": {
    "request-id": {
      "header_name": "X-Request-Id",
      "include_in_response": true
    }
  }
}'

# ──────────────────────────────────────────────
# Route 1: /auth/* → Auth Service (PUBLIC, no JWT)
# ──────────────────────────────────────────────
echo ""
echo "── Route 1: /auth/* (public) ──"

put_route 1 "{
  \"name\": \"auth-public\",
  \"desc\": \"Public auth endpoints (register, token, logout, etc.)\",
  \"uri\": \"/auth/*\",
  \"methods\": [\"GET\", \"POST\", \"OPTIONS\"],
  \"upstream\": {
    \"type\": \"roundrobin\",
    \"nodes\": {\"${AUTH_HOST}:${AUTH_PORT}\": 1},
    \"timeout\": {\"connect\": 5, \"send\": 10, \"read\": 10}
  },
  \"plugins\": {
    \"limit-count\": {
      \"count\": 30,
      \"time_window\": 60,
      \"key_type\": \"var\",
      \"key\": \"remote_addr\",
      \"rejected_code\": 429,
      \"rejected_msg\": \"Rate limit exceeded. Try again later.\",
      \"policy\": \"local\"
    },
    \"cors\": {
      \"allow_origins\": \"**\",
      \"allow_methods\": \"GET,POST,OPTIONS\",
      \"allow_headers\": \"Content-Type,Authorization,X-Request-Id\",
      \"expose_headers\": \"X-Request-Id\",
      \"max_age\": 3600,
      \"allow_credential\": false
    }
  }
}"

# ──────────────────────────────────────────────
# Route 2: /api/tenants/* → Auth Service (JWT required)
# ──────────────────────────────────────────────
echo ""
echo "── Route 2: /api/tenants/* (protected) ──"

put_route 2 "{
  \"name\": \"tenants-api\",
  \"desc\": \"Tenant and user management — JWT required\",
  \"uris\": [\"/api/tenants\", \"/api/tenants/*\"],
  \"methods\": [\"GET\", \"POST\", \"PUT\", \"DELETE\", \"OPTIONS\"],
  \"upstream\": {
    \"type\": \"roundrobin\",
    \"nodes\": {\"${AUTH_HOST}:${AUTH_PORT}\": 1},
    \"timeout\": {\"connect\": 5, \"send\": 10, \"read\": 10}
  },
  \"plugins\": {
    \"openid-connect\": {
      \"discovery\": \"${KC_DISCOVERY}\",
      \"client_id\": \"${OIDC_CLIENT_ID}\",
      \"client_secret\": \"${OIDC_CLIENT_SECRET}\",
      \"bearer_only\": true,
      \"realm\": \"doer\",
      \"token_signing_alg_values_expected\": \"RS256\",
      \"set_userinfo_header\": false
    },
    \"limit-count\": {
      \"count\": 1000,
      \"time_window\": 60,
      \"key_type\": \"var\",
      \"key\": \"remote_addr\",
      \"rejected_code\": 429,
      \"policy\": \"local\"
    },
    \"cors\": {
      \"allow_origins\": \"**\",
      \"allow_methods\": \"GET,POST,PUT,DELETE,OPTIONS\",
      \"allow_headers\": \"Content-Type,Authorization,X-Request-Id\",
      \"expose_headers\": \"X-Request-Id\",
      \"max_age\": 3600,
      \"allow_credential\": false
    }
  }
}"

# ──────────────────────────────────────────────
# Route 3: /api/platform/* → Auth Service (JWT required, platform_admin)
# ──────────────────────────────────────────────
echo ""
echo "── Route 3: /api/platform/* (protected) ──"

put_route 3 "{
  \"name\": \"platform-api\",
  \"desc\": \"Platform admin endpoints — JWT required\",
  \"uris\": [\"/api/platform\", \"/api/platform/*\"],
  \"methods\": [\"GET\", \"OPTIONS\"],
  \"upstream\": {
    \"type\": \"roundrobin\",
    \"nodes\": {\"${AUTH_HOST}:${AUTH_PORT}\": 1},
    \"timeout\": {\"connect\": 5, \"send\": 10, \"read\": 10}
  },
  \"plugins\": {
    \"openid-connect\": {
      \"discovery\": \"${KC_DISCOVERY}\",
      \"client_id\": \"${OIDC_CLIENT_ID}\",
      \"client_secret\": \"${OIDC_CLIENT_SECRET}\",
      \"bearer_only\": true,
      \"realm\": \"doer\",
      \"token_signing_alg_values_expected\": \"RS256\",
      \"set_userinfo_header\": false
    },
    \"limit-count\": {
      \"count\": 500,
      \"time_window\": 60,
      \"key_type\": \"var\",
      \"key\": \"remote_addr\",
      \"rejected_code\": 429,
      \"policy\": \"local\"
    },
    \"cors\": {
      \"allow_origins\": \"**\",
      \"allow_methods\": \"GET,OPTIONS\",
      \"allow_headers\": \"Content-Type,Authorization,X-Request-Id\",
      \"expose_headers\": \"X-Request-Id\",
      \"max_age\": 3600,
      \"allow_credential\": false
    }
  }
}"

# ──────────────────────────────────────────────
# Route 4: /api/visa/* → Doer-Visa Service
# JWT validated by APISIX; claims injected as headers
# ──────────────────────────────────────────────
echo ""
echo "── Route 4: /api/visa/* (protected, header injection) ──"

# Lua function: parse X-Userinfo (base64 JWT payload) → individual headers
# Runs in before_proxy phase (after openid-connect has validated the token)
VISA_LUA_FN='return function(conf, ctx) local core = require(\"apisix.core\"); local hdr = core.request.header(ctx, \"X-Userinfo\"); if not hdr then return end; local json_str = ngx.decode_base64(hdr); if not json_str then return end; local payload = require(\"cjson.safe\").decode(json_str); if not payload then return end; if payload.sub then core.request.set_header(ctx, \"X-User-Id\", payload.sub) end; if payload.email then core.request.set_header(ctx, \"X-User-Email\", payload.email) end; if payload.realm_access and payload.realm_access.roles then core.request.set_header(ctx, \"X-User-Roles\", table.concat(payload.realm_access.roles, \",\")) end; local ra = payload.resource_access; if ra and ra[\"doer-visa\"] and ra[\"doer-visa\"].roles then core.request.set_header(ctx, \"X-Client-Roles\", table.concat(ra[\"doer-visa\"].roles, \",\")) end; if payload.organization then local org = payload.organization; if type(org) == \"table\" then if org[1] then core.request.set_header(ctx, \"X-Organization-Id\", org[1]) else for k, _ in pairs(org) do core.request.set_header(ctx, \"X-Organization-Id\", k); break end end end end; core.request.set_header(ctx, \"X-Userinfo\", nil) end'

put_route 4 "{
  \"name\": \"visa-api\",
  \"desc\": \"Doer-Visa product API — JWT validated, claims injected as headers\",
  \"uris\": [\"/api/visa\", \"/api/visa/*\"],
  \"methods\": [\"GET\", \"POST\", \"PUT\", \"DELETE\", \"OPTIONS\"],
  \"upstream\": {
    \"type\": \"roundrobin\",
    \"nodes\": {\"${AUTH_HOST}:4001\": 1},
    \"timeout\": {\"connect\": 5, \"send\": 10, \"read\": 10}
  },
  \"plugins\": {
    \"openid-connect\": {
      \"discovery\": \"${KC_DISCOVERY}\",
      \"client_id\": \"${OIDC_CLIENT_ID}\",
      \"client_secret\": \"${OIDC_CLIENT_SECRET}\",
      \"bearer_only\": true,
      \"realm\": \"doer\",
      \"token_signing_alg_values_expected\": \"RS256\",
      \"set_userinfo_header\": true,
      \"set_access_token_header\": false
    },
    \"serverless-pre-function\": {
      \"phase\": \"before_proxy\",
      \"functions\": [\"${VISA_LUA_FN}\"]
    },
    \"limit-count\": {
      \"count\": 1000,
      \"time_window\": 60,
      \"key_type\": \"var\",
      \"key\": \"remote_addr\",
      \"rejected_code\": 429,
      \"policy\": \"local\"
    },
    \"cors\": {
      \"allow_origins\": \"**\",
      \"allow_methods\": \"GET,POST,PUT,DELETE,OPTIONS\",
      \"allow_headers\": \"Content-Type,Authorization,X-Request-Id\",
      \"expose_headers\": \"X-Request-Id\",
      \"max_age\": 3600,
      \"allow_credential\": false
    }
  }
}"

# ──────────────────────────────────────────────
# Route 5: Keycloak OIDC Discovery (passthrough)
# ──────────────────────────────────────────────
echo ""
echo "── Route 5: /realms/* (Keycloak passthrough) ──"

put_route 5 "{
  \"name\": \"keycloak-oidc\",
  \"desc\": \"Keycloak OIDC discovery and auth endpoints passthrough\",
  \"uri\": \"/realms/*\",
  \"methods\": [\"GET\", \"POST\", \"OPTIONS\"],
  \"upstream\": {
    \"type\": \"roundrobin\",
    \"nodes\": {\"${KC_HOST}:${KC_PORT}\": 1},
    \"timeout\": {\"connect\": 5, \"send\": 10, \"read\": 10}
  },
  \"plugins\": {
    \"cors\": {
      \"allow_origins\": \"**\",
      \"allow_methods\": \"GET,POST,OPTIONS\",
      \"allow_headers\": \"Content-Type,Authorization\",
      \"max_age\": 3600,
      \"allow_credential\": false
    }
  }
}"

# ──────────────────────────────────────────────
# Route 6: Swagger docs (pass-through to auth service, public)
# ──────────────────────────────────────────────
echo ""
echo "── Route 6: /api/docs* (Swagger passthrough) ──"

put_route 6 "{
  \"name\": \"swagger-docs\",
  \"desc\": \"Auth Service Swagger docs\",
  \"uri\": \"/api/docs*\",
  \"methods\": [\"GET\", \"OPTIONS\"],
  \"upstream\": {
    \"type\": \"roundrobin\",
    \"nodes\": {\"${AUTH_HOST}:${AUTH_PORT}\": 1}
  },
  \"plugins\": {}
}"

# ──────────────────────────────────────────────
# Route 7: /api/admin/* → Auth Service (JWT required, platform_admin)
# ──────────────────────────────────────────────
echo ""
echo "── Route 7: /api/admin/* (protected, admin portal) ──"

put_route 7 "{
  \"name\": \"admin-portal-api\",
  \"desc\": \"Admin portal endpoints — JWT required (platform_admin enforced by backend)\",
  \"uris\": [\"/api/admin\", \"/api/admin/*\"],
  \"methods\": [\"GET\", \"POST\", \"PUT\", \"DELETE\", \"OPTIONS\"],
  \"upstream\": {
    \"type\": \"roundrobin\",
    \"nodes\": {\"${AUTH_HOST}:${AUTH_PORT}\": 1},
    \"timeout\": {\"connect\": 5, \"send\": 10, \"read\": 10}
  },
  \"plugins\": {
    \"openid-connect\": {
      \"discovery\": \"${KC_DISCOVERY}\",
      \"client_id\": \"${OIDC_CLIENT_ID}\",
      \"client_secret\": \"${OIDC_CLIENT_SECRET}\",
      \"bearer_only\": true,
      \"realm\": \"doer\",
      \"token_signing_alg_values_expected\": \"RS256\",
      \"set_userinfo_header\": false
    },
    \"limit-count\": {
      \"count\": 500,
      \"time_window\": 60,
      \"key_type\": \"var\",
      \"key\": \"remote_addr\",
      \"rejected_code\": 429,
      \"policy\": \"local\"
    },
    \"cors\": {
      \"allow_origins\": \"**\",
      \"allow_methods\": \"GET,POST,PUT,DELETE,OPTIONS\",
      \"allow_headers\": \"Content-Type,Authorization,X-Request-Id\",
      \"expose_headers\": \"X-Request-Id\",
      \"max_age\": 3600,
      \"allow_credential\": false
    }
  }
}"

# ──────────────────────────────────────────────
echo ""
echo "============================================"
echo " All routes configured!"
echo "============================================"
echo ""

# List all routes
echo "Registered routes:"
curl -s "${ADMIN_URL}/apisix/admin/routes" \
  -H "X-API-KEY: ${API_KEY}" | \
  python3 -c "
import sys, json
data = json.load(sys.stdin)
for r in data.get('list', []):
    v = r.get('value', {})
    print(f'  [{v.get(\"id\",\"?\")}] {v.get(\"name\",\"unnamed\"):20s}  {v.get(\"uri\",\"\")}')
" 2>/dev/null || echo "  (could not parse response)"
