#!/bin/bash
#
# Doer IAM — Phase 2: Keycloak Realm Configuration
#
# Configures the "doer" realm with all clients, roles, scopes, and organizations
# via the Keycloak Admin REST API.
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
# 2.1 — CREATE DOER REALM
# ─────────────────────────────────────────────
section "2.1 — Create 'doer' realm"

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
# 2.2 — CONFIGURE REALM SETTINGS (Token lifetimes, sessions, etc.)
# ─────────────────────────────────────────────
section "2.2 — Configure realm settings"

# Refresh token to avoid expiry during long setup
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
# 2.3 — CONFIGURE PASSWORD POLICIES
# ─────────────────────────────────────────────
section "2.3 — Configure password policies"

STATUS=$(kc_api_status PUT "/admin/realms/${REALM}" '{
  "passwordPolicy": "length(8) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and passwordHistory(3)"
}')

if [ "$STATUS" = "204" ]; then
  pass "Password policy: min 8 chars, 1 upper, 1 lower, 1 digit, 1 special, history 3"
else
  fail "Failed to set password policy (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 2.4 — ENABLE BRUTE FORCE PROTECTION
# ─────────────────────────────────────────────
section "2.4 — Enable brute force protection"

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
# 2.5 — CREATE REALM ROLES
# ─────────────────────────────────────────────
section "2.5 — Create realm roles"

declare -A REALM_ROLES=(
  ["platform_admin"]="Doer platform administrator — full system access"
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
# 2.6 — SET DEFAULT REALM ROLE
# ─────────────────────────────────────────────
section "2.6 — Set 'end_user' as default realm role"

# Get the default-roles composite role
DEFAULT_ROLES=$(kc_api GET "/admin/realms/${REALM}/roles/default-roles-${REALM}")
DEFAULT_ROLES_ID=$(echo "$DEFAULT_ROLES" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)

# Get end_user role
END_USER_ROLE=$(kc_api GET "/admin/realms/${REALM}/roles/end_user")
END_USER_ROLE_ID=$(echo "$END_USER_ROLE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])" 2>/dev/null || true)

if [ -n "$DEFAULT_ROLES_ID" ] && [ -n "$END_USER_ROLE_ID" ]; then
  # Add end_user to default roles composites
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
  info "Could not find default-roles or end_user role, skipping default role assignment"
fi

# Refresh token
get_token

# ─────────────────────────────────────────────
# 2.7 — CREATE CLIENT: doer-visa (Public, Auth Code + PKCE)
# ─────────────────────────────────────────────
section "2.7 — Create client: doer-visa (public, PKCE)"

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients" '{
  "clientId": "doer-visa",
  "name": "Doer Visa Application",
  "description": "Frontend client for Doer Visa product",
  "enabled": true,
  "publicClient": true,
  "standardFlowEnabled": true,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "redirectUris": ["http://localhost:3001/callback", "http://localhost:3001/*"],
  "webOrigins": ["http://localhost:3001"],
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "http://localhost:3001/*"
  },
  "protocol": "openid-connect",
  "fullScopeAllowed": false
}')

if [ "$STATUS" = "201" ]; then
  pass "Client 'doer-visa' created (public, PKCE S256)"
elif [ "$STATUS" = "409" ]; then
  info "Client 'doer-visa' already exists"
else
  fail "Failed to create client 'doer-visa' (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 2.8 — CREATE CLIENT: doer-visa-backend (Confidential, Resource Server)
# ─────────────────────────────────────────────
section "2.8 — Create client: doer-visa-backend (confidential)"

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients" '{
  "clientId": "doer-visa-backend",
  "name": "Doer Visa Backend Service",
  "description": "Confidential client for APISIX JWT validation of Doer Visa APIs",
  "enabled": true,
  "publicClient": false,
  "standardFlowEnabled": false,
  "directAccessGrantsEnabled": false,
  "serviceAccountsEnabled": false,
  "bearerOnly": true,
  "protocol": "openid-connect"
}')

if [ "$STATUS" = "201" ]; then
  pass "Client 'doer-visa-backend' created (confidential, bearer-only)"
elif [ "$STATUS" = "409" ]; then
  info "Client 'doer-visa-backend' already exists"
else
  fail "Failed to create client 'doer-visa-backend' (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 2.9 — CREATE CLIENT ROLES FOR doer-visa
# ─────────────────────────────────────────────
section "2.9 — Create client roles for doer-visa"

# Get doer-visa client UUID
VISA_CLIENT_UUID=$(kc_api GET "/admin/realms/${REALM}/clients?clientId=doer-visa" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

if [ -z "$VISA_CLIENT_UUID" ]; then
  fail "Could not find doer-visa client UUID"
fi

declare -A VISA_ROLES=(
  ["manage_all"]="Full access to all Doer Visa features — tenant admin level"
  ["manage_applications"]="Create, edit, delete visa applications"
  ["process_visa"]="Process and review visa applications"
  ["approve_visa"]="Approve or reject visa applications"
  ["view_applications"]="View visa applications (read-only)"
  ["apply_visa"]="Submit new visa applications (end user)"
  ["view_own_status"]="View own application status (end user)"
)

for ROLE_NAME in "${!VISA_ROLES[@]}"; do
  ROLE_DESC="${VISA_ROLES[$ROLE_NAME]}"
  STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/roles" "{
    \"name\": \"${ROLE_NAME}\",
    \"description\": \"${ROLE_DESC}\"
  }")
  if [ "$STATUS" = "201" ]; then
    pass "Client role: doer-visa/${ROLE_NAME}"
  elif [ "$STATUS" = "409" ]; then
    info "Client role 'doer-visa/${ROLE_NAME}' already exists"
  else
    fail "Failed to create client role '${ROLE_NAME}' (HTTP $STATUS)"
  fi
done

# ─────────────────────────────────────────────
# 2.10 — CREATE COMPOSITE ROLES (Presets) FOR doer-visa
# ─────────────────────────────────────────────
section "2.10 — Create composite roles (presets) for doer-visa"

# Refresh token
get_token

# Get all doer-visa client roles
get_visa_role_id() {
  local ROLE_NAME="$1"
  kc_api GET "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/roles/${ROLE_NAME}" | python3 -c "import sys,json; r=json.load(sys.stdin); print(json.dumps({'id':r['id'],'name':r['name']}))"
}

# staff_basic = [view_applications, view_own_status]
VIEW_APPS=$(get_visa_role_id "view_applications")
VIEW_OWN=$(get_visa_role_id "view_own_status")

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/roles" '{
  "name": "staff_basic",
  "description": "Basic staff preset: view applications and own status",
  "composite": true
}')
if [ "$STATUS" = "201" ] || [ "$STATUS" = "409" ]; then
  # Add composites
  kc_api_status POST "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/roles/staff_basic/composites" "[${VIEW_APPS},${VIEW_OWN}]" > /dev/null 2>&1
  pass "Composite role: doer-visa/staff_basic = [view_applications, view_own_status]"
fi

# staff_senior = [view_applications, process_visa, manage_applications]
PROCESS=$(get_visa_role_id "process_visa")
MANAGE_APPS=$(get_visa_role_id "manage_applications")

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/roles" '{
  "name": "staff_senior",
  "description": "Senior staff preset: view, process, and manage applications",
  "composite": true
}')
if [ "$STATUS" = "201" ] || [ "$STATUS" = "409" ]; then
  kc_api_status POST "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/roles/staff_senior/composites" "[${VIEW_APPS},${PROCESS},${MANAGE_APPS}]" > /dev/null 2>&1
  pass "Composite role: doer-visa/staff_senior = [view_applications, process_visa, manage_applications]"
fi

# customer = [apply_visa, view_own_status]
APPLY=$(get_visa_role_id "apply_visa")

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/roles" '{
  "name": "customer",
  "description": "Customer preset: apply for visa and view own status",
  "composite": true
}')
if [ "$STATUS" = "201" ] || [ "$STATUS" = "409" ]; then
  kc_api_status POST "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/roles/customer/composites" "[${APPLY},${VIEW_OWN}]" > /dev/null 2>&1
  pass "Composite role: doer-visa/customer = [apply_visa, view_own_status]"
fi

# ─────────────────────────────────────────────
# 2.11 — CREATE CLIENT: doer-auth-svc (Confidential, Service Account)
# ─────────────────────────────────────────────
section "2.11 — Create client: doer-auth-svc (service account)"

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients" '{
  "clientId": "doer-auth-svc",
  "name": "Doer Auth Service",
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
# 2.12 — ASSIGN SERVICE ACCOUNT ROLES TO doer-auth-svc
# ─────────────────────────────────────────────
section "2.12 — Assign service account roles to doer-auth-svc"

# Refresh token
get_token

# Get doer-auth-svc client UUID
AUTH_SVC_UUID=$(kc_api GET "/admin/realms/${REALM}/clients?clientId=doer-auth-svc" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Get the service account user
SA_USER=$(kc_api GET "/admin/realms/${REALM}/clients/${AUTH_SVC_UUID}/service-account-user")
SA_USER_ID=$(echo "$SA_USER" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

# Get realm-management client UUID (built-in client for admin operations)
REALM_MGMT_UUID=$(kc_api GET "/admin/realms/${REALM}/clients?clientId=realm-management" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Get the needed roles from realm-management
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
  pass "Service account roles assigned: manage-users, manage-clients, view-users, view-clients, manage-realm"
else
  info "Service account roles may already be assigned (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 2.13 — CREATE CLIENT: doer-admin (Public, Admin Panel)
# ─────────────────────────────────────────────
section "2.13 — Create client: doer-admin (public, PKCE)"

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients" '{
  "clientId": "doer-admin",
  "name": "Doer Admin Panel",
  "description": "Frontend client for Doer Admin Dashboard",
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
# 2.14 — CREATE CLIENT SCOPE: organization
# ─────────────────────────────────────────────
section "2.14 — Create client scope: organization"

# Refresh token
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
  info "Client scope creation returned HTTP $STATUS (may already exist with different mechanism)"
fi

# Get the organization scope UUID
ORG_SCOPE_UUID=$(kc_api GET "/admin/realms/${REALM}/client-scopes" | python3 -c "
import sys, json
scopes = json.load(sys.stdin)
for s in scopes:
    if s['name'] == 'organization':
        print(s['id'])
        break
" 2>/dev/null || true)

if [ -n "$ORG_SCOPE_UUID" ]; then
  # Add a protocol mapper for organization membership
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
    info "Organization mapper may already exist or mapper type differs (HTTP $STATUS)"
  fi
fi

# ─────────────────────────────────────────────
# 2.15 — ADD ORGANIZATION SCOPE TO PRODUCT CLIENTS
# ─────────────────────────────────────────────
section "2.15 — Add 'organization' scope to product clients"

ADMIN_CLIENT_UUID=$(kc_api GET "/admin/realms/${REALM}/clients?clientId=doer-admin" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

if [ -n "$ORG_SCOPE_UUID" ]; then
  for CLIENT_NAME in "doer-visa" "doer-admin"; do
    if [ "$CLIENT_NAME" = "doer-visa" ]; then CID=$VISA_CLIENT_UUID; else CID=$ADMIN_CLIENT_UUID; fi
    # Remove from optional scopes first (Keycloak may auto-add it there)
    kc_api_status DELETE "/admin/realms/${REALM}/clients/${CID}/optional-client-scopes/${ORG_SCOPE_UUID}" > /dev/null 2>&1
    # Add to default scopes
    STATUS=$(kc_api_status PUT "/admin/realms/${REALM}/clients/${CID}/default-client-scopes/${ORG_SCOPE_UUID}")
    if [ "$STATUS" = "204" ]; then
      pass "Added 'organization' as DEFAULT scope to ${CLIENT_NAME}"
    else
      info "Organization scope for ${CLIENT_NAME} (HTTP $STATUS)"
    fi
  done
else
  info "Organization scope UUID not found, skipping client scope assignment"
fi

# ─────────────────────────────────────────────
# 2.17 — ENABLE ORGANIZATIONS
# ─────────────────────────────────────────────
section "2.17 — Enable Organizations feature"

# Refresh token
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
# 2.18 — CREATE TEST ORGANIZATION
# ─────────────────────────────────────────────
section "2.18 — Create test organization: 'Test Visa Agency'"

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/organizations" '{
  "name": "Test Visa Agency",
  "alias": "test-visa",
  "enabled": true,
  "description": "Test organization for Doer Visa product",
  "attributes": {
    "products": ["doer-visa"],
    "plan": ["basic"]
  }
}')

if [ "$STATUS" = "201" ]; then
  pass "Organization 'Test Visa Agency' created"
elif [ "$STATUS" = "409" ]; then
  info "Organization 'Test Visa Agency' already exists"
else
  info "Organization creation returned HTTP $STATUS"
fi

# ─────────────────────────────────────────────
# CLIENT SCOPE ROLE MAPPINGS
# (Required because fullScopeAllowed=false — explicitly map which roles appear in tokens)
# ─────────────────────────────────────────────
section "Configure client scope role mappings"

# Refresh token
get_token

# Get all custom realm roles
CUSTOM_REALM_ROLES=$(kc_api GET "/admin/realms/${REALM}/roles" | python3 -c "
import sys, json
roles = json.load(sys.stdin)
custom = [{'id':r['id'],'name':r['name']} for r in roles if r['name'] in ('platform_admin','tenant_admin','tenant_employee','end_user')]
print(json.dumps(custom))
")

# Add realm roles to doer-visa and doer-admin client scope mappings
for CLIENT_NAME in "doer-visa" "doer-admin"; do
  if [ "$CLIENT_NAME" = "doer-visa" ]; then CID=$VISA_CLIENT_UUID; else CID=$ADMIN_CLIENT_UUID; fi
  STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients/${CID}/scope-mappings/realm" "$CUSTOM_REALM_ROLES")
  if [ "$STATUS" = "204" ]; then
    pass "Realm roles mapped to ${CLIENT_NAME} scope"
  else
    info "Realm role scope mapping for ${CLIENT_NAME} (HTTP $STATUS)"
  fi
done

# Add doer-visa client roles to doer-visa scope
ALL_VISA_ROLES=$(kc_api GET "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/roles" | python3 -c "
import sys, json
roles = json.load(sys.stdin)
print(json.dumps([{'id':r['id'],'name':r['name']} for r in roles]))
")

STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/scope-mappings/clients/${VISA_CLIENT_UUID}" "$ALL_VISA_ROLES")
if [ "$STATUS" = "204" ]; then
  pass "doer-visa client roles mapped to doer-visa scope"
else
  info "doer-visa client role scope mapping (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# 2.22 — CONFIGURE OTP POLICY
# ─────────────────────────────────────────────
section "2.22-2.23 — Configure authentication & OTP policy"

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
# RETRIEVE AND SAVE CLIENT SECRET FOR doer-auth-svc
# ─────────────────────────────────────────────
section "Retrieve client secrets"

# Refresh token
get_token

AUTH_SVC_SECRET=$(kc_api GET "/admin/realms/${REALM}/clients/${AUTH_SVC_UUID}/client-secret" | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])")
if [ -n "$AUTH_SVC_SECRET" ]; then
  pass "doer-auth-svc secret: ${AUTH_SVC_SECRET}"
else
  info "Could not retrieve doer-auth-svc secret"
fi

# doer-visa-backend is bearer-only, no client secret needed
info "doer-visa-backend is bearer-only (no client secret)"

# ─────────────────────────────────────────────
# CONFIGURE doer-visa CLIENT SCOPE MAPPINGS
# ─────────────────────────────────────────────
section "Configure client scope mappings for doer-visa"

# Make doer-visa client roles available in the doer-visa client's tokens
# Add client role mapper to doer-visa
STATUS=$(kc_api_status POST "/admin/realms/${REALM}/clients/${VISA_CLIENT_UUID}/protocol-mappers/models" '{
  "name": "doer-visa-roles",
  "protocol": "openid-connect",
  "protocolMapper": "oidc-usermodel-client-role-mapper",
  "consentRequired": false,
  "config": {
    "multivalued": "true",
    "id.token.claim": "true",
    "access.token.claim": "true",
    "claim.name": "resource_access.doer-visa.roles",
    "userinfo.token.claim": "true",
    "usermodel.clientRoleMapping.clientId": "doer-visa"
  }
}')

if [ "$STATUS" = "201" ]; then
  pass "Client role mapper added to doer-visa client"
else
  info "Client role mapper for doer-visa (HTTP $STATUS)"
fi

# ─────────────────────────────────────────────
# SUMMARY
# ─────────────────────────────────────────────
echo ""
echo "========================================"
echo "  Phase 2 Configuration Complete"
echo "========================================"
echo ""
echo "  Realm:           doer"
echo "  Realm Roles:     platform_admin, tenant_admin, tenant_employee, end_user"
echo "  Default Role:    end_user"
echo ""
echo "  Clients:"
echo "    doer-visa          (public, PKCE S256)"
echo "    doer-visa-backend  (confidential, bearer-only)"
echo "    doer-auth-svc      (confidential, service account)"
echo "    doer-admin         (public, PKCE S256)"
echo ""
echo "  doer-visa Roles: manage_all, manage_applications, process_visa,"
echo "                   approve_visa, view_applications, apply_visa,"
echo "                   view_own_status"
echo "  Composite Roles: staff_basic, staff_senior, customer"
echo ""
echo "  Organizations:   enabled (test org: 'Test Visa Agency')"
echo "  Password Policy: 8+ chars, upper+lower+digit+special, history=3"
echo "  Brute Force:     5 failures → 60s lockout, max 15min"
echo "  OTP Policy:      TOTP, 6 digits, 30s period"
echo ""
echo "  Secrets (save these to .env):"
echo "    AUTH_SVC_CLIENT_SECRET=${AUTH_SVC_SECRET}"
echo "    VISA_BACKEND_CLIENT_SECRET=${VISA_BE_SECRET}"
echo ""
echo "  Next: Phase 3 (Auth Service), Phase 4 (APISIX), Phase 5 (Themes)"
echo ""
