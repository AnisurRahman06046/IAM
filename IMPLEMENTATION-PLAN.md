# Doer IAM — Implementation Plan

## Phase Overview

```
Phase 1: Infrastructure Foundation          ██░░░░░░░░░░░░░░░░░░
Phase 2: Keycloak Realm Configuration       ░░██░░░░░░░░░░░░░░░░
Phase 3: Auth Service Development           ░░░░██████░░░░░░░░░░
Phase 4: APISIX Gateway Configuration       ░░░░░░░░██░░░░░░░░░░
Phase 5: Keycloakify Theme Development      ░░░░░░██████░░░░░░░░
Phase 6: First Product Integration (Visa)   ░░░░░░░░░░░░██░░░░░░
Phase 7: Testing & Security Hardening       ░░░░░░░░░░░░░░██░░░░
Phase 8: Production Deployment              ░░░░░░░░░░░░░░░░████
```

### Phase Dependencies

```
Phase 1 ──▶ Phase 2 ──▶ Phase 3 ──▶ Phase 6
                │            │           │
                └──▶ Phase 4 ┘           ▼
                │                    Phase 7 ──▶ Phase 8
                └──▶ Phase 5 ────────────┘
```

- Phase 2 depends on Phase 1 (Keycloak must be running)
- Phase 3, 4, 5 can run **in parallel** after Phase 2
- Phase 6 depends on Phase 3 + 4 + 5
- Phase 7 depends on Phase 6
- Phase 8 depends on Phase 7

---

## Phase 1: Infrastructure Foundation

**Goal**: Get all core services running locally with Docker Compose.

**Depends on**: Nothing (starting point)

### Checklist

```
Docker Compose Setup
─────────────────────
□ 1.1  Create project directory structure:
       IAM/
       ├── docker-compose.yml
       ├── docker-compose.dev.yml       (dev overrides)
       ├── .env                          (environment variables)
       ├── .env.example                  (template without secrets)
       ├── config/
       │   ├── apisix/
       │   │   └── config.yaml           (APISIX configuration)
       │   ├── keycloak/
       │   │   └── realm-export.json     (realm config-as-code, later)
       │   └── prometheus/
       │       └── prometheus.yml        (monitoring config)
       ├── services/
       │   └── auth-service/             (Phase 3)
       └── themes/
           └── keycloakify/              (Phase 5)

□ 1.2  Create docker-compose.yml with all services:
       - keycloak (quay.io/keycloak/keycloak:latest)
       - keycloak-db (postgres:16-alpine)
       - apisix (apache/apisix:3.11.0-debian)
       - etcd (bitnami/etcd:3.5)
       - redis (redis:7-alpine)
       - auth-db (postgres:16-alpine)
       - prometheus (prom/prometheus:latest)
       - grafana (grafana/grafana:latest)

□ 1.3  Create .env file with all configuration variables:
       - KEYCLOAK_ADMIN / KEYCLOAK_ADMIN_PASSWORD
       - KC_DB, KC_DB_URL, KC_DB_USERNAME, KC_DB_PASSWORD
       - KC_HOSTNAME, KC_HEALTH_ENABLED, KC_METRICS_ENABLED
       - POSTGRES_USER, POSTGRES_PASSWORD (for both DBs)
       - APISIX_ADMIN_KEY
       - REDIS_PASSWORD

□ 1.4  Create APISIX config.yaml with:
       - etcd connection
       - Admin API key
       - Plugin list (openid-connect, authz-keycloak, limit-count,
         proxy-rewrite, prometheus)
       - Port configuration (9080, 9443, 9180)

□ 1.5  Create Docker network:
       - doer-network (bridge, all services connected)

□ 1.6  Add health checks for all services:
       - Keycloak: /health/ready
       - PostgreSQL: pg_isready
       - APISIX: /apisix/status
       - Redis: redis-cli ping
       - etcd: /health

□ 1.7  Add volume mounts for data persistence:
       - keycloak-db-data (PostgreSQL data)
       - auth-db-data (PostgreSQL data)
       - redis-data (Redis data)
       - etcd-data (etcd data)

□ 1.8  Run docker-compose up and verify:
       - [ ] Keycloak admin console accessible at localhost:8080
       - [ ] APISIX responding at localhost:9080
       - [ ] APISIX Admin API at localhost:9180
       - [ ] Both PostgreSQL instances running
       - [ ] Redis running
       - [ ] etcd running
       - [ ] Prometheus at localhost:9090
       - [ ] Grafana at localhost:3000
```

### Verification

```
□ Keycloak: Open http://localhost:8080 → see admin login page
□ Login with admin credentials → see master realm dashboard
□ APISIX: curl http://localhost:9080 → connection works
□ APISIX Admin: curl http://localhost:9180/apisix/admin/routes -H "X-API-KEY: <key>" → empty routes
□ Redis: docker exec -it redis redis-cli ping → PONG
□ PostgreSQL (keycloak): docker exec -it keycloak-db psql -U keycloak -c "SELECT 1"
□ PostgreSQL (auth): docker exec -it auth-db psql -U doer_auth -c "SELECT 1"
```

---

## Phase 2: Keycloak Realm Configuration

**Goal**: Configure the `doer` realm with all clients, roles, and settings.

**Depends on**: Phase 1 (Keycloak running)

### Checklist

```
Realm Setup
─────────────
□ 2.1  Create "doer" realm
       - Display name: "Doer Platform"
       - Enabled: true
       - User registration: disabled (handled by Auth Service)
       - Email login: enabled
       - Edit username: disabled
       - Remember me: enabled

□ 2.2  Configure realm settings:
       - Login tab:
         - User registration: OFF
         - Forgot password: ON
         - Remember me: ON
         - Login with email: ON
       - Email tab:
         - Configure SMTP (can use Mailhog for dev)
       - Tokens tab:
         - Access token lifespan: 15 minutes
         - Refresh token lifespan: 8 hours
         - SSO session idle: 4 hours
         - SSO session max: 24 hours
       - Sessions tab:
         - Revoke refresh token: ON
         - Refresh token max reuse: 0 (single use)

□ 2.3  Configure password policies:
       - Minimum length: 8
       - Uppercase: 1
       - Lowercase: 1
       - Digits: 1
       - Special characters: 1
       - Password history: 3
       - Hashing algorithm: argon2 (default in latest Keycloak)

□ 2.4  Enable brute force protection:
       - Permanent lockout: OFF
       - Max login failures: 5
       - Wait increment: 60 seconds
       - Max wait: 15 minutes
       - Failure reset time: 12 hours

Realm Roles
─────────────
□ 2.5  Create realm roles:
       - platform_admin (description: "Doer platform administrator")
       - tenant_admin (description: "Tenant organization administrator")
       - tenant_employee (description: "Tenant organization employee")
       - end_user (description: "Self-registered end user/customer")

□ 2.6  Set "end_user" as the default realm role
       (for users created via Admin API, Auth Service overrides as needed)

Clients — Doer-Visa (First Product)
─────────────────────────────────────
□ 2.7  Create client: doer-visa
       - Client type: OpenID Connect
       - Client authentication: OFF (public client)
       - Standard flow: ON
       - Direct access grants: OFF
       - Valid redirect URIs: http://localhost:3001/callback (dev)
       - Web origins: http://localhost:3001
       - PKCE: S256 required

□ 2.8  Create client: doer-visa-backend
       - Client type: OpenID Connect
       - Client authentication: ON (confidential)
       - Service accounts: OFF (resource server, not admin)
       - Standard flow: OFF
       - Note client secret for APISIX config

□ 2.9  Create doer-visa client roles:
       - manage_all
       - manage_applications
       - process_visa
       - approve_visa
       - view_applications
       - apply_visa
       - view_own_status

□ 2.10 Create doer-visa composite roles (optional presets):
       - staff_basic = [view_applications, view_own_status]
       - staff_senior = [view_applications, process_visa, manage_applications]
       - customer = [apply_visa, view_own_status]

Clients — Auth Service
───────────────────────
□ 2.11 Create client: doer-auth-svc
       - Client type: OpenID Connect
       - Client authentication: ON (confidential)
       - Service accounts: ON (for Admin REST API calls)
       - Standard flow: OFF
       - Direct access grants: OFF

□ 2.12 Assign service account roles to doer-auth-svc:
       - Client roles from "realm-management" client:
         - manage-users
         - manage-clients
         - view-users
         - view-clients
         - manage-realm (for organization management)
       - This gives the Auth Service permission to call Admin REST API

Clients — Admin Panel
──────────────────────
□ 2.13 Create client: doer-admin
       - Client type: OpenID Connect
       - Client authentication: OFF (public client)
       - Standard flow: ON
       - PKCE: S256 required
       - Valid redirect URIs: http://localhost:3000/callback (dev)

Client Scopes
──────────────
□ 2.14 Create client scope: "organization"
       - Protocol: OpenID Connect
       - Include in token scope: ON
       - Add mapper: "organization membership" (built-in)
       - This ensures org claims appear in JWT tokens

□ 2.15 Add "organization" scope to all product clients
       (doer-visa, doer-admin, future clients)

□ 2.16 Verify token contents:
       - Get a test token via Keycloak's built-in "Evaluate" tab
       - Confirm realm_access.roles present
       - Confirm resource_access.<client>.roles present
       - Confirm organization claim present

Enable Organizations
─────────────────────
□ 2.17 Enable Organizations feature:
       - Realm Settings → Organizations → Enable
       - Verify "Organizations" section appears in left nav

□ 2.18 Create a test organization:
       - Name: "Test Visa Agency"
       - Alias: "test-visa"
       - Attributes: { products: ["doer-visa"], plan: ["basic"] }

Identity Providers (Social Login)
──────────────────────────────────
□ 2.19 Register OAuth App on Google Cloud Console:
       - Authorized redirect URI: http://localhost:8080/realms/doer/broker/google/endpoint
       - Note Client ID and Client Secret

□ 2.20 Add Google Identity Provider in Keycloak:
       - Alias: google
       - Client ID + Secret from Google
       - Default scopes: openid email profile
       - Trust email: ON
       - First login flow: "first broker login"

□ 2.21 (Optional) Add GitHub Identity Provider:
       - Register OAuth App on GitHub Developer Settings
       - Add in Keycloak similar to Google

Authentication Flows
─────────────────────
□ 2.22 Review default browser flow — ensure it includes:
       - Cookie (for SSO session detection)
       - Identity Provider Redirector (for org-based IdP routing)
       - Username Password Form
       - OTP Form (conditional)

□ 2.23 Configure OTP policy:
       - Type: totp
       - Algorithm: SHA1
       - Digits: 6
       - Period: 30 seconds
       - Supported applications: Google Authenticator, FreeOTP

Realm Export
─────────────
□ 2.24 Export realm configuration to JSON:
       - Use Keycloak Admin CLI or REST API
       - Save to config/keycloak/doer-realm.json
       - This becomes your config-as-code baseline
       - Commit to git (without secrets)
```

### Verification

```
□ Login to doer realm admin console
□ See all 4 realm roles listed
□ See doer-visa client with roles
□ See doer-auth-svc client with service account
□ Organizations tab visible and test org created
□ Google Identity Provider configured (test login if possible)
□ Create a test user manually, assign roles, verify token via Evaluate tab
□ Token contains realm_access, resource_access, and organization claims
```

---

## Phase 3: Auth Service Development

**Goal**: Build the custom Auth Service microservice that handles registration, tenant management, and acts as the bridge between apps and Keycloak.

**Depends on**: Phase 2 (Keycloak realm configured)

**Parallel with**: Phase 4 (APISIX), Phase 5 (Themes)

### Tech Stack Decision

```
□ 3.0  Choose Auth Service technology:
       - Option A: NestJS (TypeScript) — structured, good Keycloak libraries
       - Option B: Spring Boot (Java/Kotlin) — enterprise standard, Keycloak Java SDK
       - Option C: Go (Gin/Fiber) — lightweight, fast
       - Option D: FastAPI (Python) — rapid development

       Recommendation: NestJS or Spring Boot (best Keycloak Admin SDK support)
```

### Checklist

```
Project Setup
──────────────
□ 3.1  Initialize project:
       - services/auth-service/
       - Package manager, dependencies, linting, formatting
       - Dockerfile + .dockerignore
       - Environment configuration (.env support)

□ 3.2  Set up database connection:
       - ORM/query builder setup (TypeORM, Prisma, JPA, GORM, etc.)
       - Database migration system

□ 3.3  Set up Redis connection:
       - For OTP storage, rate limiting state, cache

□ 3.4  Set up Keycloak Admin SDK/Client:
       - Initialize with doer-auth-svc client credentials
       - Token caching (service account token, refresh before expiry)
       - Error handling for Keycloak API failures

Database Schema (Auth Service DB)
──────────────────────────────────
□ 3.5  Create migration: tenants table
       - id (UUID, PK)
       - keycloak_org_id (VARCHAR, unique)
       - name (VARCHAR)
       - alias (VARCHAR, unique)
       - product (VARCHAR)
       - plan (VARCHAR: basic, pro, enterprise)
       - max_users (INT)
       - status (ENUM: active, inactive, suspended)
       - billing_email (VARCHAR)
       - domain (VARCHAR)
       - created_at, updated_at (TIMESTAMP)

□ 3.6  Create migration: invitations table
       - id (UUID, PK)
       - tenant_id (FK → tenants)
       - email (VARCHAR)
       - role (VARCHAR — client role name)
       - token (VARCHAR, unique, indexed)
       - status (ENUM: pending, accepted, expired, revoked)
       - expires_at (TIMESTAMP)
       - accepted_at (TIMESTAMP, nullable)
       - invited_by (VARCHAR — user ID from JWT)
       - created_at (TIMESTAMP)

□ 3.7  Create migration: otp_records table
       - id (UUID, PK)
       - user_identifier (VARCHAR — phone or email)
       - otp_code (VARCHAR — hashed)
       - purpose (ENUM: login_mfa, password_reset, phone_verify)
       - expires_at (TIMESTAMP)
       - verified (BOOLEAN, default false)
       - attempts (INT, default 0)
       - max_attempts (INT, default 3)
       - created_at (TIMESTAMP)

□ 3.8  Create migration: registration_configs table
       - id (UUID, PK)
       - product (VARCHAR, unique)
       - required_fields (JSONB)
       - validation_rules (JSONB)
       - default_realm_role (VARCHAR)
       - default_client_roles (JSONB — array of role names)
       - self_registration_enabled (BOOLEAN)
       - created_at, updated_at (TIMESTAMP)

□ 3.9  Create migration: audit_logs table
       - id (UUID, PK)
       - actor_id (VARCHAR — user ID)
       - actor_type (ENUM: platform_admin, tenant_admin, system)
       - action (VARCHAR — e.g., "user.created", "tenant.deactivated")
       - resource_type (VARCHAR — e.g., "user", "tenant", "invitation")
       - resource_id (VARCHAR)
       - tenant_id (VARCHAR, nullable)
       - metadata (JSONB)
       - ip_address (VARCHAR)
       - created_at (TIMESTAMP)

□ 3.10 Seed registration_configs for doer-visa:
       - product: "doer-visa"
       - required_fields: ["phone", "password", "full_name"]
       - validation_rules: { phone: "bd_phone", password: "min_8" }
       - default_realm_role: "end_user"
       - default_client_roles: ["apply_visa", "view_own_status"]
       - self_registration_enabled: true

□ 3.11 Run all migrations, verify tables created

Keycloak Integration Module
────────────────────────────
□ 3.12 Implement KeycloakService (wrapper around Admin REST API):

       User Management:
       - createUser(realmUser) → POST /admin/realms/doer/users
       - getUserById(id) → GET /admin/realms/doer/users/{id}
       - searchUsers(query) → GET /admin/realms/doer/users?search=...
       - searchByAttribute(key, value) → GET /admin/realms/doer/users?q=key:value
       - updateUser(id, data) → PUT /admin/realms/doer/users/{id}
       - disableUser(id) → PUT .../users/{id} { enabled: false }
       - enableUser(id) → PUT .../users/{id} { enabled: true }
       - resetPassword(id, password) → PUT .../users/{id}/reset-password
       - logoutUser(id) → POST .../users/{id}/logout

       Role Management:
       - getClientRoles(clientId) → GET /admin/realms/doer/clients/{uuid}/roles
       - getUserRoles(userId, clientId) → GET .../users/{id}/role-mappings/clients/{uuid}
       - assignClientRoles(userId, clientId, roles) → POST .../role-mappings/clients/{uuid}
       - removeClientRoles(userId, clientId, roles) → DELETE .../role-mappings/clients/{uuid}
       - assignRealmRole(userId, roleName) → POST .../role-mappings/realm

       Organization Management:
       - createOrganization(orgData) → POST /admin/realms/doer/organizations
       - getOrganization(orgId) → GET .../organizations/{id}
       - updateOrganization(orgId, data) → PUT .../organizations/{id}
       - addMember(orgId, userId) → POST .../organizations/{id}/members
       - removeMember(orgId, userId) → DELETE .../organizations/{id}/members/{uid}
       - listMembers(orgId) → GET .../organizations/{id}/members
       - countMembers(orgId) → GET .../organizations/{id}/members/count

       Token Operations:
       - exchangeCodeForTokens(code, codeVerifier, redirectUri, clientId)
         → POST /realms/doer/protocol/openid-connect/token
       - refreshToken(refreshToken, clientId)
         → POST .../token { grant_type: refresh_token }
       - revokeToken(refreshToken, clientId)
         → POST /realms/doer/protocol/openid-connect/logout

□ 3.13 Add error handling:
       - Keycloak down → 503 Service Unavailable
       - User already exists (409 from Keycloak) → 409 Conflict
       - User not found → 404
       - Unauthorized → 401
       - Rate limited by Keycloak → 429

□ 3.14 Add service account token caching:
       - Cache access token in memory
       - Auto-refresh before expiry
       - Retry logic on token failure

Auth Endpoints (Public — No JWT Required)
──────────────────────────────────────────
□ 3.15 POST /auth/register
       - Accept: project, tenant, user fields (varies by project)
       - Load registration config for project
       - Validate required fields and rules
       - Check phone/email uniqueness in Keycloak
       - Check tenant user limit
       - Create user in Keycloak (Admin API)
       - Add user to tenant organization
       - Assign default realm + client roles
       - Log audit event
       - Return success message + login redirect URL

□ 3.16 POST /auth/token (Authorization Code Exchange)
       - Accept: code, code_verifier, redirect_uri, client_id
       - Call Keycloak token endpoint with auth code
       - (Optional) Validate user's org has access to the product
       - Return: access_token, refresh_token, expires_in

□ 3.17 POST /auth/refresh
       - Accept: refresh_token, client_id
       - Call Keycloak token refresh endpoint
       - Return: new access_token, new refresh_token, expires_in

□ 3.18 POST /auth/logout
       - Accept: refresh_token, client_id
       - Call Keycloak logout endpoint (revoke token)
       - Return: success

□ 3.19 POST /auth/forgot-password
       - Accept: phone or email, project
       - Find user in Keycloak by phone/email
       - If email: trigger Keycloak's email reset (execute-actions-email)
       - If phone: generate OTP → store in Redis → send SMS
       - Return: method used, expires_in

□ 3.20 POST /auth/reset-password
       - Accept: phone, otp, new_password
       - Verify OTP from Redis (code, attempts, expiry)
       - Reset password via Keycloak Admin API
       - Delete OTP from Redis
       - Log audit event
       - Return: success

□ 3.21 GET /auth/invite/{token}
       - Validate invitation token (exists, not expired, not used)
       - Return: tenant info, email, assigned role

□ 3.22 POST /auth/accept-invite
       - Accept: token, name, phone, password
       - Re-validate invitation token
       - Create user in Keycloak
       - Add to invitation's tenant org
       - Assign invitation's pre-defined role
       - Mark invitation as accepted
       - Log audit event
       - Return: success + login redirect URL

Tenant Management Endpoints (JWT Required — platform_admin or tenant_admin)
────────────────────────────────────────────────────────────────────────────
□ 3.23 POST /api/tenants (platform_admin only)
       - Create tenant record in Auth DB
       - Create Keycloak Organization
       - Create admin user in Keycloak
       - Add admin to org + assign roles
       - Send welcome email
       - Log audit event

□ 3.24 GET /api/tenants (platform_admin: all, tenant_admin: own)
       - List tenants with pagination
       - platform_admin sees all
       - tenant_admin sees only their own

□ 3.25 GET /api/tenants/:id
       - Get tenant details + user count + plan info

□ 3.26 PUT /api/tenants/:id (platform_admin only)
       - Update plan, max_users, status
       - Sync changes to Keycloak org attributes

□ 3.27 PUT /api/tenants/:id/activate (platform_admin only)
       - Enable all users in org
       - Update tenant status

□ 3.28 PUT /api/tenants/:id/deactivate (platform_admin only)
       - Disable all users in org
       - Logout all sessions
       - Update tenant status

□ 3.29 PUT /api/tenants/:id/products (platform_admin only)
       - Add/remove product access for a tenant
       - Update org attributes
       - Assign/remove manage_all role for tenant admin

User Management Endpoints (JWT Required — within tenant scope)
───────────────────────────────────────────────────────────────
□ 3.30 POST /api/tenants/:tid/users
       - Verify caller is tenant_admin of :tid
       - Check user limit
       - Create user in Keycloak
       - Add to org + assign roles
       - Log audit event

□ 3.31 GET /api/tenants/:tid/users
       - List org members with pagination
       - tenant_admin: their org only
       - platform_admin: any org

□ 3.32 GET /api/tenants/:tid/users/:uid
       - Get user details + roles

□ 3.33 PUT /api/tenants/:tid/users/:uid/roles
       - Validate caller can assign these roles
       - Validate roles belong to correct product client
       - Add/remove roles via Keycloak Admin API
       - Log audit event

□ 3.34 PUT /api/tenants/:tid/users/:uid/disable
       - Disable user + logout sessions

□ 3.35 PUT /api/tenants/:tid/users/:uid/enable
       - Re-enable user

□ 3.36 DELETE /api/tenants/:tid/users/:uid
       - Remove from org + disable (or hard delete)
       - Log audit event

□ 3.37 POST /api/tenants/:tid/invite
       - Generate invitation token
       - Store in DB
       - Send invitation email
       - Log audit event

□ 3.38 GET /api/tenants/:tid/roles
       - List available client roles for this tenant's product
       - Used by admin panel to show assignable roles

Platform Admin Endpoints (JWT Required — platform_admin only)
─────────────────────────────────────────────────────────────
□ 3.39 GET /api/platform/stats
       - Total users, tenants, active sessions (from Keycloak)

□ 3.40 GET /api/platform/audit-logs
       - Query audit_logs table with filters
       - Pagination, date range, action type, tenant, actor

□ 3.41 GET /api/platform/users
       - Cross-tenant user search

Middleware & Guards
────────────────────
□ 3.42 JWT extraction middleware:
       - Decode JWT from Authorization header
       - Extract: sub, realm_access.roles, resource_access, organization
       - Attach to request context
       - NOTE: Does NOT validate signature (APISIX does that)
       - For dev without APISIX: optionally validate via Keycloak JWKS

□ 3.43 Role guard:
       - @RequireRealmRole("platform_admin")
       - @RequireClientRole("doer-visa", "manage_all")
       - Returns 403 if role not present in JWT

□ 3.44 Tenant scope guard:
       - Verify caller's org matches the :tid param
       - platform_admin bypasses this check
       - tenant_admin only accesses their own org

□ 3.45 Input validation:
       - Validate all request bodies (class-validator, Joi, Zod, etc.)
       - Phone format validation (configurable per project)
       - Email format validation
       - Password strength validation

Testing
────────
□ 3.46 Unit tests for:
       - Registration validation logic (per project config)
       - Role assignment validation (what tenant admins can/cannot assign)
       - OTP generation and verification
       - Invitation token lifecycle

□ 3.47 Integration tests for:
       - User registration → Keycloak user created with correct attributes
       - Token exchange → valid tokens returned
       - Tenant onboarding → org + admin user created
       - Role assignment → reflected in Keycloak
       - User disable → sessions revoked

□ 3.48 Add Dockerfile:
       - Multi-stage build
       - Health check endpoint: GET /health
       - Add to docker-compose.yml
```

### Verification

```
□ Auth Service starts and connects to both PostgreSQL and Redis
□ Health check returns 200
□ POST /auth/register creates user in Keycloak (verify in admin console)
□ POST /auth/token exchanges auth code for JWT tokens
□ POST /auth/refresh returns new tokens
□ POST /auth/logout revokes session
□ POST /api/tenants creates org in Keycloak
□ POST /api/tenants/:tid/users creates user in org
□ PUT /api/tenants/:tid/users/:uid/roles updates roles in Keycloak
□ Role guards prevent unauthorized access
□ Tenant scope guard prevents cross-tenant access
□ All audit events logged to DB
```

---

## Phase 4: APISIX Gateway Configuration

**Goal**: Configure APISIX routes with authentication and authorization plugins.

**Depends on**: Phase 2 (Keycloak clients exist for plugin config)

**Parallel with**: Phase 3 (Auth Service), Phase 5 (Themes)

### Checklist

```
APISIX Routes Setup
─────────────────────
□ 4.1  Create route: /auth/* → Auth Service (public, no JWT)
       - Plugins: limit-count (30 req/min per IP)
       - Upstream: auth-service:3000

□ 4.2  Create route: /api/tenants/* → Auth Service (JWT required)
       - Plugins:
         - openid-connect (bearer_only: true, discovery URL)
         - limit-count (1000 req/min per consumer)
       - Upstream: auth-service:3000

□ 4.3  Create route: /api/visa/* → Doer-Visa Service (JWT + visa roles)
       - Plugins:
         - openid-connect (bearer_only: true)
         - authz-keycloak (doer-visa permissions)
         - limit-count
       - Upstream: doer-visa-service:8080

□ 4.4  Create route: /api/platform/* → Auth Service (JWT + platform_admin)
       - Plugins:
         - openid-connect (bearer_only: true)
         - limit-count
       - Upstream: auth-service:3000

□ 4.5  Create global CORS plugin configuration:
       - Allowed origins: product frontend domains
       - Allowed methods: GET, POST, PUT, DELETE, OPTIONS
       - Allowed headers: Authorization, Content-Type, X-Organization-Id
       - Expose headers: X-Request-Id
       - Max age: 3600

□ 4.6  Create route for Keycloak well-known endpoint (passthrough):
       - /realms/doer/.well-known/* → keycloak:8080
       - No auth required (public OIDC discovery)

□ 4.7  Configure APISIX Prometheus plugin:
       - Enable metrics collection
       - Expose at /apisix/prometheus/metrics

Route Configuration Scripts
────────────────────────────
□ 4.8  Create setup script (shell or HTTP file) for all routes:
       - config/apisix/routes.sh or config/apisix/routes.http
       - Idempotent (can be re-run safely)
       - Uses APISIX Admin API to create/update routes

□ 4.9  Create consumer definitions:
       - One consumer per product backend (for rate limiting tracking)

Testing
────────
□ 4.10 Test public route: curl /auth/register → reaches Auth Service
□ 4.11 Test protected route without token: curl /api/visa/test → 401
□ 4.12 Test protected route with valid token: curl /api/visa/test -H "Authorization: Bearer <token>" → proxied to service
□ 4.13 Test protected route with wrong product token: → 403
□ 4.14 Test rate limiting: send 31+ requests/min to /auth/* → 429
□ 4.15 Test CORS: OPTIONS request returns correct headers
```

### Verification

```
□ All routes registered (GET /apisix/admin/routes lists them all)
□ Public auth routes work without JWT
□ Protected routes reject missing/invalid tokens with 401
□ Protected routes reject insufficient roles with 403
□ Rate limiting triggers at configured thresholds
□ CORS headers present in responses
□ Prometheus metrics being collected
```

---

## Phase 5: Keycloakify Theme Development

**Goal**: Build custom branded login themes for each product using React.

**Depends on**: Phase 2 (Keycloak realm + clients exist)

**Parallel with**: Phase 3 (Auth Service), Phase 4 (APISIX)

### Checklist

```
Keycloakify Project Setup
──────────────────────────
□ 5.1  Initialize Keycloakify project:
       - themes/keycloakify/
       - npx create-keycloakify-app (or manual setup)
       - Configure for multiple theme variants

□ 5.2  Set up base theme components (shared across all products):
       - Base layout (responsive, mobile-friendly)
       - Login form component
       - Error message component
       - Social login buttons component
       - MFA/OTP input component
       - Password reset form component
       - Forgot password form component
       - Footer component

□ 5.3  Create Doer-Visa theme variant:
       - Logo, brand colors, fonts
       - Login page customization
       - Phone number input format (BD)
       - "Register" link → points to visa.doer.com/register (your custom UI)

□ 5.4  (Future) Create Doer-School theme variant:
       - Different logo, colors
       - Email-focused login
       - Student-oriented messaging

□ 5.5  (Future) Create Doer-HRMS theme variant:
       - Corporate styling
       - Employee-oriented messaging

□ 5.6  Build theme JAR:
       - npx keycloakify build
       - Output: .jar file containing all theme variants

□ 5.7  Deploy theme to Keycloak:
       - Copy JAR to keycloak providers/ directory
       - Restart Keycloak (or use hot-reload in dev)
       - In docker-compose: mount JAR as volume to providers/

□ 5.8  Assign themes to clients:
       - doer-visa client → login theme: "doer-visa"
       - doer-admin client → login theme: "doer-admin" (or default)

□ 5.9  Customize email templates:
       - Password reset email
       - Email verification
       - Invitation email (if using Keycloak email)
       - Brand with Doer styling

Testing
────────
□ 5.10 Access doer-visa login URL → see Doer-Visa branded page
□ 5.11 Access doer-admin login URL → see Admin branded page
□ 5.12 Social login buttons visible and functional
□ 5.13 MFA prompt page properly themed
□ 5.14 Password reset page properly themed
□ 5.15 Mobile responsive layout works
□ 5.16 "Register" link redirects to custom registration page (not Keycloak's)
```

### Verification

```
□ Login page for doer-visa shows custom branding (not default Keycloak)
□ Login flow works: enter credentials → redirect back with code
□ Social login buttons work (Google, GitHub)
□ MFA prompt (TOTP) shows themed page
□ Password reset email sends with branded template
□ All pages are responsive on mobile
```

---

## Phase 6: First Product Integration (Doer-Visa)

**Goal**: End-to-end integration of Doer-Visa as the pilot product.

**Depends on**: Phase 3 + 4 + 5 (Auth Service, APISIX, Themes)

### Checklist

```
Doer-Visa Backend Service
──────────────────────────
□ 6.1  Create Doer-Visa service scaffold:
       - services/doer-visa/
       - Business logic endpoints (applications CRUD)
       - JWT claims extraction middleware
       - Org-based data filtering on all queries
       - Role-based feature gating

□ 6.2  Create database schema:
       - applications table (with org_id column)
       - Other business tables as needed
       - All tables include org_id for tenant isolation

□ 6.3  Add to docker-compose.yml:
       - doer-visa-service with its own DB or shared product DB

Doer-Visa Frontend (Minimal for Testing)
──────────────────────────────────────────
□ 6.4  Create minimal frontend:
       - Login button (redirects to Keycloak via PKCE)
       - Callback handler (exchanges code for tokens)
       - Registration form (calls POST /auth/register)
       - Token refresh logic
       - Logout button
       - Simple dashboard showing JWT claims

□ 6.5  Implement OIDC client integration:
       - Use oidc-client-ts or react-oidc-context (React)
       - Configure: authority, clientId, redirectUri, scope

End-to-End Flow Testing
─────────────────────────
□ 6.6  Test: Platform admin creates a tenant (XYZ Visa Agency)
       - POST /api/tenants → org created in Keycloak
       - Admin user created with tenant_admin + doer-visa:manage_all
       - Verify in Keycloak admin console

□ 6.7  Test: Tenant admin logs in
       - Click login → Keycloak themed page → enter credentials
       - Redirected back with tokens
       - JWT contains correct roles and organization

□ 6.8  Test: Tenant admin creates an employee
       - POST /api/tenants/:tid/users → user created
       - Roles assigned correctly

□ 6.9  Test: Employee logs in and accesses visa APIs
       - Auth Code flow → tokens
       - GET /api/visa/applications → sees only their org's data
       - PUT /api/visa/applications/:id/process → works (has role)
       - PUT /api/visa/applications/:id/approve → 403 (lacks role)

□ 6.10 Test: End user self-registers
       - POST /auth/register with phone + password
       - User created in Keycloak with end_user role
       - User logs in → sees only customer features

□ 6.11 Test: SSO (if second product exists, even minimal)
       - Login to doer-visa → session created
       - Navigate to doer-admin → no login prompt (SSO)

□ 6.12 Test: Access restriction
       - Doer-visa user tries /api/school/* → 403 from APISIX

□ 6.13 Test: Social login
       - Click "Sign in with Google" → Google OAuth → back to app
       - User created/linked in Keycloak

□ 6.14 Test: MFA
       - Enable TOTP for a user in Keycloak
       - Login → password prompt → TOTP prompt → success

□ 6.15 Test: Password reset (email)
       - Click "Forgot password" → email sent → reset → login

□ 6.16 Test: Password reset (phone/SMS)
       - POST /auth/forgot-password → OTP sent
       - POST /auth/reset-password → password changed

□ 6.17 Test: Token refresh
       - Wait for access token expiry → POST /auth/refresh → new tokens

□ 6.18 Test: Logout
       - POST /auth/logout → session revoked
       - Try API call → 401

□ 6.19 Test: User deactivation
       - Admin disables user → user's session revoked
       - User tries to login → rejected

□ 6.20 Test: Tenant deactivation
       - Platform admin deactivates tenant → all users disabled
       - No one from that tenant can access anything

□ 6.21 Test: Invitation flow
       - Admin sends invite → email received → user clicks link
       - Fills registration form → account created with pre-assigned role

□ 6.22 Test: Role changes
       - Admin changes employee role → next token refresh has new roles
```

### Verification

```
□ Complete tenant onboarding → employee creation → end user registration cycle works
□ All four user types can login and see appropriate data/features
□ Tenant isolation verified: Tenant A cannot see Tenant B's data
□ RBAC verified: role-less actions are blocked
□ SSO verified: login once, access other products without re-auth
□ Social login works end to end
□ MFA works end to end
□ Password reset works (both email and phone)
□ Invitation flow works end to end
□ Logout clears all sessions
```

---

## Phase 7: Testing & Security Hardening

**Goal**: Comprehensive testing and security hardening before production.

**Depends on**: Phase 6 (working end-to-end system)

### Checklist

```
Security Testing
──────────────────
□ 7.1  JWT tampering test:
       - Modify JWT payload → APISIX rejects (signature invalid)
       - Expired JWT → 401
       - JWT from different realm → rejected

□ 7.2  Cross-tenant access test:
       - User A (org-1) tries to access org-2 data → never works
       - Tenant admin of org-1 tries to manage org-2 users → 403

□ 7.3  Role escalation test:
       - Tenant admin tries to assign platform_admin → rejected
       - End user tries to access admin endpoints → 403
       - Tenant admin tries to assign roles from other product → rejected

□ 7.4  Brute force test:
       - 6+ failed logins → account locked by Keycloak
       - Verify lockout duration and reset

□ 7.5  Rate limiting test:
       - Exceed rate limits on auth endpoints → 429
       - Verify per-IP and per-tenant limits work

□ 7.6  OWASP checklist:
       - [ ] SQL injection: parameterized queries everywhere
       - [ ] XSS: proper output encoding
       - [ ] CSRF: PKCE + state parameter in Auth Code flow
       - [ ] Insecure direct object references: org_id from JWT, not request
       - [ ] Broken authentication: no ROPC, proper token handling
       - [ ] Sensitive data exposure: no tokens in URLs, HTTPS only
       - [ ] Missing function level access control: guards on all endpoints

□ 7.7  Input validation test:
       - Malformed phone numbers → rejected
       - SQL injection in search params → safe
       - Oversized payloads → rejected
       - Missing required fields → proper error messages

Keycloak Hardening
────────────────────
□ 7.8  Set explicit hostname:
       - KC_HOSTNAME=auth.doer.com
       - KC_HOSTNAME_ADMIN=admin.doer.com (separate admin access)

□ 7.9  Restrict admin console:
       - Admin accessible only via admin.doer.com
       - IP whitelist for admin access (in production)

□ 7.10 Review client configurations:
       - No client has Direct Access Grants enabled
       - All public clients require PKCE
       - Confidential clients have strong secrets
       - Redirect URIs are strict (no wildcards)

□ 7.11 Review token lifetimes:
       - Access token: 5-15 min
       - Refresh token: reasonable for use case
       - SSO session: not too long

□ 7.12 Enable HTTPS:
       - TLS certificate for Keycloak
       - TLS for APISIX
       - Redirect HTTP → HTTPS

Performance Testing
─────────────────────
□ 7.13 Load test authentication flow:
       - Simulate concurrent login requests
       - Measure token issuance latency
       - Identify bottlenecks

□ 7.14 Load test API through APISIX:
       - Simulate concurrent authenticated API calls
       - Verify JWT validation doesn't add significant latency

□ 7.15 Database performance:
       - Check Keycloak DB query performance
       - Verify tenant data filtering performance with org_id indexes

Monitoring Setup
──────────────────
□ 7.16 Configure Prometheus to scrape:
       - Keycloak metrics (/metrics)
       - APISIX metrics (/apisix/prometheus/metrics)
       - Auth Service metrics (if exposed)

□ 7.17 Create Grafana dashboards:
       - Keycloak: login success/failure rates, active sessions,
         token issuance latency
       - APISIX: request rates per route, response codes, latency
       - System: CPU, memory, DB connections

□ 7.18 Set up alerting rules:
       - High authentication failure rate (brute force?)
       - Keycloak down or unhealthy
       - APISIX error rate spike
       - Database connection pool exhaustion
       - Disk space warnings

Documentation
──────────────
□ 7.19 API documentation:
       - OpenAPI/Swagger spec for Auth Service
       - Example requests for all endpoints

□ 7.20 Developer guide:
       - "How to integrate a new product" guide
       - Frontend OIDC integration examples
       - JWT claims reference
```

### Verification

```
□ All security tests pass
□ No OWASP vulnerabilities found
□ Rate limiting works at all levels
□ Monitoring dashboards showing real data
□ Alerts firing correctly on test scenarios
□ Documentation reviewed by team
```

---

## Phase 8: Production Deployment

**Goal**: Deploy to production with high availability and operational readiness.

**Depends on**: Phase 7 (all tests pass)

### Checklist

```
Infrastructure
───────────────
□ 8.1  Choose deployment target:
       - Option A: Docker Compose on VPS (simpler, fine for starting)
       - Option B: Kubernetes (scalable, recommended for growth)

□ 8.2  Set up production PostgreSQL:
       - Dedicated managed DB (AWS RDS, DigitalOcean Managed DB, etc.)
       - OR self-hosted with replication
       - SSL enabled
       - Automated backups (daily minimum)
       - Connection pooling configured

□ 8.3  Set up production Redis:
       - Managed Redis (AWS ElastiCache, etc.) OR self-hosted
       - Password protected
       - Persistence enabled

□ 8.4  Set up domain and DNS:
       - auth.doer.com → Keycloak (public login)
       - admin.doer.com → Keycloak admin (restricted)
       - api.doer.com → APISIX (API gateway)
       - visa.doer.com → Doer-Visa frontend
       - (future product domains)

□ 8.5  Set up TLS certificates:
       - Let's Encrypt or purchased certificates
       - Auto-renewal configured
       - Applied to APISIX (TLS termination)

□ 8.6  Configure reverse proxy / load balancer:
       - TLS termination
       - Health check routing
       - If Kubernetes: Ingress controller

Keycloak Production
─────────────────────
□ 8.7  Run Keycloak in production mode:
       - bin/kc.sh build (optimize)
       - bin/kc.sh start (not start-dev)
       - KC_HOSTNAME set to auth.doer.com
       - KC_PROXY_HEADERS=xforwarded (behind reverse proxy)

□ 8.8  High availability (if needed):
       - Minimum 2 Keycloak nodes
       - JGroups clustering (JDBC_PING or DNS_PING)
       - Sticky sessions on load balancer OR distributed sessions

□ 8.9  Import realm configuration:
       - Use realm export JSON from Phase 2
       - Verify all clients, roles, providers configured

□ 8.10 Create production admin accounts:
       - Strong passwords + MFA enabled
       - Remove default admin if applicable

□ 8.11 Rotate all client secrets:
       - Generate new secrets for all confidential clients
       - Update in Auth Service and APISIX configs
       - Store secrets in vault or secret manager

Deployment
───────────
□ 8.12 CI/CD pipeline:
       - Build Docker images for Auth Service + product services
       - Run tests in CI
       - Deploy to staging → verify → deploy to production
       - Realm config changes via import/export pipeline

□ 8.13 Secret management:
       - Use Docker secrets, K8s secrets, or HashiCorp Vault
       - No secrets in docker-compose.yml or code
       - Rotate strategy documented

□ 8.14 Backup strategy:
       - Keycloak DB: daily automated backups, 30-day retention
       - Auth Service DB: daily automated backups
       - Realm export: after any configuration change
       - Test restore procedure

□ 8.15 Rollback plan:
       - Database migration rollback scripts
       - Previous Docker image versions tagged and available
       - Keycloak realm import for config rollback

Operational Readiness
──────────────────────
□ 8.16 Health check endpoints verified:
       - Keycloak /health/ready
       - Auth Service /health
       - APISIX /apisix/status
       - All product services /health

□ 8.17 Log aggregation:
       - Centralized logging (ELK, Loki, CloudWatch, etc.)
       - Structured JSON logs from all services
       - Log retention policy

□ 8.18 Monitoring and alerting live:
       - Grafana dashboards accessible
       - Alert channels configured (Slack, email, PagerDuty)
       - On-call rotation (if applicable)

□ 8.19 Runbook documentation:
       - How to restart services
       - How to check Keycloak health
       - How to manually disable a tenant (emergency)
       - How to rotate secrets
       - How to restore from backup
       - How to add a new product

Go-Live Checklist
──────────────────
□ 8.20 Final security review:
       - [ ] All endpoints tested with invalid/missing tokens
       - [ ] Admin console not accessible from public internet
       - [ ] HTTPS enforced everywhere
       - [ ] No debug mode enabled
       - [ ] No default passwords remaining
       - [ ] Client secrets rotated from dev values
       - [ ] Rate limiting active
       - [ ] Brute force protection active

□ 8.21 Smoke test in production:
       - [ ] Create a test tenant
       - [ ] Register a test user
       - [ ] Login via Auth Code + PKCE
       - [ ] Access API with token
       - [ ] Refresh token
       - [ ] Logout
       - [ ] Social login (Google)
       - [ ] MFA flow
       - [ ] Delete test data
```

### Verification

```
□ All services running and healthy in production
□ HTTPS working on all domains
□ Login flow works end to end in production
□ SSO works across product domains
□ Monitoring dashboards populated
□ Alerts tested and working
□ Backup tested and restore verified
□ Team has access to runbooks
□ First real tenant onboarded successfully
```

---

## Summary

| Phase | Description | Depends On | Estimated Effort |
|-------|-------------|------------|------------------|
| 1 | Infrastructure (Docker Compose) | — | Configuration |
| 2 | Keycloak Realm Configuration | Phase 1 | Configuration |
| 3 | Auth Service Development | Phase 2 | Core development |
| 4 | APISIX Gateway Configuration | Phase 2 | Configuration |
| 5 | Keycloakify Theme Development | Phase 2 | Frontend work |
| 6 | First Product Integration | Phase 3+4+5 | Integration |
| 7 | Testing & Security Hardening | Phase 6 | QA & security |
| 8 | Production Deployment | Phase 7 | DevOps |

**Phases 3, 4, 5 can run in parallel** — they all depend on Phase 2 but not on each other. This is your biggest opportunity to speed up development by assigning parallel workstreams.
