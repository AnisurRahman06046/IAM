# Doer IAM — Developer Setup Guide

A step-by-step guide for any developer to set up the Doer IAM infrastructure from scratch. This covers Phase 1 (Infrastructure) and Phase 2 (Keycloak Realm Configuration).

---

## Table of Contents

- [Glossary — What Does Each Term Mean?](#glossary--what-does-each-term-mean)
- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Project Structure](#project-structure)
- [Phase 1 — Infrastructure Setup](#phase-1--infrastructure-setup)
  - [Step 1.1 — Clone and Understand the Project](#step-11--clone-and-understand-the-project)
  - [Step 1.2 — Install PostgreSQL](#step-12--install-postgresql)
  - [Step 1.3 — Create Databases and Users](#step-13--create-databases-and-users)
  - [Step 1.4 — Download Keycloak](#step-14--download-keycloak)
  - [Step 1.5 — Configure Keycloak](#step-15--configure-keycloak)
  - [Step 1.6 — Set Up Environment Variables](#step-16--set-up-environment-variables)
  - [Step 1.7 — Bootstrap Keycloak Admin User](#step-17--bootstrap-keycloak-admin-user)
  - [Step 1.8 — Start Keycloak](#step-18--start-keycloak)
  - [Step 1.9 — Start Docker Services](#step-19--start-docker-services)
  - [Step 1.10 — Verify Everything is Running](#step-110--verify-everything-is-running)
- [Phase 2 — Keycloak Realm Configuration](#phase-2--keycloak-realm-configuration)
  - [What Gets Created (and Why)](#what-gets-created-and-why)
  - [Step 2.1 — Run the Realm Setup Script](#step-21--run-the-realm-setup-script)
  - [Step 2.2 — Save Client Secrets](#step-22--save-client-secrets)
  - [Step 2.3 — Verify in Keycloak Admin Console](#step-23--verify-in-keycloak-admin-console)
  - [Step 2.4 — Understand the Token Structure](#step-24--understand-the-token-structure)
- [Day-to-Day Commands](#day-to-day-commands)
- [Troubleshooting](#troubleshooting)
- [Service URLs Quick Reference](#service-urls-quick-reference)

---

## Glossary — What Does Each Term Mean?

Before diving in, here is every term you will encounter in this setup, explained simply.

### Identity & Authentication

| Term | What It Is | Analogy |
|------|-----------|---------|
| **Keycloak** | An open-source Identity Provider (IdP). It manages users, passwords, login flows, and issues security tokens. Think of it as the "login server" for all Doer products. | The security desk of a building — checks your ID before letting you in |
| **Realm** | A namespace in Keycloak that groups users, clients, roles, and settings. We use one realm called `doer` for all products. | A company within a building — has its own employee list and access rules |
| **Client** | An application registered in Keycloak. Each frontend app or backend service that interacts with auth is a "client". | A door with a specific keycard reader — each app has its own entry point |
| **Public Client** | A client where the source code is visible to users (browser apps, mobile apps). Cannot keep secrets safe, so it uses PKCE instead. | A glass door — anyone can see inside, so you need a different security method |
| **Confidential Client** | A client that runs on a server and can safely store secrets (backend services). Gets a `client_secret` for authentication. | A vault room — only authorized personnel have the combination |
| **Bearer-Only Client** | A client that only validates tokens but never initiates login. Used for backend APIs. | A checkpoint guard — only checks your badge, doesn't issue badges |
| **Service Account** | A special account for machine-to-machine communication. Our Auth Service uses one to call Keycloak's Admin API. | A robot employee with its own badge — acts on behalf of the system |

### Authorization & Roles

| Term | What It Is | Example |
|------|-----------|---------|
| **Realm Role** | A global role that applies across all products. Defines "what type of user" someone is. | `tenant_admin` — this user administrates a tenant, regardless of which product |
| **Client Role** | A role specific to one product/client. Defines "what this user can do within this product". | `doer-visa/approve_visa` — can approve visa applications, only relevant to Doer Visa |
| **Composite Role** | A role that bundles multiple other roles together. Used as presets. | `staff_senior` = `view_applications` + `process_visa` + `manage_applications` |
| **Default Role** | A role automatically assigned to every new user. | `end_user` is given to all users by default |
| **RBAC** | Role-Based Access Control — controlling who can do what based on their roles. | If you have the `approve_visa` role, you can approve visas. If not, you get a 403 error. |

### OAuth 2.0 & Tokens

| Term | What It Is | Why It Matters |
|------|-----------|---------------|
| **OAuth 2.0** | An industry-standard protocol for authorization. Defines how apps get permission to act on behalf of users. | It is the framework Keycloak uses under the hood |
| **OpenID Connect (OIDC)** | A layer on top of OAuth 2.0 that adds identity (who you are). Keycloak is an OIDC provider. | OAuth tells "what you can access", OIDC tells "who you are" |
| **Authorization Code Flow** | The recommended login flow. User is redirected to Keycloak, enters credentials there, then is redirected back with a temporary code. The code is exchanged for tokens. | Like going through a security checkpoint — you show ID at the desk, they give you a badge |
| **PKCE** (Proof Key for Code Exchange) | An extra security layer for public clients. The app generates a random `code_verifier`, hashes it, and sends the hash. Only the app that created the hash can exchange the code. | Like a sealed envelope — only the sender knows what's inside |
| **JWT** (JSON Web Token) | A signed JSON object that contains user info and permissions. It is the "access badge" your app sends with every API request. | Your building access badge — has your photo, name, floor access printed on it |
| **Access Token** | A short-lived JWT (15 minutes in our config) that grants access to APIs. Sent in the `Authorization: Bearer <token>` header. | A visitor badge that expires at end of day |
| **Refresh Token** | A longer-lived token used to get a new access token without re-logging in. Stored securely, never sent to APIs. | A renewal slip — show it to get a new visitor badge without going through security again |
| **Token Claims** | Key-value pairs inside a JWT. Our tokens contain `realm_access.roles`, `resource_access`, and `organization`. | The information printed on your badge |
| **Client Scope** | Defines which claims are included in a token. The `organization` scope ensures the org claim appears. | A badge template — determines what info gets printed |
| **Scope Mapping** | Controls which roles can appear in a client's tokens when `fullScopeAllowed` is off. Only explicitly mapped roles are included. | A filter — even if you have 10 permissions, only relevant ones are shown for this specific door |
| **Direct Access Grants (ROPC)** | A flow where the app directly sends username+password to Keycloak. Being deprecated in OAuth 2.1. We keep this OFF. | Giving your house key to a stranger to unlock the door for you — risky |

### Multi-Tenancy

| Term | What It Is | Example |
|------|-----------|---------|
| **Organization** | A Keycloak entity (available since v25) that represents a tenant — a company/client who has subscribed to a Doer product. | "ABC Visa Agency" is an organization in the `doer` realm |
| **Tenant** | A client/company that uses a Doer product. Each tenant has their own users, their own data, and can't see other tenants' data. | ABC Visa Agency can't see XYZ Visa Agency's applications |
| **Multi-Tenant** | The ability to serve multiple tenants from a single deployment. All tenants share the same Keycloak realm but are isolated via Organizations. | One building, many companies, each on its own floor |
| **SSO** (Single Sign-On) | Log in once, access all products. If you log into Doer Visa, you don't need to log in again for Doer Admin or Doer School. | One badge works for all buildings in the campus |

### Infrastructure

| Term | What It Is | Why We Use It |
|------|-----------|--------------|
| **Docker** | A tool that runs applications in lightweight, isolated containers. Each service gets its own container with its own dependencies. | A shipping container for software — everything the app needs is packed inside |
| **Docker Compose** | A tool for defining and running multi-container Docker applications using a YAML file. | A manifest that says "start these 5 containers together" |
| **PostgreSQL** | An open-source relational database. We run it locally (not in Docker) for easier debugging. | The filing cabinet that stores all user data, tenant info, etc. |
| **Redis** | An in-memory data store. We use it for OTP codes, rate limiting, and caching. | A sticky note board — fast to read/write, but data doesn't survive a power outage (unless configured) |
| **APISIX** | An open-source API Gateway. It sits between the internet and our services, handling authentication, rate limiting, and routing. | The reception desk — checks your badge, directs you to the right department, and limits how many people go through |
| **etcd** | A distributed key-value store. APISIX uses it to store its configuration (routes, plugins). | APISIX's filing cabinet — stores all the routing rules |
| **Prometheus** | A monitoring system that collects metrics (request counts, latencies, error rates) from our services. | A CCTV control room — watches everything happening |
| **Grafana** | A visualization tool that turns Prometheus metrics into dashboards and graphs. | The TV monitors in the CCTV room — makes raw data visual and useful |
| **host.docker.internal** | A special DNS name that Docker containers use to reach services running on the host machine (your computer). | A "call home" phone number that containers use to reach your local PostgreSQL and Keycloak |

---

## Architecture Overview

```
                     ┌─────────────────────────────────────┐
                     │          Your Computer (Host)        │
                     │                                      │
   ┌──────────────┐  │  ┌──────────────┐  ┌──────────────┐ │
   │  Browser /   │──┼──│  Keycloak    │  │  PostgreSQL  │ │
   │  Frontend    │  │  │  :8080       │──│  :5432       │ │
   │  App         │  │  │  (local)     │  │  (local)     │ │
   └──────────────┘  │  └──────────────┘  └──────────────┘ │
          │          │                                      │
          │          │  ┌──── Docker Compose ────────────┐  │
          │          │  │                                │  │
          ▼          │  │  ┌────────┐   ┌──────┐        │  │
   ┌──────────────┐  │  │  │ APISIX │──▶│ etcd │        │  │
   │  APISIX      │◀─┼──│  │ :9080  │   │      │        │  │
   │  (Gateway)   │  │  │  └────────┘   └──────┘        │  │
   └──────────────┘  │  │                                │  │
          │          │  │  ┌────────┐   ┌────────┐       │  │
          │          │  │  │ Redis  │   │Promethe│       │  │
          │          │  │  │ :6379  │   │us:9090 │       │  │
          │          │  │  └────────┘   └────────┘       │  │
          │          │  │                   │             │  │
          ▼          │  │               ┌────────┐       │  │
   ┌──────────────┐  │  │               │Grafana │       │  │
   │  Auth Service│  │  │               │ :3000  │       │  │
   │  / Product   │  │  │               └────────┘       │  │
   │  Services    │  │  └────────────────────────────────┘  │
   └──────────────┘  └─────────────────────────────────────┘
```

**Why Keycloak runs locally (not in Docker)?**
Debugging Java applications inside Docker is difficult — you can't easily attach a debugger, view logs interactively, or restart quickly. Running Keycloak locally gives direct control.

**Why PostgreSQL runs locally (not in Docker)?**
Same reason — easier to inspect data, run queries, and debug schema issues. Also avoids Docker volume permission headaches.

**Why everything else is in Docker?**
Redis, APISIX, etcd, Prometheus, and Grafana are infrastructure tools that "just work" in Docker. We don't modify or debug them — we just configure them. Docker keeps them isolated and easily reproducible.

---

## Prerequisites

Install the following before starting:

| Tool | Required Version | How to Install (Ubuntu/Debian) | How to Verify |
|------|-----------------|-------------------------------|--------------|
| **Docker** | 20.10+ | [docs.docker.com/engine/install](https://docs.docker.com/engine/install/) | `docker --version` |
| **Docker Compose** | v2 (bundled with Docker) | Comes with Docker Desktop or `apt install docker-compose-plugin` | `docker compose version` |
| **PostgreSQL** | 16 | `sudo apt install postgresql-16` | `psql --version` |
| **Java** | 21+ (for Keycloak) | `sudo apt install openjdk-21-jdk` | `java -version` |
| **curl** | any | Usually pre-installed | `curl --version` |
| **python3** | 3.8+ | Usually pre-installed | `python3 --version` |
| **redis-cli** | any (optional, for verification) | `sudo apt install redis-tools` | `redis-cli --version` |

Make sure:
- Docker daemon is running: `docker info` (should not error)
- PostgreSQL service is running: `sudo systemctl status postgresql`
- Your user can run Docker without sudo: `sudo usermod -aG docker $USER` (log out and back in)

---

## Project Structure

```
IAM/
├── .env                          # Environment variables (secrets — NOT committed)
├── .env.example                  # Template for .env (committed)
├── .gitignore                    # Git ignore rules
├── docker-compose.yml            # Docker services: Redis, APISIX, etcd, Prometheus, Grafana
│
├── keycloak-26.5.4/              # Keycloak installation (downloaded, not committed)
│   ├── bin/kc.sh                 # Keycloak CLI
│   └── conf/keycloak.conf        # Keycloak configuration
│
├── config/
│   ├── apisix/
│   │   └── config.yaml           # APISIX gateway configuration
│   ├── keycloak/
│   │   └── doer-realm.json       # Exported realm config (config-as-code)
│   ├── prometheus/
│   │   └── prometheus.yml        # Prometheus scrape targets
│   └── grafana/
│       └── provisioning/
│           └── datasources/
│               └── datasource.yml  # Grafana → Prometheus connection
│
├── scripts/
│   ├── start-keycloak.sh         # Start Keycloak (local)
│   ├── start-infra.sh            # Start Docker services
│   ├── stop-infra.sh             # Stop Docker services
│   ├── verify-infra.sh           # Health check all services
│   └── setup-realm.sh            # Configure Keycloak realm (Phase 2)
│
├── services/
│   └── auth-service/             # Custom Auth Service (Phase 3 — future)
│
├── themes/
│   └── keycloakify/              # Custom login themes (Phase 5 — future)
│
├── ARCHITECTURE.md               # System architecture documentation
├── USE-CASES.md                  # 28 use case flows
├── IMPLEMENTATION-PLAN.md        # 8-phase implementation checklist
└── SETUP-GUIDE.md                # This file
```

---

## Phase 1 — Infrastructure Setup

### Step 1.1 — Clone and Understand the Project

```bash
git clone <repo-url> IAM
cd IAM
```

Take a moment to explore the directory structure above. The key insight:
- **Keycloak + PostgreSQL** = run on your machine directly
- **Everything else** = run in Docker containers

### Step 1.2 — Install PostgreSQL

If PostgreSQL is not installed:

```bash
# Ubuntu/Debian
sudo apt update
sudo apt install postgresql-16 postgresql-contrib-16

# Start the service
sudo systemctl start postgresql
sudo systemctl enable postgresql   # auto-start on boot
```

Verify it's running:
```bash
sudo systemctl status postgresql
# Should show "active (running)"
```

### Step 1.3 — Create Databases and Users

We need two separate databases:
1. **`keycloak`** — Keycloak stores its own data here (users, realms, clients, sessions)
2. **`doer_auth`** — Our custom Auth Service stores its data here (tenants, invitations, audit logs)

Each database gets its own dedicated user (principle of least privilege — don't use a superuser).

```bash
# Connect to PostgreSQL as the default superuser
sudo -u postgres psql
```

Run these SQL commands inside the `psql` prompt:

```sql
-- 1. Create the Keycloak database and user
CREATE USER keycloak_user WITH PASSWORD 'keycloak_pass_2026';
CREATE DATABASE keycloak OWNER keycloak_user;
GRANT ALL PRIVILEGES ON DATABASE keycloak TO keycloak_user;

-- 2. Create the Auth Service database and user
CREATE USER doer_auth_user WITH PASSWORD 'doer_auth_pass_2026';
CREATE DATABASE doer_auth OWNER doer_auth_user;
GRANT ALL PRIVILEGES ON DATABASE doer_auth TO doer_auth_user;

-- 3. Verify
\l
-- You should see both 'keycloak' and 'doer_auth' in the list

-- 4. Exit
\q
```

Verify both databases are accessible:
```bash
PGPASSWORD=keycloak_pass_2026 psql -U keycloak_user -h localhost -d keycloak -c "SELECT 1;"
PGPASSWORD=doer_auth_pass_2026 psql -U doer_auth_user -h localhost -d doer_auth -c "SELECT 1;"
# Both should return: 1
```

> **Tip**: If you get `peer authentication failed`, edit `/etc/postgresql/16/main/pg_hba.conf` and change the line for `local all all` from `peer` to `md5`, then restart PostgreSQL: `sudo systemctl restart postgresql`

### Step 1.4 — Download Keycloak

Download Keycloak 26.5.4 (the version this project is built for):

```bash
cd IAM/

# Download and extract
wget https://github.com/keycloak/keycloak/releases/download/26.5.4/keycloak-26.5.4.tar.gz
tar xzf keycloak-26.5.4.tar.gz
rm keycloak-26.5.4.tar.gz

# Verify
ls keycloak-26.5.4/bin/kc.sh
# Should show the file
```

### Step 1.5 — Configure Keycloak

The Keycloak configuration file tells Keycloak how to connect to its database and which features to enable.

The file `keycloak-26.5.4/conf/keycloak.conf` should contain:

```properties
# Database
db=postgres
db-username=keycloak_user
db-password=keycloak_pass_2026
db-url=jdbc:postgresql://localhost:5432/keycloak

# HTTP (dev mode — TLS in production)
http-enabled=true
http-port=8080
hostname=localhost

# Observability
health-enabled=true
metrics-enabled=true

# Logging
log-level=info
```

**What each setting means:**
- `db=postgres` — Use PostgreSQL (not the default H2 file database)
- `db-url=jdbc:postgresql://localhost:5432/keycloak` — JDBC connection string. Format: `jdbc:postgresql://<host>:<port>/<database>`
- `http-enabled=true` — Allow HTTP (in production, you'd use HTTPS only)
- `hostname=localhost` — The base URL Keycloak uses to generate redirect URIs
- `health-enabled=true` — Exposes `/health/ready` and `/health/live` endpoints
- `metrics-enabled=true` — Exposes `/metrics` endpoint for Prometheus

### Step 1.6 — Set Up Environment Variables

Copy the template and fill in your values:

```bash
cp .env.example .env
```

Edit `.env` — the important values are already set. If you used different database passwords in Step 1.3, update them here.

**What the `.env` file does:**
- The `start-keycloak.sh` script reads it and exports all variables before starting Keycloak
- `docker-compose.yml` reads it automatically (Docker Compose feature)
- Your future Auth Service will also read it

> **Security note**: `.env` contains real passwords. It is listed in `.gitignore` and must NEVER be committed to git. Only `.env.example` (with `CHANGE_ME` placeholders) is committed.

### Step 1.7 — Bootstrap Keycloak Admin User

Keycloak needs an initial admin user to access its admin console. This only needs to be done once per fresh database.

```bash
KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  ./keycloak-26.5.4/bin/kc.sh bootstrap-admin user \
  --username admin \
  --password:env KC_BOOTSTRAP_ADMIN_PASSWORD \
  --no-prompt
```

**What this does:**
- Starts Keycloak temporarily in a non-server mode
- Creates a user `admin` with password `admin` in the `master` realm
- This user has full admin privileges
- Keycloak then shuts down automatically

You should see:
```
KC-SERVICES0077: Created temporary admin user with username admin
```

> **Important**: This command only works when there are no existing admin users. If you get an error, the admin user may already exist.

### Step 1.8 — Start Keycloak

Open a **separate terminal** (Keycloak runs in the foreground and logs to stdout):

```bash
cd IAM/
./scripts/start-keycloak.sh
```

Or manually:
```bash
export $(grep -v '^#' .env | grep -v '^$' | xargs)
./keycloak-26.5.4/bin/kc.sh start-dev
```

**What `start-dev` means:**
- Development mode: auto-detects config changes, enables HTTP, disables caching
- In production, you'd use `kc.sh build` followed by `kc.sh start` for optimized startup

Wait about 10-15 seconds. You should see:
```
Keycloak 26.5.4 on JVM (powered by Quarkus 3.27.2) started in 4.4s.
Listening on: http://0.0.0.0:8080
```

Verify in your browser: open http://localhost:8080 — you should see the Keycloak welcome page.

Login to admin console: http://localhost:8080/admin with `admin` / `admin`.

### Step 1.9 — Start Docker Services

In your **main terminal** (not the Keycloak terminal):

```bash
cd IAM/
./scripts/start-infra.sh
```

Or manually:
```bash
docker compose up -d
```

This starts 5 containers:

| Container | Image | Purpose | Port |
|-----------|-------|---------|------|
| `doer-redis` | `redis:7-alpine` | OTP codes, rate limiting, caching | 6379 |
| `doer-etcd` | `quay.io/coreos/etcd:v3.5.17` | Configuration store for APISIX | (internal) |
| `doer-apisix` | `apache/apisix:3.11.0-debian` | API Gateway | 9080, 9180, 9443 |
| `doer-prometheus` | `prom/prometheus:latest` | Metrics collection | 9090 |
| `doer-grafana` | `grafana/grafana:latest` | Metrics dashboards | 3000 |

**How containers talk to your local services:**
Docker containers can't access `localhost` (that means "inside the container"). Instead, they use `host.docker.internal` to reach services on your host machine. This is configured in `docker-compose.yml` via `extra_hosts`.

Wait about 30 seconds for all containers to become healthy, then verify:

```bash
docker compose ps
# All should show "healthy" or "running"
```

### Step 1.10 — Verify Everything is Running

Run the verification script:

```bash
./scripts/verify-infra.sh
```

Expected output:
```
Checking Doer IAM Infrastructure...

  [OK] Keycloak          http://localhost:8080
  [OK] APISIX            http://localhost:9080
  [OK] Redis             localhost:6379
  [OK] PostgreSQL (KC)   localhost:5432/keycloak
  [OK] PostgreSQL (Auth) localhost:5432/doer_auth
  [OK] Prometheus        http://localhost:9090
  [OK] Grafana           http://localhost:3000

All services are running!
```

If any service fails, see the [Troubleshooting](#troubleshooting) section.

**Phase 1 is complete.** You now have all infrastructure services running.

---

## Phase 2 — Keycloak Realm Configuration

Phase 2 creates the entire Keycloak configuration for the Doer platform using a single automated script. This section explains what gets created and why, then how to run it.

### What Gets Created (and Why)

#### 1. The `doer` Realm

A realm is Keycloak's top-level container. We create one realm called `doer` that holds ALL products, users, and settings.

**Why one realm (not one per product)?**
- SSO only works within a single realm. Multiple realms would require separate logins.
- Keycloak performance degrades after ~100 realms.
- Multi-tenancy is handled by Organizations within the realm, not by separate realms.

**Settings applied:**

| Setting | Value | Why |
|---------|-------|-----|
| User registration | OFF | Users are created by our Auth Service via Keycloak's Admin API (not Keycloak's own registration page) |
| Login with email | ON | Users can log in with their email address |
| Remember me | ON | "Keep me logged in" checkbox on login page |
| Forgot password | ON | Password reset link on login page |
| Access token lifespan | 15 minutes (900s) | Short-lived for security. If a token is stolen, it's only valid briefly. |
| SSO session idle | 4 hours (14400s) | How long until an idle user has to log in again |
| SSO session max | 24 hours (86400s) | Even active users must re-authenticate once a day |
| Revoke refresh token | ON | Each refresh token can only be used once (prevents replay attacks) |
| Refresh token max reuse | 0 | Single-use refresh tokens |

#### 2. Password Policy

```
length(8) and upperCase(1) and lowerCase(1) and digits(1) and specialChars(1) and passwordHistory(3)
```

This means every password must:
- Be at least 8 characters long
- Have at least 1 uppercase letter (A-Z)
- Have at least 1 lowercase letter (a-z)
- Have at least 1 digit (0-9)
- Have at least 1 special character (!@#$...)
- Not be the same as the last 3 passwords

#### 3. Brute Force Protection

| Setting | Value | Meaning |
|---------|-------|---------|
| Max failures | 5 | After 5 wrong passwords... |
| Wait increment | 60 seconds | ...the account is locked for 60 seconds |
| Max wait | 15 minutes | Lock time grows with each failure, up to 15 min max |
| Failure reset | 12 hours | Failed attempt counter resets after 12 hours of no failures |

#### 4. Realm Roles (User Types)

These define **what type of user** someone is, across all products:

| Role | Who Is This | What Can They Do |
|------|------------|-----------------|
| `platform_admin` | Doer company employees who manage the entire platform | Create tenants, manage all users, view audit logs, system settings |
| `tenant_admin` | The admin user of a client company (tenant) | Manage their own employees, assign roles, invite users |
| `tenant_employee` | A staff member of a tenant company | Operational tasks within their company (process visas, etc.) |
| `end_user` | A self-registered customer/applicant (DEFAULT) | Submit applications, view their own status |

`end_user` is the default — every new user gets this automatically unless the Auth Service assigns something else.

#### 5. Keycloak Clients (4 clients)

##### `doer-visa` — Doer Visa Frontend
- **Type**: Public (browser app, source code visible)
- **Auth flow**: Authorization Code + PKCE (user redirected to Keycloak login page)
- **Direct Access Grants**: OFF (no password sending from app to Keycloak)
- **Redirect URIs**: `http://localhost:3001/callback` (dev)
- **PKCE method**: S256 (SHA-256 hash)
- **fullScopeAllowed**: OFF (only explicitly mapped roles appear in tokens)

##### `doer-visa-backend` — Doer Visa API
- **Type**: Confidential, bearer-only
- **Purpose**: APISIX uses this client's OIDC discovery endpoint to validate JWT tokens on Visa API routes
- **Never initiates login** — only validates tokens

##### `doer-auth-svc` — Auth Service (Machine-to-Machine)
- **Type**: Confidential with Service Account
- **Purpose**: Our custom Auth Service uses this client's credentials to call Keycloak's Admin REST API
- **Service Account Roles**: `manage-users`, `manage-clients`, `view-users`, `view-clients`, `manage-realm`
- These roles come from the built-in `realm-management` client and grant permission to the Admin API

##### `doer-admin` — Admin Dashboard Frontend
- **Type**: Public (browser app)
- **Auth flow**: Authorization Code + PKCE
- **Purpose**: Platform admin and tenant admin dashboard

#### 6. Client Roles (Doer Visa Product)

These define **what a user can do within the Doer Visa product**:

| Role | Who Uses It | Permission |
|------|------------|-----------|
| `manage_all` | Tenant admin | Full control over everything in their org |
| `manage_applications` | Senior staff | Create, edit, delete visa applications |
| `process_visa` | Staff | Process and review applications |
| `approve_visa` | Authorized staff | Final approve/reject decision |
| `view_applications` | Any staff | Read-only view of applications |
| `apply_visa` | End users/customers | Submit a visa application |
| `view_own_status` | End users/customers | Check their own application status |

**Composite roles** (presets that bundle roles together):

| Preset | Includes | For |
|--------|---------|-----|
| `staff_basic` | view_applications, view_own_status | New staff members |
| `staff_senior` | view_applications, process_visa, manage_applications | Experienced staff |
| `customer` | apply_visa, view_own_status | Self-registered customers |

#### 7. Organization Scope & Organizations

**Client Scope: `organization`**
- A scope tells Keycloak "include this information in the token"
- The `organization` scope adds an `organization` claim to JWTs
- Uses the `oidc-organization-membership-mapper` to list which orgs the user belongs to
- Configured as a **default scope** on all product clients (so it's always included, no need to request explicitly)

**Test Organization: "Test Visa Agency"**
- Alias: `test-visa`
- Attributes: `products: ["doer-visa"]`, `plan: ["basic"]`
- This is a sample tenant to test with during development

#### 8. OTP Policy

| Setting | Value | Meaning |
|---------|-------|---------|
| Type | TOTP | Time-based One-Time Password |
| Algorithm | HmacSHA1 | Standard algorithm supported by Google Authenticator, FreeOTP |
| Digits | 6 | 6-digit code |
| Period | 30 seconds | New code every 30 seconds |

#### 9. Scope Mappings (How Roles Get Into Tokens)

This is a subtle but critical configuration. When `fullScopeAllowed` is `false` on a client (which we set for security), Keycloak will NOT automatically include all of a user's roles in their token. We must explicitly tell Keycloak:
- "These realm roles should appear in tokens for this client" → Realm role scope mapping
- "These client roles should appear in tokens for this client" → Client role scope mapping

Without this, you'd get a JWT with no roles in it even though the user has roles assigned.

### Step 2.1 — Run the Realm Setup Script

Make sure Keycloak is running (Step 1.8), then:

```bash
./scripts/setup-realm.sh
```

The script is **idempotent** — safe to run multiple times. If something already exists, it logs `[INFO]` and moves on.

Expected output:
```
========================================
  Doer IAM — Realm Configuration
========================================
  [OK] Admin token obtained

=== 2.1 — Create 'doer' realm ===
  [OK] Realm 'doer' created

=== 2.2 — Configure realm settings ===
  [OK] Realm settings configured (token lifetimes, SSO sessions, revoke refresh)

=== 2.3 — Configure password policies ===
  [OK] Password policy: min 8 chars, 1 upper, 1 lower, 1 digit, 1 special, history 3

=== 2.4 — Enable brute force protection ===
  [OK] Brute force protection: 5 failures, 60s wait, 15min max, 12h reset

=== 2.5 — Create realm roles ===
  [OK] Realm role: platform_admin
  [OK] Realm role: end_user
  [OK] Realm role: tenant_admin
  [OK] Realm role: tenant_employee

... (more output) ...

========================================
  Phase 2 Configuration Complete
========================================
```

### Step 2.2 — Save Client Secrets

At the end of the script output, you'll see:
```
  doer-auth-svc secret: <some-secret-here>
```

Copy this secret into your `.env` file:
```
AUTH_SVC_CLIENT_SECRET=<paste-secret-here>
```

This secret is needed by the Auth Service (Phase 3) to authenticate with Keycloak's Admin API.

### Step 2.3 — Verify in Keycloak Admin Console

Open http://localhost:8080/admin and log in with `admin` / `admin`.

1. **Switch to the `doer` realm** — Click the realm dropdown (top-left, shows "master") and select "doer"
2. **Check Realm Roles** — Left menu → Realm roles → You should see: `platform_admin`, `tenant_admin`, `tenant_employee`, `end_user`
3. **Check Clients** — Left menu → Clients → You should see: `doer-visa`, `doer-visa-backend`, `doer-auth-svc`, `doer-admin`
4. **Check Client Roles** — Click on `doer-visa` → Roles tab → You should see all 10 roles (7 base + 3 composites)
5. **Check Organizations** — Left menu → Organizations → You should see: "Test Visa Agency"
6. **Check Realm Settings** — Left menu → Realm settings → Login tab → Verify: User registration OFF, Forgot password ON, Remember me ON

### Step 2.4 — Understand the Token Structure

When a user logs in via any Doer product, they receive a JWT access token. Here is what it looks like:

```json
{
  "sub": "19b7a331-e9c3-482b-be4f-6a1a6109d989",
  "azp": "doer-visa",
  "scope": "openid profile organization email",

  "realm_access": {
    "roles": ["end_user", "tenant_admin"]
  },

  "resource_access": {
    "doer-visa": {
      "roles": ["manage_all"]
    }
  },

  "organization": ["test-visa"],

  "preferred_username": "testuser",
  "name": "Test User",
  "email": "test@doer.com"
}
```

**How each part is used:**

| Claim | Used By | Purpose |
|-------|---------|---------|
| `sub` | All services | Unique user ID (UUID) |
| `azp` | APISIX | Which client issued this token |
| `realm_access.roles` | Auth Service, APISIX | User type check: is this user a tenant_admin? |
| `resource_access.doer-visa.roles` | APISIX, Product Service | Product permission check: can this user approve visas? |
| `organization` | Auth Service, Product Service | Tenant isolation: which org does this user belong to? Filter all data by this. |
| `preferred_username` | UI | Display name for the user |

**The three layers of security:**
1. **APISIX** checks: Is the JWT valid? Does the user have the required client role?
2. **Auth Service** checks: Does the user's org match the tenant they're trying to access?
3. **Product Service** checks: Filter all database queries by `org_id` from the JWT.

---

## Day-to-Day Commands

### Starting Everything

```bash
# Terminal 1 — Start Keycloak
cd IAM/
./scripts/start-keycloak.sh

# Terminal 2 — Start Docker services
cd IAM/
./scripts/start-infra.sh

# Verify all is running
./scripts/verify-infra.sh
```

### Stopping Everything

```bash
# Stop Docker services
./scripts/stop-infra.sh

# Stop Keycloak — press Ctrl+C in the Keycloak terminal
# Or: pkill -f 'kc.sh start-dev'
```

### Checking Service Logs

```bash
# Keycloak — logs appear in the terminal where it's running
# Or if running in background:
tail -f /tmp/keycloak.log

# Docker services
docker compose logs -f apisix      # APISIX logs
docker compose logs -f redis       # Redis logs
docker compose logs -f prometheus  # Prometheus logs
docker compose logs -f grafana     # Grafana logs
docker compose logs -f etcd        # etcd logs

# All Docker logs at once
docker compose logs -f
```

### Restarting a Single Docker Service

```bash
docker compose restart apisix     # Restart just APISIX
docker compose restart redis      # Restart just Redis
```

### Re-running Realm Setup

If you need to reset or recreate the realm configuration:

```bash
# Option 1: Re-run the setup script (idempotent, safe)
./scripts/setup-realm.sh

# Option 2: Delete the realm and re-create from scratch
# In Keycloak admin console: doer realm → Realm settings → Delete realm
# Then run: ./scripts/setup-realm.sh
```

### Getting an Admin Token (for manual API calls)

```bash
TOKEN=$(curl -sf -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Use the token
curl -sf "http://localhost:8080/admin/realms/doer/users" \
  -H "Authorization: Bearer $TOKEN" | python3 -m json.tool
```

---

## Troubleshooting

### Keycloak won't start

**Symptom**: `kc.sh start-dev` errors or hangs

| Cause | Fix |
|-------|-----|
| Java not installed or wrong version | Run `java -version`. Must be 21+. Install: `sudo apt install openjdk-21-jdk` |
| PostgreSQL not running | Run `sudo systemctl start postgresql` |
| Wrong database credentials | Check `keycloak-26.5.4/conf/keycloak.conf` matches the user/password you created in Step 1.3 |
| Port 8080 already in use | Run `lsof -i :8080` to find what's using it. Kill it or change `http-port` in keycloak.conf |
| Database doesn't exist | Run `sudo -u postgres psql -c "\l"` to list databases. Create if missing. |

### "Invalid user credentials" when getting admin token

**Symptom**: Keycloak returns 401 when trying to get an admin token

This means the admin user doesn't exist in the `master` realm. Run the bootstrap command again:

```bash
KC_BOOTSTRAP_ADMIN_PASSWORD=admin \
  ./keycloak-26.5.4/bin/kc.sh bootstrap-admin user \
  --username admin \
  --password:env KC_BOOTSTRAP_ADMIN_PASSWORD \
  --no-prompt
```

Then restart Keycloak.

### Docker services won't start

**Symptom**: `docker compose up -d` fails

| Cause | Fix |
|-------|-----|
| Docker not running | Run `sudo systemctl start docker` |
| Wrong Docker context | Run `docker context use default` (switches from Docker Desktop to system Docker) |
| Port conflict | Check with `lsof -i :9080` (APISIX), `lsof -i :6379` (Redis), etc. |
| etcd image not found | Make sure `docker-compose.yml` uses `quay.io/coreos/etcd:v3.5.17` (not bitnami) |

### APISIX not starting

**Symptom**: APISIX container restarts or is unhealthy

```bash
docker compose logs apisix
```

Common causes:
- etcd not ready yet — APISIX depends on etcd. Wait and retry.
- Bad config.yaml — Check `config/apisix/config.yaml` for YAML syntax errors

### Redis connection refused

```bash
# Check if Redis container is running
docker compose ps redis

# Test manually
redis-cli -a doer_redis_2026 ping
# Should return: PONG
```

### "peer authentication failed" for PostgreSQL

Edit PostgreSQL's authentication config:

```bash
sudo nano /etc/postgresql/16/main/pg_hba.conf
```

Find lines like:
```
local   all   all   peer
```

Change `peer` to `md5`:
```
local   all   all   md5
```

Then restart:
```bash
sudo systemctl restart postgresql
```

### Realm setup script fails

**Symptom**: `setup-realm.sh` shows `[FAIL]` on a step

1. Make sure Keycloak is running: `curl -sf http://localhost:8080/`
2. Make sure you can get an admin token (see "Invalid user credentials" above)
3. Check if the `doer` realm already exists — the script handles this, but if something is partially created, you may need to delete the realm from Keycloak admin console and re-run

### Container can't reach localhost services

Docker containers use `host.docker.internal` to reach services on your host. If this doesn't work:

```bash
# Test from inside a container
docker exec doer-apisix curl -sf http://host.docker.internal:8080/
```

If it fails, check your Docker version (must be 20.10+) and that `extra_hosts` is in `docker-compose.yml`.

---

## Service URLs Quick Reference

| Service | URL | Credentials |
|---------|-----|------------|
| Keycloak Admin Console | http://localhost:8080/admin | admin / admin |
| Keycloak Account Console | http://localhost:8080/realms/doer/account | (user login) |
| APISIX Gateway | http://localhost:9080 | — |
| APISIX Admin API | http://localhost:9180 | Header: `X-API-KEY: doer_apisix_admin_key_2026` |
| Redis | localhost:6379 | Password: `doer_redis_2026` |
| PostgreSQL (Keycloak) | localhost:5432/keycloak | keycloak_user / keycloak_pass_2026 |
| PostgreSQL (Auth) | localhost:5432/doer_auth | doer_auth_user / doer_auth_pass_2026 |
| Prometheus | http://localhost:9090 | — |
| Grafana | http://localhost:3000 | admin / admin |
| OIDC Discovery | http://localhost:8080/realms/doer/.well-known/openid-configuration | — |

---

*Last updated: February 2026 | Keycloak 26.5.4 | APISIX 3.11.0*
