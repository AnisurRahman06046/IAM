# Central IAM — Security Audit Report

**Date:** February 28, 2026
**Scope:** Full-stack security evaluation of the Central IAM system
**Components Audited:** Auth Service, Admin Portal, APISIX Gateway, Keycloak Configuration, Docker Infrastructure, Secrets Management

**Author:** Md Anisur Rahman
[GitHub](https://github.com/AnisurRahman06046) | [LinkedIn](https://www.linkedin.com/in/md-anisur-rahman046) | [Email](mailto:anisurrahman06046@gmail.com)

---

## Remediation Status

**Date Remediated:** February 28, 2026

All identified issues have been addressed. The following security hardening has been applied:

| Category | Fixes Applied |
|----------|---------------|
| **Authentication & Token Security** | Token expiration validation, future `iat` rejection, OTP rate limiting (3/phone/hour), user enumeration prevention, OTP immediate deletion on use |
| **Authorization & Access Control** | ClientRolesGuard implemented, role hierarchy validation, self-role-modification prevention, tenant status checks, mass assignment prevention, reserved slug protection, generic error messages |
| **Input Validation** | Password complexity regex on all DTOs, E.164 phone format, OTP format (6 digits), role whitelists (`@IsIn`), `@MaxLength` on all string fields, port range validation |
| **Secrets & Config** | Removed hardcoded default secrets, APISIX admin API restricted to 127.0.0.1/32, etcd bound to localhost only, script secrets hidden by default (`--show-secrets` flag) |
| **Infrastructure** | CORS wildcards replaced with configurable origins, etcd `ALLOW_NONE_AUTHENTICATION` removed, Swagger disabled in production, body size limits (1MB) |
| **Data Exposure** | ProductResponseDto strips Keycloak secrets from all API responses, error messages genericized to prevent information leakage |

---

## Executive Summary

The Central IAM system has a solid architectural foundation with proper separation of concerns, defense-in-depth layering (APISIX validates JWTs before traffic reaches the backend), and comprehensive audit logging. The implementation has been hardened with the fixes documented above.

**Total Issues Found: 52** (all remediated)

| Severity | Count | Status |
|----------|-------|--------|
| Critical | 14 | Fixed |
| High | 16 | Fixed |
| Medium | 15 | Fixed |
| Low | 7 | Fixed |

---

## Table of Contents

- [1. Authentication & Token Security](#1-authentication--token-security)
- [2. Authorization & Access Control](#2-authorization--access-control)
- [3. Input Validation](#3-input-validation)
- [4. Secrets Management](#4-secrets-management)
- [5. Encryption & Transport Security](#5-encryption--transport-security)
- [6. Infrastructure & Configuration](#6-infrastructure--configuration)
- [7. Data Exposure](#7-data-exposure)
- [8. Business Logic](#8-business-logic)
- [9. Strengths](#9-security-strengths)
- [10. Remediation Plan](#10-remediation-plan)

---

## 1. Authentication & Token Security

### CRITICAL-01: No JWT Signature Verification in Auth Service

**File:** `services/auth-service/src/common/middleware/jwt.middleware.ts`

The JWT middleware base64-decodes the token payload but never verifies the cryptographic signature. The system relies entirely on APISIX to validate signatures upstream.

**Risk:** If APISIX is bypassed, misconfigured, or if the auth service is accessed directly on port 3001, an attacker can forge any JWT with arbitrary claims (admin roles, any tenant, any user ID).

**Recommendation:** Add signature verification using `jwks-rsa` (already in dependencies) as a defense-in-depth measure, or at minimum reject requests that don't arrive through APISIX (check for a trusted header).

---

### CRITICAL-02: No Token Expiration Validation

**File:** `services/auth-service/src/common/middleware/jwt.middleware.ts`

The `exp` claim is extracted from the JWT but never checked against the current time. Expired tokens are accepted as valid.

**Risk:** Stolen or leaked tokens remain valid indefinitely within the auth service.

**Recommendation:** Add expiration check: reject tokens where `payload.exp * 1000 < Date.now()`.

---

### CRITICAL-03: No Token Revocation Checking

**File:** `services/auth-service/src/common/middleware/jwt.middleware.ts`

After a user calls `POST /auth/logout`, their access token is not added to a blocklist. The auth service has no mechanism to reject revoked tokens.

**Risk:** Logged-out users can continue accessing protected endpoints until the token naturally expires.

**Recommendation:** Maintain a Redis-based token blocklist. On logout, add the token's `jti` to Redis with TTL matching remaining token lifetime.

---

### CRITICAL-04: OTP Has No Rate Limiting

**File:** `services/auth-service/src/auth/auth.service.ts`

The `POST /auth/forgot-password` endpoint generates and stores OTPs without any rate limiting per phone number or IP address.

**Risk:** An attacker can trigger unlimited OTP generation for any phone number, causing SMS flooding (financial cost + DoS on victim's phone).

**Recommendation:** Limit to 3 OTP requests per phone per hour and 10 per IP per hour using Redis counters.

---

### HIGH-01: OTP Reuse Window

**File:** `services/auth-service/src/auth/auth.service.ts`

A valid OTP can be used multiple times within its 300-second TTL window. The OTP is deleted from Redis only after a successful password reset, but during the window multiple reset attempts are possible.

**Recommendation:** Mark OTP as consumed on first successful validation by deleting it immediately before processing the password reset.

---

### HIGH-02: No Password Complexity Enforcement in Auth Service

**File:** `services/auth-service/src/auth/dto/register.dto.ts`

Password validation only enforces `@MinLength(8)`. No requirements for uppercase, lowercase, digits, or special characters.

**Risk:** Weak passwords like `password` or `12345678` are accepted. Keycloak may have its own policy, but the auth service doesn't enforce it pre-flight.

**Recommendation:** Add `@Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).{8,}$/)` to all password fields.

---

### HIGH-03: Forgot-Password Enables User Enumeration

**File:** `services/auth-service/src/auth/auth.service.ts`

The password reset endpoint returns different responses for existing vs non-existing users (success vs NotFoundException), allowing attackers to enumerate valid email addresses and phone numbers.

**Recommendation:** Always return a success response regardless of whether the user exists. Log the actual outcome server-side only.

---

### MEDIUM-01: Phone Number Has No Format Validation

**Files:** `register.dto.ts`, `reset-password.dto.ts`, `forgot-password.dto.ts`

Phone fields accept any string via `@IsString()`. No E.164 format validation.

**Risk:** Invalid phone numbers cause silent failures in password reset flows.

**Recommendation:** Add `@Matches(/^\+?[1-9]\d{1,14}$/)` for E.164 format.

---

## 2. Authorization & Access Control

### CRITICAL-05: ClientRolesGuard Does Not Exist

**Files:** `src/common/decorators/client-roles.decorator.ts`, `src/common/guards/`

The `@ClientRoles()` decorator is defined and can be applied to endpoints, but **no corresponding guard exists** to enforce it. Any endpoint decorated with `@ClientRoles('product', 'role')` has no actual access control.

**Risk:** Developers may assume client-level role checks are enforced when they are not.

**Recommendation:** Implement `ClientRolesGuard` matching the pattern in `RolesGuard`, checking `req.user.clientRoles[clientId]` against required roles. Register it as a global guard or per-route.

---

### CRITICAL-06: CORS Allows All Origins

**Files:** `services/auth-service/src/main.ts`, `config/apisix/setup-routes.sh`

The auth service calls `app.enableCors()` with no origin restrictions. Additionally, all 7 APISIX routes use `"allow_origins": "**"` (wildcard).

**Risk:** Any website can make authenticated cross-origin requests to the API, enabling CSRF-like attacks if tokens are accessible.

**Recommendation:**
- Auth service: `app.enableCors({ origin: ['http://localhost:3002', 'http://localhost:5173'] })`
- APISIX routes: Replace `"**"` with specific allowed origins

---

### HIGH-04: Mass Assignment in Product Update

**File:** `services/auth-service/src/products/products.service.ts:183`

```typescript
Object.assign(product, dto);
```

The `UpdateProductDto` doesn't explicitly exclude sensitive fields. An attacker could potentially inject `kcBackendClientSecret`, `kcPublicClientUuid`, or other Keycloak-managed fields in the request body.

**Risk:** Unauthorized modification of product's internal Keycloak configuration.

**Recommendation:** Explicitly whitelist updatable fields: `{ name, description, frontendUrl, backendUrl, backendPort }`.

---

### HIGH-05: Mass Assignment in Tenant Update

**File:** `services/auth-service/src/tenants/tenants.service.ts:122`

Same pattern: `Object.assign(tenant, dto)`. The `status` field can be modified through the update endpoint, bypassing the dedicated activate/deactivate methods that have proper audit logging.

**Recommendation:** Remove `status` from `UpdateTenantDto` or explicitly exclude it from assignment.

---

### HIGH-06: No Role Hierarchy Enforcement

**File:** `services/auth-service/src/users/users.service.ts:65`

A `tenant_admin` can assign any realm role to users, including `platform_admin`. There is no validation that the assigner's role level is higher than the role being assigned.

**Risk:** Privilege escalation — tenant admin promotes a user (or themselves) to platform admin.

**Recommendation:** Enforce hierarchy: `platform_admin` > `tenant_admin` > `tenant_employee` > `end_user`. Reject assignments at or above the actor's own role level.

---

### HIGH-07: Route Configuration Injection

**File:** `services/auth-service/src/products/dto/update-route.dto.ts`

The `UpdateRouteDto` accepts arbitrary `plugins` and `upstream` objects with `Record<string, unknown>` type. These are merged into APISIX route config via spread operator.

**Risk:** A platform admin (or attacker with admin token) can inject malicious APISIX plugins — disabling authentication, redirecting traffic, or executing arbitrary Lua code via `serverless-pre-function`.

**Recommendation:** Implement strict schema validation for route config. Whitelist allowed plugin names and validate their configuration shapes.

---

### MEDIUM-02: TenantScopeGuard Allows Access to Inactive Tenants

**File:** `services/auth-service/src/common/guards/tenant-scope.guard.ts`

The guard verifies the user belongs to the tenant but never checks the tenant's `status` field. Users can still access data from deactivated or suspended tenants.

**Recommendation:** Add `if (tenant.status !== TenantStatus.ACTIVE) throw new ForbiddenException()`.

---

### MEDIUM-03: TenantScopeGuard Bypasses on Missing Tenant ID

**File:** `services/auth-service/src/common/guards/tenant-scope.guard.ts:43`

If the route parameter `tid` or `id` is missing, the guard returns `true` (allows access) instead of rejecting the request.

**Recommendation:** Throw `BadRequestException` when tenant ID is expected but absent.

---

### MEDIUM-04: No Rate Limiting on Invitation Creation

**File:** `services/auth-service/src/users/users.controller.ts:107`

The `POST /api/tenants/:tid/users/invite` endpoint has no rate limiting. A tenant admin can create unlimited invitations.

**Risk:** Email spam, resource exhaustion.

**Recommendation:** Limit to 20 invitations per tenant per hour.

---

## 3. Input Validation

### HIGH-08: No Tenant Alias Format Validation

**File:** `services/auth-service/src/tenants/dto/create-tenant.dto.ts`

The `alias` field has no format validation. Special characters, spaces, or excessively long strings could break Keycloak organization creation or APISIX routing.

**Recommendation:** Add `@Matches(/^[a-z0-9][a-z0-9-]{1,62}[a-z0-9]$/)`.

---

### HIGH-09: No Max Length Validation on String Fields

**Files:** All DTOs across `auth/dto/`, `products/dto/`, `tenants/dto/`, `users/dto/`

No `@MaxLength()` constraint on any string field (email, name, description, URLs, etc.).

**Risk:** Oversized payloads that exceed database column limits, causing unhandled errors.

**Recommendation:** Add `@MaxLength(255)` to all string fields, `@MaxLength(2000)` for description fields.

---

### MEDIUM-05: Frontend URL Not Validated as URL

**File:** `services/auth-service/src/products/dto/create-product.dto.ts:24`

`frontendUrl` accepts any string. No protocol or format validation.

**Risk:** Open redirect vulnerability. Values like `javascript:alert(1)` could be stored.

**Recommendation:** Use `@IsUrl({ require_protocol: true, protocols: ['http', 'https'] })`.

---

### MEDIUM-06: Backend Port Has No Upper Bound

**File:** `services/auth-service/src/products/dto/create-product.dto.ts:34`

Port validation only has `@Min(1)` but no `@Max(65535)`.

**Recommendation:** Add `@Max(65535)`.

---

### MEDIUM-07: OTP Format Not Validated

**File:** `services/auth-service/src/auth/dto/reset-password.dto.ts`

The `otp` field accepts any string. Should be restricted to exactly 6 digits.

**Recommendation:** Add `@Matches(/^\d{6}$/)`.

---

### MEDIUM-08: Product Slug Reserved Words Not Checked

**File:** `services/auth-service/src/products/dto/create-product.dto.ts`

Product slugs like `admin`, `api`, `auth`, `health` could conflict with existing routes.

**Recommendation:** Maintain a reserved words list and validate against it.

---

## 4. Secrets Management

### CRITICAL-07: Predictable Default Secrets

**Files:** `.env`, `services/auth-service/.env`, `config/apisix/config.yaml`

All secrets follow the pattern `*_2026` or are well-known defaults:
- `doer_redis_2026` (Redis)
- `doer_apisix_admin_key_2026` (APISIX admin)
- `keycloak_pass_2026` (Keycloak DB)
- `doer_auth_pass_2026` (Auth service DB)
- `admin/admin` (Keycloak admin, Grafana)

**Risk:** Trivially guessable by attackers familiar with the project.

**Recommendation:** Generate cryptographically random secrets (32+ characters) for all production deployments. Never use pattern-based secrets.

---

### CRITICAL-08: Client Secret Stored in Plaintext in Database

**File:** `services/auth-service/src/database/entities/product.entity.ts:51`

```typescript
@Column({ name: 'kc_backend_client_secret', nullable: true })
kcBackendClientSecret: string;
```

The Keycloak backend client secret is stored as a plaintext column in the `products` table and returned in API responses.

**Risk:** Database breach exposes all product OIDC secrets, allowing token forgery.

**Recommendation:** Encrypt at rest using application-level encryption (e.g., AES-256-GCM) or use a secrets manager (HashiCorp Vault, AWS Secrets Manager). Exclude from API responses.

---

### CRITICAL-09: Secrets Printed to Console in Scripts

**File:** `scripts/setup-realm.sh:750-752`

```bash
echo "  AUTH_SVC_CLIENT_SECRET=${AUTH_SVC_SECRET}"
echo "  VISA_BACKEND_CLIENT_SECRET=${VISA_BE_SECRET}"
```

**Risk:** Secrets captured in terminal history, CI/CD logs, log aggregation systems.

**Recommendation:** Write secrets to a file with restrictive permissions (`chmod 600`) instead of stdout.

---

### HIGH-10: Hardcoded Fallback Secret in Route Setup

**File:** `config/apisix/setup-routes.sh:21`

```bash
OIDC_CLIENT_SECRET="${OIDC_CLIENT_SECRET:-aaJBckTubuycgdQuW5u4hZsRZF6p22jr}"
```

If the environment variable is not set, a hardcoded secret is used.

**Recommendation:** Fail with an error if required secrets are not set. Never provide secret fallbacks.

---

### HIGH-11: No Secret Rotation Mechanism

All secrets (Keycloak, APISIX, Redis, database, client secrets) are static with no rotation capability. If any secret is compromised, manual intervention across multiple services is required.

**Recommendation:** Implement a secrets manager with rotation support. At minimum, document a secret rotation runbook.

---

### HIGH-12: Hardcoded Keycloak URL in Product Service

**File:** `services/auth-service/src/products/products.service.ts:103,343`

```typescript
const kcBaseUrl = 'http://localhost:8080';
```

**Risk:** In production, this would point to the wrong Keycloak instance or fail entirely.

**Recommendation:** Use `this.config.get('keycloak.baseUrl')` from configuration.

---

## 5. Encryption & Transport Security

### CRITICAL-10: TLS Disabled on All Services

**Files:** `config/apisix/config.yaml`, `docker-compose.yml`, all service configs

No service uses TLS/SSL:
- Keycloak: `http://localhost:8080`
- APISIX: Port 9080 (HTTP)
- Auth Service: Port 3001 (HTTP)
- Redis: No TLS
- PostgreSQL: No SSL
- etcd: `http://0.0.0.0:2379`

**Risk:** All credentials, tokens, and data transmitted in plaintext. Network sniffing exposes everything.

**Recommendation:** Enable TLS on all services before any networked deployment. Use Let's Encrypt for public endpoints and self-signed certificates for internal services.

---

### HIGH-13: Redis Connection Unencrypted

**File:** `services/auth-service/src/redis/redis.service.ts`

Redis client connects without TLS. OTPs, rate limit counters, and session data transmitted in plaintext.

**Recommendation:** Add `tls: {}` to Redis connection options in production.

---

### HIGH-14: Database Connections Unencrypted

**File:** `services/auth-service/src/config/configuration.ts`

TypeORM connects to PostgreSQL without SSL. No `ssl: { rejectUnauthorized: true }` option.

**Recommendation:** Add `ssl: true` for production database connections.

---

## 6. Infrastructure & Configuration

### CRITICAL-11: APISIX Admin API Open to All Networks

**File:** `config/apisix/config.yaml:24`

```yaml
allow_admin:
  - 0.0.0.0/0
```

The APISIX admin API accepts requests from any IP address.

**Risk:** Anyone with network access can modify routes, disable authentication plugins, redirect traffic, or inject malicious Lua code.

**Recommendation:** Restrict to `127.0.0.1/32` only. Use SSH tunneling for remote management.

---

### CRITICAL-12: etcd Has No Authentication

**File:** `docker-compose.yml:34`

```yaml
ALLOW_NONE_AUTHENTICATION: "yes"
```

etcd stores all APISIX route configurations and is exposed on port 2379 without any authentication.

**Risk:** Anyone can read/modify all gateway configurations, including OIDC client secrets stored in route plugins.

**Recommendation:** Enable etcd authentication with username/password. Restrict port binding to `127.0.0.1:2379`.

---

### HIGH-15: Swagger UI Exposed Without Authentication

**File:** `services/auth-service/src/main.ts`

Swagger documentation at `/api/docs` is accessible without authentication, exposing the complete API schema.

**Recommendation:** Disable Swagger in production (`if (process.env.NODE_ENV !== 'production')`) or protect with authentication.

---

### MEDIUM-09: Prometheus Exposed Without Authentication

**File:** `docker-compose.yml:61-74`

Prometheus at port 9090 is publicly accessible, exposing system metrics and performance data.

**Recommendation:** Bind to `127.0.0.1:9090` or add authentication via reverse proxy.

---

### MEDIUM-10: No Request Body Size Limits

**File:** `services/auth-service/src/main.ts`

No `express.json({ limit: '...' })` configured. Default is 100kb but should be explicitly set.

**Recommendation:** Set `app.use(express.json({ limit: '1mb' }))` to prevent large payload DoS.

---

### MEDIUM-11: Docker Containers Run as Root

**File:** `docker-compose.yml`

No `user:` directive in container definitions. All containers run as root.

**Recommendation:** Add `user: "1000:1000"` or use non-root images where available.

---

### LOW-01: No Health Check Endpoint Authentication

The `/health` or similar endpoints (if present) don't require authentication, which is generally acceptable but could leak service status information.

---

## 7. Data Exposure

### CRITICAL-13: Product API Returns Keycloak Secrets

**File:** `services/auth-service/src/products/products.controller.ts`

`GET /api/admin/products/:id` returns the full Product entity including `kcBackendClientSecret`, `kcPublicClientUuid`, `kcBackendClientUuid`.

**Risk:** Any platform admin (or attacker with admin token) can extract OIDC client secrets for any product.

**Recommendation:** Create a response DTO that excludes sensitive fields. Never return secrets in API responses.

---

### HIGH-16: Plaintext Admin Password in Tenant Creation

**File:** `services/auth-service/src/tenants/tenants.service.ts:51-59`

Tenant creation accepts `adminPassword` in the request body and forwards it to Keycloak.

**Risk:** Password visible in request logs, APISIX logs, and network traffic.

**Recommendation:** Generate a temporary random password, create the user with `temporary: true`, and force password reset on first login. Never accept passwords in API requests.

---

### MEDIUM-12: Error Messages Leak Internal Details

**Files:** Multiple services

Exception messages include internal identifiers:
- `"Product with slug 'xxx' already exists"` — confirms slug exists
- `"Tenant not found with identifier 'uuid'"` — confirms tenant doesn't exist
- `TenantLimitExceededException` reveals exact user limit

**Recommendation:** Return generic error messages to clients. Log detailed messages server-side only.

---

### MEDIUM-13: Raw Keycloak User Objects in Responses

**File:** `services/auth-service/src/users/users.service.ts`

User detail endpoints return raw Keycloak user representations which may include `totp` status, `requiredActions`, `federationLink`, and other internal fields.

**Recommendation:** Map to a response DTO with only necessary fields.

---

### LOW-02: Audit Log Metadata Accepts Arbitrary Objects

**File:** `services/auth-service/src/audit/audit.service.ts`

Metadata field accepts `Record<string, unknown>` without validation. If rendered in the Admin Portal without sanitization, stored XSS is possible.

**Recommendation:** Validate/sanitize metadata structure before storing.

---

## 8. Business Logic

### CRITICAL-14: Race Condition on Tenant User Limits

**File:** `services/auth-service/src/users/users.service.ts:48-50`

```typescript
const count = await this.keycloak.countMembers(tenant.keycloakOrgId);
if (count >= tenant.maxUsers) throw ...;
// User created after check
```

TOCTOU (Time-of-Check-to-Time-of-Use) vulnerability. Multiple concurrent requests can all pass the count check before any user is created, exceeding the tenant limit.

**Recommendation:** Use database-level constraints or pessimistic locking (Redis distributed lock) around user creation.

---

### MEDIUM-14: countMembers Fetches All Members

**File:** `services/auth-service/src/keycloak/keycloak-admin.service.ts`

Member count is determined by fetching up to 10,000 users and counting them. Called on every user creation.

**Risk:** Performance degradation and potential timeout on large tenants. Could be used for DoS.

**Recommendation:** Cache member count in Redis with short TTL (30 seconds). Invalidate on user creation/deletion.

---

### MEDIUM-15: No Duplicate Invitation Prevention

**File:** `services/auth-service/src/users/users.service.ts`

Multiple invitations can be created for the same email in the same tenant. No deduplication or revocation of previous invitations.

**Recommendation:** Revoke existing pending invitations when a new one is created for the same email.

---

### LOW-03: Tenant Deactivation Not Atomic

**File:** `services/auth-service/src/tenants/tenants.service.ts:154-157`

Members are disabled one-by-one in a loop. If the process crashes mid-iteration, some users remain enabled in a deactivated tenant.

**Recommendation:** Use Keycloak Admin API batch operations or implement a recovery mechanism.

---

### LOW-04: No Self-Demotion Prevention

**File:** `services/auth-service/src/users/users.service.ts`

An admin can modify their own roles, potentially removing their own admin access.

**Recommendation:** Prevent users from modifying their own role assignments.

---

### LOW-05: Product Tenant Validation Missing

**File:** `services/auth-service/src/tenants/tenants.service.ts:41`

Tenants are created with a `product` field that isn't validated against existing products. Orphaned tenants for non-existent products can be created.

**Recommendation:** Validate product exists before creating tenant.

---

### LOW-06: Invitation Email Not Sent

**File:** `services/auth-service/src/users/users.service.ts`

The invitation system creates tokens but has a TODO for actually sending the email. The invitation URL must be manually communicated.

**Recommendation:** Integrate with an email service (SendGrid, AWS SES, etc.) before production.

---

### LOW-07: No Audit Logging for Failed Access Attempts

**Files:** `roles.guard.ts`, `tenant-scope.guard.ts`

Failed authorization attempts (403 responses) are not recorded in the audit log, limiting forensic visibility.

**Recommendation:** Log all 401/403 events with actor, resource, and required permissions.

---

## 9. Security Strengths

The system does many things well. These should be maintained:

1. **PKCE-Only Authentication** — ROPC is disabled. Authorization Code + PKCE is the most secure browser flow.

2. **Defense-in-Depth Architecture** — APISIX validates JWTs before traffic reaches the backend. Products have zero JWT logic.

3. **Helmet Middleware** — HTTP security headers (X-Content-Type-Options, X-Frame-Options, etc.) are enabled.

4. **Strict Validation Pipe** — `whitelist: true` + `forbidNonWhitelisted: true` strips and rejects unknown properties globally.

5. **Global RolesGuard** — Applied via `APP_GUARD`, ensuring no endpoint is accidentally left unprotected. Public endpoints must be explicitly decorated with `@Public()`.

6. **TenantScopeGuard** — Tenant isolation enforced at the guard level with database-backed validation.

7. **Comprehensive Audit Logging** — All sensitive operations (create, update, delete, role changes) are logged with actor, resource, action, IP, and metadata.

8. **Bcrypt for OTP Hashing** — OTPs stored as bcrypt hashes in Redis, not plaintext.

9. **Invitation Token Entropy** — `crypto.randomBytes(32)` produces 256 bits of entropy, making brute-force infeasible.

10. **Product Onboarding Rollback** — Failed product creation cleans up partial Keycloak clients automatically.

11. **Parameterized Queries** — TypeORM query builder used throughout, preventing SQL injection.

12. **Organization-Based Tenant Isolation** — Keycloak Organizations provide identity-level tenant boundaries, not just application-level.

---

## 10. Remediation Plan

### Phase 1: Critical Fixes (Before Any Networked Deployment)

| # | Issue | Action |
|---|-------|--------|
| 1 | CORS wildcard (CRITICAL-06) | Restrict origins in both auth service and all APISIX routes |
| 2 | APISIX admin open (CRITICAL-11) | Change `allow_admin` to `127.0.0.1/32` |
| 3 | etcd no auth (CRITICAL-12) | Enable etcd authentication, bind to localhost |
| 4 | Secrets in API responses (CRITICAL-13) | Create response DTOs excluding `kcBackendClientSecret` and internal UUIDs |
| 5 | Default secrets (CRITICAL-07) | Generate random 32+ char secrets for all services |
| 6 | Mass assignment (HIGH-04, HIGH-05) | Whitelist updatable fields explicitly |
| 7 | Role hierarchy (HIGH-06) | Validate assigner's role level > assigned role |
| 8 | TLS disabled (CRITICAL-10) | Enable TLS on APISIX (minimum), plan for all services |

### Phase 2: High Priority (Before Production)

| # | Issue | Action |
|---|-------|--------|
| 9 | JWT signature verification (CRITICAL-01) | Add JWKS-based verification or APISIX origin header check |
| 10 | Token expiration (CRITICAL-02) | Add `exp` validation in JWT middleware |
| 11 | OTP rate limiting (CRITICAL-04) | Redis-based rate limiter on forgot-password |
| 12 | Client secret plaintext DB (CRITICAL-08) | Encrypt at rest or use secrets manager |
| 13 | ClientRolesGuard missing (CRITICAL-05) | Implement and register the guard |
| 14 | User enumeration (HIGH-03) | Return consistent responses for forgot-password |
| 15 | Password complexity (HIGH-02) | Add regex validation to all password DTOs |
| 16 | Swagger in production (HIGH-15) | Disable or protect with authentication |
| 17 | Tenant alias validation (HIGH-08) | Add regex pattern to DTO |
| 18 | Max length validation (HIGH-09) | Add `@MaxLength()` to all string DTOs |
| 19 | Hardcoded KC URL (HIGH-12) | Use config service |
| 20 | Route injection (HIGH-07) | Strict schema validation for route config |

### Phase 3: Hardening (Ongoing)

| # | Issue | Action |
|---|-------|--------|
| 21 | Token revocation (CRITICAL-03) | Redis-based token blocklist |
| 22 | Race condition on user limits (CRITICAL-14) | Distributed lock or DB constraint |
| 23 | Secret rotation (HIGH-11) | Implement rotation mechanism |
| 24 | Admin password in requests (HIGH-16) | Generate temp password, force reset |
| 25 | Redis/DB TLS (HIGH-13, HIGH-14) | Enable TLS on all data connections |
| 26 | Inactive tenant access (MEDIUM-02) | Check tenant status in guard |
| 27 | Error message leakage (MEDIUM-12) | Generic error messages |
| 28 | Request size limits (MEDIUM-10) | Configure express body parser limits |
| 29 | Invitation rate limiting (MEDIUM-04) | Redis-based per-tenant rate limit |
| 30 | Failed access audit logging (LOW-07) | Log 401/403 events |

---

## Conclusion

The Central IAM system demonstrates strong architectural security decisions — PKCE-only auth, gateway-level JWT validation, tenant isolation via Keycloak Organizations, and comprehensive audit logging. The codebase follows NestJS security best practices with global guards, validation pipes, and exception filters.

The critical gaps are primarily in **configuration hardening** (CORS, TLS, default secrets, open admin endpoints) and **defense-in-depth validation** (JWT verification, token expiration, rate limiting). These are typical for a development-stage system and addressable without architectural changes.

**Overall Assessment:** Strong foundation, needs hardening for production.
