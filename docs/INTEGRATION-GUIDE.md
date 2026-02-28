# Doer Central Auth — Developer Integration Guide

> **Version**: 1.0 | **Last updated**: 2026-02-28
>
> This guide explains how to integrate any product with the Doer central authentication and authorization platform. It covers architecture, Keycloak client setup, APISIX gateway configuration, auth service APIs, and frontend/backend code patterns.
>
> **Reference implementation**: `doer-visa` (frontend + API) in `dummy-products/`

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Concepts](#2-concepts)
3. [Register Your Product (Runbook)](#3-register-your-product-runbook)
4. [Auth Service API Reference](#4-auth-service-api-reference)
5. [APISIX Header Injection Reference](#5-apisix-header-injection-reference)
6. [Frontend Integration Guide](#6-frontend-integration-guide)
7. [Backend Integration Guide](#7-backend-integration-guide)
8. [JWT Token Reference](#8-jwt-token-reference)
9. [Role System Deep Dive](#9-role-system-deep-dive)
10. [Troubleshooting & FAQ](#10-troubleshooting--faq)

---

## 1. Architecture Overview

### What Central Auth Provides

- **Authentication (AuthN)**: Login, registration, password reset, token refresh, logout — all via Keycloak + Auth Service
- **Authorization (AuthZ)**: Realm roles (WHO), client roles (WHAT), organization scoping (WHOSE)
- **Multi-tenancy**: Keycloak Organizations map to tenants; each user belongs to one org
- **Gateway enforcement**: APISIX validates JWTs before requests reach your service

### Architecture Diagram

```
                          +-----------+
                          | Keycloak  |
                          | :8080     |
                          +-----+-----+
                                |
    Browser                     | OIDC
    (SPA)                       |
      |                   +-----+------+
      |  HTTPS            |            |
      +------------------>+  APISIX    +-------> Your Product API
         all traffic      |  :9080     |         (reads headers only)
         via gateway      |            |
                          +-----+------+
                                |
                                | forward
                                |
                          +-----+------+
                          | Auth Svc   |
                          | :3001      |
                          +------------+
```

All traffic flows through APISIX on port **9080**. The gateway:

1. **Public routes** (`/auth/*`): Forwards directly to Auth Service — no JWT check
2. **Protected routes** (`/api/*`): Validates the JWT via the `openid-connect` plugin, then forwards with the original `Authorization` header
3. **Product routes** (`/api/your-product/*`): Validates JWT, decodes claims into HTTP headers, forwards to your service
4. **Keycloak passthrough** (`/realms/*`): Forwards OIDC discovery/auth endpoints to Keycloak

### The "Zero Auth Code" Principle

Your product service **never** touches JWTs. APISIX validates the token and injects identity as plain HTTP headers:

| Header | Value |
|--------|-------|
| `X-User-Id` | User's Keycloak ID (UUID) |
| `X-User-Email` | User's email |
| `X-User-Roles` | Realm roles (comma-separated) |
| `X-Client-Roles` | Your product's client roles (comma-separated) |
| `X-Organization-Id` | Tenant alias from the JWT org claim |

Your backend just reads these headers. No JWT library needed.

### Port Table

| Service | Port | Purpose |
|---------|------|---------|
| Keycloak | 8080 | Identity provider (OIDC) |
| APISIX | 9080 | API gateway (all client traffic) |
| APISIX Admin | 9180 | Route configuration API |
| Auth Service | 3001 | User/tenant management APIs |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | OTP storage, rate limiting |
| etcd | 2379 | APISIX configuration store |
| Prometheus | 9090 | Metrics collection |
| Grafana | 3000 | Dashboards |

---

## 2. Concepts

### Realm Roles (WHO is the user?)

Realm roles describe the user's position in the platform hierarchy:

| Role | Description | Assigned by |
|------|-------------|-------------|
| `platform_admin` | Full platform access, cross-tenant | Manual |
| `tenant_admin` | Manages one tenant's users and settings | Platform admin |
| `tenant_employee` | Staff member within a tenant | Tenant admin |
| `end_user` | Default role for self-registered users | Automatic |

Every user gets `end_user` by default. Admins assign higher roles via the Auth Service API.

### Client Roles (WHAT can they do?)

Client roles are **product-specific permissions** scoped to a Keycloak client. For example, the `doer-visa` client defines:

| Client Role | Description |
|-------------|-------------|
| `apply_visa` | Submit visa applications |
| `view_own_status` | See own application status |
| `view_applications` | See all org applications |
| `process_visa` | Move applications to "processing" |
| `approve_visa` | Approve/reject applications |
| `manage_applications` | Full application management |
| `manage_all` | Superuser for this product |

When you create your product, you define your own client roles. They appear in the JWT under `resource_access.<client-id>.roles`.

### Organizations (WHOSE data?)

Keycloak Organizations provide tenant isolation:

- Each tenant is a Keycloak Organization with a unique **alias** (e.g., `acme-corp`)
- Users are members of one organization
- The JWT contains an `organization` claim with the alias
- APISIX extracts this into the `X-Organization-Id` header
- Your backend uses this to scope data queries (e.g., `WHERE org_id = :orgId`)

### PKCE Flow

All frontends use **Authorization Code + PKCE** (Proof Key for Code Exchange):

```
1. Frontend generates code_verifier (random string)
2. Frontend computes code_challenge = SHA256(code_verifier)
3. Frontend redirects to Keycloak /auth?code_challenge=...
4. User logs in at Keycloak
5. Keycloak redirects back with ?code=AUTH_CODE
6. Frontend sends AUTH_CODE + code_verifier to Auth Service
7. Auth Service exchanges with Keycloak, returns tokens
```

No client secrets are exposed to the browser. No implicit flow. No ROPC.

### Token Lifecycle

| Token | Lifetime | Storage |
|-------|----------|---------|
| Access token | 15 minutes (900s) | `sessionStorage` |
| Refresh token | Tied to SSO session | `sessionStorage` |
| SSO session (idle) | 4 hours | Keycloak server-side |
| SSO session (max) | 24 hours | Keycloak server-side |
| Remember-me session | 7 days | Keycloak server-side |

Refresh flow: When the access token expires, use the refresh token to get a new pair. When the refresh token expires, the user must log in again.

---

## 3. Register Your Product (Runbook)

This section walks you through registering a new product (e.g., `doer-school`) with the central auth system.

**Prerequisites**: Keycloak running at `localhost:8080`, realm `doer` exists.

### Step 0: Get an Admin Token

```bash
# Get Keycloak admin token
KC=http://localhost:8080
ADMIN_TOKEN=$(curl -s -X POST "$KC/realms/master/protocol/openid-connect/token" \
  -d "grant_type=client_credentials" \
  -d "client_id=admin-cli" \
  -d "username=admin" \
  -d "password=admin" \
  -d "grant_type=password" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

echo "Token: ${ADMIN_TOKEN:0:20}..."
```

### Step 1: Create the Public Client (Frontend)

This client is used by your SPA for the PKCE login flow.

```bash
# Create public client for your frontend
curl -s -X POST "$KC/admin/realms/doer/clients" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "doer-school",
    "name": "Doer School",
    "enabled": true,
    "publicClient": true,
    "protocol": "openid-connect",
    "rootUrl": "http://localhost:5174",
    "redirectUris": [
      "http://localhost:5174/*",
      "http://localhost:3001/*"
    ],
    "webOrigins": [
      "http://localhost:5174",
      "http://localhost:3001"
    ],
    "attributes": {
      "pkce.code.challenge.method": "S256",
      "post.logout.redirect.uris": "http://localhost:5174/*"
    },
    "fullScopeAllowed": false,
    "directAccessGrantsEnabled": false,
    "standardFlowEnabled": true
  }'
echo "Public client created."
```

Key settings:
- `publicClient: true` — no client secret (PKCE instead)
- `pkce.code.challenge.method: S256` — enforce PKCE
- `fullScopeAllowed: false` — only explicitly mapped roles appear in tokens
- `directAccessGrantsEnabled: false` — no password grant (PKCE only)

### Step 2: Create the Bearer-Only Client (APISIX Validation)

This confidential client is used by APISIX to validate JWTs via introspection.

```bash
curl -s -X POST "$KC/admin/realms/doer/clients" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "clientId": "doer-school-backend",
    "name": "Doer School Backend",
    "enabled": true,
    "publicClient": false,
    "protocol": "openid-connect",
    "bearerOnly": true,
    "serviceAccountsEnabled": false,
    "standardFlowEnabled": false
  }'
echo "Bearer-only client created."
```

Retrieve the client secret:

```bash
# Get the internal UUID of the client
CLIENT_UUID=$(curl -s "$KC/admin/realms/doer/clients?clientId=doer-school-backend" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Get the secret
CLIENT_SECRET=$(curl -s "$KC/admin/realms/doer/clients/$CLIENT_UUID/client-secret" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)['value'])")

echo "Backend client secret: $CLIENT_SECRET"
# Save this — you'll need it for the APISIX route configuration
```

### Step 3: Define Client Roles

Create the permissions specific to your product on the **public** client:

```bash
# Get public client UUID
PUB_UUID=$(curl -s "$KC/admin/realms/doer/clients?clientId=doer-school" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Create client roles
for ROLE in "manage_students" "view_grades" "submit_grades" "manage_courses" "view_own_grades"; do
  curl -s -X POST "$KC/admin/realms/doer/clients/$PUB_UUID/roles" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$ROLE\"}"
  echo "  Created role: $ROLE"
done
```

### Step 4: Configure Scope Mappings

Map realm roles and client roles so they appear in the JWT:

```bash
# --- Add realm roles to client scope ---
# Get realm role IDs
for ROLE in "platform_admin" "tenant_admin" "tenant_employee" "end_user"; do
  ROLE_JSON=$(curl -s "$KC/admin/realms/doer/roles/$ROLE" \
    -H "Authorization: Bearer $ADMIN_TOKEN")

  curl -s -X POST "$KC/admin/realms/doer/clients/$PUB_UUID/scope-mappings/realm" \
    -H "Authorization: Bearer $ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    -d "[$ROLE_JSON]"
  echo "  Mapped realm role: $ROLE"
done

# --- Add client roles to client scope ---
# Get all client roles
ALL_ROLES=$(curl -s "$KC/admin/realms/doer/clients/$PUB_UUID/roles" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

curl -s -X POST "$KC/admin/realms/doer/clients/$PUB_UUID/scope-mappings/clients/$PUB_UUID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$ALL_ROLES"
echo "  Mapped all client roles to scope."
```

**Also add a protocol mapper** for client roles to appear in `resource_access`:

```bash
curl -s -X POST "$KC/admin/realms/doer/clients/$PUB_UUID/protocol-mappers/models" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "doer-school-client-roles",
    "protocol": "openid-connect",
    "protocolMapper": "oidc-usermodel-client-role-mapper",
    "config": {
      "claim.name": "resource_access.doer-school.roles",
      "multivalued": "true",
      "id.token.claim": "true",
      "access.token.claim": "true",
      "userinfo.token.claim": "true",
      "usermodel.clientRoleMapping.clientId": "doer-school"
    }
  }'
echo "  Protocol mapper created."
```

### Step 5: Move Organization Scope to Default

The `organization` scope must be a **default** scope (not optional) for the org claim to appear in tokens automatically:

```bash
# Find the organization scope ID
ORG_SCOPE_ID=$(curl -s "$KC/admin/realms/doer/client-scopes" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  python3 -c "import sys,json; scopes=json.load(sys.stdin); print(next(s['id'] for s in scopes if s['name']=='organization'))")

# Remove from optional scopes (if present)
curl -s -X DELETE "$KC/admin/realms/doer/clients/$PUB_UUID/optional-client-scopes/$ORG_SCOPE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" 2>/dev/null

# Add as default scope
curl -s -X PUT "$KC/admin/realms/doer/clients/$PUB_UUID/default-client-scopes/$ORG_SCOPE_ID" \
  -H "Authorization: Bearer $ADMIN_TOKEN"
echo "  Organization scope set as default."
```

### Step 6: Set Redirect URIs and Web Origins

If you need to update redirect URIs later:

```bash
# Get full client config
CLIENT_JSON=$(curl -s "$KC/admin/realms/doer/clients/$PUB_UUID" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

# Update with new URIs
echo "$CLIENT_JSON" | python3 -c "
import sys, json
c = json.load(sys.stdin)
c['redirectUris'] = ['http://localhost:5174/*', 'https://school.doer.com/*']
c['webOrigins'] = ['http://localhost:5174', 'https://school.doer.com']
json.dump(c, sys.stdout)
" | curl -s -X PUT "$KC/admin/realms/doer/clients/$PUB_UUID" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d @-
echo "  Redirect URIs updated."
```

### Step 7: Add APISIX Route with Header Injection

Create an APISIX route that validates JWTs and injects user claims as headers:

```bash
APISIX_ADMIN="http://localhost:9180"
APISIX_KEY="doer_apisix_admin_key_2026"
KC_DISCOVERY="http://localhost:8080/realms/doer/.well-known/openid-configuration"

# Replace with your backend client credentials from Step 2
BACKEND_CLIENT_ID="doer-school-backend"
BACKEND_SECRET="YOUR_SECRET_FROM_STEP_2"

# Replace "doer-school" with your public client ID
# Replace port 4002 with your service port
# Replace "/api/school" with your API prefix

LUA_FN='return function(conf, ctx) local core = require("apisix.core"); local hdr = core.request.header(ctx, "X-Userinfo"); if not hdr then return end; local json_str = ngx.decode_base64(hdr); if not json_str then return end; local payload = require("cjson.safe").decode(json_str); if not payload then return end; if payload.sub then core.request.set_header(ctx, "X-User-Id", payload.sub) end; if payload.email then core.request.set_header(ctx, "X-User-Email", payload.email) end; if payload.realm_access and payload.realm_access.roles then core.request.set_header(ctx, "X-User-Roles", table.concat(payload.realm_access.roles, ",")) end; local ra = payload.resource_access; if ra and ra["doer-school"] and ra["doer-school"].roles then core.request.set_header(ctx, "X-Client-Roles", table.concat(ra["doer-school"].roles, ",")) end; if payload.organization then local org = payload.organization; if type(org) == "table" then if org[1] then core.request.set_header(ctx, "X-Organization-Id", org[1]) else for k, _ in pairs(org) do core.request.set_header(ctx, "X-Organization-Id", k); break end end end; core.request.set_header(ctx, "X-Userinfo", nil) end'

curl -s -X PUT "$APISIX_ADMIN/apisix/admin/routes/YOUR_ROUTE_ID" \
  -H "X-API-KEY: $APISIX_KEY" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"school-api\",
    \"desc\": \"Doer-School product API\",
    \"uris\": [\"/api/school\", \"/api/school/*\"],
    \"methods\": [\"GET\", \"POST\", \"PUT\", \"DELETE\", \"OPTIONS\"],
    \"upstream\": {
      \"type\": \"roundrobin\",
      \"nodes\": {\"localhost:4002\": 1},
      \"timeout\": {\"connect\": 5, \"send\": 10, \"read\": 10}
    },
    \"plugins\": {
      \"openid-connect\": {
        \"discovery\": \"$KC_DISCOVERY\",
        \"client_id\": \"$BACKEND_CLIENT_ID\",
        \"client_secret\": \"$BACKEND_SECRET\",
        \"bearer_only\": true,
        \"realm\": \"doer\",
        \"token_signing_alg_values_expected\": \"RS256\",
        \"set_userinfo_header\": true,
        \"set_access_token_header\": false
      },
      \"serverless-pre-function\": {
        \"phase\": \"before_proxy\",
        \"functions\": [\"$LUA_FN\"]
      },
      \"cors\": {
        \"allow_origins\": \"**\",
        \"allow_methods\": \"GET,POST,PUT,DELETE,OPTIONS\",
        \"allow_headers\": \"Content-Type,Authorization,X-Request-Id\",
        \"expose_headers\": \"X-Request-Id\",
        \"max_age\": 3600,
        \"allow_credential\": false
      },
      \"limit-count\": {
        \"count\": 1000,
        \"time_window\": 60,
        \"key_type\": \"var\",
        \"key\": \"remote_addr\",
        \"rejected_code\": 429,
        \"policy\": \"local\"
      }
    }
  }"
```

> **Important**: In the Lua function, replace `ra["doer-school"]` with your public client ID.

### Step 8 (Optional): Add Registration Config

If your product supports self-registration, add a registration config:

```bash
# Via the Auth Service API (requires platform_admin JWT)
curl -X POST http://localhost:9080/api/tenants \
  -H "Authorization: Bearer $PLATFORM_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "School Corp",
    "alias": "school-corp",
    "product": "doer-school",
    "plan": "basic",
    "maxUsers": 100,
    "adminEmail": "admin@school-corp.com",
    "adminFullName": "School Admin",
    "adminPassword": "SecureP@ss1"
  }'
```

This creates the tenant, Keycloak organization, and admin user in one call.

---

## 4. Auth Service API Reference

**Base URL**: `http://localhost:9080` (via APISIX gateway)

### Response Format

All successful responses are wrapped:

```json
{
  "success": true,
  "data": { ... }
}
```

Paginated responses:

```json
{
  "success": true,
  "data": [ ... ],
  "meta": {
    "page": 1,
    "limit": 20,
    "total": 57,
    "totalPages": 3
  }
}
```

Error responses:

```json
{
  "statusCode": 403,
  "error": "FORBIDDEN",
  "message": "You do not have permission to perform this action",
  "timestamp": "2026-02-28T12:00:00.000Z",
  "path": "/api/tenants/..."
}
```

### 4.1 Public Endpoints (No Auth Required)

These endpoints are routed through APISIX Route 1 (`/auth/*`) with no JWT validation.

---

#### POST /auth/register

Register a new end user.

```bash
curl -X POST http://localhost:9080/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "product": "doer-visa",
    "tenantAlias": "acme-corp",
    "email": "newuser@example.com",
    "phone": "+966501234567",
    "password": "SecureP@ss1",
    "fullName": "John Doe"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `product` | string | Yes | Client ID of the product (e.g., `doer-visa`) |
| `tenantAlias` | string | No | Organization alias to join |
| `email` | string | Yes | Must be a valid email |
| `phone` | string | Yes | Phone number |
| `password` | string | Yes | Min 8 chars, must meet password policy |
| `fullName` | string | Yes | User's display name |

---

#### POST /auth/token

Exchange an authorization code for tokens (PKCE flow).

```bash
curl -X POST http://localhost:9080/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "code": "AUTH_CODE_FROM_KEYCLOAK",
    "codeVerifier": "THE_ORIGINAL_CODE_VERIFIER",
    "redirectUri": "http://localhost:5173/callback",
    "clientId": "doer-visa"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `code` | string | Yes | Authorization code from Keycloak redirect |
| `codeVerifier` | string | Yes | The original PKCE code verifier |
| `redirectUri` | string | Yes | Must match the redirect URI used in the auth request |
| `clientId` | string | Yes | Your public client ID |

**Response**:
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJhbG...",
    "refreshToken": "eyJhbG...",
    "expiresIn": 900,
    "tokenType": "Bearer"
  }
}
```

> **Note**: Field names are **camelCase** (`accessToken`, not `access_token`), and the response is wrapped in the standard `{success, data}` envelope.

---

#### POST /auth/refresh

Refresh an expired access token.

```bash
curl -X POST http://localhost:9080/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "REFRESH_TOKEN",
    "clientId": "doer-visa"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshToken` | string | Yes | The refresh token from the last token response |
| `clientId` | string | Yes | Your public client ID |

---

#### POST /auth/logout

Revoke tokens and end the session.

```bash
curl -X POST http://localhost:9080/auth/logout \
  -H "Content-Type: application/json" \
  -d '{
    "refreshToken": "REFRESH_TOKEN",
    "clientId": "doer-visa"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `refreshToken` | string | Yes | The refresh token to revoke |
| `clientId` | string | Yes | Your public client ID |

---

#### POST /auth/forgot-password

Initiate a password reset (sends OTP via email/SMS).

```bash
curl -X POST http://localhost:9080/auth/forgot-password \
  -H "Content-Type: application/json" \
  -d '{
    "identifier": "user@example.com",
    "product": "doer-visa"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `identifier` | string | Yes | Email or phone number |
| `product` | string | Yes | Product client ID |

---

#### POST /auth/reset-password

Reset password using OTP verification.

```bash
curl -X POST http://localhost:9080/auth/reset-password \
  -H "Content-Type: application/json" \
  -d '{
    "phone": "+966501234567",
    "otp": "123456",
    "newPassword": "NewSecureP@ss1"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `phone` | string | Yes | The phone number that received the OTP |
| `otp` | string | Yes | The OTP code |
| `newPassword` | string | Yes | New password (min 8 chars, must meet policy) |

---

#### GET /auth/invite/:token

Validate an invitation token and return invitation details.

```bash
curl http://localhost:9080/auth/invite/abc123-invite-token
```

---

#### POST /auth/accept-invite

Accept an invitation and create an account.

```bash
curl -X POST http://localhost:9080/auth/accept-invite \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123-invite-token",
    "fullName": "Jane Smith",
    "phone": "+966501234567",
    "password": "SecureP@ss1"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `token` | string | Yes | Invitation token from email link |
| `fullName` | string | Yes | User's display name |
| `phone` | string | Yes | Phone number |
| `password` | string | Yes | Min 8 chars, must meet password policy |

---

### 4.2 Tenant Management (JWT Required)

These endpoints require a valid JWT in the `Authorization: Bearer <token>` header. Routed through APISIX Route 2 (`/api/tenants/*`) which validates the JWT.

---

#### POST /api/tenants

Create a new tenant (with Keycloak organization and admin user).

**Required role**: `platform_admin`

```bash
curl -X POST http://localhost:9080/api/tenants \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corporation",
    "alias": "acme-corp",
    "product": "doer-visa",
    "plan": "pro",
    "maxUsers": 50,
    "billingEmail": "billing@acme.com",
    "domain": "acme.com",
    "adminEmail": "admin@acme.com",
    "adminFullName": "John Admin",
    "adminPassword": "SecureP@ss1"
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Display name |
| `alias` | string | Yes | URL-safe identifier (becomes org alias) |
| `product` | string | Yes | Product client ID |
| `plan` | enum | No | `basic`, `pro`, or `enterprise` |
| `maxUsers` | number | No | Maximum users allowed (min: 1) |
| `billingEmail` | string | No | Billing contact email |
| `domain` | string | No | Company domain |
| `adminEmail` | string | Yes | Initial admin's email |
| `adminFullName` | string | Yes | Initial admin's name |
| `adminPassword` | string | Yes | Initial admin's password |

---

#### GET /api/tenants

List tenants with pagination.

**Required role**: `platform_admin` or `tenant_admin`

```bash
curl http://localhost:9080/api/tenants?page=1&limit=20 \
  -H "Authorization: Bearer $TOKEN"
```

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `page` | number | 1 | Page number (min: 1) |
| `limit` | number | 20 | Items per page (min: 1, max: 100) |

---

#### GET /api/tenants/:id

Get tenant details.

**Required role**: Any authenticated user (tenant-scoped — user must belong to this tenant or be `platform_admin`)

```bash
curl http://localhost:9080/api/tenants/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN"
```

---

#### PUT /api/tenants/:id

Update tenant settings.

**Required role**: `platform_admin`

```bash
curl -X PUT http://localhost:9080/api/tenants/550e8400-e29b-41d4-a716-446655440000 \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Acme Corp Updated",
    "plan": "enterprise",
    "maxUsers": 200
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | No | Updated display name |
| `plan` | enum | No | `basic`, `pro`, or `enterprise` |
| `maxUsers` | number | No | Updated user limit |
| `status` | enum | No | `active`, `inactive`, or `suspended` |
| `billingEmail` | string | No | Updated billing email |
| `domain` | string | No | Updated domain |

---

#### PUT /api/tenants/:id/activate

Activate a tenant and enable all its members in Keycloak.

**Required role**: `platform_admin`

```bash
curl -X PUT http://localhost:9080/api/tenants/550e8400-e29b-41d4-a716-446655440000/activate \
  -H "Authorization: Bearer $TOKEN"
```

---

#### PUT /api/tenants/:id/deactivate

Deactivate a tenant and disable all its members in Keycloak.

**Required role**: `platform_admin`

```bash
curl -X PUT http://localhost:9080/api/tenants/550e8400-e29b-41d4-a716-446655440000/deactivate \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4.3 User Management (JWT + Tenant Scope)

All user endpoints are scoped to a tenant. The `TenantScopeGuard` ensures the caller belongs to the tenant (matched via the `organization` claim in the JWT) or is a `platform_admin`.

---

#### POST /api/tenants/:tid/users

Create a user within the tenant.

**Required role**: `platform_admin` or `tenant_admin`

```bash
curl -X POST http://localhost:9080/api/tenants/$TENANT_ID/users \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "employee@acme.com",
    "fullName": "Jane Employee",
    "phone": "+966509876543",
    "password": "SecureP@ss1",
    "realmRole": "tenant_employee",
    "clientRoles": ["process_visa", "view_applications"]
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Must be a valid email |
| `fullName` | string | Yes | Display name |
| `phone` | string | No | Phone number |
| `password` | string | Yes | Min 8 chars |
| `realmRole` | string | Yes | One of: `tenant_admin`, `tenant_employee`, `end_user` |
| `clientRoles` | string[] | No | Product-specific roles (e.g., `["process_visa"]`) |

---

#### GET /api/tenants/:tid/users

List users in a tenant.

**Required role**: Any authenticated user within tenant scope

```bash
curl "http://localhost:9080/api/tenants/$TENANT_ID/users?max=20" \
  -H "Authorization: Bearer $TOKEN"
```

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `first` | number | — | Offset (skip N users) |
| `max` | number | 20 | Maximum results to return |

---

#### GET /api/tenants/:tid/users/:uid

Get detailed user information including roles.

**Required role**: Any authenticated user within tenant scope

```bash
curl http://localhost:9080/api/tenants/$TENANT_ID/users/$USER_ID \
  -H "Authorization: Bearer $TOKEN"
```

---

#### PUT /api/tenants/:tid/users/:uid/roles

Update a user's roles.

**Required role**: `platform_admin` or `tenant_admin`

```bash
curl -X PUT http://localhost:9080/api/tenants/$TENANT_ID/users/$USER_ID/roles \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "realmRole": "tenant_employee",
    "clientRoles": ["process_visa", "approve_visa"]
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `realmRole` | string | No | New realm role |
| `clientRoles` | string[] | No | **Replaces** all existing client roles |

> **Warning**: `clientRoles` is a full replacement, not additive. Always send the complete list of desired roles.

---

#### PUT /api/tenants/:tid/users/:uid/disable

Disable a user (they can no longer log in).

**Required role**: `platform_admin` or `tenant_admin`

```bash
curl -X PUT http://localhost:9080/api/tenants/$TENANT_ID/users/$USER_ID/disable \
  -H "Authorization: Bearer $TOKEN"
```

---

#### PUT /api/tenants/:tid/users/:uid/enable

Re-enable a disabled user.

**Required role**: `platform_admin` or `tenant_admin`

```bash
curl -X PUT http://localhost:9080/api/tenants/$TENANT_ID/users/$USER_ID/enable \
  -H "Authorization: Bearer $TOKEN"
```

---

#### DELETE /api/tenants/:tid/users/:uid

Remove a user from the tenant.

**Required role**: `platform_admin` or `tenant_admin`

```bash
curl -X DELETE http://localhost:9080/api/tenants/$TENANT_ID/users/$USER_ID \
  -H "Authorization: Bearer $TOKEN"
```

---

#### POST /api/tenants/:tid/users/invite

Send an email invitation to join the tenant.

**Required role**: `platform_admin` or `tenant_admin`

```bash
curl -X POST http://localhost:9080/api/tenants/$TENANT_ID/users/invite \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "invitee@example.com",
    "role": "tenant_employee",
    "expiresInHours": 72
  }'
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `email` | string | Yes | Invitee's email |
| `role` | string | Yes | Realm role to assign on acceptance |
| `expiresInHours` | number | No | Token expiry (default varies) |

---

#### GET /api/tenants/:tid/users/roles/available

List available client roles for the tenant's product.

**Required role**: Any authenticated user within tenant scope

```bash
curl http://localhost:9080/api/tenants/$TENANT_ID/users/roles/available \
  -H "Authorization: Bearer $TOKEN"
```

---

### 4.4 Platform Admin Endpoints

All platform endpoints require `platform_admin` role. Routed through APISIX Route 3 (`/api/platform/*`).

---

#### GET /api/platform/stats

Get platform-wide statistics (tenant counts, user counts, etc.).

```bash
curl http://localhost:9080/api/platform/stats \
  -H "Authorization: Bearer $TOKEN"
```

---

#### GET /api/platform/audit-logs

Query the audit trail with filters.

```bash
curl "http://localhost:9080/api/platform/audit-logs?action=CREATE_TENANT&page=1&limit=50" \
  -H "Authorization: Bearer $TOKEN"
```

| Query Param | Type | Description |
|-------------|------|-------------|
| `tenantId` | string | Filter by tenant UUID |
| `actorId` | string | Filter by actor user ID |
| `action` | string | Filter by action type |
| `resourceType` | string | Filter by resource type |
| `from` | string | Start date (ISO 8601) |
| `to` | string | End date (ISO 8601) |
| `page` | number | Page number |
| `limit` | number | Items per page |

---

#### GET /api/platform/users

Cross-tenant user search.

```bash
curl "http://localhost:9080/api/platform/users?q=john&max=20" \
  -H "Authorization: Bearer $TOKEN"
```

| Query Param | Type | Default | Description |
|-------------|------|---------|-------------|
| `q` | string | `""` | Search query (searches email, name, username) |
| `first` | number | — | Offset |
| `max` | number | 20 | Maximum results |

---

## 5. APISIX Header Injection Reference

### How It Works

APISIX Route 4 (the product route pattern) uses two plugins in sequence:

1. **`openid-connect`**: Validates the JWT against Keycloak's OIDC discovery endpoint. If invalid, returns 401. If valid, sets `X-Userinfo` header with the base64-encoded JWT payload.

2. **`serverless-pre-function`**: A Lua function that runs in the `before_proxy` phase. It decodes `X-Userinfo`, extracts claims, and sets individual headers.

### Headers Injected

| Header | Source | Example |
|--------|--------|---------|
| `X-User-Id` | `payload.sub` | `f47ac10b-58cc-4372-a567-0e02b2c3d479` |
| `X-User-Email` | `payload.email` | `user@acme.com` |
| `X-User-Roles` | `payload.realm_access.roles` (joined) | `end_user,tenant_employee` |
| `X-Client-Roles` | `payload.resource_access.<client>.roles` (joined) | `apply_visa,view_own_status` |
| `X-Organization-Id` | `payload.organization[0]` | `acme-corp` |

The `X-Userinfo` header is **removed** after extraction (set to `nil`) so it doesn't leak to your service.

### Lua Function Template

Copy this template and replace `YOUR_CLIENT_ID` with your product's public client ID:

```lua
return function(conf, ctx)
  local core = require("apisix.core")
  local hdr = core.request.header(ctx, "X-Userinfo")
  if not hdr then return end

  local json_str = ngx.decode_base64(hdr)
  if not json_str then return end

  local payload = require("cjson.safe").decode(json_str)
  if not payload then return end

  -- User identity
  if payload.sub then
    core.request.set_header(ctx, "X-User-Id", payload.sub)
  end
  if payload.email then
    core.request.set_header(ctx, "X-User-Email", payload.email)
  end

  -- Realm roles
  if payload.realm_access and payload.realm_access.roles then
    core.request.set_header(ctx, "X-User-Roles",
      table.concat(payload.realm_access.roles, ","))
  end

  -- Client roles (REPLACE "YOUR_CLIENT_ID" with your product client ID)
  local ra = payload.resource_access
  if ra and ra["YOUR_CLIENT_ID"] and ra["YOUR_CLIENT_ID"].roles then
    core.request.set_header(ctx, "X-Client-Roles",
      table.concat(ra["YOUR_CLIENT_ID"].roles, ","))
  end

  -- Organization (tenant alias)
  if payload.organization then
    local org = payload.organization
    if type(org) == "table" then
      if org[1] then
        -- Array format: ["alias"]
        core.request.set_header(ctx, "X-Organization-Id", org[1])
      else
        -- Map format: {"alias": {}}
        for k, _ in pairs(org) do
          core.request.set_header(ctx, "X-Organization-Id", k)
          break
        end
      end
    end
  end

  -- Remove raw userinfo header
  core.request.set_header(ctx, "X-Userinfo", nil)
end
```

> **Note on organization format**: Keycloak's `oidc-organization-membership-mapper` returns the org as an **array** (`["alias"]`). The template handles both array and map formats for safety.

### APISIX Route JSON Template

```json
{
  "name": "your-product-api",
  "desc": "Your product API — JWT validated, claims injected as headers",
  "uris": ["/api/your-product", "/api/your-product/*"],
  "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  "upstream": {
    "type": "roundrobin",
    "nodes": { "localhost:YOUR_PORT": 1 },
    "timeout": { "connect": 5, "send": 10, "read": 10 }
  },
  "plugins": {
    "openid-connect": {
      "discovery": "http://localhost:8080/realms/doer/.well-known/openid-configuration",
      "client_id": "your-product-backend",
      "client_secret": "YOUR_BACKEND_CLIENT_SECRET",
      "bearer_only": true,
      "realm": "doer",
      "token_signing_alg_values_expected": "RS256",
      "set_userinfo_header": true,
      "set_access_token_header": false
    },
    "serverless-pre-function": {
      "phase": "before_proxy",
      "functions": ["<MINIFIED_LUA_FUNCTION_FROM_ABOVE>"]
    },
    "cors": {
      "allow_origins": "**",
      "allow_methods": "GET,POST,PUT,DELETE,OPTIONS",
      "allow_headers": "Content-Type,Authorization,X-Request-Id",
      "expose_headers": "X-Request-Id",
      "max_age": 3600,
      "allow_credential": false
    },
    "limit-count": {
      "count": 1000,
      "time_window": 60,
      "key_type": "var",
      "key": "remote_addr",
      "rejected_code": 429,
      "policy": "local"
    }
  }
}
```

---

## 6. Frontend Integration Guide

This section provides copy-paste ready code for a React SPA. The patterns apply to any framework — the core logic is plain TypeScript.

### 6.1 PKCE Helpers

```typescript
// auth/pkce.ts

export function generateCodeVerifier(): string {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return base64UrlEncode(new Uint8Array(digest));
}

function base64UrlEncode(bytes: Uint8Array): string {
  const str = btoa(String.fromCharCode(...bytes));
  return str.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
```

### 6.2 Token Storage

```typescript
// auth/token-storage.ts

const ACCESS_TOKEN_KEY = "doer_access_token";
const REFRESH_TOKEN_KEY = "doer_refresh_token";

export function getAccessToken(): string | null {
  return sessionStorage.getItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  sessionStorage.setItem(ACCESS_TOKEN_KEY, accessToken);
  if (refreshToken) {
    sessionStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
  }
}

export function clearTokens(): void {
  sessionStorage.removeItem(ACCESS_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem("pkce_verifier");
}
```

> **Why `sessionStorage`?** Tokens are cleared when the tab closes, reducing exposure. For multi-tab support, consider `localStorage` with appropriate expiry checks.

### 6.3 JWT Decoder (No Library Needed)

```typescript
// auth/jwt.ts

export interface DecodedJwt {
  sub: string;
  email?: string;
  preferred_username?: string;
  given_name?: string;
  family_name?: string;
  realm_access?: { roles: string[] };
  resource_access?: Record<string, { roles: string[] }>;
  organization?: string[];
  exp?: number;
}

export function decodeJwt(token: string): DecodedJwt | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}
```

### 6.4 Login Flow

```typescript
// Redirect user to Keycloak login
import { generateCodeVerifier, generateCodeChallenge } from "./pkce";

const KC_BASE = "http://localhost:8080";
const REALM = "doer";
const CLIENT_ID = "doer-visa";  // Your product client ID
const REDIRECT_URI = `${window.location.origin}/callback`;

async function login(): Promise<void> {
  const verifier = generateCodeVerifier();
  sessionStorage.setItem("pkce_verifier", verifier);
  const challenge = await generateCodeChallenge(verifier);

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid",
    code_challenge: challenge,
    code_challenge_method: "S256",
  });

  window.location.href =
    `${KC_BASE}/realms/${REALM}/protocol/openid-connect/auth?${params}`;
}
```

### 6.5 Callback Handler

When Keycloak redirects back with `?code=...`, exchange it for tokens:

```typescript
// pages/CallbackPage.tsx (or equivalent)

const APISIX_BASE = "http://localhost:9080";

async function handleCallback(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  const verifier = sessionStorage.getItem("pkce_verifier");

  if (!code || !verifier) {
    console.error("Missing code or verifier");
    window.location.href = "/login";
    return;
  }

  const resp = await fetch(`${APISIX_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      codeVerifier: verifier,
      redirectUri: REDIRECT_URI,
      clientId: CLIENT_ID,
    }),
  });

  if (!resp.ok) throw new Error(`Token exchange failed: ${resp.status}`);

  const json = await resp.json();
  // Response is wrapped: { success: true, data: { accessToken, refreshToken, ... } }
  const tokens = json.data;
  setTokens(tokens.accessToken, tokens.refreshToken);
  sessionStorage.removeItem("pkce_verifier");

  // Clean URL and navigate to app
  window.history.replaceState({}, "", "/");
  window.location.href = "/dashboard";
}
```

### 6.6 API Client with Bearer Header

```typescript
// api/client.ts

import { getAccessToken } from "../auth/token-storage";

const APISIX_BASE = "http://localhost:9080";

export async function apiCall<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getAccessToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const resp = await fetch(`${APISIX_BASE}${path}`, { ...options, headers });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.message || `HTTP ${resp.status}`);
  }

  return resp.json();
}
```

### 6.7 Token Refresh on 401

Wrap API calls with automatic refresh:

```typescript
export async function apiCallWithRefresh<T = unknown>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  try {
    return await apiCall<T>(path, options);
  } catch (err: any) {
    if (err.message?.includes("401")) {
      const refreshed = await refreshTokens();
      if (refreshed) {
        return apiCall<T>(path, options);  // Retry with new token
      }
      // Refresh failed — redirect to login
      clearTokens();
      window.location.href = "/login";
    }
    throw err;
  }
}

async function refreshTokens(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const resp = await fetch(`${APISIX_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken, clientId: CLIENT_ID }),
  });

  if (!resp.ok) return false;

  const json = await resp.json();
  // Response is wrapped: { success: true, data: { accessToken, refreshToken, ... } }
  const tokens = json.data;
  setTokens(tokens.accessToken, tokens.refreshToken);
  return true;
}
```

### 6.8 Logout Flow

```typescript
async function logout(): Promise<void> {
  const refreshToken = getRefreshToken();
  try {
    await fetch(`${APISIX_BASE}/auth/logout`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken, clientId: CLIENT_ID }),
    });
  } catch {
    // Ignore — clear local state regardless
  }
  clearTokens();
  window.location.href = "/login";
}
```

### 6.9 Reading JWT Claims for UI

Use the decoded JWT to render role-based UI:

```typescript
import { decodeJwt } from "./auth/jwt";
import { getAccessToken } from "./auth/token-storage";

const token = getAccessToken();
const user = token ? decodeJwt(token) : null;

// Check realm roles
const isAdmin = user?.realm_access?.roles?.includes("tenant_admin") ?? false;

// Check client roles
const clientRoles = user?.resource_access?.["doer-visa"]?.roles ?? [];
const canApprove = clientRoles.includes("approve_visa");

// Get organization
const orgAlias = Array.isArray(user?.organization)
  ? user.organization[0]
  : undefined;

// Render conditionally
function AdminPanel() {
  if (!isAdmin) return null;
  return <div>Admin controls...</div>;
}
```

---

## 7. Backend Integration Guide

Your product backend receives pre-validated identity via HTTP headers from APISIX. **You do NOT need any JWT library.**

All examples are in TypeScript/Express (matching the `doer-visa-api` reference implementation).

### 7.1 Parse APISIX Headers Middleware

```typescript
// middleware/parse-user.ts

import type { Request, Response, NextFunction } from "express";

export interface RequestUser {
  id: string;
  email: string;
  realmRoles: string[];
  clientRoles: string[];
  organizationId?: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: RequestUser;
    }
  }
}

export function parseUser(req: Request, _res: Response, next: NextFunction): void {
  const userId = req.headers["x-user-id"] as string | undefined;

  if (userId) {
    req.user = {
      id: userId,
      email: (req.headers["x-user-email"] as string) || "",
      realmRoles: splitHeader(req.headers["x-user-roles"] as string),
      clientRoles: splitHeader(req.headers["x-client-roles"] as string),
      organizationId: (req.headers["x-organization-id"] as string) || undefined,
    };
  }

  next();
}

function splitHeader(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(",").map((s) => s.trim()).filter(Boolean);
}
```

### 7.2 Auth Guard Middleware

```typescript
// middleware/require-auth.ts

import type { Request, Response, NextFunction } from "express";

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }
  next();
}
```

### 7.3 Role Guard Middleware

```typescript
// middleware/require-role.ts

import type { Request, Response, NextFunction } from "express";

/**
 * Require that the user has at least one of the specified client roles.
 * Roles come from the X-Client-Roles header (set by APISIX).
 */
export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const hasRole = roles.some((role) => req.user!.clientRoles.includes(role));
    if (!hasRole) {
      res.status(403).json({
        error: "Insufficient permissions",
        required: roles,
        actual: req.user.clientRoles,
      });
      return;
    }
    next();
  };
}
```

### 7.4 Organization Scoping

Filter all data queries by the caller's organization:

```typescript
// In your route handler
app.get("/api/school/students", requireAuth, (req, res) => {
  const orgId = req.user!.organizationId;
  if (!orgId) {
    return res.json([]);
  }

  // Always filter by organization — this is your tenant isolation
  const students = db.students.findAll({
    where: { organizationId: orgId },
  });

  res.json(students);
});
```

### 7.5 Example Route with Full Middleware Chain

```typescript
import express from "express";
import { parseUser } from "./middleware/parse-user";
import { requireAuth } from "./middleware/require-auth";
import { requireRole } from "./middleware/require-role";

const app = express();
app.use(express.json());
app.use(parseUser);  // Always first — populates req.user from headers

// Public health check (no auth)
app.get("/api/school/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Any authenticated user in the org can list students
app.get("/api/school/students", requireAuth, (req, res) => {
  const students = getStudentsByOrg(req.user!.organizationId!);
  res.json(students);
});

// Only users with "submit_grades" role can post grades
app.post("/api/school/grades",
  requireAuth,
  requireRole("submit_grades", "manage_all"),
  (req, res) => {
    const grade = createGrade({
      ...req.body,
      submittedBy: req.user!.id,
      organizationId: req.user!.organizationId,
    });
    res.status(201).json(grade);
  },
);

app.listen(4002, () => console.log("doer-school-api on port 4002"));
```

### 7.6 Important Notes

- **You do NOT need any JWT library** — APISIX handles all JWT validation
- **Never trust headers from outside APISIX** — in production, ensure your service only accepts traffic from APISIX (firewall rules, network policies, etc.)
- **Always scope by organization** — every data query should filter by `X-Organization-Id`
- **APISIX strips the `X-Userinfo` header** — you only see the individual `X-*` headers

---

## 8. JWT Token Reference

### Decoded Access Token Example

```json
{
  "exp": 1740700800,
  "iat": 1740699900,
  "jti": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "iss": "http://localhost:8080/realms/doer",
  "aud": "account",
  "sub": "f47ac10b-58cc-4372-a567-0e02b2c3d479",
  "typ": "Bearer",
  "azp": "doer-visa",
  "sid": "session-id-here",
  "acr": "1",
  "scope": "openid email profile organization",
  "email_verified": true,
  "name": "Jane Employee",
  "given_name": "Jane",
  "family_name": "Employee",
  "preferred_username": "jane@acme.com",
  "email": "jane@acme.com",
  "realm_access": {
    "roles": [
      "default-roles-doer",
      "end_user",
      "tenant_employee"
    ]
  },
  "resource_access": {
    "doer-visa": {
      "roles": [
        "apply_visa",
        "view_own_status",
        "process_visa"
      ]
    },
    "account": {
      "roles": [
        "manage-account",
        "view-profile"
      ]
    }
  },
  "organization": ["acme-corp"]
}
```

### Claim-by-Claim Explanation

| Claim | Type | Description |
|-------|------|-------------|
| `sub` | string (UUID) | Unique user ID in Keycloak |
| `azp` | string | Authorized party — the client that requested the token |
| `email` | string | User's email address |
| `preferred_username` | string | Usually the email |
| `given_name` | string | First name |
| `family_name` | string | Last name |
| `realm_access.roles` | string[] | Platform-level roles (e.g., `tenant_employee`) |
| `resource_access.<client>.roles` | string[] | Product-specific roles per client |
| `organization` | string[] | Array of organization aliases the user belongs to |
| `exp` | number | Token expiry (Unix timestamp) |
| `iat` | number | Token issued at (Unix timestamp) |
| `scope` | string | Space-separated list of granted scopes |

### Organization Claim

The `organization` claim is an **array of aliases**:

```json
"organization": ["acme-corp"]
```

This is set by the `oidc-organization-membership-mapper` in Keycloak. A user belongs to one organization, so it's typically a single-element array.

**In APISIX headers**: Extracted as `X-Organization-Id: acme-corp` (first element).

### Resource Access (Client Roles)

The `resource_access` object contains roles grouped by client:

```json
"resource_access": {
  "doer-visa": {
    "roles": ["apply_visa", "view_own_status"]
  }
}
```

To see your product's roles, look under `resource_access["your-client-id"].roles`.

**In APISIX headers**: Extracted as `X-Client-Roles: apply_visa,view_own_status` (comma-joined).

---

## 9. Role System Deep Dive

### Realm Roles

| Role | Level | Capabilities |
|------|-------|-------------|
| `platform_admin` | Platform | Full access to everything. Can manage all tenants, users, and settings. Bypasses tenant scope checks. |
| `tenant_admin` | Tenant | Manages users within their own tenant. Can create users, assign roles, send invitations, view tenant settings. |
| `tenant_employee` | Tenant | Staff member. Can access product features based on their client roles. |
| `end_user` | Default | Self-registered user. Minimal access — typically can only use consumer-facing features. |

### Defining Client Roles for a New Product

When creating a new product, define roles that map to your feature permissions:

1. **Start with actions**: List what users can do (view, create, edit, delete, approve, etc.)
2. **Group by resource**: `manage_students`, `view_grades`, `submit_grades`
3. **Add a superuser role**: `manage_all` grants everything
4. **Create composite roles** (presets) for common combinations

Example for `doer-school`:

| Role | Description |
|------|-------------|
| `view_own_grades` | Students see their own grades |
| `view_grades` | Teachers see all grades in their org |
| `submit_grades` | Teachers submit grades |
| `manage_students` | Admins manage student records |
| `manage_courses` | Admins manage course catalog |
| `manage_all` | Full access to all school features |

### Composite Roles (Presets)

Composite roles bundle multiple roles for convenience. Define them in Keycloak:

```bash
# Create a composite role "teacher" that includes view_grades + submit_grades
curl -X POST "$KC/admin/realms/doer/clients/$CLIENT_UUID/roles" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "teacher", "composite": false}'

# Get the component role IDs
VIEW_ROLE=$(curl -s "$KC/admin/realms/doer/clients/$CLIENT_UUID/roles/view_grades" \
  -H "Authorization: Bearer $ADMIN_TOKEN")
SUBMIT_ROLE=$(curl -s "$KC/admin/realms/doer/clients/$CLIENT_UUID/roles/submit_grades" \
  -H "Authorization: Bearer $ADMIN_TOKEN")

# Make "teacher" a composite of view_grades + submit_grades
curl -X POST "$KC/admin/realms/doer/clients/$CLIENT_UUID/roles/teacher/composites" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  -d "[$VIEW_ROLE, $SUBMIT_ROLE]"
```

When a user is assigned the `teacher` composite role, their JWT will contain the individual roles (`view_grades`, `submit_grades`) — not the composite name.

### Role Assignment Flow

Roles are assigned via the Auth Service API, not directly in Keycloak:

```
1. Platform admin creates tenant     → POST /api/tenants
   (tenant admin gets tenant_admin role automatically)

2. Tenant admin creates user         → POST /api/tenants/:tid/users
   (specify realmRole + clientRoles in the request)

3. Tenant admin updates roles later  → PUT /api/tenants/:tid/users/:uid/roles
   (clientRoles is a full replacement)

4. List available roles              → GET /api/tenants/:tid/users/roles/available
   (returns all client roles defined on the tenant's product)
```

---

## 10. Troubleshooting & FAQ

### Common Errors

#### 401 Unauthorized

**Symptom**: API returns `401` on a protected endpoint.

**Causes**:
- Missing `Authorization: Bearer <token>` header
- Token expired (access tokens last 15 minutes)
- Token was issued for a different realm or client
- APISIX cannot reach Keycloak for token validation

**Debug**:
```bash
# Check if APISIX can reach Keycloak
curl http://localhost:9080/realms/doer/.well-known/openid-configuration

# Decode your token to check expiry
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
```

#### 403 Forbidden

**Symptom**: API returns `403` even though the user is authenticated.

**Causes**:
- User lacks the required realm role (e.g., `platform_admin`)
- User is not a member of the tenant's organization (TenantScopeGuard)
- User lacks required client roles

**Debug**:
```bash
# Decode token and check roles
echo "YOUR_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -c "
import sys, json
t = json.load(sys.stdin)
print('Realm roles:', t.get('realm_access', {}).get('roles', []))
print('Client roles:', {k: v.get('roles', []) for k, v in t.get('resource_access', {}).items()})
print('Organization:', t.get('organization', []))
"
```

#### Missing Headers in Backend

**Symptom**: `X-User-Id` and other headers are empty or missing.

**Causes**:
- Your route doesn't have the `serverless-pre-function` plugin (only Route 4 pattern has header injection)
- The `openid-connect` plugin doesn't have `set_userinfo_header: true`
- The Lua function has the wrong client ID for `resource_access` extraction

**Debug**:
```bash
# Add a debug endpoint to your service
app.get("/api/your-product/debug-headers", (req, res) => {
  res.json({
    "x-user-id": req.headers["x-user-id"],
    "x-user-email": req.headers["x-user-email"],
    "x-user-roles": req.headers["x-user-roles"],
    "x-client-roles": req.headers["x-client-roles"],
    "x-organization-id": req.headers["x-organization-id"],
  });
});
```

#### CORS Errors

**Symptom**: Browser shows "blocked by CORS policy".

**Causes**:
- APISIX CORS plugin not configured on the route
- `allow_origins` doesn't include your frontend's origin
- Missing `OPTIONS` in `methods` list

**Fix**: Ensure every route includes the CORS plugin (see the route template in Section 5).

#### Redirect URI Mismatch

**Symptom**: Keycloak shows "Invalid redirect_uri" after login.

**Causes**:
- The `redirect_uri` in your auth request doesn't match any URI registered on the Keycloak client
- Port or path mismatch (e.g., `localhost:5173` vs `localhost:5174`)

**Fix**: Update the client's `redirectUris` in Keycloak (see Step 6 in the runbook).

#### Organization Not in Token

**Symptom**: JWT doesn't contain the `organization` claim.

**Causes**:
- The `organization` scope is still in "optional scopes" instead of "default scopes"
- The user is not a member of any Keycloak organization
- The `oidc-organization-membership-mapper` is not configured

**Fix**:
```bash
# Move organization to default scopes (see Step 5 in the runbook)
# Then verify by requesting a new token and decoding it
```

### How to Inspect JWT Tokens

**Option 1: Command line**
```bash
echo "YOUR_ACCESS_TOKEN" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
```

**Option 2: Browser console**
```javascript
JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')))
```

### How to Verify APISIX Headers

```bash
# Call your product API with a valid token and check what headers arrive
curl -v http://localhost:9080/api/your-product/debug-headers \
  -H "Authorization: Bearer $TOKEN" 2>&1 | grep -i "x-"
```

### Keycloak Password Policy

Passwords must meet these requirements:

| Rule | Requirement |
|------|-------------|
| Minimum length | 8 characters |
| Uppercase | At least 1 |
| Lowercase | At least 1 |
| Digit | At least 1 |
| Special character | At least 1 |
| History | Cannot reuse last 3 passwords |

### Rate Limits

APISIX enforces rate limits per IP:

| Route | Limit |
|-------|-------|
| `/auth/*` (public) | 30 requests/minute |
| `/api/platform/*` | 500 requests/minute |
| `/api/tenants/*` and product routes | 1,000 requests/minute |

Exceeding the limit returns HTTP `429 Too Many Requests`.

---

## Quick Reference: Auth Flow Checklist

When integrating a new product, verify each step:

- [ ] Public client created in Keycloak with PKCE (S256)
- [ ] Bearer-only client created for APISIX JWT validation
- [ ] Client roles defined on the public client
- [ ] Realm roles + client roles mapped to client scope
- [ ] Protocol mapper added for `resource_access` claim
- [ ] `organization` scope moved to default scopes
- [ ] Redirect URIs and web origins configured
- [ ] APISIX route created with `openid-connect` + `serverless-pre-function`
- [ ] Lua function updated with your client ID
- [ ] Backend reads `X-User-*` and `X-Organization-Id` headers
- [ ] Frontend implements PKCE login flow
- [ ] Token refresh on 401 implemented
- [ ] Organization-scoped data queries in backend
