# Central IAM — Centralized Identity & Access Management

A production-grade, multi-tenant Identity and Access Management system designed for **any multi-product SaaS company**. Provides centralized authentication, authorization, tenant management, and automated product onboarding — all from a single platform.

**Author:** Md Anisur Rahman
[GitHub](https://github.com/AnisurRahman06046) | [LinkedIn](https://www.linkedin.com/in/md-anisur-rahman046) | [Email](mailto:anisurrahman06046@gmail.com)

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Features](#features)
- [User Flows](#user-flows)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start](#quick-start)
- [Service Ports](#service-ports)
- [Default Credentials](#default-credentials)
- [API Overview](#api-overview)
- [Frontend Applications](#frontend-applications)
- [Release Notes](#release-notes)
- [Documentation](#documentation)
- [Author](#author)
- [License](#license)

---

## Overview

Central IAM is a **B2B2C multi-tenant** identity platform that allows any organization to manage multiple products under a single authentication umbrella. Whether you're running an ERP, CRM, LMS, or any SaaS product suite — this system provides the identity backbone. It handles:

- **Single Sign-On (SSO)** across all registered products
- **Multi-tenancy** with organization-based isolation
- **Role-Based Access Control (RBAC)** at both platform and product levels
- **Automated product onboarding** — register a new product and get Keycloak clients, API gateway routes, and RBAC configured in one step
- **Comprehensive audit logging** for compliance and debugging

```
┌─────────────────────────────────────────────────────────────────┐
│                      YOUR PLATFORM                              │
│                                                                 │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐       │
│  │Product A │  │Product B │  │Product C │  │  future  │       │
│  │ frontend │  │ frontend  │  │ frontend │  │ products │       │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘       │
│       │              │              │              │             │
│       └──────────────┴──────────────┴──────────────┘             │
│                              │                                   │
│                    ┌─────────▼──────────┐                        │
│                    │   APISIX Gateway   │  JWT Validation        │
│                    │   (Port 9080)      │  Rate Limiting         │
│                    └─────────┬──────────┘  Header Injection      │
│                              │                                   │
│            ┌─────────────────┼──────────────────┐                │
│            │                 │                   │                │
│   ┌────────▼───────┐  ┌─────▼──────┐  ┌────────▼───────┐       │
│   │  Auth Service   │  │ Product    │  │  Product       │       │
│   │  (Port 3001)    │  │ APIs       │  │  APIs          │       │
│   └────────┬───────┘  └────────────┘  └────────────────┘       │
│            │                                                     │
│   ┌────────▼───────┐  ┌─────────────┐  ┌───────────────┐       │
│   │  PostgreSQL    │  │  Keycloak   │  │    Redis      │       │
│   │  (Port 5432)   │  │  (Port 8080)│  │  (Port 6379)  │       │
│   └────────────────┘  └─────────────┘  └───────────────┘       │
└─────────────────────────────────────────────────────────────────┘
```

---

## Architecture

| Component | Role |
|-----------|------|
| **Keycloak 26.5** | Identity Provider — manages users, organizations, roles, SSO, and OIDC tokens |
| **APISIX 3.11** | API Gateway — JWT validation, rate limiting, CORS, and header injection via Lua |
| **Auth Service** | NestJS backend — registration, token exchange, tenant/user/product management |
| **Admin Portal** | React admin UI — product onboarding, tenant management, audit logs |
| **PostgreSQL** | Persistent storage for Keycloak + Auth Service |
| **Redis** | OTP storage, rate limiting counters, session caching |
| **Prometheus + Grafana** | Metrics collection and visualization |

### Authentication Flow

All products use **Authorization Code + PKCE** (no passwords ever touch product backends):

```
Browser → Keycloak Login → Authorization Code → Auth Service → Token Exchange → JWT
```

Products never handle credentials. APISIX validates JWTs and injects user context as HTTP headers (`X-User-Id`, `X-User-Email`, `X-User-Roles`, `X-Client-Roles`, `X-Organization-Id`), so product backends have **zero JWT logic**.

---

## Features

### Authentication & SSO
- Authorization Code + PKCE flow (ROPC disabled for security)
- Single Sign-On across all registered products
- Token exchange, refresh, and revocation
- Password reset via OTP
- Invitation-based onboarding with token validation
- Custom Keycloakify login themes (per-product branding)

### Multi-Tenancy
- Organization-based tenant isolation via Keycloak Organizations
- Automatic org membership in JWT tokens
- Tenant-scoped API guards preventing cross-tenant access
- Per-tenant user management (create, invite, enable/disable, remove)
- Tenant plans: Basic, Pro, Enterprise with configurable user limits

### Role-Based Access Control
- **4 realm roles**: `platform_admin`, `tenant_admin`, `tenant_employee`, `end_user`
- **Per-product client roles**: Fully customizable (e.g., `manage_orders`, `approve_requests`)
- **Composite roles**: Group multiple roles under a single parent role
- Scope mappings ensure only relevant roles appear in tokens
- Global `RolesGuard` + per-route `TenantScopeGuard`

### Product Lifecycle Management
- **One-click product onboarding** that automates:
  - Keycloak public client creation (PKCE)
  - Keycloak backend client creation (with secret)
  - Realm role scope mappings
  - Organization scope configuration
  - APISIX route creation (JWT + Lua header injection)
  - Database record with full audit trail
- Rollback on failure — partial resources cleaned up automatically
- Product deactivation with APISIX route disabling
- Per-product client role CRUD with composite support
- APISIX route config management (view, edit, toggle)

### API Gateway (APISIX)
- JWT validation via `openid-connect` plugin
- Lua-based header injection (`serverless-pre-function`)
- Per-route rate limiting
- CORS handling
- Request ID tracking
- Route enable/disable per product

### Audit & Monitoring
- Comprehensive audit logging for all sensitive operations
- Filterable by action, resource type, actor, date range
- Prometheus metrics scraping (Keycloak + APISIX)
- Grafana dashboards

### Admin Portal
- React + Ant Design web application for platform administrators
- Dashboard with platform statistics
- Product management with role editor and route configurator
- Tenant management with user listing
- Audit log viewer with filters

---

## User Flows

### 1. Platform Admin Onboards a New Product

```
Admin Portal                Auth Service              Keycloak              APISIX
     │                           │                        │                    │
     │  POST /api/admin/products │                        │                    │
     │ ─────────────────────────▶│                        │                    │
     │                           │  Create public client  │                    │
     │                           │ ──────────────────────▶│                    │
     │                           │  Create backend client │                    │
     │                           │ ──────────────────────▶│                    │
     │                           │  Get client secret     │                    │
     │                           │ ──────────────────────▶│                    │
     │                           │  Add scope mappings    │                    │
     │                           │ ──────────────────────▶│                    │
     │                           │                        │  Create route      │
     │                           │ ───────────────────────┼───────────────────▶│
     │                           │  Save to DB + Audit    │                    │
     │  Product created          │                        │                    │
     │ ◀─────────────────────────│                        │                    │
```

### 2. Platform Admin Creates a Tenant

```
Admin Portal                Auth Service              Keycloak
     │                           │                        │
     │  POST /api/tenants        │                        │
     │ ─────────────────────────▶│                        │
     │                           │  Create Organization   │
     │                           │ ──────────────────────▶│
     │                           │  Save tenant to DB     │
     │                           │  Write audit log       │
     │  Tenant created           │                        │
     │ ◀─────────────────────────│                        │
```

### 3. Tenant Admin Invites a User

```
Tenant Admin                Auth Service              Keycloak
     │                           │                        │
     │  POST /api/tenants/:tid   │                        │
     │       /users/invite       │                        │
     │ ─────────────────────────▶│                        │
     │                           │  Generate invitation   │
     │                           │  token + store in DB   │
     │  Invitation link          │                        │
     │ ◀─────────────────────────│                        │
     │                           │                        │
     ├─── (User clicks link) ───▶│                        │
     │  POST /auth/accept-invite │                        │
     │ ─────────────────────────▶│                        │
     │                           │  Create user           │
     │                           │ ──────────────────────▶│
     │                           │  Add to organization   │
     │                           │ ──────────────────────▶│
     │                           │  Assign roles          │
     │                           │ ──────────────────────▶│
     │  Account created          │                        │
     │ ◀─────────────────────────│                        │
```

### 4. End User Logs In (PKCE Flow)

```
Browser                     Keycloak                  APISIX               Product API
  │                              │                        │                      │
  │  Redirect to /auth?          │                        │                      │
  │  response_type=code&         │                        │                      │
  │  code_challenge=...          │                        │                      │
  │ ────────────────────────────▶│                        │                      │
  │                              │                        │                      │
  │  Login page (themed)         │                        │                      │
  │ ◀────────────────────────────│                        │                      │
  │                              │                        │                      │
  │  Submit credentials          │                        │                      │
  │ ────────────────────────────▶│                        │                      │
  │                              │                        │                      │
  │  Redirect with ?code=abc     │                        │                      │
  │ ◀────────────────────────────│                        │                      │
  │                              │                        │                      │
  │  POST /auth/token            │                        │                      │
  │  {code, code_verifier}       │                        │                      │
  │ ────────────────────────────▶│                        │                      │
  │                              │                        │                      │
  │  {access_token, refresh}     │                        │                      │
  │ ◀────────────────────────────│                        │                      │
  │                              │                        │                      │
  │  GET /api/product/resource   │                        │                      │
  │  Authorization: Bearer xxx   │                        │                      │
  │ ─────────────────────────────┼───────────────────────▶│                      │
  │                              │  Validate JWT          │                      │
  │                              │  Inject X-User-* hdrs  │                      │
  │                              │                        │ ────────────────────▶│
  │                              │                        │                      │
  │                              │                        │  Response            │
  │ ◀────────────────────────────┼────────────────────────┼──────────────────────│
```

### 5. Product Backend Reads User Context

Product APIs never parse JWTs. They read pre-validated headers set by APISIX:

```javascript
// Express.js example
app.get('/api/myproduct/resource', (req, res) => {
  const userId     = req.headers['x-user-id'];
  const email      = req.headers['x-user-email'];
  const roles      = req.headers['x-user-roles'];       // "tenant_admin,end_user"
  const clientRoles= req.headers['x-client-roles'];     // "manage_orders,approve_requests"
  const orgId      = req.headers['x-organization-id'];   // "acme-corp"

  // Apply business logic using these headers — zero JWT code needed
});
```

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Identity Provider | Keycloak | 26.5.4 |
| API Gateway | Apache APISIX | 3.11.0 |
| Backend Framework | NestJS | 11.x |
| ORM | TypeORM | 0.3.x |
| Database | PostgreSQL | 16+ |
| Cache | Redis | 7.x |
| Admin Frontend | React + Ant Design | 18.x + 5.x |
| Product Frontend | React + Vite | 18.x + 6.x |
| Login Themes | Keycloakify | 11.x |
| Monitoring | Prometheus + Grafana | Latest |
| Language | TypeScript | 5.6+ |

---

## Project Structure

```
IAM/
├── services/
│   ├── auth-service/            # NestJS backend (port 3001)
│   │   ├── src/
│   │   │   ├── auth/            # Public auth endpoints (register, login, password reset)
│   │   │   ├── tenants/         # Tenant CRUD + activation/deactivation
│   │   │   ├── users/           # User management within tenants
│   │   │   ├── products/        # Product onboarding + role + route management
│   │   │   ├── platform/        # Platform stats, audit logs, user search
│   │   │   ├── keycloak/        # Keycloak Admin API client (30+ methods)
│   │   │   ├── gateway/         # APISIX Admin API client
│   │   │   ├── audit/           # Audit logging service
│   │   │   ├── redis/           # Redis service (OTP, rate limiting)
│   │   │   ├── database/        # Entities, migrations, seeds
│   │   │   ├── common/          # Guards, decorators, middleware, filters
│   │   │   └── config/          # Environment validation + config
│   │   └── .env
│   │
│   └── admin-portal/            # React admin UI (port 3002)
│       └── src/
│           ├── auth/            # PKCE auth context
│           ├── api/             # API client layer
│           ├── pages/           # Dashboard, Products, Tenants, Audit
│           └── layouts/         # Admin layout with sidebar
│
├── dummy-products/              # Reference implementation for integration
│   ├── doer-visa-api/           # Sample Express backend (port 4001)
│   ├── doer-visa-frontend/      # Sample React frontend (port 5173)
│   └── e2e-test.sh             # 13 E2E integration tests
│
├── themes/
│   └── keycloakify/             # Login page themes (customizable per product)
│
├── config/
│   ├── apisix/                  # APISIX config + route setup script
│   ├── keycloak/                # Realm export JSON
│   ├── prometheus/              # Scrape configuration
│   └── grafana/                 # Dashboard provisioning
│
├── scripts/
│   ├── setup-realm.sh           # Idempotent Keycloak realm configuration
│   ├── start-keycloak.sh        # Start Keycloak in dev mode
│   ├── start-infra.sh           # Docker Compose up
│   ├── stop-infra.sh            # Docker Compose down
│   ├── deploy-theme.sh          # Build + deploy Keycloakify themes
│   └── verify-infra.sh          # Health check all services
│
├── docker-compose.yml           # Redis, APISIX, etcd, Prometheus, Grafana
├── ARCHITECTURE.md              # Detailed system architecture
├── IMPLEMENTATION-PLAN.md       # Phase-by-phase build guide
├── USER-MANUAL.md               # Setup, deployment, API reference
├── USE-CASES.md                 # Business use cases
└── SETUP-GUIDE.md               # Installation guide
```

---

## Quick Start

### Prerequisites

- PostgreSQL 16+
- Node.js 20+ and npm
- Docker and Docker Compose
- Java 21+ (for Keycloak)
- Maven (for theme JAR packaging)

### 1. Start Infrastructure

```bash
# Start Docker services (Redis, APISIX, etcd, Prometheus, Grafana)
./scripts/start-infra.sh

# Start Keycloak
./scripts/start-keycloak.sh

# Configure realm, clients, roles, organizations
./scripts/setup-realm.sh

# Setup APISIX routes
bash config/apisix/setup-routes.sh
```

### 2. Start Auth Service

```bash
cd services/auth-service
npm install
npm run migration:run
npm run start:dev
```

### 3. Start Admin Portal

```bash
cd services/admin-portal
npm install
npm run dev
```

### 4. Verify

- Keycloak Admin: http://localhost:8080 (`admin/admin`)
- Auth Service Swagger: http://localhost:3001/api/docs
- Admin Portal: http://localhost:3002
- APISIX Gateway: http://localhost:9080
- Grafana: http://localhost:3000 (`admin/admin`)

> For full setup instructions including database creation and VPS deployment, see [USER-MANUAL.md](./USER-MANUAL.md).

---

## Service Ports

| Service | Port | Purpose |
|---------|------|---------|
| Keycloak | 8080 | Identity provider admin + OIDC endpoints |
| Auth Service | 3001 | Registration, tenants, users, products API |
| Admin Portal | 3002 | Platform administration UI |
| APISIX Gateway | 9080 | API gateway (all product traffic) |
| APISIX Admin | 9092 | Gateway management API |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache, OTP storage |
| etcd | 2379 | APISIX configuration store |
| Prometheus | 9090 | Metrics collection |
| Grafana | 3000 | Monitoring dashboards |
| Sample Product API | 4001 | Reference product backend |
| Sample Product UI | 5173 | Reference product frontend |

---

## Default Credentials

| Service | Username | Password |
|---------|----------|----------|
| Keycloak Admin Console | `admin` | `admin` |
| PostgreSQL (Keycloak) | `keycloak_user` | *(see .env)* |
| PostgreSQL (Auth Service) | `doer_auth_user` | `doer_auth_pass` |
| Redis | — | `doer_redis_2026` |
| Grafana | `admin` | `admin` |

> These are development defaults. Change all credentials before deploying to production.

---

## API Overview

All protected endpoints require a Bearer token. Responses follow the format:

```json
{ "success": true, "data": { ... } }
```

### Auth (Public — no token required)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/auth/register` | Register a new user |
| POST | `/auth/token` | Exchange authorization code for tokens |
| POST | `/auth/refresh` | Refresh an access token |
| POST | `/auth/logout` | Logout and revoke tokens |
| POST | `/auth/forgot-password` | Initiate password reset via OTP |
| POST | `/auth/reset-password` | Reset password with OTP |
| GET | `/auth/invite/:token` | Validate an invitation token |
| POST | `/auth/accept-invite` | Accept invitation and create account |

### Tenants (Requires `platform_admin` or `tenant_admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tenants` | Create tenant + Keycloak Organization |
| GET | `/api/tenants` | List tenants (scoped by role) |
| GET | `/api/tenants/:id` | Get tenant details |
| PUT | `/api/tenants/:id` | Update tenant metadata |
| PUT | `/api/tenants/:id/activate` | Activate tenant + enable members |
| PUT | `/api/tenants/:id/deactivate` | Deactivate tenant + disable members |

### Users (Requires `platform_admin` or `tenant_admin`, scoped to tenant)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/tenants/:tid/users` | Create user in tenant |
| GET | `/api/tenants/:tid/users` | List users in tenant |
| GET | `/api/tenants/:tid/users/:uid` | Get user details with roles |
| PUT | `/api/tenants/:tid/users/:uid/roles` | Update user roles |
| PUT | `/api/tenants/:tid/users/:uid/disable` | Disable user |
| PUT | `/api/tenants/:tid/users/:uid/enable` | Enable user |
| DELETE | `/api/tenants/:tid/users/:uid` | Remove user from tenant |
| POST | `/api/tenants/:tid/users/invite` | Send invitation to join tenant |
| GET | `/api/tenants/:tid/users/roles/available` | List available client roles |

### Products (Requires `platform_admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/admin/products` | Create product (full onboarding) |
| GET | `/api/admin/products` | List all products |
| GET | `/api/admin/products/:id` | Get product details |
| PUT | `/api/admin/products/:id` | Update product metadata |
| DELETE | `/api/admin/products/:id` | Deactivate product |
| GET | `/api/admin/products/:id/roles` | List client roles |
| POST | `/api/admin/products/:id/roles` | Create client role |
| DELETE | `/api/admin/products/:id/roles/:name` | Delete client role |
| POST | `/api/admin/products/:id/roles/:name/composites` | Add composite roles |
| GET | `/api/admin/products/:id/roles/:name/composites` | Get composite roles |
| GET | `/api/admin/products/:id/route` | Get APISIX route config |
| PUT | `/api/admin/products/:id/route` | Update APISIX route config |
| POST | `/api/admin/products/:id/route/toggle` | Enable/disable route |
| GET | `/api/admin/products/:id/tenants` | List tenants for product |

### Platform (Requires `platform_admin`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/platform/stats` | Platform statistics |
| GET | `/api/platform/audit-logs` | Query audit logs |
| GET | `/api/platform/users` | Cross-tenant user search |

---

## Frontend Applications

| Application | Local URL | Purpose |
|-------------|-----------|---------|
| Admin Portal | http://localhost:3002 | Platform administration |
| Sample Product Frontend | http://localhost:5173 | Reference product implementation |
| Keycloak Account | http://localhost:8080/realms/doer/account | User self-service |
| Swagger API Docs | http://localhost:3001/api/docs | Interactive API documentation |
| Grafana Dashboards | http://localhost:3000 | Monitoring and metrics |
| Keycloak Admin | http://localhost:8080 | Identity provider management |

---

## Release Notes

### v1.0.0 — Initial Release (February 2026)

The first complete release of Central IAM, delivering a fully functional centralized identity and access management system across 8 implementation phases.

#### Phase 1: Infrastructure Foundation
- PostgreSQL setup with dedicated databases for Keycloak and Auth Service
- Docker Compose orchestration for Redis, APISIX, etcd, Prometheus, and Grafana
- Keycloak 26.5.4 installation (local, non-Docker for development flexibility)
- APISIX configured with `network_mode: host` to reach host-bound services

#### Phase 2: Keycloak Realm Configuration
- Realm with Organizations feature enabled
- 4 realm roles: `platform_admin`, `tenant_admin`, `tenant_employee`, `end_user`
- Multiple client configurations: public/PKCE clients, confidential backend clients, service account client, admin client
- Product-specific client roles with composite role support
- Scope mappings for token claim control (`fullScopeAllowed=false`)
- Organization scope moved to default scopes for automatic JWT inclusion

#### Phase 3: Auth Service Development
- NestJS 11 + TypeORM backend with 6 modules (Auth, Tenants, Users, Platform, Keycloak, Audit)
- User registration with product-specific strategies
- Token exchange (PKCE code to JWT), refresh, and revocation
- Password reset via OTP with Redis-backed storage
- Invitation system with expiring tokens
- Tenant CRUD with Keycloak Organization sync
- User management within tenants (create, invite, roles, enable/disable)
- Global `RolesGuard` + per-route `TenantScopeGuard` for access control
- JWT middleware (decodes only — APISIX handles validation)
- Global response wrapper (`{success: true, data: {...}}`)
- Swagger documentation at `/api/docs`

#### Phase 4: APISIX Gateway Configuration
- Route-based JWT validation using `openid-connect` plugin
- Lua `serverless-pre-function` for header injection (X-User-Id, X-User-Email, X-User-Roles, X-Client-Roles, X-Organization-Id)
- Per-route CORS configuration
- Rate limiting (configurable per route)
- Request ID tracking for log correlation
- Separate routes for auth (public), tenant APIs (authenticated), and admin APIs (platform_admin only)

#### Phase 5: Keycloakify Theme Development
- Custom login page themes using Keycloakify v11 + React
- Multiple theme variants with per-product branding
- Single JAR deployment with all theme variants
- Automated build + deploy script
- Per-client theme assignment through Keycloak client attributes

#### Phase 6: First Product Integration (Sample Product)
- **Sample API**: Express + TypeScript backend with zero JWT logic
  - Reads APISIX-injected headers for user context
  - Role-based middleware using `X-Client-Roles` header
  - CRUD operations with organization scoping
- **Sample Frontend**: React + Vite SPA with PKCE authentication
  - Authorization Code + PKCE flow with Keycloak
  - Hash-based routing for static deployment compatibility
  - Role-aware UI rendering

#### Phase 7: End-to-End Testing & Security
- 13 comprehensive E2E tests covering:
  - User registration and login flows
  - Token exchange and refresh
  - Tenant creation and management
  - User invitation and role assignment
  - Cross-tenant access prevention
  - Product API access through APISIX
  - Role-based endpoint protection
- Security hardening:
  - ROPC flow disabled (PKCE only)
  - Tenant scope guard prevents cross-tenant data access
  - Audit logging on all sensitive operations
  - Rate limiting on all gateway routes

#### Phase 8: Admin Portal & Product Lifecycle
- **Admin Portal** (React + Ant Design):
  - Dashboard with platform statistics (products, tenants, users)
  - Product list with status indicators
  - Product creation wizard (auto-generates slug from name)
  - Product detail page with 4 tabs: Overview, Roles, Route Config, Tenants
  - Tenant management with activation/deactivation
  - Audit log viewer with action, resource type, and date range filters
  - PKCE authentication restricted to `platform_admin` role
- **Product Onboarding Orchestration**:
  - Single API call creates: public KC client (PKCE) + backend KC client (secret) + realm role scope mappings + organization scope config + APISIX route + DB record
  - Automatic rollback on partial failure
- **Gateway Management** (APISIX Admin API wrapper):
  - Route CRUD, enable/disable, status toggling
  - Pre-built route templates with openid-connect + Lua header injection
- **Per-Product RBAC**:
  - Client role CRUD via Admin Portal
  - Composite role management (group roles under parent roles)
  - Automatic scope mapping so new roles appear in JWT tokens
- **14 new admin API endpoints** protected by `platform_admin` role
- **19 admin portal API tests** — all passing
- **Regression verified** — all existing E2E tests still pass

---

### Known Limitations

- Keycloak runs locally (not in Docker) — recommended for development; production should use a managed deployment
- APISIX uses `network_mode: host` — suitable for single-node setups; multi-node requires network redesign
- Email sending (invitations, password reset) is stubbed — integrate with an SMTP provider for production
- Admin Portal uses sessionStorage for tokens — closing the browser tab logs out the user

---

## Documentation

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](./ARCHITECTURE.md) | Detailed system architecture, data flows, and design decisions |
| [IMPLEMENTATION-PLAN.md](./IMPLEMENTATION-PLAN.md) | Phase-by-phase build plan with checklists |
| [USER-MANUAL.md](./USER-MANUAL.md) | Setup guide, VPS deployment, API reference with payloads |
| [USE-CASES.md](./USE-CASES.md) | Business use cases and acceptance criteria |
| [SETUP-GUIDE.md](./SETUP-GUIDE.md) | Detailed installation and configuration guide |
| [Swagger UI](http://localhost:3001/api/docs) | Interactive API documentation (when running) |

---

## Author

**Md Anisur Rahman** — System Architect & Developer

- GitHub: [AnisurRahman06046](https://github.com/AnisurRahman06046)
- LinkedIn: [md-anisur-rahman046](https://www.linkedin.com/in/md-anisur-rahman046)
- Email: [anisurrahman06046@gmail.com](mailto:anisurrahman06046@gmail.com)

---

## License

MIT License

Copyright (c) 2026 Md Anisur Rahman

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
