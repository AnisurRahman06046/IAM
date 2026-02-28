#!/bin/bash
#
# Doer IAM — Keycloak Realm Setup (Platform Infrastructure Only)
#
# Creates the "doer" realm with:
#   - Realm roles, password policy, brute force protection
#   - doer-auth-svc (service account for Auth Service → Keycloak admin API)
#   - doer-admin (public PKCE client for Admin Portal UI)
#   - Organization scope + organizations enabled
#   - OTP policy
#
# Product clients (doer-visa, doer-school, etc.) are NOT created here —
# those are created via the Admin Portal UI.
#
# Prerequisites: Keycloak running at localhost:8080 with admin/admin credentials
#
set -e

KEYCLOAK_URL="http://localhost:8080"
ADMIN_USER="admin"
ADMIN_PASS="admin"
REALM="doer"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "  ${GREEN}[OK]${NC} $1"; }
fail() { echo -e "  ${RED}[FAIL]${NC} $1"; exit 1; }
info() { echo -e "  ${YELLOW}[INFO]${NC} $1"; }
section() { echo -e "\n${GREEN}=== $1 ===${NC}"; }

# ─── GET ADMIN TOKEN ───
get_token() {
  ACCESS_TOKEN=$(curl -sf -X POST "${KEYCLOAK_URL}/realms/master/protocol/openid-connect/token" \
    -H "Content-Type: application/x-www-form-urlencoded" \
    -d "username=${ADMIN_USER}&password=${ADMIN_PASS}&grant_type=password&client_id=admin-cli" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

  if [ -z "$ACCESS_TOKEN" ]; then
    fail "Could not obtain admin token"
  fi
}

# Helper: Make authenticated API call
kc_api() {
  local METHOD="$1"
  local ENDPOINT="$2"
  local DATA="$3"

  if [ -n "$DATA" ]; then
    curl -sf -X "$METHOD" "${KEYCLOAK_URL}${ENDPOINT}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$DATA"
  else
    curl -sf -X "$METHOD" "${KEYCLOAK_URL}${ENDPOINT}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

# Helper: Make API call, return HTTP status
kc_api_status() {
  local METHOD="$1"
  local ENDPOINT="$2"
  local DATA="$3"

  if [ -n "$DATA" ]; then
    curl -s -o /dev/null -w "%{http_code}" -X "$METHOD" "${KEYCLOAK_URL}${ENDPOINT}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json" \
      -d "$DATA"
  else
    curl -s -o /dev/null -w "%{http_code}" -X "$METHOD" "${KEYCLOAK_URL}${ENDPOINT}" \
      -H "Authorization: Bearer ${ACCESS_TOKEN}" \
      -H "Content-Type: application/json"
  fi
}

echo "========================================"
echo "  Doer IAM — Realm Configuration"
echo "========================================"

get_token
pass "Admin token obtained"

# ─────────────────────────────────────────────
# 1 — CREATE DOER REALM
# ─────────────────────────────────────────────
section "1 — Create 'doer' realm"

STATUS=$(kc_api_status GET "/admin/realms/${REALM}")
if [ "$STATUS" = "200" ]; then
  info "Realm '${REALM}' already exists, updating settings..."
else
  STATUS=$(kc_api_status POST "/admin/realms" '{
    "realm": "doer",
    "enabled": true,
    "displayName": "Doer Platform",
    "registrationAllowed": false,
    "loginWithEmailAllowed": true,
    "editUsernameAllowed": false,
    "rememberMe": true,
    "resetPasswordAllowed": true,
    "duplicateEmailsAllowed": false,
    "verifyEmail": false
  }')
  if [ "$STATUS" = "201" ]; then
    pass "Realm 'doer' created"
  else
    fail "Failed to create realm (HTTP $STATUS)"
  fi
fi

# ─────────────────────────────────────────────
# 2 — CONFIGURE REALM SETTINGS
# ─────────────────────────────────────────────
section "2 — Configure realm settings"

get_token

STATUS=$(kc_api_status PUT "/admin/realms/${REALM}" '{
  "displayName": "Doer Platform",
  "enabled": true,
  "registrationAllowed": false,
  "loginWithEmailAllowed": true,
  "editUsernameAllowed": false,
  "rememberMe": true,
  "resetPasswordAllowed": true,
  "duplicateEmailsAllowed": false,
  "verifyEmail": false,
  "accessTokenLifespan": 900,
  "ssoSessionIdleTimeout": 14400,
  "ssoSessionMaxLifespan": 86400,
  "offlineSessionIdleTimeout": 2592000,
  "accessTokenLifespanForImplicitFlow": 900,
  "revokeRefreshToken": true,
  "refreshTokenMaxReuse": 0,
  "ssoSessionIdleTimeoutRememberMe": 604800,
  "ssoSessionMaxLifespanRememberMe": 604800
}')

if [ "$STATUS" = "204" ]; then
  pass "Realm settings configured (token lifetimes, SSO sessions, revoke refresh)"
else
  fail "Failed to update realm settings (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 3 — CONFIGURE PASSWORD POLICIES
# ─────────────────────────────────────────────
section "3 — Configure password policies"

STATUS=$(kc_api_status PUT "/admin/realms/${REALM}" '{
  "passwordPolicy": "length(8) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and passwordHistory(3)"
}')

if [ "$STATUS" = "204" ]; then
  pass "Password policy: min 8 chars, 1 upper, 1 lower, 1 digit, 1 special, history 3"
else
  fail "Failed to set password policy (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 4 — ENABLE BRUTE FORCE PROTECTION
# ─────────────────────────────────────────────
section "4 — Enable brute force protection"

STATUS=$(kc_api_status PUT "/admin/realms/${REALM}" '{
  "bruteForceProtected": true,
  "permanentLockout": false,
  "maxFailureWaitSeconds": 900,
  "minimumQuickLoginWaitSeconds": 60,
  "waitIncrementSeconds": 60,
  "maxDeltaTimeSeconds": 43200,
  "failureFactor": 5
}')

if [ "$STATUS" = "204" ]; then
  pass "Brute force protection: 5 failures, 60s wait, 15min max, 12h reset"
else
  fail "Failed to enable brute force protection (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 5 — CREATE REALM ROLES
# ─────────────────────────────────────────────
section "5 — Create realm roles"

declare -A REALM_ROLES=(
  ["platform_admin"]="Platform administrator — full system access"
  ["tenant_admin"]="Tenant organization administrator — manages users and settings within their org"
  ["tenant_employee"]="Tenant organization employee — operational access within their org"
  ["end_user"]="Self-registered end user/customer"
)

for ROLE_NAME in "${!REALM_ROLES[@]}"; do
  ROLE_DESC="${REALM_ROLES[$ROLE_NAME]}"
  STATUS=$(kc_api_status POST "/admin/realms/${REALM}/roles" "{
    \"name\": \"${ROLE_NAME}\",
    \"description\": \"${ROLE_DESC}\"
  }")
  if [ "$STATUS" = "201" ]; then
    pass "Realm role: ${ROLE_NAME}"
  elif [ "$STATUS" = "409" ]; then
    info "Realm role '${ROLE_NAME}' already exists"
  else
    fail "Failed to create realm role '${ROLE_NAME}' (HTTP $STATUS)"
  fi
done

# ─────────────────────────────────────────────
# 6 — SET DEFAULT REALM ROLE
# ─────────────────────────────────────────────
section "6 — Set 'end_user' as default realm role"

DEFAULT_ROLES=$(kc_api GET "/admin/realms/${REALM}/roles/default-roles-${REALM}")
DEFAULT_ROLES_ID=$(echo "$DEFAULT_ROLES" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)

END_USER_ROLE=$(kc_api GET "/admin/realms/${REALM}/roles/end_user")
END_USER_ROLE_ID=$(echo "$END_USER_ROLE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)

if [ -n "$DEFAULT_ROLES_ID" ] && [ -n "$END_USER_ROLE_ID" ]; then
  STATUS=$(kc_api_status POST "/admin/realms/${REALM}/roles-by-id/${DEFAULT_ROLES_ID}/composites" "[{
    \"id\": \"${END_USER_ROLE_ID}\",
    \"name\": \"end_user\"
  }]")
  if [ "$STATUS" = "204" ]; then
    pass "Default realm role set to include 'end_user'"
  else
    info "Default role may already include 'end_user' (HTTP $STATUS)"
  fi
else
  info "Could not find default-roles or end_user role, skipping"
fi

# Refresh token
get_token

# ─────────────────────────────────────────────
# 7 — CREATE CLIENT: doer-auth-svc (Service Account)
# ─────────────────────────────────────────────
section "7 — Create client: doer-auth-svc (service account)"

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients" '{
  "clientId": "doer-auth-svc",
  "name": "Auth Service",
  "description": "Confidential client for Auth Service to call Keycloak Admin REST API",
  "enabled": true,
  "publicClient": false,
  "standardFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": true,
  "protocol": "openid-connect"
}')

if [ "$STATUS" = "201" ]; then
  pass "Client 'doer-auth-svc' created (confidential, service account)"
elif [ "$STATUS" = "409" ]; then
  info "Client 'doer-auth-svc' already exists"
else
  fail "Failed to create client 'doer-auth-svc' (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 8 — ASSIGN SERVICE ACCOUNT ROLES
# ─────────────────────────────────────────────
section "8 — Assign service account roles to doer-auth-svc"

get_token

AUTH_SVC_UUID=$(kc_api GET "/admin/realms/${REALM}/clients?clientId=doer-auth-svc" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
SA_USER=$(kc_api GET "/admin/realms/${REALM}/clients/${AUTH_SVC_UUID}/service-account-user")
SA_USER_ID=$(echo "$SA_USER" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
REALM_MGMT_UUID=$(kc_api GET "/admin/realms/${REALM}/clients?clientId=realm-management" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

ADMIN_ROLES_NEEDED=("manage-users" "manage-clients" "view-users" "view-clients" "manage-realm")

ROLES_JSON="["
FIRST=true
for ROLE_NAME in "${ADMIN_ROLES_NEEDED[@]}"; do
  ROLE_DATA=$(kc_api GET "/admin/realms/${REALM}/clients/${REALM_MGMT_UUID}/roles/${ROLE_NAME}" 2>/dev/null)
  if [ -n "$ROLE_DATA" ]; then
    ROLE_ENTRY=$(echo "$ROLE_DATA" | python3 -c "import sys,json; r=json.load(sys.stdin); print(json.dumps({'id':r['id'],'name':r['name']}))")
    if [ "$FIRST" = true ]; then
      FIRST=false
    else
      ROLES_JSON+=","
    fi
    ROLES_JSON+="$ROLE_ENTRY"
  fi
done
ROLES_JSON+="]"

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/users/${SA_USER_ID}/role-mappings/clients/${REALM_MGMT_UUID}" "$ROLES_JSON")
if [ "$STATUS" = "204" ]; then
  pass "Service account roles: manage-users, manage-clients, view-users, view-clients, manage-realm"
else
  info "Service account roles may already be assigned (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 9 — CREATE CLIENT: doer-admin (Admin Portal UI)
# ─────────────────────────────────────────────
section "9 — Create client: doer-admin (public, PKCE)"

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients" '{
  "clientId": "doer-admin",
  "name": "Admin Portal",
  "description": "Frontend client for Admin Portal Dashboard",
  "enabled": true,
  "publicClient": true,
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "redirectUris": ["http://localhost:3002/callback", "http://localhost:3002/*"],
  "webOrigins": ["http://localhost:3002"],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "http://localhost:3002/*"
  },
  "protocol": "openid-connect",
  "fullScopeAllowed": false
}')

if [ "$STATUS" = "201" ]; then
  pass "Client 'doer-admin' created (public, PKCE S256)"
elif [ "$STATUS" = "409" ]; then
  info "Client 'doer-admin' already exists"
else
  fail "Failed to create client 'doer-admin' (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 10 — CREATE CLIENT SCOPE: organization
# ─────────────────────────────────────────────
section "10 — Create client scope: organization"

get_token

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/client-scopes" '{
  "name": "organization",
  "description": "Adds organization membership claims to tokens",
  "protocol": "openid-connect",
  "attributes": {
    "include.in.token.scope": "true",
    "display.on.consent.screen": "false"
  }
}')

if [ "$STATUS" = "201" ]; then
  pass "Client scope 'organization' created"
elif [ "$STATUS" = "409" ]; then
  info "Client scope 'organization' already exists"
else
  info "Client scope creation returned HTTP $STATUS (may already exist)"
fi

ORG_SCOPE_UUID=$(kc_api GET "/admin/realms/${REALM}/client-scopes" | python3 -c "
import sys, json
scopes = json.load(sys.stdin)
for s in scopes:
    if s['name'] == 'organization':
        print(s['id'])
        break
" 2>/dev/null || true)

if [ -n "$ORG_SCOPE_UUID" ]; then
  STATUS=$(kc_api_status POST "/admin/realms/${REALM}/client-scopes/${ORG_SCOPE_UUID}/protocol-mappers/models" '{
    "name": "organization",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-organization-membership-mapper",
    "consentRequired": false,
    "config": {
      "id.token.claim": "true",
      "access.token.claim": "true",
      "claim.name": "organization",
      "userinfo.token.claim": "true"
    }
  }')
  if [ "$STATUS" = "201" ]; then
    pass "Organization membership mapper added to scope"
  else
    info "Organization mapper may already exist (HTTP $STATUS)"
  fi
fi

# ─────────────────────────────────────────────
# 11 — ADD ORGANIZATION SCOPE TO doer-admin CLIENT
# ─────────────────────────────────────────────
section "11 — Add 'organization' scope to doer-admin"

ADMIN_CLIENT_UUID=$(kc_api GET "/admin/realms/${REALM}/clients?clientId=doer-admin" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

if [ -n "$ORG_SCOPE_UUID" ] && [ -n "$ADMIN_CLIENT_UUID" ]; then
  kc_api_status DELETE "/admin/realms/${REALM}/clients/${ADMIN_CLIENT_UUID}/optional-client-scopes/${ORG_SCOPE_UUID}" > /dev/null 2>&1
  STATUS=$(kc_api_status PUT "/admin/realms/${REALM}/clients/${ADMIN_CLIENT_UUID}/default-client-scopes/${ORG_SCOPE_UUID}")
  if [ "$STATUS" = "204" ]; then
    pass "Added 'organization' as DEFAULT scope to doer-admin"
  else
    info "Organization scope for doer-admin (HTTP $STATUS)"
  fi
else
  info "Organization scope UUID or admin client not found, skipping"
fi

# ─────────────────────────────────────────────
# 12 — MAP REALM ROLES TO doer-admin SCOPE
# ─────────────────────────────────────────────
section "12 — Map realm roles to doer-admin token scope"

get_token

CUSTOM_REALM_ROLES=$(kc_api GET "/admin/realms/${REALM}/roles" | python3 -c "
import sys, json
roles = json.load(sys.stdin)
custom = [{'id':r['id'],'name':r['name']} for r in roles if r['name'] in ('platform_admin','tenant_admin','tenant_employee','end_user')]
print(json.dumps(custom))
")

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients/${ADMIN_CLIENT_UUID}/scope-mappings/realm" "$CUSTOM_REALM_ROLES")
if [ "$STATUS" = "204" ]; then
  pass "Realm roles mapped to doer-admin scope"
else
  info "Realm role scope mapping for doer-admin (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 13 — CREATE CLIENT: doer-gateway (Bearer-only for APISIX JWT validation)
# ─────────────────────────────────────────────
section "13 — Create client: doer-gateway (bearer-only)"

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients" '{
  "clientId": "doer-gateway",
  "name": "API Gateway",
  "description": "Confidential client for APISIX to validate JWTs on infrastructure routes",
  "enabled": true,
  "publicClient": false,
  "standardFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "bearerOnly": false,
  "protocol": "openid-connect"
}')

if [ "$STATUS" = "201" ]; then
  pass "Client 'doer-gateway' created (confidential)"
elif [ "$STATUS" = "409" ]; then
  info "Client 'doer-gateway' already exists"
else
  fail "Failed to create client 'doer-gateway' (HTTP $STATUS)"
fi

# Get gateway client secret
GATEWAY_UUID=$(kc_api GET "/admin/realms/${REALM}/clients?clientId=doer-gateway" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")
GATEWAY_SECRET=$(kc_api GET "/admin/realms/${REALM}/clients/${GATEWAY_UUID}/client-secret" | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])" 2>/dev/null || true)

if [ -n "$GATEWAY_SECRET" ]; then
  pass "doer-gateway secret retrieved"
else
  info "Could not retrieve doer-gateway secret"
fi

# ─────────────────────────────────────────────
# 14 — ENABLE ORGANIZATIONS
# ─────────────────────────────────────────────
section "14 — Enable Organizations feature"

get_token

STATUS=$(kc_api_status PUT "/admin/realms/${REALM}" '{
  "organizationsEnabled": true
}')

if [ "$STATUS" = "204" ]; then
  pass "Organizations enabled for realm 'doer'"
else
  info "Organizations setting update returned HTTP $STATUS"
fi

# ─────────────────────────────────────────────
# 14 — CONFIGURE OTP POLICY
# ─────────────────────────────────────────────
section "15 — Configure OTP policy"

STATUS=$(kc_api_status PUT "/admin/realms/${REALM}" '{
  "otpPolicyType": "totp",
  "otpPolicyAlgorithm": "HmacSHA1",
  "otpPolicyDigits": 6,
  "otpPolicyPeriod": 30,
  "otpPolicyInitialCounter": 0,
  "otpPolicyLookAheadWindow": 1
}')

if [ "$STATUS" = "204" ]; then
  pass "OTP policy: TOTP, SHA1, 6 digits, 30s period"
else
  fail "Failed to configure OTP policy (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 15 — RETRIEVE AUTH SERVICE SECRET
# ─────────────────────────────────────────────
section "16 — Retrieve auth service client secret"

get_token

AUTH_SVC_SECRET=$(kc_api GET "/admin/realms/${REALM}/clients/${AUTH_SVC_UUID}/client-secret" | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])")
if [ -n "$AUTH_SVC_SECRET" ]; then
  pass "doer-auth-svc secret retrieved"
else
  info "Could not retrieve doer-auth-svc secret"
fi

# ─────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────
echo ""
echo "========================================"
echo "  Realm Configuration Complete"
echo "========================================"
echo ""
echo "  Realm:           doer"
echo "  Realm Roles:     platform_admin, tenant_admin, tenant_employee, end_user"
echo "  Default Role:    end_user"
echo ""
echo "  Clients (infrastructure only):"
echo "    doer-auth-svc  (confidential, service account — for Auth Service)"
echo "    doer-admin     (public, PKCE S256 — for Admin Portal UI)"
echo "    doer-gateway   (confidential — for APISIX JWT validation)"
echo ""
echo "  Organizations:   enabled"
echo "  Password Policy: 8+ chars, upper+lower+digit+special, history=3"
echo "  Brute Force:     5 failures → 60s lockout, max 15min"
echo "  OTP Policy:      TOTP, 6 digits, 30s period"
echo ""
if [ "${1:-}" = "--show-secrets" ]; then
  echo "  Secrets (save these to .env):"
  echo "    KEYCLOAK_CLIENT_SECRET=${AUTH_SVC_SECRET}"
  echo "    OIDC_CLIENT_SECRET=${GATEWAY_SECRET}  (for APISIX setup-routes.sh)"
else
  echo "  Secrets: retrieved (re-run with --show-secrets to display)"
fi
echo ""
echo "  Next steps:"
echo "    1. Update services/auth-service/.env with KEYCLOAK_CLIENT_SECRET"
echo "    2. Start auth-service: npm run build && npm run migration:run && npm run start:dev"
echo "    3. Setup APISIX routes: bash config/apisix/setup-routes.sh"
echo "    4. Start admin portal: cd services/admin-portal && npm run dev"
echo "    5. Create platform_admin user in Keycloak admin console"
echo "    6. Login to Admin Portal → create products from UI"
echo ""
