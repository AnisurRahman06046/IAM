# Doer IAM — Use Case Flows

## Table of Contents

- [User Types Reference](#user-types-reference)
- [1. Tenant Onboarding](#1-tenant-onboarding)
- [2. Login — Authorization Code Flow + PKCE](#2-login--authorization-code-flow--pkce)
- [3. SSO Across Products](#3-sso-across-products)
- [4. Access Restriction — Blocking Unauthorized Products](#4-access-restriction--blocking-unauthorized-products)
- [5. End User Self-Registration](#5-end-user-self-registration)
- [6. Tenant Admin Creates an Employee](#6-tenant-admin-creates-an-employee)
- [7. Invitation Flow](#7-invitation-flow)
- [8. Social Login + Tenant Association](#8-social-login--tenant-association)
- [9. MFA / Two-Factor Authentication](#9-mfa--two-factor-authentication)
- [10. Password Reset](#10-password-reset)
- [11. Token Refresh](#11-token-refresh)
- [12. Logout — Single Logout Across Products](#12-logout--single-logout-across-products)
- [13. User Deactivation / Blocking](#13-user-deactivation--blocking)
- [14. Tenant Deactivation](#14-tenant-deactivation)
- [15. User Belongs to Multiple Tenants](#15-user-belongs-to-multiple-tenants)
- [16. User Belongs to Multiple Products](#16-user-belongs-to-multiple-products)
- [17. Tenant Admin Manages Permissions](#17-tenant-admin-manages-permissions)
- [18. Varying Registration Per Product](#18-varying-registration-per-product)
- [19. Tenant Data Isolation](#19-tenant-data-isolation)
- [20. Platform Admin Operations](#20-platform-admin-operations)
- [21. Product Service — How It Uses JWT](#21-product-service--how-it-uses-jwt)
- [22. Subscription / Plan Enforcement](#22-subscription--plan-enforcement)
- [23. Audit Trail](#23-audit-trail)
- [24. RBAC Enforcement — End to End](#24-rbac-enforcement--end-to-end)
- [25. Role Assignment Flow](#25-role-assignment-flow)
- [26. New Product Integration — Onboarding a New Doer Product](#26-new-product-integration--onboarding-a-new-doer-product)
- [27. Existing Tenant Gets Access to a New Product](#27-existing-tenant-gets-access-to-a-new-product)
- [28. Existing User Gets Access to a New Product](#28-existing-user-gets-access-to-a-new-product)

---

## User Types Reference

| User Type | Who | Created By | Access Scope |
|-----------|-----|-----------|--------------|
| **Platform Admin** | Doer company staff | Manually / super-admin | All products, all tenants |
| **Tenant Admin** | Client onboarded to a product | Doer platform admin (via onboarding) | Their own organization, their subscribed products |
| **Tenant Employee** | Staff of a tenant | Tenant admin | Their organization, assigned product roles only |
| **End User** | Customer of a tenant | Self-registration | Their organization, customer-facing features only |

---

## 1. Tenant Onboarding

**Scenario**: Doer sales team onboards "XYZ Visa Agency" as a client for Doer-Visa.

**Actor**: Platform Admin (Doer staff)

```
Doer Admin Panel                    Auth Service                         Keycloak
     │                                   │                                  │
     │ POST /api/tenants                 │                                  │
     │ {                                 │                                  │
     │   "name": "XYZ Visa Agency",      │                                  │
     │   "product": "doer-visa",         │                                  │
     │   "plan": "enterprise",           │                                  │
     │   "max_users": 50,                │                                  │
     │   "admin_email": "boss@xyz.com",  │                                  │
     │   "admin_phone": "+880171...",    │                                  │
     │   "domain": "xyzvisa.com"         │                                  │
     │ }                                 │                                  │
     │ ─────────────────────────────────▶│                                  │
     │                                   │                                  │
     │                                   │  Step 1: Validate request        │
     │                                   │  - Caller has platform_admin role │
     │                                   │  - Plan exists, product valid    │
     │                                   │                                  │
     │                                   │  Step 2: Save tenant metadata    │
     │                                   │  (in Auth Service DB — billing,  │
     │                                   │   plan limits, status)           │
     │                                   │                                  │
     │                                   │  Step 3: Create Organization     │
     │                                   │  POST /admin/realms/doer/        │
     │                                   │  organizations                   │
     │                                   │  {                               │
     │                                   │    "name": "XYZ Visa Agency",    │
     │                                   │    "alias": "xyz-visa",          │
     │                                   │    "domains": [                  │
     │                                   │      {"name": "xyzvisa.com",     │
     │                                   │       "verified": true}          │
     │                                   │    ],                            │
     │                                   │    "attributes": {               │
     │                                   │      "products": ["doer-visa"],  │
     │                                   │      "plan": ["enterprise"]      │
     │                                   │    }                             │
     │                                   │  }                               │
     │                                   │ ────────────────────────────────▶│
     │                                   │                                  │
     │                                   │  Step 4: Create admin user       │
     │                                   │  POST /admin/realms/doer/users   │
     │                                   │  {                               │
     │                                   │    "username": "+880171...",      │
     │                                   │    "email": "boss@xyz.com",      │
     │                                   │    "enabled": true,              │
     │                                   │    "attributes": {               │
     │                                   │      "user_type": ["tenant_      │
     │                                   │       admin"],                   │
     │                                   │      "phone": ["+880171..."]     │
     │                                   │    },                            │
     │                                   │    "credentials": [{             │
     │                                   │      "type": "password",         │
     │                                   │      "value": "<temp>",          │
     │                                   │      "temporary": true           │
     │                                   │    }]                            │
     │                                   │  }                               │
     │                                   │ ────────────────────────────────▶│
     │                                   │                                  │
     │                                   │  Step 5: Add user to org         │
     │                                   │  POST /admin/realms/doer/        │
     │                                   │  organizations/{org-id}/members  │
     │                                   │ ────────────────────────────────▶│
     │                                   │                                  │
     │                                   │  Step 6: Assign roles            │
     │                                   │  - Realm role: tenant_admin      │
     │                                   │  - Client role:                  │
     │                                   │    doer-visa:manage_all          │
     │                                   │ ────────────────────────────────▶│
     │                                   │                                  │
     │                                   │  Step 7: Send welcome email      │
     │                                   │  with login link + temp password │
     │                                   │                                  │
     │ Response:                         │                                  │
     │ {                                 │                                  │
     │   "tenant_id": "...",             │                                  │
     │   "org_id": "...",                │                                  │
     │   "admin_user_id": "...",         │                                  │
     │   "status": "active"              │                                  │
     │ }                                 │                                  │
     │ ◀─────────────────────────────────│                                  │
```

**Result**: XYZ Visa Agency exists in the system. The admin will receive a welcome email, login, be prompted to change their temporary password, and then can start managing their organization.

---

## 2. Login — Authorization Code Flow + PKCE

**Scenario**: A user wants to log in to Doer-Visa.

**Actor**: Any user type

```
Doer-Visa Frontend              Keycloak (Themed Page)            Auth Service Backend
(visa.doer.com)                (auth.doer.com)                    (api.doer.com)
     │                              │                                  │
     │ 1. User clicks "Login"       │                                  │
     │                              │                                  │
     │ 2. Frontend generates PKCE:  │                                  │
     │    code_verifier = random(43)│                                  │
     │    code_challenge = SHA256(  │                                  │
     │      code_verifier)          │                                  │
     │    state = random()          │                                  │
     │                              │                                  │
     │ 3. Redirect browser to:      │                                  │
     │    auth.doer.com/realms/doer │                                  │
     │    /protocol/openid-connect/ │                                  │
     │    auth?                     │                                  │
     │      client_id=doer-visa     │                                  │
     │      &response_type=code     │                                  │
     │      &scope=openid+          │                                  │
     │       organization           │                                  │
     │      &redirect_uri=          │                                  │
     │       visa.doer.com/callback │                                  │
     │      &code_challenge=xxx     │                                  │
     │      &code_challenge_method  │                                  │
     │       =S256                  │                                  │
     │      &state=yyy              │                                  │
     │ ────────────────────────────▶│                                  │
     │                              │                                  │
     │                              │ 4. Keycloak displays login page  │
     │                              │    THEMED with Doer-Visa         │
     │                              │    branding via Keycloakify:     │
     │                              │                                  │
     │                              │    ┌────────────────────────┐    │
     │                              │    │    🏢 DOER VISA         │    │
     │                              │    │                        │    │
     │                              │    │  Phone or Email        │    │
     │                              │    │  [________________]    │    │
     │                              │    │                        │    │
     │                              │    │  Password              │    │
     │                              │    │  [________________]    │    │
     │                              │    │                        │    │
     │                              │    │  [    Sign In     ]    │    │
     │                              │    │                        │    │
     │                              │    │  ── or continue with ──│    │
     │                              │    │  [G] Google  [GH] GitHub│   │
     │                              │    │                        │    │
     │                              │    │  Don't have an account?│    │
     │                              │    │  Register here →       │    │
     │                              │    │                        │    │
     │                              │    │  © 2026 Doer Inc.      │    │
     │                              │    └────────────────────────┘    │
     │                              │                                  │
     │                              │ 5. User enters credentials       │
     │                              │    Keycloak validates:           │
     │                              │    - Password correct?           │
     │                              │    - Account enabled?            │
     │                              │    - Brute force check           │
     │                              │    - MFA required? (see flow 9) │
     │                              │                                  │
     │                              │ 6. Keycloak creates SSO session  │
     │                              │    (session cookie on            │
     │                              │     auth.doer.com)              │
     │                              │                                  │
     │ 7. Redirect back:            │                                  │
     │    visa.doer.com/callback    │                                  │
     │    ?code=AUTH_CODE            │                                  │
     │    &state=yyy                │                                  │
     │ ◀────────────────────────────│                                  │
     │                              │                                  │
     │ 8. Frontend verifies state   │                                  │
     │    matches original state    │                                  │
     │                              │                                  │
     │ 9. Frontend sends code to    │                                  │
     │    backend for exchange:     │                                  │
     │                              │                                  │
     │ POST /auth/token             │                                  │
     │ {                            │                                  │
     │   "code": "AUTH_CODE",       │                                  │
     │   "code_verifier": "...",    │                                  │
     │   "redirect_uri":            │                                  │
     │    "visa.doer.com/callback"  │                                  │
     │ }                            │                                  │
     │ ──────────────────────────────────────────────────────────────▶│
     │                              │                                  │
     │                              │         POST /realms/doer/       │
     │                              │         protocol/openid-connect/ │
     │                              │         token                    │
     │                              │         {                        │
     │                              │           grant_type=            │
     │                              │            authorization_code,   │
     │                              │           code=AUTH_CODE,        │
     │                              │           code_verifier=...,     │
     │                              │           client_id=doer-visa,   │
     │                              │           client_secret=...,     │
     │                              │           redirect_uri=          │
     │                              │            visa.doer.com/callback│
     │                              │         }                        │
     │                              │ ◀────────────────────────────────│
     │                              │                                  │
     │                              │         {                        │
     │                              │           access_token: "...",   │
     │                              │           refresh_token: "...",  │
     │                              │           id_token: "...",       │
     │                              │           expires_in: 300        │
     │                              │         }                        │
     │                              │ ────────────────────────────────▶│
     │                              │                                  │
     │                              │                     (Optional)   │
     │                              │                     Auth Service │
     │                              │                     checks org   │
     │                              │                     product attr │
     │                              │                     matches      │
     │                              │                     doer-visa    │
     │                              │                                  │
     │ {                            │                                  │
     │   "access_token": "...",     │                                  │
     │   "refresh_token": "...",    │                                  │
     │   "expires_in": 300          │                                  │
     │ }                            │                                  │
     │ ◀──────────────────────────────────────────────────────────────│
     │                              │                                  │
     │ 10. Store tokens:            │                                  │
     │     SPA → memory             │                                  │
     │     Mobile → secure storage  │                                  │
     │                              │                                  │
     │ 11. Use access_token for     │                                  │
     │     all subsequent API calls │                                  │
```

**Key Points:**
- The app NEVER sees the user's password
- Keycloak's themed page looks like your product (Keycloakify)
- SSO session cookie is created on auth.doer.com
- MFA is handled by Keycloak during step 5 (no custom code needed)
- Brute force protection is automatic

---

## 3. SSO Across Products

**Scenario**: User already logged in to Doer-Visa, now wants to access Doer-HRMS.

**Actor**: User with access to multiple products (e.g., Mega Corp admin)

```
Doer-HRMS Frontend              Keycloak                          Auth Service
(hrms.doer.com)                (auth.doer.com)                    (api.doer.com)
     │                              │                                  │
     │ 1. User clicks "Open HRMS"   │                                  │
     │    from product dashboard    │                                  │
     │                              │                                  │
     │ 2. Frontend generates PKCE   │                                  │
     │    + redirect to:            │                                  │
     │    auth.doer.com/realms/doer │                                  │
     │    /protocol/openid-connect/ │                                  │
     │    auth?                     │                                  │
     │      client_id=doer-hrms...  │                                  │
     │ ────────────────────────────▶│                                  │
     │                              │                                  │
     │                              │ 3. Keycloak checks: session      │
     │                              │    cookie exists on auth.doer.com│
     │                              │    from earlier Doer-Visa login? │
     │                              │                                  │
     │                              │    YES → SSO! No login prompt.   │
     │                              │                                  │
     │                              │ 4. Keycloak generates auth code  │
     │                              │    for doer-hrms client          │
     │                              │                                  │
     │ 5. Redirect back:            │                                  │
     │    hrms.doer.com/callback    │                                  │
     │    ?code=NEW_AUTH_CODE        │                                  │
     │ ◀────────────────────────────│                                  │
     │                              │                                  │
     │ 6. Exchange code for tokens  │                                  │
     │    (same as login flow       │                                  │
     │     steps 8-10)              │                                  │
     │ ──────────────────────────────────────────────────────────────▶│
     │                              │                                  │
     │ 7. Tokens received —         │                                  │
     │    user is in HRMS now!      │                                  │
     │                              │                                  │
     │ ◀──────────────────────────────────────────────────────────────│
     │                              │                                  │
     │ TOTAL TIME: ~200ms           │                                  │
     │ (redirect + code exchange)   │                                  │
     │ USER EXPERIENCE: Instant.    │                                  │
     │ No login form shown.         │                                  │
```

**What the user sees**: They click "Open HRMS", the page briefly flashes (redirect), and they're in. No credentials entered. This is SSO.

---

## 4. Access Restriction — Blocking Unauthorized Products

**Scenario**: XYZ Visa Agency user tries to access Doer-School (they have NO subscription).

**Actor**: Any XYZ Visa Agency user

```
Doer-School Frontend            Keycloak                          Frontend Logic
(school.doer.com)              (auth.doer.com)
     │                              │
     │ 1. User navigates to         │
     │    school.doer.com           │
     │                              │
     │ 2. Redirect to Keycloak      │
     │    (SSO — no login prompt)   │
     │ ────────────────────────────▶│
     │                              │
     │                              │ 3. Keycloak authenticates via
     │                              │    SSO session (user IS who
     │                              │    they claim — authentication
     │                              │    succeeds)
     │                              │
     │ 4. Redirect back with code   │
     │ ◀────────────────────────────│
     │                              │
     │ 5. Exchange code for tokens  │
     │    Token received. But the   │
     │    JWT contains:             │
     │                              │
     │    resource_access: {        │
     │      "doer-visa": {          │
     │        roles: ["apply_visa"] │  ← HAS visa roles
     │      }                       │
     │      // doer-school: MISSING │  ← NO school roles
     │    }                         │
     │    organization: {           │
     │      "xyz-visa-agency": {}   │  ← visa org, not school
     │    }                         │
     │                              │
     │ 6. Frontend checks:          │
     │    Does token have ANY       │
     │    doer-school roles?        │
     │    → NO                      │
     │                              │
     │ 7. Frontend shows:           │
     │    ┌─────────────────────────────────────┐
     │    │                                     │
     │    │   🔒 Access Denied                   │
     │    │                                     │
     │    │   You don't have access to          │
     │    │   Doer School.                      │
     │    │                                     │
     │    │   Your organization (XYZ Visa       │
     │    │   Agency) is subscribed to:         │
     │    │   • Doer Visa ✅                     │
     │    │                                     │
     │    │   To add Doer School, contact       │
     │    │   your administrator or             │
     │    │   [Upgrade your plan →]             │
     │    │                                     │
     │    └─────────────────────────────────────┘


ADDITIONALLY — even if the user somehow bypasses the frontend check:

API Call                        APISIX                           Doer-School Service
     │                              │                                  │
     │ GET /api/school/students     │                                  │
     │ Authorization: Bearer <JWT>  │                                  │
     │ ─────────────────────────────▶│                                  │
     │                              │                                  │
     │                              │ authz-keycloak plugin checks:    │
     │                              │ Does JWT have doer-school roles? │
     │                              │ → NO                             │
     │                              │                                  │
     │ 403 Forbidden                │                                  │
     │ { "error": "access_denied" } │  (request never reaches the      │
     │ ◀─────────────────────────────│   school service)               │
```

**Three layers of protection:**
1. Frontend checks token for product roles → shows access denied page
2. APISIX validates permissions → returns 403 if no roles
3. Product service filters by org_id → even if somehow reached, no data matches

---

## 5. End User Self-Registration

**Scenario**: A customer wants to register on XYZ Visa Agency's portal to apply for a visa.

**Actor**: New end user (not yet in the system)

```
Doer-Visa Website                Auth Service                         Keycloak
(visa.xyzvisa.com)
     │                                │                                  │
     │ 1. User clicks "Register"      │                                  │
     │    on Doer-Visa website        │                                  │
     │                                │                                  │
     │ 2. Frontend shows CUSTOM       │                                  │
     │    registration form:          │                                  │
     │    ┌──────────────────────┐    │                                  │
     │    │  Create Your Account │    │                                  │
     │    │                      │    │                                  │
     │    │  Full Name *         │    │                                  │
     │    │  [________________]  │    │                                  │
     │    │                      │    │                                  │
     │    │  Phone Number *      │    │                                  │
     │    │  [+880 ___________]  │    │                                  │
     │    │                      │    │                                  │
     │    │  Email               │    │                                  │
     │    │  [________________]  │    │                                  │
     │    │                      │    │                                  │
     │    │  Password *          │    │                                  │
     │    │  [________________]  │    │                                  │
     │    │                      │    │                                  │
     │    │  Passport No.        │    │                                  │
     │    │  [________________]  │    │                                  │
     │    │                      │    │                                  │
     │    │  [  Create Account ] │    │                                  │
     │    │                      │    │                                  │
     │    │  Already have an     │    │                                  │
     │    │  account? Login →    │    │                                  │
     │    └──────────────────────┘    │                                  │
     │                                │                                  │
     │ 3. Submit form:                │                                  │
     │ POST /auth/register            │                                  │
     │ {                              │                                  │
     │   "project": "doer-visa",      │                                  │
     │   "tenant": "xyz-visa",        │                                  │
     │   "name": "Rahim Ahmed",       │                                  │
     │   "phone": "+8801912345678",   │                                  │
     │   "email": "rahim@gmail.com",  │                                  │
     │   "password": "***",           │                                  │
     │   "passport_no": "BR1234567"   │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ Step 1: Load registration rules  │
     │                                │ for "doer-visa" from config DB   │
     │                                │                                  │
     │                                │ Step 2: Validate                 │
     │                                │ - Phone format (BD: +880...)     │
     │                                │ - Password strength              │
     │                                │ - Passport format (optional)     │
     │                                │ - Check phone not duplicate      │
     │                                │   GET /admin/realms/doer/users   │
     │                                │   ?q=phone:+8801912345678        │
     │                                │ ────────────────────────────────▶│
     │                                │   (empty result = available)     │
     │                                │                                  │
     │                                │ Step 3: Check tenant user limit  │
     │                                │ (xyz-visa enterprise plan: 500   │
     │                                │  users, currently 123 = OK)      │
     │                                │                                  │
     │                                │ Step 4: Create user in Keycloak  │
     │                                │ POST /admin/realms/doer/users    │
     │                                │ {                                │
     │                                │   "username": "+8801912345678",  │
     │                                │   "email": "rahim@gmail.com",   │
     │                                │   "firstName": "Rahim",         │
     │                                │   "lastName": "Ahmed",          │
     │                                │   "enabled": true,              │
     │                                │   "emailVerified": false,       │
     │                                │   "attributes": {               │
     │                                │     "phone": ["+8801912345678"],│
     │                                │     "user_type": ["end_user"],  │
     │                                │     "passport_no":["BR1234567"] │
     │                                │   },                            │
     │                                │   "credentials": [{             │
     │                                │     "type": "password",         │
     │                                │     "value": "***",             │
     │                                │     "temporary": false          │
     │                                │   }]                            │
     │                                │ }                                │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ Step 5: Add user to xyz-visa org│
     │                                │ POST /admin/realms/doer/         │
     │                                │ organizations/{org-id}/members   │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ Step 6: Assign roles             │
     │                                │ - Realm: end_user                │
     │                                │ - Client: doer-visa:apply_visa,  │
     │                                │           doer-visa:view_own_    │
     │                                │           status                 │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ Step 7: (Optional) Send          │
     │                                │ verification email/SMS           │
     │                                │                                  │
     │ Response:                      │                                  │
     │ {                              │                                  │
     │   "success": true,             │                                  │
     │   "message": "Account created. │                                  │
     │    Please login.",              │                                  │
     │   "login_url": "/login"        │                                  │
     │ }                              │                                  │
     │ ◀──────────────────────────────│                                  │
     │                                │                                  │
     │ 4. Frontend redirects user     │                                  │
     │    to login page               │                                  │
     │    → Auth Code + PKCE flow     │                                  │
     │    (see Use Case 2)            │                                  │
```

**Key Points:**
- Registration uses YOUR custom UI (not Keycloak's)
- Registration calls Keycloak Admin REST API (uses client_credentials, NOT ROPC)
- After registration, user logs in via Auth Code + PKCE (Keycloak themed page)
- Project-specific fields (passport_no) are stored as Keycloak user attributes

---

## 6. Tenant Admin Creates an Employee

**Scenario**: XYZ Visa Agency admin creates a staff member account.

**Actor**: Tenant Admin

```
Doer-Visa Admin Panel           Auth Service                         Keycloak
     │                                │                                  │
     │ POST /api/tenants/             │                                  │
     │   xyz-visa/users               │                                  │
     │ {                              │                                  │
     │   "phone": "+8801811111111",   │                                  │
     │   "email": "karim@xyz.com",    │                                  │
     │   "name": "Karim Hossain",     │                                  │
     │   "roles": ["process_visa",    │                                  │
     │             "view_applications"]│                                  │
     │ }                              │                                  │
     │ Authorization: Bearer <JWT>    │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ Step 1: Validate caller's JWT    │
     │                                │ - Has tenant_admin realm role?   │
     │                                │ - Belongs to xyz-visa org?       │
     │                                │ - Has doer-visa:manage_all?      │
     │                                │ All YES → proceed                │
     │                                │                                  │
     │                                │ Step 2: Validate requested roles │
     │                                │ - "process_visa" belongs to      │
     │                                │   doer-visa client? YES          │
     │                                │ - Tenant admin can assign this?  │
     │                                │   YES (it's within their product)│
     │                                │ - NOT trying to assign roles     │
     │                                │   from doer-school? CORRECT      │
     │                                │                                  │
     │                                │ Step 3: Check user limit         │
     │                                │ xyz-visa: 24/50 users → OK       │
     │                                │                                  │
     │                                │ Step 4: Create user              │
     │                                │ POST /admin/realms/doer/users    │
     │                                │ { username, email, attributes:   │
     │                                │   { user_type: "tenant_employee",│
     │                                │     phone: "+8801811111111" },   │
     │                                │   credentials: [{ type:         │
     │                                │   "password", value: "<temp>",   │
     │                                │   temporary: true }] }           │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ Step 5: Add to org + assign roles│
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ Step 6: Send credential email/SMS│
     │                                │                                  │
     │ { "user_id": "...",            │                                  │
     │   "temp_password": "..." }     │                                  │
     │ ◀──────────────────────────────│                                  │
```

**Security Enforcements:**
- Tenant admin can ONLY create users within their own organization
- Tenant admin can ONLY assign roles from their subscribed product's client roles
- Tenant admin CANNOT assign `platform_admin` or roles from other products
- User count is checked against the subscription plan limit

---

## 7. Invitation Flow

**Scenario**: Tenant admin invites someone to join their organization via email.

**Actor**: Tenant Admin

```
Doer-Visa Admin                 Auth Service                          Email
     │                                │                                  │
     │ POST /api/tenants/             │                                  │
     │   xyz-visa/invite              │                                  │
     │ {                              │                                  │
     │   "email": "newguy@xyz.com",   │                                  │
     │   "role": "visa_processor"     │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ 1. Generate invitation:          │
     │                                │    token = random UUID           │
     │                                │    Save to Auth DB:              │
     │                                │    { token, tenant: xyz-visa,    │
     │                                │      email, role, expires_at:    │
     │                                │      now + 48h, status: pending, │
     │                                │      invited_by: caller_id }     │
     │                                │                                  │
     │                                │ 2. Send invitation email         │
     │                                │ ─────────────────────────────────│──▶
     │                                │                                  │
     │                                │    Subject: "You're invited to   │
     │                                │    join XYZ Visa Agency"         │
     │                                │                                  │
     │                                │    Body: "Click here to accept:  │
     │                                │    visa.doer.com/invite/{token}" │
     │                                │                                  │
     │ { "invitation_sent": true }    │                                  │
     │ ◀──────────────────────────────│                                  │
     │                                │                                  │

─── Later, invitee clicks the link: ───

Doer-Visa UI                    Auth Service                         Keycloak
     │                                │                                  │
     │ GET /auth/invite/{token}       │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ Validate token:                  │
     │                                │ - Exists? YES                    │
     │                                │ - Expired? NO                    │
     │                                │ - Already used? NO               │
     │                                │                                  │
     │ {                              │                                  │
     │   "valid": true,               │                                  │
     │   "tenant": "XYZ Visa Agency", │                                  │
     │   "email": "newguy@xyz.com",   │                                  │
     │   "role": "visa_processor"     │                                  │
     │ }                              │                                  │
     │ ◀──────────────────────────────│                                  │
     │                                │                                  │
     │ Show registration form         │                                  │
     │ (pre-filled email, ask for     │                                  │
     │  name, phone, password)        │                                  │
     │                                │                                  │
     │ POST /auth/accept-invite       │                                  │
     │ {                              │                                  │
     │   "token": "{token}",          │                                  │
     │   "name": "New Guy",           │                                  │
     │   "phone": "+8801711111111",   │                                  │
     │   "password": "***"            │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ 1. Re-validate token             │
     │                                │ 2. Create user in Keycloak       │
     │                                │ 3. Add to xyz-visa org           │
     │                                │ 4. Assign pre-defined role       │
     │                                │ 5. Mark invitation as accepted   │
     │                                │ 6. Log audit event               │
     │                                │                                  │
     │ {                              │                                  │
     │   "success": true,             │                                  │
     │   "message": "Account created. │                                  │
     │    Please login.",              │                                  │
     │   "login_url": "/login"        │                                  │
     │ }                              │                                  │
     │ ◀──────────────────────────────│                                  │
     │                                │                                  │
     │ → Redirect to login            │                                  │
     │   (Auth Code + PKCE flow)      │                                  │
```

---

## 8. Social Login + Tenant Association

**Scenario**: End user clicks "Sign in with Google" on XYZ Visa Agency's portal.

**Actor**: New or existing end user

```
Doer-Visa Frontend              Keycloak                       Google
(visa.doer.com)                (auth.doer.com)
     │                              │                              │
     │ 1. User clicks "Login"       │                              │
     │    → redirect to Keycloak    │                              │
     │ ────────────────────────────▶│                              │
     │                              │                              │
     │                              │ 2. Themed login page shows:  │
     │                              │    [G] Sign in with Google   │
     │                              │    User clicks it            │
     │                              │                              │
     │                              │ 3. Keycloak redirects to     │
     │                              │    Google's OAuth page       │
     │                              │ ─────────────────────────────│──▶
     │                              │                              │
     │                              │                              │ 4. User
     │                              │                              │    logs in
     │                              │                              │    to Google
     │                              │                              │
     │                              │ 5. Google returns auth code  │
     │                              │    to Keycloak callback      │
     │                              │ ◀─────────────────────────────│
     │                              │                              │
     │                              │ 6. Keycloak exchanges code   │
     │                              │    with Google, gets profile  │
     │                              │                              │
     │                              │ 7. Is this a new user?       │
     │                              │                              │
     │                              │    NEW USER:                 │
     │                              │    → Keycloak creates user   │
     │                              │    → First login flow runs   │
     │                              │    → User may be prompted    │
     │                              │      to fill additional info │
     │                              │                              │
     │                              │    EXISTING USER:            │
     │                              │    → Keycloak links Google   │
     │                              │      account to existing     │
     │                              │      Keycloak account        │
     │                              │                              │
     │                              │ 8. Keycloak creates SSO      │
     │                              │    session + generates code  │
     │                              │                              │
     │ 9. Redirect back:            │                              │
     │    visa.doer.com/callback    │                              │
     │    ?code=AUTH_CODE            │                              │
     │ ◀────────────────────────────│                              │
     │                              │                              │
     │ 10. Exchange code for tokens │                              │
     │     (same as regular login)  │                              │
     │                              │                              │
     │ 11. Auth Service post-       │                              │
     │     processing:              │                              │
     │     - If new user: add to    │                              │
     │       xyz-visa org + assign  │                              │
     │       end_user roles         │                              │
     │     - If existing: proceed   │                              │
```

**How does Keycloak know which tenant to associate?**

The `client_id=doer-visa` in the initial auth request tells Keycloak which product. The Auth Service maps the product to the tenant context (from the frontend's referrer or a query parameter like `tenant=xyz-visa`).

After the social login creates a user, the Auth Service uses the Admin API to add them to the correct organization and assign roles.

---

## 9. MFA / Two-Factor Authentication

**Scenario**: User logs in and MFA (TOTP) is required.

**Actor**: Any user with MFA enabled

With Authorization Code Flow, MFA is handled entirely by Keycloak — no custom code needed.

```
Doer-Visa Frontend              Keycloak (Themed Pages)
(visa.doer.com)                (auth.doer.com)
     │                              │
     │ 1. Redirect to Keycloak      │
     │    (Auth Code + PKCE)        │
     │ ────────────────────────────▶│
     │                              │
     │                              │ 2. Show themed login page
     │                              │    User enters phone + password
     │                              │
     │                              │ 3. Keycloak validates credentials
     │                              │    → Valid
     │                              │
     │                              │ 4. MFA required for this user?
     │                              │    → YES (TOTP configured)
     │                              │
     │                              │ 5. Show themed MFA page:
     │                              │    ┌────────────────────────┐
     │                              │    │    🏢 DOER VISA         │
     │                              │    │                        │
     │                              │    │  Two-Factor Auth       │
     │                              │    │                        │
     │                              │    │  Enter the code from   │
     │                              │    │  your authenticator    │
     │                              │    │  app:                  │
     │                              │    │                        │
     │                              │    │  [__ __ __ __ __ __]   │
     │                              │    │                        │
     │                              │    │  [    Verify     ]     │
     │                              │    │                        │
     │                              │    └────────────────────────┘
     │                              │
     │                              │ 6. User enters TOTP code
     │                              │    Keycloak validates → OK
     │                              │
     │                              │ 7. Create SSO session
     │                              │    Generate auth code
     │                              │
     │ 8. Redirect back with code   │
     │ ◀────────────────────────────│
     │                              │
     │ 9. Exchange code for tokens  │
     │    (same as regular flow)    │
```

**Advantage over ROPC**: With ROPC, you'd have to build the entire MFA challenge-response system yourself. With Auth Code flow, Keycloak handles it — you just theme the pages.

**MFA Options in Keycloak:**
- TOTP (Google Authenticator, Authy, etc.)
- WebAuthn / FIDO2 (hardware security keys, biometrics)
- SMS OTP (via Keycloak SPI or Auth Service)

**Enabling MFA per tenant/user:**
The Auth Service can configure MFA requirements via the Admin API:
- Enable as "required" for tenant_admin users
- Enable as "optional" for end_users
- Configure per-organization via authentication flow conditions

---

## 10. Password Reset

**Scenario**: User forgot their password.

### Option A: Email-Based Reset (Keycloak-Native)

```
Doer-Visa Frontend              Keycloak (Themed)
(visa.doer.com)                (auth.doer.com)
     │                              │
     │ 1. User clicks "Forgot       │
     │    password?" on login page   │
     │    (this link is on the       │
     │     Keycloak themed page)     │
     │                              │
     │                              │ 2. Keycloak shows themed
     │                              │    "Reset Password" page
     │                              │    User enters email
     │                              │
     │                              │ 3. Keycloak sends password
     │                              │    reset email with link
     │                              │
     │                              │ 4. User clicks link in email
     │                              │    → Keycloak themed
     │                              │    "Set New Password" page
     │                              │
     │                              │ 5. User sets new password
     │                              │    Keycloak updates it
     │                              │
     │                              │ 6. Redirect to login page
     │                              │    User logs in normally
```

### Option B: Phone/SMS-Based Reset (Custom via Auth Service)

```
Doer-Visa Frontend              Auth Service                         Keycloak
(visa.doer.com)
     │                                │                                  │
     │ 1. User clicks "Reset via      │                                  │
     │    Phone" (link on your        │                                  │
     │    product page, NOT on        │                                  │
     │    Keycloak page)              │                                  │
     │                                │                                  │
     │ POST /auth/forgot-password     │                                  │
     │ {                              │                                  │
     │   "phone": "+8801912345678",   │                                  │
     │   "project": "doer-visa"       │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ 1. Find user by phone            │
     │                                │    GET /admin/realms/doer/users  │
     │                                │    ?q=phone:+8801912345678       │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 2. User found                    │
     │                                │                                  │
     │                                │ 3. Generate OTP (6 digits)       │
     │                                │    Store in Redis:               │
     │                                │    { key: "otp:+880191...",      │
     │                                │      code: "583921",            │
     │                                │      attempts: 0,               │
     │                                │      expires: now + 5min }      │
     │                                │                                  │
     │                                │ 4. Send SMS: "Your Doer-Visa    │
     │                                │    reset code is 583921"         │
     │                                │                                  │
     │ { "otp_sent": true,            │                                  │
     │   "expires_in": 300 }          │                                  │
     │ ◀──────────────────────────────│                                  │
     │                                │                                  │
     │ User enters OTP + new password │                                  │
     │                                │                                  │
     │ POST /auth/reset-password      │                                  │
     │ {                              │                                  │
     │   "phone": "+8801912345678",   │                                  │
     │   "otp": "583921",             │                                  │
     │   "new_password": "***"        │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ 5. Verify OTP from Redis         │
     │                                │    - Code matches? YES           │
     │                                │    - Expired? NO                 │
     │                                │    - Max attempts? NO            │
     │                                │                                  │
     │                                │ 6. Reset password via Admin API  │
     │                                │    PUT /admin/realms/doer/       │
     │                                │    users/{id}/reset-password     │
     │                                │    { type: "password",           │
     │                                │      value: "***",               │
     │                                │      temporary: false }          │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 7. Delete OTP from Redis         │
     │                                │ 8. Log audit event               │
     │                                │                                  │
     │ { "success": true,             │                                  │
     │   "message": "Password reset.  │                                  │
     │    Please login." }            │                                  │
     │ ◀──────────────────────────────│                                  │
     │                                │                                  │
     │ → Redirect to login            │                                  │
     │   (Auth Code + PKCE flow)      │                                  │
```

---

## 11. Token Refresh

**Scenario**: Access token expired, need a new one without re-login.

**Actor**: Any authenticated user

```
Product Frontend                Auth Service                         Keycloak
     │                                │                                  │
     │ API call fails with 401        │                                  │
     │ (access token expired)         │                                  │
     │                                │                                  │
     │ POST /auth/refresh             │                                  │
     │ {                              │                                  │
     │   "refresh_token": "..."       │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ POST /realms/doer/protocol/      │
     │                                │ openid-connect/token             │
     │                                │ {                                │
     │                                │   grant_type: refresh_token,     │
     │                                │   refresh_token: "...",          │
     │                                │   client_id: "doer-visa",        │
     │                                │   client_secret: "..."           │
     │                                │ }                                │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ {                                │
     │                                │   access_token: "NEW",           │
     │                                │   refresh_token: "NEW",          │
     │                                │   expires_in: 300                │
     │                                │ }                                │
     │                                │ ◀────────────────────────────────│
     │                                │                                  │
     │ {                              │                                  │
     │   "access_token": "NEW",       │                                  │
     │   "refresh_token": "NEW",      │                                  │
     │   "expires_in": 300            │                                  │
     │ }                              │                                  │
     │ ◀──────────────────────────────│                                  │
     │                                │                                  │
     │ Retry failed request with      │                                  │
     │ new access token               │                                  │


Token Lifetimes:
────────────────
Access Token:   5-15 minutes
Refresh Token:  30 min - 8 hours (configurable per client in Keycloak)
SSO Session:    8-24 hours (configurable per realm)

When refresh token also expires → user must re-login (Auth Code flow).
Thanks to SSO, if session cookie is still valid, re-login is instant (no credentials).
```

---

## 12. Logout — Single Logout Across Products

**Scenario**: User logs out from Doer-Visa. All other product sessions should also end.

**Actor**: Any authenticated user

```
Doer-Visa Frontend              Auth Service                     Keycloak
     │                                │                              │
     │ 1. User clicks "Logout"        │                              │
     │                                │                              │
     │ POST /auth/logout              │                              │
     │ { "refresh_token": "..." }     │                              │
     │ ──────────────────────────────▶│                              │
     │                                │                              │
     │                                │ Option A: Backend logout     │
     │                                │ POST /realms/doer/protocol/  │
     │                                │ openid-connect/logout        │
     │                                │ { refresh_token: "...",      │
     │                                │   client_id, client_secret } │
     │                                │ ──────────────────────────▶│
     │                                │                              │
     │                                │    Keycloak revokes tokens   │
     │                                │    and invalidates SSO       │
     │                                │    session                   │
     │                                │                              │
     │ { "logged_out": true }         │                              │
     │ ◀──────────────────────────────│                              │
     │                                │                              │
     │ 2. Frontend clears local       │                              │
     │    tokens (memory/storage)     │                              │
     │                                │                              │
     │ 3. Redirect to:                │                              │
     │    auth.doer.com/realms/doer/  │                              │
     │    protocol/openid-connect/    │                              │
     │    logout?                     │                              │
     │    post_logout_redirect_uri=   │                              │
     │    visa.doer.com               │                              │
     │ ────────────────────────────▶│                              │
     │                              │                              │
     │                              │ 4. Keycloak clears browser   │
     │                              │    session cookie on          │
     │                              │    auth.doer.com              │
     │                              │                              │
     │                              │ 5. Keycloak sends back-      │
     │                              │    channel logout to all      │
     │                              │    other clients (Doer-HRMS,  │
     │                              │    Doer-School, etc.)         │
     │                              │                              │
     │ 6. Redirect to visa.doer.com │                              │
     │ ◀────────────────────────────│                              │


Result:
- Doer-Visa: logged out (tokens cleared locally + revoked in Keycloak)
- Doer-HRMS: back-channel logout received → session invalidated
- Doer-School: back-channel logout received → session invalidated
- SSO session cookie: deleted from auth.doer.com

User must re-enter credentials to access ANY Doer product.
```

---

## 13. User Deactivation / Blocking

### Scenario A: Tenant Admin Disables an Employee

**Actor**: Tenant Admin

```
Doer-Visa Admin Panel           Auth Service                         Keycloak
     │                                │                                  │
     │ PUT /api/tenants/xyz-visa/     │                                  │
     │     users/{uid}/disable        │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ 1. Verify caller is tenant_admin │
     │                                │    of xyz-visa (from JWT)        │
     │                                │                                  │
     │                                │ 2. Verify target user belongs    │
     │                                │    to xyz-visa org (prevent      │
     │                                │    cross-tenant manipulation)    │
     │                                │                                  │
     │                                │ 3. Disable user in Keycloak      │
     │                                │    PUT /admin/realms/doer/       │
     │                                │    users/{uid}                   │
     │                                │    { "enabled": false }          │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 4. Revoke all active sessions    │
     │                                │    POST /admin/realms/doer/      │
     │                                │    users/{uid}/logout            │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 5. Log audit event               │
     │                                │                                  │
     │ { "disabled": true }           │                                  │
     │ ◀──────────────────────────────│                                  │

Immediate effect:
- User's existing tokens become invalid on next validation
- User cannot login again (Keycloak rejects disabled accounts)
- User's SSO session is terminated
```

### Scenario B: Tenant Admin Re-Enables a User

```
     │ PUT /api/tenants/xyz-visa/     │                                  │
     │     users/{uid}/enable         │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ PUT /admin/realms/doer/          │
     │                                │ users/{uid}                      │
     │                                │ { "enabled": true }              │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │ { "enabled": true }            │                                  │
     │ ◀──────────────────────────────│                                  │

User can now login again.
```

---

## 14. Tenant Deactivation

**Scenario**: Doer platform admin deactivates XYZ Visa Agency (e.g., subscription expired, contract ended).

**Actor**: Platform Admin

```
Doer Admin Panel                Auth Service                         Keycloak
     │                                │                                  │
     │ PUT /api/tenants/xyz-visa/     │                                  │
     │     deactivate                 │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ 1. Mark tenant as "inactive"     │
     │                                │    in Auth DB                    │
     │                                │                                  │
     │                                │ 2. Get all members of xyz-visa   │
     │                                │    GET /admin/realms/doer/       │
     │                                │    organizations/{org-id}/       │
     │                                │    members                       │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 3. For each member:              │
     │                                │    a. Disable user               │
     │                                │       PUT /users/{uid}           │
     │                                │       { enabled: false }         │
     │                                │    b. Logout sessions            │
     │                                │       POST /users/{uid}/logout   │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 4. Log audit event               │
     │                                │                                  │
     │ {                              │                                  │
     │   "tenant": "xyz-visa",        │                                  │
     │   "status": "inactive",        │                                  │
     │   "users_disabled": 24         │                                  │
     │ }                              │                                  │
     │ ◀──────────────────────────────│                                  │

Immediate effect:
- ALL users of XYZ Visa Agency are disabled
- ALL active sessions are terminated
- No one from xyz-visa can login or access any API
- Data is preserved (not deleted) — can be reactivated later

Reactivation:
- PUT /api/tenants/xyz-visa/activate
- Enables all users, tenant is active again
```

---

## 15. User Belongs to Multiple Tenants

**Scenario**: A consultant works for both XYZ Visa Agency AND DEF Visa Corp on the same product.

**Actor**: User with multi-org membership

```
Keycloak State:
───────────────
User: consultant@gmail.com
├── Organization: xyz-visa-agency
│   └── Client Roles: doer-visa:process_visa
├── Organization: def-visa-corp
│   └── Client Roles: doer-visa:view_applications

JWT Token after login:
{
  "organization": {
    "xyz-visa-agency": { "id": "org-1" },
    "def-visa-corp": { "id": "org-2" }
  },
  "resource_access": {
    "doer-visa": {
      "roles": ["process_visa", "view_applications"]
    }
  }
}
```

**Frontend experience:**

```
┌────────────────────────────────────────────────────────┐
│  Doer Visa                    [Switch Organization ▼]  │
│                                ├── XYZ Visa Agency      │
│                                └── DEF Visa Corp        │
│                                                        │
│  Currently viewing: XYZ Visa Agency                    │
│                                                        │
│  [Applications]  [Reports]  [Settings]                 │
│                                                        │
│  ┌──────────────────────────────────────┐              │
│  │ #101 - Rahim Ahmed    [Process ▶]    │              │
│  │ #102 - Karim Hossain  [Process ▶]    │              │
│  └──────────────────────────────────────┘              │
│                                                        │
│  Switching to "DEF Visa Corp" shows ONLY their data.   │
│  The API call includes org_id from the selection.       │
│                                                        │
└────────────────────────────────────────────────────────┘
```

**API call with org context:**

```
GET /api/visa/applications
Headers:
  Authorization: Bearer <JWT>
  X-Organization-Id: org-1          ← frontend sends selected org

Product service:
  1. Read JWT → user belongs to org-1? YES (check organization claim)
  2. Filter: SELECT * FROM applications WHERE org_id = 'org-1'
  3. Return only XYZ Visa's data
```

---

## 16. User Belongs to Multiple Products

**Scenario**: Mega Corp subscribes to both Doer-HRMS and Doer-Visa. Their admin accesses both.

**Actor**: Tenant Admin with multi-product access

```
Keycloak State:
───────────────
User: admin@megacorp.com
├── Organization: mega-corp
│   └── Attributes: { products: ["doer-hrms", "doer-visa"] }
├── Realm Role: tenant_admin
├── Client Roles:
│   ├── doer-visa: [manage_all]        ← HAS access
│   ├── doer-hrms: [manage_all]        ← HAS access
│   └── doer-school: []                ← NO access
```

**Product Dashboard:**

```
┌──────────────────────────────────────────────────────────────┐
│  DOER Platform           Welcome, admin@megacorp.com [Logout] │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Your Products:                                               │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐        │
│  │  Doer HRMS   │  │  Doer Visa   │  │  Doer School │        │
│  │              │  │              │  │              │        │
│  │   Active     │  │   Active     │  │   Locked     │        │
│  │              │  │              │  │              │        │
│  │  [Open →]    │  │  [Open →]    │  │ [Contact Us] │        │
│  └──────────────┘  └──────────────┘  └──────────────┘        │
│                                                               │
│  Clicking "Open →" uses SSO — instant access, no login form.  │
│  Clicking "Contact Us" → sales inquiry for new subscription.  │
│                                                               │
└──────────────────────────────────────────────────────────────┘

How the dashboard knows what to show:
- Read JWT's resource_access → list products with roles
- Read JWT's organization attributes → get plan info
- Products without client roles → show as locked
```

---

## 17. Tenant Admin Manages Permissions

**Scenario**: XYZ Visa Agency admin changes an employee's role from "viewer" to "processor."

**Actor**: Tenant Admin

```
Doer-Visa Admin Panel           Auth Service                         Keycloak
     │                                │                                  │
     │ PUT /api/tenants/xyz-visa/     │                                  │
     │     users/{uid}/roles          │                                  │
     │ {                              │                                  │
     │   "add": ["process_visa"],     │                                  │
     │   "remove": ["view_            │                                  │
     │    applications"]              │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ Validations:                     │
     │                                │                                  │
     │                                │ 1. Caller has tenant_admin role  │
     │                                │    for xyz-visa? YES             │
     │                                │                                  │
     │                                │ 2. Target user belongs to        │
     │                                │    xyz-visa org? YES             │
     │                                │                                  │
     │                                │ 3. Requested roles belong to     │
     │                                │    doer-visa client? YES         │
     │                                │    (prevent assigning roles      │
     │                                │     from other products)         │
     │                                │                                  │
     │                                │ 4. Tenant admin allowed to       │
     │                                │    assign these roles?           │
     │                                │    (can't assign manage_all      │
     │                                │     or platform_admin) YES       │
     │                                │                                  │
     │                                │ 5. Remove old roles              │
     │                                │    DELETE /admin/realms/doer/    │
     │                                │    users/{uid}/role-mappings/    │
     │                                │    clients/{doer-visa-uuid}      │
     │                                │    [{ id: "...",                 │
     │                                │       name: "view_applications" }│]
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 6. Add new roles                 │
     │                                │    POST /admin/realms/doer/      │
     │                                │    users/{uid}/role-mappings/    │
     │                                │    clients/{doer-visa-uuid}      │
     │                                │    [{ id: "...",                 │
     │                                │       name: "process_visa" }]   │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 7. Log audit event               │
     │                                │                                  │
     │ { "updated": true,             │                                  │
     │   "roles": ["process_visa"] }  │                                  │
     │ ◀──────────────────────────────│                                  │

Note: The user's EXISTING access token still has old roles until it
expires (5-15 min). New role appears on next token refresh.
For immediate effect, you can force-logout the user's sessions.
```

---

## 18. Varying Registration Per Product

**Scenario**: Different products require different registration fields.

Each product configures its registration requirements in the Auth Service DB:

```
┌────────────────────────────────────────────────────────────────────────┐
│                        registration_configs table                      │
├──────────────┬──────────────────────────────────────────┬─────────────┤
│ product      │ required_fields                          │ validations │
├──────────────┼──────────────────────────────────────────┼─────────────┤
│ doer-visa    │ phone*, password*, full_name*,            │ BD phone    │
│              │ passport_no (optional)                    │ format      │
├──────────────┼──────────────────────────────────────────┼─────────────┤
│ doer-school  │ email*, password*, full_name*,            │ .edu email  │
│              │ student_id*                               │ preferred   │
├──────────────┼──────────────────────────────────────────┼─────────────┤
│ doer-hrms    │ email*, password*, employee_id*           │ invite-only │
│              │ (registration only via invitation)        │             │
└──────────────┴──────────────────────────────────────────┴─────────────┘
```

**Auth Service registration handler:**

```
POST /auth/register
{
  "project": "doer-visa",         ← determines which rules to apply
  "tenant": "xyz-visa",
  "phone": "+8801912345678",
  "password": "securePass123",
  "name": "Rahim Ahmed",
  "passport_no": "BR1234567"
}

Auth Service logic:

  1. Load config for "doer-visa"
  2. Validate required fields present: phone, password, name → OK
  3. Validate phone format (Bangladesh +880): → OK
  4. Validate password strength: → OK
  5. Check phone uniqueness in Keycloak: → OK
  6. Create user in Keycloak with:
     username = phone (for doer-visa)
     attributes = { phone, passport_no, user_type: "end_user" }
  7. Add to tenant org, assign default end_user roles for doer-visa


POST /auth/register
{
  "project": "doer-school",
  "tenant": "abc-school",
  "email": "student@abcschool.edu",
  "password": "securePass123",
  "name": "Fatima Khan",
  "student_id": "STU-2026-001"
}

Auth Service logic:

  1. Load config for "doer-school"
  2. Validate required fields: email, password, name, student_id → OK
  3. Validate email format: → OK
  4. Validate student_id format: → OK
  5. Check email uniqueness: → OK
  6. Create user in Keycloak with:
     username = email (for doer-school)
     attributes = { student_id, user_type: "end_user" }
  7. Add to tenant org, assign default end_user roles for doer-school
```

**The registration UI is FULLY in your control** (your React/Vue components). Only login goes through Keycloakify-themed pages.

---

## 19. Tenant Data Isolation

**Scenario**: Two visa agencies use Doer-Visa. They must NEVER see each other's data.

```
┌─────────────────────────────────────────────────────────────────────┐
│                     Doer-Visa Service Database                       │
│                                                                      │
│  applications table:                                                 │
│  ┌─────┬──────────────┬─────────────────┬─────────────┬────────┐    │
│  │ id  │ org_id       │ applicant_name  │ status      │ ...    │    │
│  ├─────┼──────────────┼─────────────────┼─────────────┼────────┤    │
│  │ 101 │ xyz-visa     │ Rahim Ahmed     │ processing  │ ...    │    │
│  │ 102 │ xyz-visa     │ Karim Hossain   │ approved    │ ...    │    │
│  │ 103 │ xyz-visa     │ Siam Khan       │ pending     │ ...    │    │
│  │ 201 │ def-visa     │ Sumon Roy       │ processing  │ ...    │    │
│  │ 202 │ def-visa     │ Rima Akter      │ approved    │ ...    │    │
│  └─────┴──────────────┴─────────────────┴─────────────┴────────┘    │
│                                                                      │
│  When XYZ admin calls GET /api/visa/applications:                    │
│                                                                      │
│    org_id = jwt.organization.keys()[0]   // "xyz-visa"               │
│                                                                      │
│    SELECT * FROM applications WHERE org_id = 'xyz-visa'              │
│    → Returns: #101, #102, #103 ONLY                                  │
│                                                                      │
│  When DEF admin calls the same endpoint:                             │
│                                                                      │
│    org_id = jwt.organization.keys()[0]   // "def-visa"               │
│                                                                      │
│    SELECT * FROM applications WHERE org_id = 'def-visa'              │
│    → Returns: #201, #202 ONLY                                        │
│                                                                      │
│  NEVER trust a client-provided org_id.                               │
│  ALWAYS read from the JWT token (which Keycloak signed).             │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 20. Platform Admin Operations

**Scenario**: Doer platform admin needs to manage the entire system.

**Actor**: Platform Admin (Doer staff)

```
Platform Admin Capabilities:
─────────────────────────────

1. Tenant Management
   POST   /api/tenants                    → Create new tenant (onboard client)
   GET    /api/tenants                    → List all tenants
   GET    /api/tenants/:id                → Get tenant details
   PUT    /api/tenants/:id                → Update tenant (plan, limits)
   PUT    /api/tenants/:id/activate       → Activate tenant
   PUT    /api/tenants/:id/deactivate     → Deactivate tenant
   DELETE /api/tenants/:id                → Delete tenant (dangerous)

2. Cross-Tenant User Management
   GET    /api/platform/users             → Search users across all tenants
   GET    /api/platform/users/:uid        → Get any user's details
   PUT    /api/platform/users/:uid        → Modify any user
   DELETE /api/platform/users/:uid        → Remove any user

3. System Health & Analytics
   GET    /api/platform/stats             → Total users, tenants, active sessions
   GET    /api/platform/audit-logs        → System-wide audit trail
   GET    /api/platform/products          → Product health and usage

4. Keycloak Admin Console
   Platform admins also have access to Keycloak's admin console
   at admin.doer.com for direct realm management (emergency use).

All platform admin endpoints require:
- JWT with realm role: platform_admin
- APISIX validates this before proxying to Auth Service
```

---

## 21. Product Service — How It Uses JWT

**Scenario**: Doer-Visa service receives an API request. How does it use the JWT?

```
Doer-Visa Service receives request (already authenticated by APISIX):

  Headers:
    Authorization: Bearer eyJhbG...
    X-Organization-Id: xyz-visa (if multi-org user selected one)

  JWT payload (decoded by service):
  {
    "sub": "user-uuid-123",
    "realm_access": { "roles": ["tenant_employee"] },
    "resource_access": {
      "doer-visa": { "roles": ["process_visa", "view_applications"] }
    },
    "organization": {
      "xyz-visa-agency": { "id": "org-uuid-456" }
    },
    "preferred_username": "+8801811111111",
    "user_type": "tenant_employee"
  }

  Service logic:

  // 1. Extract org_id (for data isolation)
  orgId = getOrgFromJwt(jwt)  // "org-uuid-456"

  // 2. Extract user roles (for feature gating)
  roles = jwt.resource_access["doer-visa"].roles
  // ["process_visa", "view_applications"]

  // 3. Extract user type (for UI/logic branching)
  userType = jwt.user_type  // "tenant_employee"

  // 4. Example: List applications
  GET /api/visa/applications
  → SELECT * FROM applications WHERE org_id = :orgId
  → Returns only xyz-visa's applications

  // 5. Example: Process a visa (check role)
  PUT /api/visa/applications/101/process
  → if "process_visa" not in roles → 403
  → if application.org_id != orgId → 404
  → else → process the application

  // 6. Example: Show admin panel link
  → if userType == "tenant_admin" → show admin panel
  → if userType == "end_user" → show only customer features


THE SERVICE NEVER:
  ✗ Validates passwords
  ✗ Issues tokens
  ✗ Manages sessions
  ✗ Calls Keycloak directly
  ✗ Handles login/registration
  ✗ Manages roles or permissions

THE SERVICE ONLY:
  ✓ Reads JWT claims (already validated by APISIX)
  ✓ Filters data by org_id
  ✓ Checks roles for feature access
  ✓ Implements business logic
```

---

## 22. Subscription / Plan Enforcement

**Scenario**: Auth Service checks tenant plan limits before allowing operations.

```
Plan Definitions (in Auth Service DB):
──────────────────────────────────────

┌─────────────┬────────────┬──────────────┬──────────────┐
│ Plan        │ Max Users  │ Max Products │ Features     │
├─────────────┼────────────┼──────────────┼──────────────┤
│ basic       │ 10         │ 1            │ Standard     │
│ pro         │ 100        │ 2            │ + MFA, API   │
│ enterprise  │ 500        │ Unlimited    │ + Everything │
└─────────────┴────────────┴──────────────┴──────────────┘


Enforcement Points:
───────────────────

1. Registration (end user joins a tenant)
   → Auth Service checks: tenant_user_count < max_users?
   → If exceeded: "This organization has reached its user limit."

2. Tenant admin creates employee
   → Same user limit check

3. Adding a new product to a tenant
   → Auth Service checks: tenant_product_count < max_products?
   → If exceeded: "Upgrade your plan to add more products."

4. Feature gating
   → Auth Service checks plan features before enabling MFA, API access, etc.

All enforcement happens in the Auth Service, NOT in Keycloak.
Keycloak doesn't know about plans — it just stores users and roles.
```

---

## 23. Audit Trail

**Scenario**: Tracking who did what, when, where.

```
Audit Events Captured (in Auth Service DB):
───────────────────────────────────────────

Auth Events:
├── user.registered        { user_id, project, tenant, method: "phone" }
├── user.login.success     { user_id, project, ip, user_agent }
├── user.login.failed      { identifier, project, ip, reason }
├── user.logout            { user_id, project }
├── user.password.reset    { user_id, method: "sms" | "email" }
├── user.mfa.enabled       { user_id, mfa_type: "totp" }
└── user.social.linked     { user_id, provider: "google" }

Tenant Events:
├── tenant.created         { tenant_id, product, plan, created_by }
├── tenant.activated       { tenant_id, activated_by }
├── tenant.deactivated     { tenant_id, deactivated_by, reason }
├── tenant.plan.changed    { tenant_id, old_plan, new_plan }
└── tenant.user.limit.hit  { tenant_id, current_count, max_count }

User Management Events:
├── user.created           { user_id, tenant_id, created_by, user_type }
├── user.disabled          { user_id, tenant_id, disabled_by }
├── user.enabled           { user_id, tenant_id, enabled_by }
├── user.roles.changed     { user_id, added: [...], removed: [...], changed_by }
├── user.invited           { email, tenant_id, role, invited_by }
└── user.invitation.accepted { user_id, tenant_id, invitation_id }


Keycloak also maintains its own event log:
├── Login events (success, failure, logout)
├── Admin events (user CRUD, role changes, client config changes)
These can be queried via the Admin REST API or exported to external systems.


Example audit query:
GET /api/platform/audit-logs?
    tenant=xyz-visa&
    action=user.roles.changed&
    from=2026-02-01&
    to=2026-02-28

Response:
[
  {
    "timestamp": "2026-02-15T10:30:00Z",
    "actor": "boss@xyz.com",
    "actor_type": "tenant_admin",
    "action": "user.roles.changed",
    "target_user": "karim@xyz.com",
    "tenant": "xyz-visa",
    "details": {
      "added": ["process_visa"],
      "removed": ["view_applications"]
    }
  }
]
```

---

## 24. RBAC Enforcement — End to End

**Scenario**: Different users with different roles access the same endpoint. RBAC determines what happens.

**Actors**: Tenant Admin, Tenant Employee, End User

```
Endpoint: GET /api/visa/applications
────────────────────────────────────

User A: boss@xyz.com (tenant_admin, doer-visa:manage_all)
User B: karim@xyz.com (tenant_employee, doer-visa:view_applications)
User C: customer@gmail.com (end_user, doer-visa:view_own_status)
User D: student@abc.edu (end_user, doer-school:enroll_course — NO visa roles)


User A calls GET /api/visa/applications
─────────────────────────────────────────
  APISIX Layer:
    ✓ JWT valid
    ✓ Has doer-visa client roles → allowed through

  Doer-Visa Service:
    ✓ org_id = xyz-visa (from JWT)
    ✓ Role: manage_all → sees ALL applications for xyz-visa
    → Returns: [#101 Rahim, #102 Karim, #103 Siam, ...]
    → Also sees: admin panel, reports, settings


User B calls GET /api/visa/applications
─────────────────────────────────────────
  APISIX Layer:
    ✓ JWT valid
    ✓ Has doer-visa:view_applications → allowed through

  Doer-Visa Service:
    ✓ org_id = xyz-visa (from JWT)
    ✓ Role: view_applications → sees all applications (read-only)
    → Returns: [#101 Rahim, #102 Karim, #103 Siam, ...]
    → Does NOT see: admin panel, settings
    → Cannot: edit, approve, or delete applications


User C calls GET /api/visa/applications
─────────────────────────────────────────
  APISIX Layer:
    ✓ JWT valid
    ✓ Has doer-visa:view_own_status → allowed through

  Doer-Visa Service:
    ✓ org_id = xyz-visa (from JWT)
    ✓ Role: view_own_status → sees ONLY their own applications
    → Query: WHERE org_id = 'xyz-visa' AND user_id = 'customer-uuid'
    → Returns: [#103 — their application only]
    → Does NOT see: other people's applications


User D calls GET /api/visa/applications
─────────────────────────────────────────
  APISIX Layer:
    ✓ JWT valid
    ✗ Has NO doer-visa client roles (only doer-school roles)
    → 403 Forbidden — request NEVER reaches Doer-Visa Service
```

### Write Operation RBAC Example

```
Endpoint: PUT /api/visa/applications/101/approve
────────────────────────────────────────────────

User A: boss@xyz.com (tenant_admin, doer-visa:manage_all)
  APISIX: ✓ → Doer-Visa Service: ✓ manage_all includes approve → 200 OK

User B: karim@xyz.com (tenant_employee, doer-visa:process_visa)
  APISIX: ✓ → Doer-Visa Service: ✗ process_visa ≠ approve_visa → 403 Forbidden

User C: customer@gmail.com (end_user, doer-visa:apply_visa)
  APISIX: ✓ → Doer-Visa Service: ✗ apply_visa ≠ approve_visa → 403 Forbidden


Endpoint: POST /api/visa/applications (submit new application)
──────────────────────────────────────────────────────────────

User A: boss@xyz.com (tenant_admin)
  APISIX: ✓ → Service: ✓ manage_all allows everything → 201 Created

User C: customer@gmail.com (end_user, doer-visa:apply_visa)
  APISIX: ✓ → Service: ✓ apply_visa → 201 Created
  → Application created with org_id = jwt.org_id, user_id = jwt.sub

User B: karim@xyz.com (tenant_employee, doer-visa:process_visa)
  APISIX: ✓ → Service: ✗ process_visa ≠ apply_visa → 403 Forbidden
  → Employees process applications, they don't submit them
```

### Cross-Tenant RBAC Prevention

```
User: boss@xyz.com (tenant_admin of xyz-visa)

Tries: GET /api/visa/applications?org_id=def-visa
       (attempting to see competitor's data)

  Doer-Visa Service:
    org_id from JWT = "xyz-visa"
    IGNORES the query param org_id = "def-visa"
    ALWAYS uses JWT org_id for filtering

  → Returns: only xyz-visa applications
  → boss@xyz.com can NEVER see def-visa data
  → even if they craft the request manually


Tries: PUT /api/tenants/def-visa/users/123/disable
       (attempting to disable competitor's user)

  Auth Service:
    Caller's org from JWT = "xyz-visa"
    Target org = "def-visa"
    "xyz-visa" ≠ "def-visa" → 403 Forbidden
    "You can only manage users in your own organization"
```

---

## 25. Role Assignment Flow

**Scenario**: Complete lifecycle of how roles get assigned and changed.

### Initial Role Assignment (During User Creation)

```
End User Self-Registers for Doer-Visa:
───────────────────────────────────────
  Auth Service reads registration_configs for "doer-visa":
    default_roles: ["apply_visa", "view_own_status"]

  Creates user → assigns:
    realm role:  end_user
    client roles: doer-visa:apply_visa, doer-visa:view_own_status

  User's JWT will contain:
    realm_access.roles = ["end_user"]
    resource_access.doer-visa.roles = ["apply_visa", "view_own_status"]


Tenant Admin Creates Employee:
──────────────────────────────
  Admin specifies roles: ["process_visa", "view_applications"]

  Creates user → assigns:
    realm role:  tenant_employee
    client roles: doer-visa:process_visa, doer-visa:view_applications


Tenant Onboarding (Admin User):
───────────────────────────────
  Auth Service automatically assigns:
    realm role:  tenant_admin
    client roles: doer-visa:manage_all
```

### Role Promotion (Employee Gets More Permissions)

```
Doer-Visa Admin Panel           Auth Service                         Keycloak
     │                                │                                  │
     │ Tenant admin wants to promote  │                                  │
     │ Karim from viewer to processor │                                  │
     │                                │                                  │
     │ PUT /api/tenants/xyz-visa/     │                                  │
     │     users/{karim-id}/roles     │                                  │
     │ {                              │                                  │
     │   "add": ["process_visa",      │                                  │
     │           "manage_applications"]│                                  │
     │   "remove": ["view_            │                                  │
     │    applications"]              │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ Validate:                        │
     │                                │ 1. Caller = tenant_admin of      │
     │                                │    xyz-visa? ✓                   │
     │                                │ 2. Karim in xyz-visa org? ✓      │
     │                                │ 3. All roles belong to           │
     │                                │    doer-visa client? ✓           │
     │                                │ 4. Not assigning manage_all      │
     │                                │    or platform_admin? ✓          │
     │                                │    (manage_applications is OK)   │
     │                                │                                  │
     │                                │ Remove old roles:                │
     │                                │ DELETE /admin/realms/doer/       │
     │                                │ users/{karim}/role-mappings/     │
     │                                │ clients/{visa-client-uuid}       │
     │                                │ [{"name":"view_applications"}]   │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ Add new roles:                   │
     │                                │ POST /admin/realms/doer/         │
     │                                │ users/{karim}/role-mappings/     │
     │                                │ clients/{visa-client-uuid}       │
     │                                │ [{"name":"process_visa"},        │
     │                                │  {"name":"manage_applications"}] │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ Audit log:                       │
     │                                │ { action: "user.roles.changed",  │
     │                                │   actor: boss@xyz.com,           │
     │                                │   target: karim@xyz.com,         │
     │                                │   added: [...], removed: [...] } │
     │                                │                                  │
     │ { "updated": true }            │                                  │
     │ ◀──────────────────────────────│                                  │

When does the change take effect?
─────────────────────────────────
  Karim's EXISTING access token still has old roles
  (tokens are stateless — Keycloak can't revoke them mid-flight)

  The change appears when:
  a) Access token expires (5-15 min) + refresh → new token has new roles
  b) OR: Force logout Karim's session → next login has new roles

  For immediate effect, the admin panel can offer:
  "Force re-login for this user?" → calls POST /admin/.../users/{id}/logout
```

### Using Composite Roles (Role Presets)

```
Instead of assigning individual roles, tenant admin uses presets:

Admin Panel UI:
┌──────────────────────────────────────────────────┐
│  Assign Role to Karim Hossain                    │
│                                                  │
│  ○ Basic Staff                                   │
│    (View applications only)                      │
│                                                  │
│  ● Senior Staff                                  │
│    (View + process + manage applications)        │
│                                                  │
│  ○ Custom                                        │
│    (Pick individual permissions)                 │
│                                                  │
│  [   Save   ]                                    │
└──────────────────────────────────────────────────┘

"Senior Staff" is a composite role = [view_applications,
  process_visa, manage_applications]

Selecting it assigns all three roles at once via Keycloak.
```

### What Tenant Admin CANNOT Do (RBAC on Role Assignment Itself)

```
Auth Service prevents:

  ✗ Assign manage_all to others (only platform admin can)
  ✗ Assign platform_admin realm role
  ✗ Assign roles from other products (doer-school roles)
  ✗ Assign roles to users outside their organization
  ✗ Remove their own tenant_admin role (prevent lockout)
  ✗ Create more users than plan allows

These are validated BEFORE any Keycloak Admin API call is made.
```

---

## 26. New Product Integration — Onboarding a New Doer Product

**Scenario**: Doer company decides to launch "Doer-Marketplace." How does the dev team integrate it with the central auth?

**Actor**: Doer Platform Engineer / Dev Team

```
This is a CONFIGURATION workflow, NOT a coding workflow.
The dev team does NOT modify the Auth Service, Keycloak, or APISIX code.

Step 1: Register Clients in Keycloak (Admin Console)
─────────────────────────────────────────────────────
  → Create "doer-marketplace" client (public, PKCE enabled)
  → Create "doer-marketplace-backend" client (confidential)
  → Set redirect URIs, web origins
  → Time: ~5 minutes

Step 2: Define Client Roles (Admin Console)
───────────────────────────────────────────
  → Add roles under doer-marketplace client:
    manage_all, manage_store, manage_orders,
    list_product, buy_product, view_own_orders
  → Create composite role presets:
    seller_basic = [list_product, view_own_orders]
    buyer = [buy_product, view_own_orders]
  → Time: ~5 minutes

Step 3: Add Registration Config (Auth Service DB)
──────────────────────────────────────────────────
  → INSERT into registration_configs:
    product: "doer-marketplace"
    required_fields: ["email", "password", "name", "shop_name"]
    default_roles: ["buy_product", "view_own_orders"]
    self_registration_enabled: true
  → Time: ~2 minutes

Step 4: Add APISIX Route (APISIX Admin API)
────────────────────────────────────────────
  → Create route for /api/marketplace/*
    with openid-connect + authz-keycloak plugins
    pointing upstream to doer-marketplace-service
  → Time: ~5 minutes

Step 5: Create Keycloakify Theme Variant
────────────────────────────────────────
  → Add doer-marketplace theme (logo, colors)
  → Build and deploy JAR to Keycloak
  → Assign theme to doer-marketplace client
  → Time: ~1-2 hours (design dependent)

Step 6: Build and Deploy the Marketplace Service
─────────────────────────────────────────────────
  → Standard microservice (NestJS, Spring Boot, Go, etc.)
  → JWT claims middleware (decode, extract org_id + roles)
  → Business logic (products, orders, stores)
  → Filter ALL queries by org_id from JWT
  → Add to docker-compose
  → Time: depends on business logic complexity

TOTAL CENTRAL AUTH INTEGRATION EFFORT:
  Configuration: ~20 minutes
  Theme: ~1-2 hours
  Product service auth code: 0 lines
  Business logic: you focus 100% on this
```

### What the New Product's Frontend Looks Like

```
// React example — the ENTIRE auth integration for the new product

import { useAuth } from './hooks/useAuth';  // shared OIDC hook

function App() {
  const { isAuthenticated, login, logout, token, user } = useAuth({
    authority: 'https://auth.doer.com/realms/doer',
    clientId: 'doer-marketplace',
    redirectUri: 'https://marketplace.doer.com/callback',
    scope: 'openid organization'
  });

  if (!isAuthenticated) {
    return <button onClick={login}>Login</button>;
    // This redirects to Keycloak's themed login page
    // SSO: if user already logged in to doer-visa, this is instant
  }

  // User is authenticated. Read roles from token:
  const roles = token.resource_access?.['doer-marketplace']?.roles || [];
  const orgId = Object.keys(token.organization || {})[0];

  return (
    <div>
      {roles.includes('manage_store') && <AdminPanel />}
      {roles.includes('list_product') && <SellerDashboard />}
      {roles.includes('buy_product') && <BuyerDashboard />}
      <button onClick={logout}>Logout</button>
    </div>
  );
}

// API calls automatically include the token:
async function fetchOrders() {
  const res = await fetch('/api/marketplace/orders', {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  // APISIX validates token, checks roles, proxies to service
  // Service filters by org_id from JWT
  return res.json();
}
```

That's the ENTIRE auth integration on the frontend. Everything else is business logic.

---

## 27. Existing Tenant Gets Access to a New Product

**Scenario**: Mega Corp already uses Doer-HRMS. Now they also want Doer-Marketplace.

**Actor**: Platform Admin (Doer staff)

```
Doer Admin Panel                Auth Service                         Keycloak
     │                                │                                  │
     │ PUT /api/tenants/mega-corp/    │                                  │
     │     products                   │                                  │
     │ {                              │                                  │
     │   "add_product":               │                                  │
     │     "doer-marketplace"         │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ 1. Check plan allows more        │
     │                                │    products (enterprise:         │
     │                                │    unlimited → OK)               │
     │                                │                                  │
     │                                │ 2. Update org attributes         │
     │                                │    in Keycloak:                  │
     │                                │    products: ["doer-hrms"]       │
     │                                │    →                             │
     │                                │    products: ["doer-hrms",       │
     │                                │               "doer-marketplace"]│
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 3. Assign doer-marketplace:      │
     │                                │    manage_all to mega-corp's     │
     │                                │    tenant_admin                  │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │                                │ 4. Update Auth DB:               │
     │                                │    mega-corp products updated    │
     │                                │                                  │
     │ {                              │                                  │
     │   "tenant": "mega-corp",       │                                  │
     │   "products": [                │                                  │
     │     "doer-hrms",               │                                  │
     │     "doer-marketplace"         │                                  │
     │   ]                            │                                  │
     │ }                              │                                  │
     │ ◀──────────────────────────────│                                  │

Result:
─────────
  Mega Corp's admin can now:
  ✓ Access Doer-Marketplace (SSO — instant, no re-login)
  ✓ Create employees for Doer-Marketplace
  ✓ Assign marketplace roles to their staff
  ✓ Product dashboard shows Doer-Marketplace as "Active"

  Mega Corp's EXISTING employees:
  → Still only have doer-hrms roles
  → Admin must explicitly grant them doer-marketplace roles
  → They do NOT auto-get marketplace access
```

---

## 28. Existing User Gets Access to a New Product

**Scenario**: Karim already works for Mega Corp on Doer-HRMS. The admin now gives him access to Doer-Marketplace too.

**Actor**: Tenant Admin (Mega Corp admin)

```
Doer Admin Panel                Auth Service                         Keycloak
     │                                │                                  │
     │ Mega Corp admin sees the       │                                  │
     │ user management panel:         │                                  │
     │                                │                                  │
     │ ┌────────────────────────────────────────────────────────┐       │
     │ │ Karim Hossain — karim@megacorp.com                    │       │
     │ │                                                        │       │
     │ │ Current Access:                                        │       │
     │ │   Doer HRMS: ✅ [apply_leave, view_payslip]            │       │
     │ │   Doer Marketplace: ❌ No access                       │       │
     │ │                                                        │       │
     │ │ [+ Add Product Access]                                 │       │
     │ └────────────────────────────────────────────────────────┘       │
     │                                │                                  │
     │ Admin clicks "+ Add Product    │                                  │
     │ Access" → selects              │                                  │
     │ "Doer Marketplace" →           │                                  │
     │ selects role "seller_basic"    │                                  │
     │                                │                                  │
     │ PUT /api/tenants/mega-corp/    │                                  │
     │     users/{karim-id}/roles     │                                  │
     │ {                              │                                  │
     │   "product": "doer-marketplace"│                                  │
     │   "add": ["list_product",      │                                  │
     │           "view_own_orders"]   │                                  │
     │ }                              │                                  │
     │ ──────────────────────────────▶│                                  │
     │                                │                                  │
     │                                │ Validate:                        │
     │                                │ 1. Caller is tenant_admin ✓      │
     │                                │ 2. Karim in mega-corp org ✓      │
     │                                │ 3. mega-corp has                  │
     │                                │    doer-marketplace product ✓    │
     │                                │ 4. Roles belong to               │
     │                                │    doer-marketplace client ✓     │
     │                                │                                  │
     │                                │ Assign roles:                    │
     │                                │ POST /admin/realms/doer/         │
     │                                │ users/{karim}/role-mappings/     │
     │                                │ clients/{marketplace-uuid}       │
     │                                │ [{"name":"list_product"},        │
     │                                │  {"name":"view_own_orders"}]     │
     │                                │ ────────────────────────────────▶│
     │                                │                                  │
     │ { "updated": true }            │                                  │
     │ ◀──────────────────────────────│                                  │

Result:
─────────
  Karim's JWT (after next token refresh) now contains:

  resource_access: {
    "doer-hrms": {
      "roles": ["apply_leave", "view_payslip"]      ← existing
    },
    "doer-marketplace": {
      "roles": ["list_product", "view_own_orders"]   ← NEW
    }
  }

  Karim can now:
  ✓ Access Doer-HRMS (as before)
  ✓ Access Doer-Marketplace (SSO — instant)
  ✓ List products and view his orders on marketplace
  ✗ Still cannot access Doer-Visa, Doer-School (no roles)

  Product dashboard now shows:
  ┌──────────────┐  ┌──────────────────┐  ┌──────────────┐
  │  Doer HRMS   │  │ Doer Marketplace │  │  Doer Visa   │
  │   ✅ Active   │  │   ✅ Active       │  │   🔒 Locked  │
  │  [Open →]    │  │  [Open →]        │  │              │
  └──────────────┘  └──────────────────┘  └──────────────┘
```
