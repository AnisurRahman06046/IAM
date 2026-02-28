# Dummy Products — E2E Testing

Disposable product services for end-to-end verification of the Doer IAM platform. These are **not production code** — they exist to exercise every auth flow and can be deleted at any time.

## Architecture

```
┌─────────────────┐     ┌──────────────────────────────────────────┐
│  doer-visa-     │     │             APISIX (port 9080)           │
│  frontend       │────▶│                                          │
│  (port 5173)    │     │  1. openid-connect: validate JWT (JWKS)  │
└─────────────────┘     │  2. serverless-pre-function: extract     │
                        │     claims → X-User-Id, X-User-Email,    │
                        │     X-User-Roles, X-Client-Roles,        │
                        │     X-Organization-Id                     │
                        │  3. proxy to upstream                     │
                        ├──────────────┬───────────────────────────┤
                        │              │                           │
                        ▼              ▼                           ▼
                 ┌──────────┐  ┌──────────────┐           ┌──────────┐
                 │ doer-visa│  │ auth-service  │           │ Keycloak │
                 │ -api     │  │ (port 3001)   │──────────▶│ (8080)   │
                 │ (4001)   │  │               │           │          │
                 └──────────┘  └──────────────┘           └──────────┘
```

**Key design:** APISIX handles all JWT validation and injects user claims as HTTP headers. The doer-visa-api has **zero JWT logic** — it reads `X-User-Id`, `X-Client-Roles`, etc. directly from request headers.

## Port Allocation

| Service              | Port  | Purpose                     |
|----------------------|-------|-----------------------------|
| Keycloak             | 8080  | Identity provider           |
| APISIX               | 9080  | API gateway                 |
| Auth Service         | 3001  | Registration, token exchange|
| doer-visa-api        | 4001  | Visa application CRUD       |
| doer-visa-frontend   | 5173  | React SPA                   |

## Quick Start

### Prerequisites
All infrastructure services must be running:
```bash
# From project root
bash scripts/start-keycloak.sh
bash scripts/start-infra.sh          # Docker: Redis, APISIX, etcd, Prometheus, Grafana
cd services/auth-service && npm run start:dev &
bash config/apisix/setup-routes.sh   # Configure APISIX routes with header injection
```

### 1. Setup Keycloak redirect URIs
```bash
bash dummy-products/setup-keycloak.sh
```

### 2. Start the Visa API
```bash
cd dummy-products/doer-visa-api
npm install
npm run dev
```

### 3. Start the Frontend
```bash
cd dummy-products/doer-visa-frontend
npm install
npm run dev
```

### 4. Open in browser
Navigate to http://localhost:5173

### 5. Run E2E tests
```bash
bash dummy-products/e2e-test.sh
```

## APISIX Header Injection

APISIX validates the JWT and sets these headers on upstream requests:

| Header             | JWT Claim                          | Example                    |
|--------------------|------------------------------------|----------------------------|
| `X-User-Id`        | `sub`                              | `a1b2c3d4-...`             |
| `X-User-Email`     | `email`                            | `user@example.com`         |
| `X-User-Roles`     | `realm_access.roles`               | `tenant_employee,end_user` |
| `X-Client-Roles`   | `resource_access["doer-visa"].roles`| `apply_visa,view_own_status`|
| `X-Organization-Id`| first key of `organization` map    | `org-uuid-...`             |

This means product services don't need any JWT libraries or token parsing logic.

## E2E Test Scenarios

The test script (`e2e-test.sh`) covers:

1. Health check — visa API is running
2. Unauthenticated access — returns 401
3. Tenant creation — platform admin creates org
4. Employee creation — tenant admin adds user with roles
5. Visa CRUD — create and list applications
6. Role enforcement — employee can't approve (403)
7. Tenant isolation — different org sees 0 apps
8. Self-registration — new user registers via auth service
9. Audit logs — platform admin can view logs
