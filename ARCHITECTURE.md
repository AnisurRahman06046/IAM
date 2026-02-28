# Doer IAM — System Architecture

## Table of Contents

- [Overview](#overview)
- [Why This Architecture](#why-this-architecture)
- [The ROPC Problem and Our Solution](#the-ropc-problem-and-our-solution)
- [System Components](#system-components)
- [Architecture Diagram](#architecture-diagram)
- [Authentication Flow — Authorization Code + PKCE](#authentication-flow--authorization-code--pkce)
- [How Custom UI Works Without ROPC](#how-custom-ui-works-without-ropc)
- [Keycloak Data Model](#keycloak-data-model)
- [APISIX API Gateway Configuration](#apisix-api-gateway-configuration)
- [Auth Service — Role and Responsibilities](#auth-service--role-and-responsibilities)
- [Token Structure](#token-structure)
- [Tenant Isolation Model](#tenant-isolation-model)
- [Permission Model](#permission-model)
- [RBAC — Role-Based Access Control](#rbac--role-based-access-control)
- [SSO — How It Works With Access Restriction](#sso--how-it-works-with-access-restriction)
- [Infrastructure — Docker Compose](#infrastructure--docker-compose)
- [New Project Integration Guide](#new-project-integration-guide)
- [Security Considerations](#security-considerations)

---

## Overview

Doer IAM is a centralized Identity and Access Management system for Doer's product ecosystem. It provides authentication, authorization, SSO, and multi-tenant user management for all current and future Doer products.

**Products:**
- Doer-Visa — Visa processing platform
- Doer-School — Educational institution management
- Doer-HRMS — Human resource management system
- Future products...

**User Types:**
- **Platform Admin** — Doer company staff (manages everything)
- **Tenant Admin** — Client onboarded to a product (manages their organization)
- **Tenant Employee** — Staff of a tenant (permissions assigned by tenant admin)
- **End User** — Customer who self-registers to use a tenant's service

**Core Technology:**
- **Keycloak** — Identity Provider (authentication, authorization, SSO, user storage)
- **Apache APISIX** — API Gateway (JWT validation, rate limiting, routing)
- **Auth Service** — Custom microservice (business logic layer between apps and Keycloak)
- **PostgreSQL** — Database for both Keycloak and Auth Service
- **Redis** — Session/cache storage for Auth Service

---

## Why This Architecture

| Concern | Custom Auth (Build from scratch) | Keycloak-Based (This Architecture) |
|---------|----------------------------------|-------------------------------------|
| Security | High risk — OWASP vulnerabilities easy to introduce | Battle-tested, CNCF-backed, Red Hat-supported |
| Protocols | Must implement OIDC/OAuth2/SAML from scratch | Full OIDC, OAuth 2.0, SAML 2.0 out of the box |
| SSO | Complex to build correctly | Native, works automatically |
| MFA | Months to implement properly | Built-in TOTP, WebAuthn, configurable flows |
| Social Login | Per-provider integration work | Pre-built connectors for Google, GitHub, etc. |
| Password Security | Easy to get hashing wrong | Argon2/bcrypt with configurable policies |
| CVE Response | You're on your own | Active community + regular security patches |
| Time to Production | 6-12 months for a basic system | Weeks to production-ready |

---

## The ROPC Problem and Our Solution

### The Problem

Direct Access Grants (Resource Owner Password Credentials / ROPC) allow sending username+password directly to Keycloak's token endpoint from your backend. This enables fully custom login UIs without redirecting to Keycloak.

**However, ROPC is strongly discouraged:**
- Removed from the OAuth 2.1 specification entirely
- Your backend sees raw user passwords (violates delegated auth principle)
- Breaks MFA flows (Keycloak's built-in MFA requires the Keycloak UI)
- Breaks SSO (no Keycloak browser session is created)
- Keycloak is disabling it by default for new clients

### Our Solution — Authorization Code Flow + PKCE + Themed Keycloak Pages

```
                OLD (ROPC — Discouraged)                 NEW (Auth Code + PKCE — Recommended)
        ┌─────────────────────────────┐          ┌──────────────────────────────────────┐
        │                             │          │                                      │
        │  Your UI collects password  │          │  Your UI redirects to Keycloak       │
        │        ↓                    │          │        ↓                              │
        │  Auth Service sends to      │          │  Keycloak shows login page            │
        │  Keycloak token endpoint    │          │  (themed to look like your product!)  │
        │        ↓                    │          │        ↓                              │
        │  Gets tokens                │          │  User logs in on Keycloak             │
        │                             │          │        ↓                              │
        │  Problems:                  │          │  Keycloak redirects back with code    │
        │  ✗ App sees password        │          │        ↓                              │
        │  ✗ No SSO                   │          │  Your app exchanges code for tokens   │
        │  ✗ No built-in MFA          │          │                                      │
        │  ✗ Being deprecated         │          │  Benefits:                            │
        │                             │          │  ✓ App never sees password             │
        └─────────────────────────────┘          │  ✓ SSO works natively                 │
                                                 │  ✓ MFA works natively                 │
                                                 │  ✓ Social login works natively         │
                                                 │  ✓ Future-proof                        │
                                                 └──────────────────────────────────────┘
```

### "But I don't want the Keycloak page!"

You won't see a "Keycloak page." We use **Keycloakify** — a tool that lets you build Keycloak themes using **React/TypeScript**. The login page hosted by Keycloak will look **identical** to your product's UI:

```
What the user experiences:

1. Visits visa.doer.com → clicks "Login"
2. Redirected to auth.doer.com/realms/doer/login?client_id=doer-visa
3. Sees a login page that looks EXACTLY like Doer-Visa's design
   (branded colors, logo, fonts — all React components you control)
4. Logs in
5. Redirected back to visa.doer.com with tokens

The URL shows auth.doer.com briefly — same as Google, GitHub, Microsoft, etc.
This is the industry standard. Users are accustomed to it.
```

### What About Registration?

**Registration does NOT need ROPC.** It uses the Keycloak Admin REST API (via client credentials, which is NOT deprecated):

```
Custom UI → Auth Service → Keycloak Admin REST API (creates user)
                                                     ↓
                         user created, then redirect to login (Auth Code flow)
```

So you keep **fully custom registration UIs** per product. Only login goes through Keycloak's themed pages.

---

## System Components

| Component | Technology | Purpose |
|-----------|-----------|---------|
| **Keycloak** | quay.io/keycloak/keycloak (Quarkus) | Identity Provider — user storage, JWT issuance, SSO, MFA, social login |
| **Keycloak DB** | PostgreSQL 16 | Stores users, realms, clients, organizations, roles, sessions |
| **Apache APISIX** | apache/apisix | API Gateway — JWT validation, authorization, rate limiting, routing |
| **etcd** | bitnami/etcd | Configuration store for APISIX |
| **Auth Service** | Your microservice (NestJS/Spring Boot/Go) | Business logic — registration, tenant onboarding, invitation, OTP |
| **Auth Service DB** | PostgreSQL 16 | Stores tenants metadata, invitations, OTP records, audit logs, plan/billing info |
| **Redis** | redis:7 | OTP codes, rate limiting state, session cache for Auth Service |
| **Keycloakify Themes** | React/TypeScript | Custom login/registration themes per product, built with Keycloakify |
| **Product Services** | Your microservices | Business logic only — Doer-Visa, Doer-School, Doer-HRMS |

---

## Architecture Diagram

```
                              ┌─────────────────────────────────────────────────┐
                              │                    INTERNET                      │
                              └────────────────────────┬────────────────────────┘
                                                       │
                              ┌────────────────────────▼────────────────────────┐
                              │              Apache APISIX (API Gateway)         │
                              │                                                 │
                              │  • openid-connect plugin (bearer_only: true)    │
                              │    → Validates JWT on every API request          │
                              │  • authz-keycloak plugin                        │
                              │    → Fine-grained permission checks              │
                              │  • limit-count plugin                           │
                              │    → Rate limiting per tenant/user               │
                              │  • Routes to upstream services                   │
                              └──┬──────────┬──────────┬──────────┬─────────────┘
                                 │          │          │          │
                   ┌─────────────┘    ┌─────┘    ┌─────┘    ┌─────┘
                   ▼                  ▼          ▼          ▼
            ┌────────────┐    ┌───────────┐ ┌──────────┐ ┌──────────┐
            │   Auth      │    │ Doer-Visa │ │Doer-     │ │Doer-HRMS │
            │   Service   │    │  Service  │ │School    │ │ Service  │
            │             │    │           │ │Service   │ │          │
            │ • Register  │    │ Business  │ │ Business │ │ Business │
            │ • Onboard   │    │ logic     │ │ logic    │ │ logic    │
            │ • Invite    │    │ only      │ │ only     │ │ only     │
            │ • OTP/MFA   │    │           │ │          │ │          │
            │ • Tenant    │    │ Reads JWT │ │ Reads JWT│ │ Reads JWT│
            │   mgmt      │    │ for auth  │ │ for auth │ │ for auth │
            └──────┬──────┘    └───────────┘ └──────────┘ └──────────┘
                   │
         ┌─────────┴─────────┐
         ▼                   ▼
  ┌─────────────┐    ┌─────────────┐
  │  Keycloak   │    │   Redis     │
  │  (IdP)      │    │  (Cache)    │
  │             │    │             │
  │ • Auth Code │    │ • OTP codes │
  │   + PKCE    │    │ • Rate data │
  │ • Admin API │    └─────────────┘
  │ • SSO       │
  │ • MFA       │
  │ • Social    │
  │ • Orgs      │
  └──────┬──────┘
         │
  ┌──────▼──────┐    ┌──────────────┐    ┌──────────────┐
  │ Keycloak DB │    │ Auth Svc DB  │    │   SMTP       │
  │ (PostgreSQL)│    │ (PostgreSQL) │    │  (Email)     │
  └─────────────┘    └──────────────┘    └──────────────┘
```

### Request Flow for Protected API Calls

```
Client App                    APISIX                        Keycloak              Product Service
    │                           │                              │                        │
    │ GET /api/visa/apps        │                              │                        │
    │ Authorization: Bearer JWT │                              │                        │
    │ ─────────────────────────▶│                              │                        │
    │                           │                              │                        │
    │                           │ 1. openid-connect plugin     │                        │
    │                           │    validates JWT signature   │                        │
    │                           │    via JWKS endpoint         │                        │
    │                           │ ────────────────────────────▶│                        │
    │                           │    (cached after first call) │                        │
    │                           │                              │                        │
    │                           │ 2. authz-keycloak plugin     │                        │
    │                           │    checks permissions        │                        │
    │                           │ ────────────────────────────▶│                        │
    │                           │                              │                        │
    │                           │ 3. If authorized, proxy      │                        │
    │                           │    request to upstream        │                        │
    │                           │ ─────────────────────────────┼───────────────────────▶│
    │                           │                              │                        │
    │                           │                              │    Read org_id, roles  │
    │                           │                              │    from JWT claims     │
    │                           │                              │    Filter data by org  │
    │                           │                              │                        │
    │ { data: [...] }           │                              │                        │
    │ ◀─────────────────────────┼──────────────────────────────┼────────────────────────│
```

---

## Authentication Flow — Authorization Code + PKCE

### Login Flow (All Products)

```
Product Frontend               Keycloak (Themed)                  Product Backend
(visa.doer.com)               (auth.doer.com)                    (api.doer.com)
     │                              │                                  │
     │ 1. User clicks "Login"       │                                  │
     │                              │                                  │
     │ 2. Frontend generates:       │                                  │
     │    code_verifier (random)    │                                  │
     │    code_challenge (SHA256)   │                                  │
     │                              │                                  │
     │ 3. Redirect to Keycloak:     │                                  │
     │    /realms/doer/protocol/    │                                  │
     │    openid-connect/auth?      │                                  │
     │    client_id=doer-visa&      │                                  │
     │    response_type=code&       │                                  │
     │    scope=openid+org&         │                                  │
     │    redirect_uri=visa.doer.   │                                  │
     │    com/callback&             │                                  │
     │    code_challenge=xxx&       │                                  │
     │    code_challenge_method=    │                                  │
     │    S256                      │                                  │
     │ ────────────────────────────▶│                                  │
     │                              │                                  │
     │                              │ 4. Keycloak shows login page     │
     │                              │    THEMED with Doer-Visa         │
     │                              │    branding (Keycloakify React)  │
     │                              │                                  │
     │                              │    User enters credentials       │
     │                              │    (or clicks Google/GitHub)     │
     │                              │                                  │
     │                              │    If MFA enabled → shows        │
     │                              │    TOTP/WebAuthn prompt          │
     │                              │    (all handled by Keycloak)     │
     │                              │                                  │
     │ 5. Keycloak redirects back:  │                                  │
     │    visa.doer.com/callback?   │                                  │
     │    code=AUTH_CODE             │                                  │
     │ ◀────────────────────────────│                                  │
     │                              │                                  │
     │ 6. Frontend sends code to    │                                  │
     │    backend for exchange:     │                                  │
     │                              │                                  │
     │ POST /auth/token             │                                  │
     │ { code, code_verifier,       │                                  │
     │   redirect_uri }             │                                  │
     │ ────────────────────────────────────────────────────────────────▶│
     │                              │                                  │
     │                              │    POST /realms/doer/protocol/   │
     │                              │    openid-connect/token          │
     │                              │    { grant_type=authorization_   │
     │                              │      code, code, code_verifier,  │
     │                              │      client_id, client_secret,   │
     │                              │      redirect_uri }              │
     │                              │ ◀────────────────────────────────│
     │                              │                                  │
     │                              │    { access_token, refresh_      │
     │                              │      token, id_token }           │
     │                              │ ────────────────────────────────▶│
     │                              │                                  │
     │ { access_token,              │                                  │
     │   refresh_token }            │                                  │
     │ ◀──────────────────────────────────────────────────────────────│
     │                              │                                  │
     │ 7. Store tokens              │                                  │
     │    (memory for SPA,          │                                  │
     │     secure storage for       │                                  │
     │     mobile)                  │                                  │
```

### Why This Is Better

| Aspect | ROPC (Old Plan) | Auth Code + PKCE (Final Plan) |
|--------|-----------------|-------------------------------|
| App sees password | Yes (security risk) | No (Keycloak handles it) |
| SSO | Does not work (no session) | Works natively (Keycloak session cookie) |
| MFA | Must build custom MFA in Auth Service | Built-in — TOTP, WebAuthn, SMS via SPI |
| Social login | Complex hybrid flow | Native — one-click Google/GitHub |
| Brute force protection | Must implement yourself | Keycloak handles it automatically |
| Future-proof | ROPC being removed from OAuth 2.1 | Industry standard, fully supported |
| Custom UI look | Full control over UI | Keycloakify gives full React control |

---

## How Custom UI Works Without ROPC

### Login — Keycloakify (React-Themed Keycloak Pages)

Keycloakify lets you build Keycloak login/registration themes as React applications. The pages are hosted BY Keycloak but look EXACTLY like your product:

```
Standard Keycloak Login          vs          Keycloakify-Themed Login
┌─────────────────────────┐                  ┌─────────────────────────┐
│     ⚙ Keycloak           │                  │     🏢 DOER VISA         │
│                          │                  │                          │
│  Username                │                  │  Phone Number            │
│  [____________]          │                  │  [+880 ___________]      │
│                          │                  │                          │
│  Password                │                  │  Password                │
│  [____________]          │                  │  [____________]          │
│                          │                  │                          │
│  [    Log In    ]        │                  │  [    Sign In    ]       │
│                          │                  │                          │
│  Forgot password?        │                  │  Forgot password?        │
│                          │                  │  ─────────────────       │
│                          │                  │  [G] Sign in with Google │
│                          │                  │  [📱] Sign in with GitHub │
│                          │                  │                          │
│  Powered by Keycloak     │                  │  © 2026 Doer Inc.        │
└─────────────────────────┘                  └─────────────────────────┘

Same Keycloak backend, completely different UI.
You control every pixel with React components.
```

**Per-product theming:** Keycloak supports selecting themes per client. So `doer-visa` client shows Doer-Visa branding, `doer-school` shows Doer-School branding — all from the same Keycloak instance.

### Registration — Fully Custom UI (No Keycloak Pages)

Registration does NOT need ROPC. The flow is:

```
1. User fills YOUR custom registration form (React/Vue/mobile)
2. Your frontend sends data to Auth Service
3. Auth Service validates project-specific rules
4. Auth Service creates user via Keycloak Admin REST API (client_credentials grant)
5. Auth Service adds user to organization, assigns roles
6. Auth Service redirects user to login (Auth Code flow)
7. User logs in via Keycloakify-themed page → gets tokens
```

This gives you **full control** over registration UIs per product while using the secure Auth Code flow for login.

### Summary: What Uses Custom UI vs Keycloak UI

| Feature | Custom UI (Your React/Vue) | Keycloak UI (Themed with Keycloakify) |
|---------|---------------------------|---------------------------------------|
| Registration | Yes | No |
| Login | No | Yes (but looks like your UI) |
| Social login buttons | No | Yes (configured in Keycloak, shown on themed page) |
| MFA prompt (TOTP) | No | Yes (Keycloak handles the flow) |
| Password reset request | Yes (form → Auth Service) | Link in email → Keycloak themed page |
| Password reset entry | No | Yes (Keycloak themed page) |
| Tenant admin panel | Yes | No |
| User profile mgmt | Yes (via Auth Service → Admin API) | No |

---

## Keycloak Data Model

```
Keycloak Instance
│
├── master realm (super-admin only — never expose)
│
└── doer realm (single realm for everything)
    │
    ├── Clients
    │   ├── doer-visa           (public, PKCE, for Doer-Visa frontend)
    │   ├── doer-visa-backend   (confidential, for Doer-Visa backend token exchange)
    │   ├── doer-school         (public, PKCE, for Doer-School frontend)
    │   ├── doer-school-backend (confidential, for Doer-School backend)
    │   ├── doer-hrms           (public, PKCE, for Doer-HRMS frontend)
    │   ├── doer-hrms-backend   (confidential, for Doer-HRMS backend)
    │   ├── doer-auth-svc       (confidential, service account — for Auth Service Admin API calls)
    │   └── doer-admin          (public, PKCE, for Doer Admin Panel)
    │
    ├── Realm Roles (user type — WHO they are)
    │   ├── platform_admin      (Doer company staff)
    │   ├── tenant_admin        (onboarded client)
    │   ├── tenant_employee     (created by tenant admin)
    │   └── end_user            (self-registered customer)
    │
    ├── Client Roles (product permissions — WHAT they can do WHERE)
    │   │
    │   ├── doer-visa:
    │   │   ├── manage_all              (tenant admin)
    │   │   ├── manage_applications     (senior staff)
    │   │   ├── process_visa            (processor staff)
    │   │   ├── view_applications       (read-only staff)
    │   │   ├── apply_visa              (end user)
    │   │   └── view_own_status         (end user)
    │   │
    │   ├── doer-school:
    │   │   ├── manage_all              (tenant admin)
    │   │   ├── manage_students         (registrar)
    │   │   ├── manage_courses          (academic admin)
    │   │   ├── grade_students          (teacher)
    │   │   ├── enroll_course           (student end user)
    │   │   └── view_grades             (student end user)
    │   │
    │   └── doer-hrms:
    │       ├── manage_all              (tenant admin)
    │       ├── manage_employees        (HR manager)
    │       ├── approve_leave           (manager)
    │       ├── view_payslip            (employee)
    │       └── apply_leave             (employee)
    │
    ├── Organizations (one per tenant)
    │   ├── xyz-visa-agency
    │   │   ├── Domains: ["xyzvisa.com"]
    │   │   ├── Attributes: { products: ["doer-visa"], plan: "enterprise" }
    │   │   └── Members:
    │   │       ├── boss@xyz.com        (tenant_admin + doer-visa:manage_all)
    │   │       ├── karim@xyz.com       (tenant_employee + doer-visa:process_visa)
    │   │       └── customer@gmail.com  (end_user + doer-visa:apply_visa)
    │   │
    │   ├── abc-school
    │   │   ├── Domains: ["abcschool.edu"]
    │   │   ├── Attributes: { products: ["doer-school"], plan: "basic" }
    │   │   └── Members: ...
    │   │
    │   └── mega-corp (multi-product tenant)
    │       ├── Domains: ["megacorp.com"]
    │       ├── Attributes: { products: ["doer-hrms", "doer-visa"], plan: "enterprise" }
    │       └── Members: ...
    │
    ├── Identity Providers
    │   ├── google      (social login)
    │   ├── github      (social login)
    │   └── facebook    (social login)
    │
    ├── Authentication Flows
    │   ├── doer-browser (custom browser flow)
    │   │   ├── Cookie (check existing session → SSO)
    │   │   ├── Identity Provider Redirector (org domain → auto-IdP)
    │   │   ├── Username Password Form (themed by Keycloakify)
    │   │   └── OTP Form (conditional, if MFA enabled)
    │   └── doer-registration (Keycloak-side registration, if needed)
    │
    ├── Client Scopes
    │   ├── organization (includes org claims in token)
    │   ├── doer-visa-scope (includes doer-visa client roles)
    │   ├── doer-school-scope
    │   └── doer-hrms-scope
    │
    └── User Attributes (custom fields on user profiles)
        ├── phone
        ├── user_type
        ├── passport_no (doer-visa specific)
        ├── student_id (doer-school specific)
        └── employee_id (doer-hrms specific)
```

---

## APISIX API Gateway Configuration

### Route Structure

```
APISIX Routes:
│
├── /auth/*                    → Auth Service (no JWT required — public)
│   ├── /auth/register         → Auth Service
│   ├── /auth/token            → Auth Service (code exchange)
│   ├── /auth/refresh          → Auth Service
│   ├── /auth/logout           → Auth Service
│   └── /auth/social/*         → Auth Service
│
├── /api/tenants/*             → Auth Service (JWT required, platform_admin or tenant_admin)
│   ├── POST   /api/tenants                 → create tenant
│   ├── GET    /api/tenants/:id             → get tenant
│   ├── POST   /api/tenants/:id/users       → create user in tenant
│   ├── PUT    /api/tenants/:id/users/:uid  → update user
│   ├── DELETE /api/tenants/:id/users/:uid  → remove user
│   └── POST   /api/tenants/:id/invite      → invite user
│
├── /api/visa/*                → Doer-Visa Service (JWT required, doer-visa roles)
├── /api/school/*              → Doer-School Service (JWT required, doer-school roles)
├── /api/hrms/*                → Doer-HRMS Service (JWT required, doer-hrms roles)
│
└── /api/platform/*            → Platform Admin APIs (JWT required, platform_admin role)
```

### APISIX Plugin Configuration (per route)

```json
{
  "uri": "/api/visa/*",
  "plugins": {
    "openid-connect": {
      "bearer_only": true,
      "client_id": "doer-visa-backend",
      "client_secret": "${DOER_VISA_CLIENT_SECRET}",
      "discovery": "http://keycloak:8080/realms/doer/.well-known/openid-configuration",
      "scope": "openid organization",
      "token_signing_alg_values_expected": "RS256"
    },
    "authz-keycloak": {
      "token_endpoint": "http://keycloak:8080/realms/doer/protocol/openid-connect/token",
      "permissions": ["visa-resource#view_applications"],
      "client_id": "doer-visa-backend",
      "policy_enforcement_mode": "ENFORCING"
    },
    "limit-count": {
      "count": 1000,
      "time_window": 60,
      "key_type": "var",
      "key": "consumer_name",
      "rejected_code": 429
    }
  },
  "upstream": {
    "type": "roundrobin",
    "nodes": { "doer-visa-service:8080": 1 }
  }
}
```

### Public Routes (No Auth)

```json
{
  "uri": "/auth/*",
  "plugins": {
    "limit-count": {
      "count": 30,
      "time_window": 60,
      "key_type": "var",
      "key": "remote_addr",
      "rejected_code": 429
    }
  },
  "upstream": {
    "type": "roundrobin",
    "nodes": { "auth-service:3000": 1 }
  }
}
```

---

## Auth Service — Role and Responsibilities

The Auth Service is the **only service** that directly talks to Keycloak's Admin REST API. It handles all business logic around authentication and tenant management.

### What Auth Service Does

| Responsibility | How |
|---------------|-----|
| User registration (custom UI) | Validates project-specific fields → Keycloak Admin API creates user |
| Token exchange (Auth Code) | Receives auth code from frontend → exchanges with Keycloak for tokens |
| Token refresh | Receives refresh token → exchanges with Keycloak |
| Logout | Calls Keycloak logout endpoint → revokes session |
| Tenant onboarding | Creates Keycloak Organization + admin user + assigns roles |
| Tenant user management | CRUD users in Keycloak org via Admin API |
| Invitation system | Generates invite tokens (stored in Auth DB) → sends email |
| OTP for custom MFA | Generates OTP → stores in Redis → sends via SMS → verifies |
| Password reset (phone/SMS) | Generates OTP → verifies → resets password via Admin API |
| Subscription/plan enforcement | Checks tenant's plan limits before allowing actions |
| Audit logging | Logs all auth and admin events to Auth DB |

### What Auth Service Does NOT Do

| Not Responsible For | Handled By |
|--------------------|-----------|
| Password hashing/storage | Keycloak |
| JWT token generation/signing | Keycloak |
| SSO session management | Keycloak |
| Login UI | Keycloak (themed via Keycloakify) |
| Social login handshake | Keycloak |
| Built-in MFA (TOTP/WebAuthn) | Keycloak |
| JWT validation on API calls | APISIX |
| Fine-grained authorization checks | APISIX + Keycloak |
| Business logic | Product services |

### Auth Service Keycloak Communication

```
Auth Service uses TWO Keycloak connection methods:

1. Service Account (client_credentials) — for Admin REST API calls
   ┌─────────────┐     POST /realms/doer/protocol/openid-connect/token
   │ Auth Service │ ──▶ { grant_type: client_credentials,
   │              │       client_id: doer-auth-svc,
   │              │       client_secret: xxx }
   │              │ ◀── { access_token (with admin privileges) }
   │              │
   │              │     Then uses this token for:
   │              │ ──▶ POST /admin/realms/doer/users (create user)
   │              │ ──▶ POST /admin/realms/doer/organizations (create org)
   │              │ ──▶ PUT  /admin/realms/doer/users/{id}/role-mappings
   └─────────────┘

2. Token Endpoint — for auth code exchange, refresh, logout
   ┌─────────────┐     POST /realms/doer/protocol/openid-connect/token
   │ Auth Service │ ──▶ { grant_type: authorization_code,
   │              │       code: AUTH_CODE_FROM_FRONTEND,
   │              │       code_verifier: PKCE_VERIFIER,
   │              │       client_id: doer-visa,
   │              │       redirect_uri: ... }
   │              │ ◀── { access_token, refresh_token, id_token }
   └─────────────┘
```

### Auth Service Database (Separate from Keycloak DB)

```
Auth Service DB stores business metadata that Keycloak doesn't handle:

┌──────────────────────────────────────────────────────────┐
│ tenants                                                  │
│ ─────────                                                │
│ id, keycloak_org_id, name, product, plan, status,        │
│ max_users, billing_email, created_at, updated_at         │
├──────────────────────────────────────────────────────────┤
│ invitations                                              │
│ ──────────                                               │
│ id, tenant_id, email, role, token, status, expires_at,   │
│ accepted_at, invited_by                                  │
├──────────────────────────────────────────────────────────┤
│ otp_records                                              │
│ ──────────                                               │
│ id, user_identifier, otp_code, purpose, expires_at,      │
│ verified, attempts                                       │
├──────────────────────────────────────────────────────────┤
│ registration_configs                                     │
│ ────────────────────                                     │
│ id, product, required_fields, validation_rules,          │
│ default_roles, self_registration_enabled                 │
├──────────────────────────────────────────────────────────┤
│ audit_logs                                               │
│ ──────────                                               │
│ id, actor_id, actor_type, action, resource_type,         │
│ resource_id, tenant_id, metadata, timestamp              │
└──────────────────────────────────────────────────────────┘
```

---

## Token Structure

When a user from "XYZ Visa Agency" logs in via Doer-Visa, their access token (JWT) contains:

```json
{
  "exp": 1740700000,
  "iat": 1740699100,
  "iss": "https://auth.doer.com/realms/doer",
  "sub": "user-uuid-123",
  "typ": "Bearer",
  "azp": "doer-visa",
  "scope": "openid organization",

  "realm_access": {
    "roles": ["end_user"]
  },

  "resource_access": {
    "doer-visa": {
      "roles": ["apply_visa", "view_own_status"]
    }
  },

  "organization": {
    "xyz-visa-agency": {
      "id": "org-uuid-456"
    }
  },

  "preferred_username": "+8801712345678",
  "email": "customer@gmail.com",
  "given_name": "Rahim",
  "family_name": "Ahmed",
  "phone": "+8801712345678",
  "user_type": "end_user"
}
```

**Product services read these claims to:**
- Identify the user (`sub`)
- Know their role (`realm_access.roles`, `resource_access`)
- Filter data by tenant (`organization.xyz-visa-agency.id`)
- Show/hide UI features based on permissions

---

## Tenant Isolation Model

```
┌─────────────────────────────────────────────────────────────────┐
│                    THREE-LAYER TENANT ISOLATION                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Layer 1: Gateway Level (APISIX)                                 │
│  ─────────────────────────────────                               │
│  APISIX validates JWT and checks that the user has the           │
│  required client roles for the product they're accessing.        │
│  A doer-visa user with NO doer-school roles gets 403.            │
│                                                                  │
│  Layer 2: Application Level (Product Service)                    │
│  ──────────────────────────────────────────────                  │
│  Every database query includes the organization_id from JWT:     │
│                                                                  │
│    SELECT * FROM applications                                    │
│    WHERE org_id = jwt.organization.keys()[0]                     │
│                                                                  │
│  Tenant A NEVER sees Tenant B's data, even if they're on the     │
│  same product. This is enforced at query level in every service.  │
│                                                                  │
│  Layer 3: Keycloak Level (Organization Membership)               │
│  ──────────────────────────────────────────────────              │
│  Users are members of specific organizations. The Auth Service   │
│  ensures tenant admins can only manage users within their own    │
│  organization. Keycloak's organization scope ensures tokens      │
│  only contain the orgs the user belongs to.                      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Permission Model

```
┌──────────────────────────────────────────────────────────────────┐
│                        PERMISSION LAYERS                          │
│                                                                   │
│  Layer 1: Realm Roles → WHO you are                               │
│  ──────────────────────────────────                               │
│  platform_admin → God mode, Doer staff                            │
│  tenant_admin   → Manages their organization                      │
│  tenant_employee → Works for a tenant                             │
│  end_user       → Self-registered customer                        │
│                                                                   │
│  Layer 2: Client Roles → WHAT you can do in WHICH product         │
│  ─────────────────────────────────────────────────────            │
│  doer-visa:manage_all         → Full admin for visa product       │
│  doer-visa:process_visa       → Can process applications          │
│  doer-visa:apply_visa         → Can submit applications           │
│                                                                   │
│  Layer 3: Organization → WHOSE data you see                       │
│  ────────────────────────────────────────                         │
│  Organization membership determines data access scope.            │
│  User in xyz-visa sees only xyz-visa data.                        │
│                                                                   │
│  Combined Example:                                                │
│  "Karim has realm role tenant_employee,                           │
│   client role doer-visa:process_visa,                             │
│   and belongs to organization xyz-visa-agency.                    │
│   He can process visa applications, but only for XYZ Visa."      │
│                                                                   │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  WHO CAN ASSIGN WHAT:                                             │
│  ────────────────────                                             │
│                                                                   │
│  Platform Admin  → Any role, any org, any product                 │
│  Tenant Admin    → Client roles for THEIR product,                │
│                    within THEIR org only                           │
│  Tenant Employee → Nothing (unless given sub-admin role)          │
│  End User        → Nothing                                        │
│                                                                   │
│  Enforcement: Auth Service validates the caller's permissions     │
│  before making any Admin API call to Keycloak.                    │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

---

## RBAC — Role-Based Access Control

Keycloak provides a complete RBAC system. This architecture uses it at every layer.

### Role Types

```
┌─────────────────────────────────────────────────────────────────────┐
│                         KEYCLOAK RBAC MODEL                          │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  REALM ROLES (Global within the doer realm)                │      │
│  │                                                            │      │
│  │  These define WHAT TYPE of user someone is.                │      │
│  │  Every user has exactly ONE of these.                      │      │
│  │                                                            │      │
│  │  platform_admin   → Doer company staff                     │      │
│  │  tenant_admin     → Client organization admin              │      │
│  │  tenant_employee  → Staff working for a tenant             │      │
│  │  end_user         → Self-registered customer               │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  CLIENT ROLES (Scoped to a specific product)               │      │
│  │                                                            │      │
│  │  These define WHAT ACTIONS a user can perform              │      │
│  │  in a SPECIFIC product. A user can have multiple.          │      │
│  │                                                            │      │
│  │  doer-visa:manage_all          (full product admin)        │      │
│  │  doer-visa:manage_applications (manage visa apps)          │      │
│  │  doer-visa:process_visa        (process submissions)       │      │
│  │  doer-visa:view_applications   (read-only access)          │      │
│  │  doer-visa:apply_visa          (submit an application)     │      │
│  │  doer-visa:view_own_status     (check own app status)      │      │
│  │                                                            │      │
│  │  doer-school:manage_all        (full product admin)        │      │
│  │  doer-school:manage_students   (registrar)                 │      │
│  │  doer-school:manage_courses    (academic admin)            │      │
│  │  doer-school:grade_students    (teacher)                   │      │
│  │  doer-school:enroll_course     (student)                   │      │
│  │  doer-school:view_grades       (student)                   │      │
│  │                                                            │      │
│  │  doer-hrms:manage_all          (full product admin)        │      │
│  │  doer-hrms:manage_employees    (HR manager)                │      │
│  │  doer-hrms:approve_leave       (line manager)              │      │
│  │  doer-hrms:view_payslip        (any employee)              │      │
│  │  doer-hrms:apply_leave         (any employee)              │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  COMPOSITE ROLES (Optional — group of roles)               │      │
│  │                                                            │      │
│  │  A composite role bundles multiple roles together          │      │
│  │  for easier assignment. When you assign a composite        │      │
│  │  role, the user inherits all contained roles.              │      │
│  │                                                            │      │
│  │  doer-visa:staff_basic = [                                 │      │
│  │    doer-visa:view_applications,                            │      │
│  │    doer-visa:view_own_status                               │      │
│  │  ]                                                         │      │
│  │                                                            │      │
│  │  doer-visa:staff_senior = [                                │      │
│  │    doer-visa:view_applications,                            │      │
│  │    doer-visa:process_visa,                                 │      │
│  │    doer-visa:manage_applications                           │      │
│  │  ]                                                         │      │
│  │                                                            │      │
│  │  Tenant admins see composite roles as simple "role          │      │
│  │  presets" they can assign to employees without              │      │
│  │  needing to understand individual permissions.              │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                      │
│  ┌───────────────────────────────────────────────────────────┐      │
│  │  GROUPS (Optional — inherit roles from group membership)   │      │
│  │                                                            │      │
│  │  Groups provide role inheritance. Assign roles to a group, │      │
│  │  all members inherit those roles.                          │      │
│  │                                                            │      │
│  │  /xyz-visa-agency                                          │      │
│  │    /managers     → inherits doer-visa:manage_applications  │      │
│  │    /processors   → inherits doer-visa:process_visa         │      │
│  │    /viewers      → inherits doer-visa:view_applications    │      │
│  │                                                            │      │
│  │  Move a user from /processors to /managers and their       │      │
│  │  permissions change automatically.                         │      │
│  └───────────────────────────────────────────────────────────┘      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### How Roles Appear in JWT Tokens

When a user authenticates, their roles are embedded in the JWT access token:

```json
{
  "sub": "user-uuid-123",
  "realm_access": {
    "roles": ["tenant_employee"]
  },
  "resource_access": {
    "doer-visa": {
      "roles": ["process_visa", "view_applications"]
    }
  },
  "organization": {
    "xyz-visa-agency": { "id": "org-uuid-456" }
  }
}
```

`realm_access.roles` → Realm roles (user type)
`resource_access.<client>.roles` → Client roles (product permissions)
`organization` → Which tenant's data they can access

### RBAC Enforcement — Three Layers

Every API request passes through three enforcement checkpoints:

```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  Layer 1: APISIX API Gateway (First checkpoint)                      │
│  ──────────────────────────────────────────────                      │
│                                                                      │
│  The openid-connect plugin validates the JWT signature and expiry.   │
│  The authz-keycloak plugin checks if the user has the required       │
│  client roles for the route they're accessing.                       │
│                                                                      │
│  Route: /api/visa/*     → requires ANY doer-visa client role         │
│  Route: /api/school/*   → requires ANY doer-school client role       │
│  Route: /api/tenants/*  → requires tenant_admin or platform_admin    │
│  Route: /api/platform/* → requires platform_admin                    │
│                                                                      │
│  Result: Unauthorized requests get 401/403 BEFORE reaching           │
│          any service. This is the coarse-grained gate.               │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Layer 2: Auth Service (For user/tenant management endpoints)        │
│  ────────────────────────────────────────────────────────            │
│                                                                      │
│  When a tenant admin manages users, the Auth Service validates:      │
│                                                                      │
│  a) Caller's realm role allows the action                            │
│     - tenant_admin can create users                                  │
│     - end_user cannot                                                │
│                                                                      │
│  b) Caller belongs to the target organization                        │
│     - xyz-visa admin cannot manage abc-school users                  │
│                                                                      │
│  c) Requested roles are within caller's product scope                │
│     - xyz-visa admin can assign doer-visa:process_visa               │
│     - xyz-visa admin CANNOT assign doer-school:manage_students       │
│     - xyz-visa admin CANNOT assign platform_admin                    │
│                                                                      │
│  d) Subscription plan allows the action                              │
│     - User limit not exceeded                                        │
│     - Feature available on current plan                              │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Layer 3: Product Service (For business logic endpoints)             │
│  ───────────────────────────────────────────────────────             │
│                                                                      │
│  The product service reads JWT claims for fine-grained control:      │
│                                                                      │
│  a) Organization-based data filtering (tenant isolation)             │
│     SELECT * FROM applications WHERE org_id = jwt.org_id             │
│                                                                      │
│  b) Role-based feature gating                                        │
│     if "manage_applications" in roles → show admin panel             │
│     if "apply_visa" in roles → show application form                 │
│     if "process_visa" not in roles → reject processing action        │
│                                                                      │
│  c) User-type-based UI branching                                     │
│     if user_type == "tenant_admin" → show org settings               │
│     if user_type == "end_user" → show customer dashboard             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### RBAC Enforcement Example — End to End

```
User: Karim (tenant_employee of xyz-visa, roles: [process_visa, view_applications])

Request: PUT /api/visa/applications/101/approve
         Authorization: Bearer <JWT>

Layer 1 — APISIX:
  ✓ JWT valid (signature, expiry)
  ✓ User has doer-visa client roles → route /api/visa/* allowed
  → Proxies to Doer-Visa Service

Layer 3 — Doer-Visa Service:
  ✓ Read org_id from JWT → "xyz-visa"
  ✓ Application #101 belongs to org "xyz-visa"? → YES
  ✗ User has "approve_visa" role? → NO (only has process_visa)
  → 403 Forbidden: "You don't have permission to approve applications"

If Karim had "approve_visa" role:
  ✓ approve_visa role present → proceed
  ✓ Application #101.org_id matches jwt.org_id → proceed
  → Application approved, return 200 OK
```

### Default Role Assignments

When users are created through the Auth Service, these are the default roles assigned:

```
┌─────────────────┬───────────────────┬────────────────────────────────────┐
│ User Type       │ Realm Role        │ Client Roles (default)             │
├─────────────────┼───────────────────┼────────────────────────────────────┤
│ Platform Admin  │ platform_admin    │ All manage_all roles for all       │
│                 │                   │ products (or specific ones)        │
├─────────────────┼───────────────────┼────────────────────────────────────┤
│ Tenant Admin    │ tenant_admin      │ <product>:manage_all               │
│                 │                   │ (for subscribed product only)      │
├─────────────────┼───────────────────┼────────────────────────────────────┤
│ Tenant Employee │ tenant_employee   │ Assigned by tenant admin           │
│                 │                   │ (e.g., process_visa, view_apps)    │
├─────────────────┼───────────────────┼────────────────────────────────────┤
│ End User        │ end_user          │ <product>:default end-user roles   │
│ (self-register) │                   │ (e.g., apply_visa, view_own_status)│
└─────────────────┴───────────────────┴────────────────────────────────────┘

These defaults are configured in the Auth Service's registration_configs table.
Tenant admins can later modify employee roles via the admin panel.
```

### Role Management API (Auth Service)

```
Tenant Admin endpoints:

GET    /api/tenants/:tid/roles              → List available roles for this product
GET    /api/tenants/:tid/users/:uid/roles   → Get user's current roles
PUT    /api/tenants/:tid/users/:uid/roles   → Update user roles
  Body: { "add": ["process_visa"], "remove": ["view_applications"] }

Platform Admin endpoints:

GET    /api/platform/roles                  → List all roles across all products
POST   /api/platform/roles                  → Create a new client role
DELETE /api/platform/roles/:role            → Delete a client role
GET    /api/platform/composites             → List composite role definitions
POST   /api/platform/composites             → Create a composite role preset

Under the hood, all these call Keycloak's Admin REST API:
  GET    /admin/realms/doer/clients/{client-uuid}/roles
  POST   /admin/realms/doer/clients/{client-uuid}/roles
  POST   /admin/realms/doer/users/{user-id}/role-mappings/clients/{client-uuid}
  DELETE /admin/realms/doer/users/{user-id}/role-mappings/clients/{client-uuid}
```

---

## SSO — How It Works With Access Restriction

SSO (Single Sign-On) means: **authenticate once, don't enter credentials again.**
SSO does NOT mean: **access everything.**

### The Mechanism

When a user logs in to any Doer product via the Auth Code flow, Keycloak creates a **browser session cookie** on `auth.doer.com`. This session is shared across all Doer products.

```
Step 1: User logs in to Doer-Visa
──────────────────────────────────
visa.doer.com → redirects to auth.doer.com → user enters credentials
→ Keycloak creates session cookie on auth.doer.com
→ Keycloak redirects back to visa.doer.com with auth code
→ User gets tokens for doer-visa


Step 2: User navigates to Doer-HRMS (if they have access)
──────────────────────────────────────────────────────────
hrms.doer.com → redirects to auth.doer.com
→ Keycloak detects existing session cookie → NO login prompt!
→ Keycloak checks: does this user have doer-hrms client roles?
→ YES → redirects back to hrms.doer.com with auth code
→ User gets tokens for doer-hrms (seamless, no password entered)


Step 3: User navigates to Doer-School (no access)
──────────────────────────────────────────────────
school.doer.com → redirects to auth.doer.com
→ Keycloak detects existing session cookie → NO login prompt
→ Keycloak issues auth code (authentication succeeds — SSO)
→ school.doer.com exchanges code for tokens
→ Tokens contain NO doer-school client roles
→ Frontend/Auth Service checks: user has doer-school roles? NO
→ Shows: "You don't have access to Doer School."

OR: APISIX blocks any API call to /api/school/* because
    the JWT has no doer-school roles → 403 Forbidden
```

### Product Dashboard Experience

```
┌──────────────────────────────────────────────────────────────┐
│  DOER Platform           Welcome, boss@megacorp.com  [Logout] │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Your Products:                                               │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Doer HRMS   │  │  Doer Visa   │  │  Doer School │        │
│  │              │  │              │  │              │        │
│  │   ✅ Active   │  │   ✅ Active   │  │   🔒 Locked  │        │
│  │              │  │              │  │              │        │
│  │  [Open →]    │  │  [Open →]    │  │ [Contact Us] │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                               │
│  Clicking "Open →" on any active product is INSTANT (SSO).    │
│  No login form. No waiting. Keycloak session handles it.      │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Infrastructure — Docker Compose

```yaml
# Overview of services (not the actual docker-compose.yml — that comes during implementation)

services:
  # ─── IDENTITY PROVIDER ───
  keycloak:
    image: quay.io/keycloak/keycloak:latest
    command: start
    environment:
      KC_DB: postgres
      KC_DB_URL: jdbc:postgresql://keycloak-db:5432/keycloak
      KC_HOSTNAME: auth.doer.com
      KC_HEALTH_ENABLED: true
      KC_METRICS_ENABLED: true
    depends_on: [keycloak-db]

  keycloak-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: keycloak

  # ─── API GATEWAY ───
  apisix:
    image: apache/apisix:3.11.0-debian
    ports:
      - "9080:9080"    # HTTP
      - "9443:9443"    # HTTPS
    depends_on: [etcd]

  etcd:
    image: bitnami/etcd:3.5
    environment:
      ALLOW_NONE_AUTHENTICATION: "yes"

  # ─── AUTH SERVICE ───
  auth-service:
    build: ./services/auth-service
    depends_on: [keycloak, auth-db, redis]

  auth-db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: doer_auth

  redis:
    image: redis:7-alpine

  # ─── PRODUCT SERVICES ───
  doer-visa-service:
    build: ./services/doer-visa

  doer-school-service:
    build: ./services/doer-school

  doer-hrms-service:
    build: ./services/doer-hrms

  # ─── MONITORING ───
  prometheus:
    image: prom/prometheus:latest

  grafana:
    image: grafana/grafana:latest
```

---

## New Project Integration Guide

When you build a new Doer product (e.g., `doer-marketplace`), you integrate it with the existing central auth system. **You write zero auth code.** The Auth Service, Keycloak, and APISIX handle everything.

### What Already Exists (Built Once, Used by All)

```
┌─────────────────────────────────────────────────────────────────────┐
│  ALREADY RUNNING (shared infrastructure):                            │
│                                                                      │
│  ✓ Keycloak          — identity provider, user storage, SSO          │
│  ✓ Auth Service       — registration, tenant mgmt, invitations       │
│  ✓ APISIX             — API gateway, JWT validation, rate limiting   │
│  ✓ PostgreSQL (x2)    — Keycloak DB + Auth Service DB                │
│  ✓ Redis              — OTP cache, session data                      │
│  ✓ Keycloakify Themes — base theme system                            │
│                                                                      │
│  You do NOT redeploy or modify any of these.                         │
│  You just ADD configuration for the new product.                     │
└─────────────────────────────────────────────────────────────────────┘
```

### Step-by-Step: Adding doer-marketplace

#### Step 1: Register Clients in Keycloak (Admin Console or Admin API)

Create two clients in the `doer` realm:

```
Client 1: doer-marketplace (Frontend)
──────────────────────────────────────
  Client Type:        Public
  Standard Flow:      Enabled (Authorization Code)
  Direct Access:      Disabled
  PKCE:               S256 (required)
  Valid Redirect URIs: https://marketplace.doer.com/callback
  Web Origins:        https://marketplace.doer.com
  Login Theme:        doer-marketplace-theme (Keycloakify)

Client 2: doer-marketplace-backend (Backend)
────────────────────────────────────────────
  Client Type:        Confidential
  Service Account:    Disabled (it's a resource server, not admin)
  Standard Flow:      Disabled
  Client Secret:      <generated>
```

#### Step 2: Define Client Roles in Keycloak

Create roles under the `doer-marketplace` client:

```
doer-marketplace client roles:
──────────────────────────────
  manage_all          → Full admin (tenant admin gets this)
  manage_store        → Manage store settings, products
  manage_orders       → Process and fulfill orders
  view_orders         → Read-only order access
  list_product        → List a product for sale (seller)
  buy_product         → Purchase a product (buyer)
  view_own_orders     → View own purchase history (buyer)

Optional composite roles (presets):
  seller_basic  = [list_product, view_orders]
  seller_pro    = [list_product, manage_orders, view_orders]
  buyer         = [buy_product, view_own_orders]
```

#### Step 3: Add Registration Config in Auth Service DB

Insert a row into the `registration_configs` table:

```sql
INSERT INTO registration_configs (product, required_fields, validation_rules, default_roles, self_registration_enabled)
VALUES (
  'doer-marketplace',
  '["email", "password", "full_name", "shop_name"]',
  '{"email": "email_format", "password": "min_8_chars", "shop_name": "min_3_chars"}',
  '["buy_product", "view_own_orders"]',
  true
);
```

Now the Auth Service knows:
- What fields to require for doer-marketplace registration
- What validation rules to apply
- What default roles to assign to self-registered users
- Whether self-registration is allowed

**No code changes to the Auth Service.** It reads config from the database.

#### Step 4: Add APISIX Routes

Register routes via the APISIX Admin API:

```json
// Route 1: Protected marketplace API
{
  "uri": "/api/marketplace/*",
  "methods": ["GET", "POST", "PUT", "DELETE"],
  "plugins": {
    "openid-connect": {
      "bearer_only": true,
      "client_id": "doer-marketplace-backend",
      "client_secret": "${MARKETPLACE_CLIENT_SECRET}",
      "discovery": "http://keycloak:8080/realms/doer/.well-known/openid-configuration",
      "token_signing_alg_values_expected": "RS256"
    },
    "authz-keycloak": {
      "token_endpoint": "http://keycloak:8080/realms/doer/protocol/openid-connect/token",
      "client_id": "doer-marketplace-backend",
      "policy_enforcement_mode": "ENFORCING"
    },
    "limit-count": {
      "count": 1000,
      "time_window": 60,
      "key_type": "var",
      "key": "consumer_name",
      "rejected_code": 429
    }
  },
  "upstream": {
    "type": "roundrobin",
    "nodes": { "doer-marketplace-service:8080": 1 }
  }
}
```

#### Step 5: Create Keycloakify Theme Variant

Add a theme variant for doer-marketplace in your Keycloakify project:

```
keycloakify-themes/
├── src/
│   ├── login/           (shared login components)
│   ├── themes/
│   │   ├── doer-visa/   (existing)
│   │   │   ├── logo.svg
│   │   │   ├── colors.ts
│   │   │   └── LoginPage.tsx
│   │   ├── doer-school/ (existing)
│   │   └── doer-marketplace/  ← NEW
│   │       ├── logo.svg
│   │       ├── colors.ts      (brand colors)
│   │       └── LoginPage.tsx  (optional customization)
│   └── ...
```

Build and deploy the theme JAR to Keycloak's `providers/` directory.

#### Step 6: Deploy Your Product Service

Your marketplace service is a standard microservice with **zero auth code**:

```
doer-marketplace-service/
├── src/
│   ├── middleware/
│   │   └── jwt.ts              ← Reads JWT claims (does NOT validate — APISIX did that)
│   ├── routes/
│   │   ├── products.ts         ← Business logic only
│   │   ├── orders.ts           ← Business logic only
│   │   └── stores.ts           ← Business logic only
│   └── ...
├── Dockerfile
└── ...
```

**JWT middleware (the only "auth-adjacent" code in your service):**

```
// This is NOT authentication. APISIX already validated the JWT.
// This just extracts claims for business logic use.

function extractJwtClaims(request):
  token = request.headers.authorization  // Already validated by APISIX
  claims = decodeJwt(token)              // Just decode, no signature check needed

  return {
    userId:    claims.sub,
    userType:  claims.user_type,
    orgId:     claims.organization.keys()[0],
    roles:     claims.resource_access["doer-marketplace"]?.roles || [],
    email:     claims.email,
    name:      claims.given_name
  }
```

**Business logic example:**

```
// GET /api/marketplace/orders
function listOrders(request):
  jwt = extractJwtClaims(request)

  // Tenant isolation — ALWAYS filter by org_id from JWT
  if "manage_orders" in jwt.roles:
    // Staff: see all orders for this tenant
    return db.query("SELECT * FROM orders WHERE org_id = ?", jwt.orgId)
  elif "view_own_orders" in jwt.roles:
    // Buyer: see only their own orders
    return db.query("SELECT * FROM orders WHERE org_id = ? AND user_id = ?",
                     jwt.orgId, jwt.userId)
  else:
    return 403
```

#### Step 7: Onboard a Tenant for the New Product

Use the existing Auth Service API:

```
POST /api/tenants
{
  "name": "SuperMart Online",
  "product": "doer-marketplace",
  "plan": "pro",
  "admin_email": "admin@supermart.com",
  "admin_phone": "+8801712222222"
}

→ Auth Service creates Keycloak Organization "supermart-online"
→ Creates admin user with doer-marketplace:manage_all role
→ Sends welcome email
→ Done. SuperMart can now use Doer-Marketplace.
```

### Integration Checklist (New Product)

```
┌─────────────────────────────────────────────────────────────────────┐
│              NEW PRODUCT INTEGRATION CHECKLIST                        │
├───┬─────────────────────────────────────────────────────────────────┤
│   │ Configuration (no code changes to shared infra)                 │
├───┼─────────────────────────────────────────────────────────────────┤
│ □ │ Register public + confidential clients in Keycloak              │
│ □ │ Define client roles (permissions for this product)              │
│ □ │ Define composite roles (role presets for easy assignment)       │
│ □ │ Add registration config row in Auth Service DB                  │
│ □ │ Add APISIX route with openid-connect + authz-keycloak plugins  │
│ □ │ Create Keycloakify theme variant (logo, colors, optional layout)│
├───┼─────────────────────────────────────────────────────────────────┤
│   │ New code (only the product service itself)                      │
├───┼─────────────────────────────────────────────────────────────────┤
│ □ │ Build product microservice (business logic only)                │
│ □ │ Add JWT claims extraction middleware (decode, don't validate)   │
│ □ │ Filter all DB queries by org_id from JWT                        │
│ □ │ Check client roles from JWT for feature gating                  │
│ □ │ Build frontend with login redirect to Keycloak (PKCE)           │
│ □ │ Add token refresh logic in frontend (call /auth/refresh)        │
│ □ │ Deploy as Docker container, add to docker-compose               │
├───┼─────────────────────────────────────────────────────────────────┤
│   │ NOT needed (handled by existing central auth)                   │
├───┼─────────────────────────────────────────────────────────────────┤
│ ✗ │ Login/registration UI or logic                                  │
│ ✗ │ Password hashing or credential storage                          │
│ ✗ │ JWT token creation or validation                                │
│ ✗ │ SSO implementation                                              │
│ ✗ │ MFA implementation                                              │
│ ✗ │ Social login integration                                        │
│ ✗ │ User management APIs                                            │
│ ✗ │ Tenant onboarding logic                                         │
│ ✗ │ Invitation system                                                │
│ ✗ │ Rate limiting                                                    │
│ ✗ │ Audit logging (auth events)                                      │
└───┴─────────────────────────────────────────────────────────────────┘
```

### Frontend Integration Pattern (SPA)

Your new product's frontend needs three things:

```
1. Login Button
─────────────────
  onClick → redirect to:
    auth.doer.com/realms/doer/protocol/openid-connect/auth?
      client_id=doer-marketplace&
      response_type=code&
      scope=openid+organization&
      redirect_uri=marketplace.doer.com/callback&
      code_challenge=<SHA256>&
      code_challenge_method=S256

  Use any OIDC client library:
    - React: oidc-client-ts, react-oidc-context
    - Vue: vue-oidc-client
    - Angular: angular-auth-oidc-client
    - Mobile: AppAuth (iOS/Android)


2. Callback Handler
─────────────────────
  On /callback → extract auth code from URL params
  → POST /auth/token { code, code_verifier, redirect_uri }
  → Store received access_token and refresh_token


3. API Calls
─────────────
  Every API call includes:
    Authorization: Bearer <access_token>

  On 401 response:
    → Call POST /auth/refresh { refresh_token }
    → Get new tokens
    → Retry request

  On refresh failure:
    → Redirect to login (SSO will make it instant if session exists)
```

---

## Security Considerations

### TLS Everywhere
- Client → APISIX: HTTPS (TLS 1.3)
- APISIX → Keycloak: HTTPS
- APISIX → Services: HTTPS (or HTTP if within private Docker network)
- Keycloak → PostgreSQL: SSL
- Inter-node (if clustered): Infinispan TLS

### Keycloak Hardening
- Separate admin hostname (`admin.doer.com`) from public auth (`auth.doer.com`)
- IP-whitelist admin console access
- Enforce MFA for all platform_admin accounts
- Rotate client secrets regularly
- Set explicit hostname (never rely on dynamic resolution)

### Token Security
- Access tokens: 5-15 minute lifetime (short-lived)
- Refresh tokens: 30 min - 8 hours (aligned with SSO session)
- Enable "Revoke Refresh Tokens" (single-use refresh tokens)
- Use RS256 signing (asymmetric — services validate without knowing the secret)

### Rate Limiting (APISIX)
- Public auth endpoints: 30 requests/minute per IP
- Authenticated API endpoints: 1000 requests/minute per tenant
- Token refresh: 10 requests/minute per user

### Auth Service Security
- Service account (doer-auth-svc) has minimum required permissions
- All Admin API calls are audited in Auth DB
- OTP codes expire in 5 minutes, max 3 attempts
- Invitation tokens expire in 48 hours, single-use
- Input validation on all endpoints (phone format, email format, etc.)

### Data Isolation
- Organization ID from JWT is the ONLY way to scope data queries
- Never trust client-provided tenant IDs — always read from JWT
- Product services must validate organization membership on every request
