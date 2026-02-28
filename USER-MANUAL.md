# Doer IAM — User Manual

> Centralized Identity & Access Management for multi-tenant B2B2C SaaS products.

**Author:** Md Anisur Rahman
[GitHub](https://github.com/AnisurRahman06046) | [LinkedIn](https://www.linkedin.com/in/md-anisur-rahman046) | [Email](mailto:anisurrahman06046@gmail.com)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Prerequisites](#2-prerequisites)
3. [Local Development Setup](#3-local-development-setup)
4. [VPS / Production Deployment](#4-vps--production-deployment)
5. [Frontend URLs for Testing](#5-frontend-urls-for-testing)
6. [API Reference](#6-api-reference)
7. [Integrating a New Product](#7-integrating-a-new-product)
8. [PKCE Auth Flow for Frontend Developers](#8-pkce-auth-flow-for-frontend-developers)
9. [Backend Integration (Reading APISIX Headers)](#9-backend-integration-reading-apisix-headers)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. System Overview

```
                                 +-----------------+
                                 |    Keycloak     |
                                 |  (port 8080)    |
                                 +--------+--------+
                                          |
  Browsers / SPAs                         | OIDC
        |                                 |
        v                                 v
+-------+--------+    JWT      +----------+---------+
|  APISIX Gateway +----------->+   Auth Service     |
|  (port 9080)    |            |   (port 3001)      |
+-------+---------+            +----+----------+----+
        |                           |          |
        | X-User-Id                 |          |
        | X-User-Email              v          v
        | X-User-Roles         PostgreSQL    Redis
        | X-Client-Roles       (doer_auth)   (6379)
        | X-Organization-Id
        |
        v
+-------+---------+
| Product Backend  |
| (any language)   |
+------------------+
```

**Components:**

| Component | Technology | Default Port |
|-----------|-----------|-------------|
| Keycloak | 26.5.4 (local binary) | 8080 |
| APISIX Gateway | 3.11.0 (Docker) | 9080 (proxy), 9180 (admin) |
| Auth Service | NestJS + TypeScript | 3001 |
| Admin Portal | React + Ant Design | 3002 |
| PostgreSQL | 16.x | 5432 |
| Redis | 7.x (Docker) | 6379 |
| etcd | 3.5 (Docker) | 2379 |
| Prometheus | (Docker) | 9090 |
| Grafana | (Docker) | 3000 |

---

## 2. Prerequisites

### Local Development

- **Node.js** >= 18.x
- **PostgreSQL** >= 14.x (running locally)
- **Docker** + **Docker Compose** v2
- **Java** 17+ (for Keycloak)
- **Git**

### VPS Deployment

- Ubuntu 22.04+ / Debian 12+
- 4 GB RAM minimum (8 GB recommended)
- Docker + Docker Compose v2
- PostgreSQL 14+ (can run in Docker or managed)
- Java 17+ (for Keycloak — or use the Keycloak Docker image)
- Nginx or Caddy as reverse proxy (for HTTPS)
- A domain name with DNS configured

---

## 3. Local Development Setup

### Step 1: Clone the Repository

```bash
git clone <your-repo-url> doer-iam
cd doer-iam
```

### Step 2: Configure Environment

```bash
cp .env.example .env
# Edit .env and set your passwords (or keep defaults for local dev)
```

### Step 3: Create PostgreSQL Databases

```bash
# Connect as your postgres superuser
sudo -u postgres psql

# Create Keycloak database
CREATE USER keycloak_user WITH PASSWORD 'keycloak_pass_2026';
CREATE DATABASE keycloak OWNER keycloak_user;

# Create Auth Service database
CREATE USER doer_auth_user WITH PASSWORD 'doer_auth_pass';
CREATE DATABASE doer_auth OWNER doer_auth_user;

# Grant extensions permission
\c doer_auth
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

\q
```

### Step 4: Download and Configure Keycloak

```bash
# Download Keycloak 26.5.4
wget https://github.com/keycloak/keycloak/releases/download/26.5.4/keycloak-26.5.4.zip
unzip keycloak-26.5.4.zip

# Verify keycloak.conf
cat keycloak-26.5.4/conf/keycloak.conf
# Should have: db=postgres, db-url=jdbc:postgresql://localhost:5432/keycloak
```

### Step 5: Create Keycloak Admin User

```bash
./keycloak-26.5.4/bin/kc.sh bootstrap-admin user \
  --username admin --password admin
```

### Step 6: Start Keycloak

```bash
# Terminal 1:
./scripts/start-keycloak.sh
# Wait until you see "Keycloak started in Xs"
```

### Step 7: Start Docker Services

```bash
# Terminal 2:
docker compose up -d
# Starts: Redis, etcd, APISIX, Prometheus, Grafana
```

### Step 8: Configure Keycloak Realm

```bash
# Wait for Keycloak to be ready, then:
bash scripts/setup-realm.sh
```

This creates:
- `doer` realm with all roles, clients, scopes, and organizations
- Outputs the `doer-auth-svc` client secret — save it

### Step 9: Install and Start Auth Service

```bash
cd services/auth-service

# Create .env
cat > .env << 'EOF'
NODE_ENV=development
APP_PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=doer_auth_user
DB_PASSWORD=doer_auth_pass
DB_DATABASE=doer_auth
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=doer_redis_2026
KEYCLOAK_BASE_URL=http://localhost:8080
KEYCLOAK_REALM=doer
KEYCLOAK_CLIENT_ID=doer-auth-svc
KEYCLOAK_CLIENT_SECRET=<paste-secret-from-step-8>
APISIX_ADMIN_URL=http://localhost:9180
APISIX_ADMIN_KEY=doer_apisix_admin_key_2026
EOF

npm install
npm run start:dev
```

Database migrations run automatically on startup.

### Step 10: Configure APISIX Routes

```bash
cd ../..
bash config/apisix/setup-routes.sh
```

### Step 11: Install and Start Admin Portal

```bash
cd services/admin-portal
npm install
npm run dev
```

### Step 12: (Optional) Deploy Keycloakify Themes

```bash
# Requires Maven: install at ~/.local/share/maven
cd themes/keycloakify
npm install
bash ../../scripts/deploy-theme.sh
# Then restart Keycloak
```

### Verify Everything Works

```bash
# Keycloak
curl -sf http://localhost:8080/realms/doer | python3 -c "import sys,json; print('Keycloak OK:', json.load(sys.stdin)['realm'])"

# Auth Service
curl -sf http://localhost:3001/api/docs && echo "Auth Service OK"

# APISIX Gateway
curl -sf http://localhost:9080/api/docs && echo "APISIX OK"

# Admin Portal
curl -sf http://localhost:3002/ && echo "Admin Portal OK"
```

---

## 4. VPS / Production Deployment

### Architecture for VPS

```
Internet
   |
   v
[Nginx/Caddy] (HTTPS termination)
   |
   +-- iam.yourdomain.com       --> APISIX :9080
   +-- auth.yourdomain.com      --> Keycloak :8080
   +-- admin.yourdomain.com     --> Admin Portal :3002 (or static files)
   +-- grafana.yourdomain.com   --> Grafana :3000
```

### Step 1: Server Setup

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install dependencies
sudo apt install -y curl git unzip postgresql postgresql-contrib \
  openjdk-17-jre-headless nginx certbot python3-certbot-nginx

# Install Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# Install Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for docker group to take effect

# Install Docker Compose plugin
sudo apt install -y docker-compose-plugin
```

### Step 2: Clone and Configure

```bash
cd /opt
sudo git clone <your-repo-url> doer-iam
sudo chown -R $USER:$USER doer-iam
cd doer-iam

cp .env.example .env
```

Edit `.env` — **change all passwords and keys to strong random values**:

```bash
# Generate random passwords
openssl rand -base64 24   # For each password field

# In .env, change:
KC_DB_PASSWORD=<strong-random>
AUTH_PG_PASSWORD=<strong-random>
REDIS_PASSWORD=<strong-random>
APISIX_ADMIN_KEY=<strong-random>
KEYCLOAK_ADMIN_PASSWORD=<strong-random>
GRAFANA_ADMIN_PASSWORD=<strong-random>
KC_HOSTNAME=auth.yourdomain.com
```

### Step 3: PostgreSQL Setup

```bash
sudo -u postgres psql << 'SQL'
CREATE USER keycloak_user WITH PASSWORD '<your-kc-db-password>';
CREATE DATABASE keycloak OWNER keycloak_user;
CREATE USER doer_auth_user WITH PASSWORD '<your-auth-db-password>';
CREATE DATABASE doer_auth OWNER doer_auth_user;
\c doer_auth
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
SQL
```

### Step 4: Keycloak Setup

```bash
cd /opt/doer-iam

# Download Keycloak
wget https://github.com/keycloak/keycloak/releases/download/26.5.4/keycloak-26.5.4.zip
unzip keycloak-26.5.4.zip

# Edit conf
cat > keycloak-26.5.4/conf/keycloak.conf << 'EOF'
db=postgres
db-username=keycloak_user
db-password=<your-kc-db-password>
db-url=jdbc:postgresql://localhost:5432/keycloak

http-enabled=true
http-port=8080
hostname=auth.yourdomain.com

health-enabled=true
metrics-enabled=true
proxy-headers=xforwarded
EOF

# Create admin
./keycloak-26.5.4/bin/kc.sh bootstrap-admin user \
  --username admin --password '<your-keycloak-admin-password>'

# Create systemd service
sudo tee /etc/systemd/system/keycloak.service << EOF
[Unit]
Description=Keycloak Identity Provider
After=postgresql.service network.target

[Service]
User=$USER
WorkingDirectory=/opt/doer-iam/keycloak-26.5.4
ExecStart=/opt/doer-iam/keycloak-26.5.4/bin/kc.sh start-dev
Restart=on-failure
RestartSec=10
Environment="JAVA_OPTS=-Xms512m -Xmx1024m"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable keycloak
sudo systemctl start keycloak
```

Wait for Keycloak to start, then configure realm:

```bash
bash scripts/setup-realm.sh
# Save the output client secret
```

### Step 5: Start Docker Services

```bash
docker compose up -d
```

### Step 6: Auth Service Setup

```bash
cd services/auth-service

cat > .env << EOF
NODE_ENV=production
APP_PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=doer_auth_user
DB_PASSWORD=<your-auth-db-password>
DB_DATABASE=doer_auth
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=<your-redis-password>
KEYCLOAK_BASE_URL=http://localhost:8080
KEYCLOAK_REALM=doer
KEYCLOAK_CLIENT_ID=doer-auth-svc
KEYCLOAK_CLIENT_SECRET=<secret-from-setup-realm>
APISIX_ADMIN_URL=http://localhost:9180
APISIX_ADMIN_KEY=<your-apisix-admin-key>
EOF

npm install --omit=dev
npm run build

# Create systemd service
sudo tee /etc/systemd/system/doer-auth.service << EOF
[Unit]
Description=Doer Auth Service
After=postgresql.service keycloak.service network.target

[Service]
User=$USER
WorkingDirectory=/opt/doer-iam/services/auth-service
ExecStart=/usr/bin/node dist/main.js
Restart=on-failure
RestartSec=5
Environment="NODE_ENV=production"

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable doer-auth
sudo systemctl start doer-auth
```

### Step 7: Configure APISIX Routes

Before running setup-routes, edit `config/apisix/setup-routes.sh` and update `KC_HOST` if you have a custom domain.

```bash
cd /opt/doer-iam
bash config/apisix/setup-routes.sh
```

### Step 8: Build and Serve Admin Portal

```bash
cd services/admin-portal

# Before building, update API base URLs for production
# In src/auth/auth-context.tsx and src/api/client.ts,
# change localhost URLs to your domain:
#   APISIX_BASE = "https://iam.yourdomain.com"
#   KC_BASE     = "https://auth.yourdomain.com"
#   REDIRECT_URI uses window.location.origin (auto-correct)

npm install
npm run build

# Serve static files via Nginx (see Step 9)
```

### Step 9: Nginx Reverse Proxy + HTTPS

```bash
sudo tee /etc/nginx/sites-available/doer-iam << 'NGINX'
# APISIX Gateway (main API endpoint)
server {
    server_name iam.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:9080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Keycloak
server {
    server_name auth.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }
}

# Admin Portal (static files)
server {
    server_name admin.yourdomain.com;
    root /opt/doer-iam/services/admin-portal/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}

# Grafana (optional)
server {
    server_name grafana.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
NGINX

sudo ln -sf /etc/nginx/sites-available/doer-iam /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx

# Get SSL certificates
sudo certbot --nginx \
  -d iam.yourdomain.com \
  -d auth.yourdomain.com \
  -d admin.yourdomain.com \
  -d grafana.yourdomain.com
```

### Step 10: Update Keycloak Client Redirect URIs

After setting up domains, update client URIs:

```bash
# Edit scripts/setup-realm.sh:
# Change "http://localhost:3002" to "https://admin.yourdomain.com" (doer-admin)
# Change "http://localhost:3001" to "https://iam.yourdomain.com" (doer-visa etc.)
# Then re-run:
bash scripts/setup-realm.sh
```

Or manually update via Keycloak Admin Console at `https://auth.yourdomain.com/admin/`.

### Step 11: Verify Deployment

```bash
curl -sf https://auth.yourdomain.com/realms/doer && echo " Keycloak OK"
curl -sf https://iam.yourdomain.com/api/docs && echo " APISIX+Auth OK"
curl -sf https://admin.yourdomain.com/ && echo " Admin Portal OK"
```

### VPS Cheat Sheet — Common Operations

```bash
# View logs
sudo journalctl -u keycloak -f
sudo journalctl -u doer-auth -f
docker compose logs -f apisix

# Restart services
sudo systemctl restart keycloak
sudo systemctl restart doer-auth
docker compose restart apisix

# Run DB migrations (automatic on auth-service start)
cd /opt/doer-iam/services/auth-service && node dist/main.js

# Reconfigure APISIX routes
bash config/apisix/setup-routes.sh

# Deploy theme update
bash scripts/deploy-theme.sh && sudo systemctl restart keycloak
```

---

## 5. Frontend URLs for Testing

### Local Development

| Application | URL | Credentials |
|------------|-----|-------------|
| **Admin Portal** | http://localhost:3002 | Login as `platform_admin` user via Keycloak |
| **Doer Visa Frontend** | http://localhost:5173 | Any user registered via the system |
| **Keycloak Admin Console** | http://localhost:8080/admin | `admin` / `admin` |
| **Swagger API Docs** | http://localhost:3001/api/docs | — |
| **Swagger via APISIX** | http://localhost:9080/api/docs | — |
| **Grafana Dashboard** | http://localhost:3000 | `admin` / `admin` |
| **Prometheus** | http://localhost:9090 | — |

### VPS / Production

| Application | URL | Notes |
|------------|-----|-------|
| **Admin Portal** | https://admin.yourdomain.com | Replace with your domain |
| **API Gateway** | https://iam.yourdomain.com | All API calls go here |
| **Keycloak** | https://auth.yourdomain.com | Login screens redirect here |
| **Keycloak Admin Console** | https://auth.yourdomain.com/admin | Use strong admin password |
| **Swagger API Docs** | https://iam.yourdomain.com/api/docs | — |
| **Grafana** | https://grafana.yourdomain.com | — |

### Starting Each Frontend Locally

```bash
# Admin Portal (port 3002)
cd services/admin-portal && npm run dev

# Doer Visa Frontend (port 5173) — dummy test product
cd dummy-products/doer-visa-frontend && npm run dev

# Doer Visa Backend (port 4001) — dummy test backend
cd dummy-products/doer-visa-api && npm run dev
```

### Creating a Test Platform Admin User

To log in to the Admin Portal, you need a user with the `platform_admin` role:

```bash
# Get Keycloak admin token
TOKEN=$(curl -sf -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# Create user
curl -sf -X POST "http://localhost:8080/admin/realms/doer/users" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "username": "platformadmin",
    "email": "admin@doer.com",
    "firstName": "Platform",
    "lastName": "Admin",
    "enabled": true,
    "credentials": [{"type": "password", "value": "Admin1234@pass", "temporary": false}]
  }'

# Get user ID
USER_ID=$(curl -sf "http://localhost:8080/admin/realms/doer/users?username=platformadmin" \
  -H "Authorization: Bearer $TOKEN" | python3 -c "import sys,json; print(json.load(sys.stdin)[0]['id'])")

# Get platform_admin role
ROLE=$(curl -sf "http://localhost:8080/admin/realms/doer/roles/platform_admin" \
  -H "Authorization: Bearer $TOKEN")

# Assign role
curl -sf -X POST "http://localhost:8080/admin/realms/doer/users/$USER_ID/role-mappings/realm" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "[$ROLE]"

echo "Platform admin created: platformadmin / Admin1234@pass"
```

---

## 6. API Reference

**Base URL (via APISIX):** `http://localhost:9080` (local) or `https://iam.yourdomain.com` (VPS)

**Response Format:** All successful responses are wrapped:

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
    "total": 42,
    "totalPages": 3
  }
}
```

Error responses:

```json
{
  "statusCode": 400,
  "error": "VALIDATION_ERROR",
  "message": "Description of what went wrong",
  "timestamp": "2026-02-28T12:00:00.000Z",
  "path": "/api/tenants"
}
```

---

### 6.1 Authentication APIs (Public — No Token Required)

All auth routes go through `/auth/*` on APISIX. Rate limited to 30 requests/minute per IP.

---

#### POST /auth/register

Register a new user.

**Request:**
```json
{
  "product": "doer-visa",
  "tenantAlias": "acme-corp",
  "email": "user@example.com",
  "phone": "+966501234567",
  "password": "SecureP@ss1",
  "fullName": "John Doe"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| product | string | yes | Product client ID (e.g., `doer-visa`) |
| tenantAlias | string | no | Tenant to join (if blank, user is standalone) |
| email | string (email) | yes | User email |
| phone | string | yes | Phone number |
| password | string (min 8) | yes | Must meet password policy |
| fullName | string | yes | Full name |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "userId": "a1b2c3d4-...",
    "email": "user@example.com",
    "message": "User registered successfully"
  }
}
```

---

#### POST /auth/token

Exchange authorization code for tokens (PKCE flow).

**Request:**
```json
{
  "code": "abc123...",
  "codeVerifier": "def456...",
  "redirectUri": "http://localhost:3002/callback",
  "clientId": "doer-admin"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| code | string | yes | Authorization code from Keycloak callback |
| codeVerifier | string | yes | PKCE code verifier (stored during login) |
| redirectUri | string | yes | Must match the redirect_uri used during auth |
| clientId | string | yes | Keycloak client ID |

**Response (200):**
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "expires_in": 900,
  "token_type": "Bearer",
  "scope": "openid"
}
```

> Note: This endpoint returns raw Keycloak response, NOT wrapped in `{success, data}`.

---

#### POST /auth/refresh

Refresh an access token.

**Request:**
```json
{
  "refreshToken": "eyJhbG...",
  "clientId": "doer-visa"
}
```

**Response (200):**
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "eyJhbG...",
  "expires_in": 900,
  "token_type": "Bearer"
}
```

---

#### POST /auth/logout

Revoke refresh token and end session.

**Request:**
```json
{
  "refreshToken": "eyJhbG...",
  "clientId": "doer-visa"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "Logged out" }
}
```

---

#### POST /auth/forgot-password

Initiate password reset (email or OTP).

**Request:**
```json
{
  "identifier": "user@example.com",
  "product": "doer-visa"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| identifier | string | yes | Email address or phone number |
| product | string | yes | Product client ID |

**Response (200):**
```json
{
  "success": true,
  "data": { "method": "email", "message": "Reset email sent" }
}
```

If identifier is a phone number, an OTP is sent and `method` is `"otp"`.

---

#### POST /auth/reset-password

Reset password using OTP (for phone-based reset).

**Request:**
```json
{
  "phone": "+966501234567",
  "otp": "123456",
  "newPassword": "NewSecureP@ss1"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { "message": "Password reset successfully" }
}
```

---

#### GET /auth/invite/:token

Validate an invitation token.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "email": "invited@example.com",
    "role": "tenant_employee",
    "tenantName": "Acme Corp",
    "expiresAt": "2026-03-07T12:00:00.000Z"
  }
}
```

---

#### POST /auth/accept-invite

Accept an invitation and create an account.

**Request:**
```json
{
  "token": "invitation-token-string",
  "fullName": "Jane Smith",
  "phone": "+966501234567",
  "password": "SecureP@ss1"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "userId": "uuid",
    "email": "invited@example.com",
    "message": "Account created and invitation accepted"
  }
}
```

---

### 6.2 Tenant APIs (JWT Required)

All requests must include: `Authorization: Bearer <access_token>`

Route: `/api/tenants/*` — Protected by APISIX JWT validation.

---

#### POST /api/tenants

Create a new tenant with admin user. **Role: `platform_admin`**

**Request:**
```json
{
  "name": "Acme Corporation",
  "alias": "acme-corp",
  "product": "doer-visa",
  "plan": "basic",
  "maxUsers": 50,
  "billingEmail": "billing@acme.com",
  "domain": "acme.com",
  "adminEmail": "admin@acme.com",
  "adminFullName": "John Admin",
  "adminPassword": "Admin1234@pass"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Display name |
| alias | string | yes | Unique slug (used as Keycloak org name) |
| product | string | yes | Product client ID |
| plan | enum | no | `basic`, `pro`, `enterprise` (default: `basic`) |
| maxUsers | integer | no | Max users allowed (default: 50) |
| billingEmail | email | no | Billing contact |
| domain | string | no | Tenant domain |
| adminEmail | email | yes | First admin user's email |
| adminFullName | string | yes | First admin user's full name |
| adminPassword | string | yes | First admin user's password |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Acme Corporation",
    "alias": "acme-corp",
    "product": "doer-visa",
    "plan": "basic",
    "maxUsers": 50,
    "status": "active",
    "keycloakOrgId": "kc-org-uuid",
    "createdAt": "2026-02-28T12:00:00.000Z",
    "updatedAt": "2026-02-28T12:00:00.000Z"
  }
}
```

---

#### GET /api/tenants

List tenants. **Role: `platform_admin` or `tenant_admin`**

Query params: `?page=1&limit=20`

- `platform_admin` sees all tenants
- `tenant_admin` sees only their own tenant

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Acme Corp", "alias": "acme-corp", ... }
  ],
  "meta": { "page": 1, "limit": 20, "total": 5, "totalPages": 1 }
}
```

---

#### GET /api/tenants/:id

Get tenant detail with member count. **Guard: TenantScopeGuard** (own org or platform_admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Acme Corporation",
    "alias": "acme-corp",
    "product": "doer-visa",
    "plan": "basic",
    "maxUsers": 50,
    "status": "active",
    "billingEmail": "billing@acme.com",
    "domain": "acme.com",
    "keycloakOrgId": "kc-org-uuid",
    "memberCount": 12,
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

#### PUT /api/tenants/:id

Update tenant metadata. **Role: `platform_admin`**

**Request:**
```json
{
  "name": "Acme Corp Updated",
  "plan": "pro",
  "maxUsers": 100,
  "billingEmail": "new-billing@acme.com",
  "domain": "acme.io"
}
```

All fields are optional.

---

#### PUT /api/tenants/:id/activate

Activate tenant and enable all members. **Role: `platform_admin`**

No request body.

---

#### PUT /api/tenants/:id/deactivate

Deactivate tenant, disable all members, and kill their sessions. **Role: `platform_admin`**

No request body.

---

### 6.3 User APIs (JWT Required)

Route: `/api/tenants/:tid/users/*` — Protected by APISIX JWT validation + TenantScopeGuard.

---

#### POST /api/tenants/:tid/users

Create a user within the tenant. **Role: `platform_admin` or `tenant_admin`**

**Request:**
```json
{
  "email": "user@example.com",
  "fullName": "Jane Smith",
  "phone": "+966501234567",
  "password": "SecureP@ss1",
  "realmRole": "tenant_employee",
  "clientRoles": ["view_applications", "process_visa"]
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| email | email | yes | User email |
| fullName | string | yes | Full name |
| phone | string | no | Phone number |
| password | string (min 8) | yes | Password |
| realmRole | string | yes | One of: `tenant_admin`, `tenant_employee`, `end_user` |
| clientRoles | string[] | no | Client roles to assign |

**Response (201):**
```json
{
  "success": true,
  "data": {
    "userId": "kc-user-uuid",
    "email": "user@example.com"
  }
}
```

---

#### GET /api/tenants/:tid/users

List users in tenant. Query: `?first=0&max=20`

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": "kc-user-uuid",
      "username": "user@example.com",
      "email": "user@example.com",
      "firstName": "Jane",
      "lastName": "Smith",
      "enabled": true
    }
  ]
}
```

---

#### GET /api/tenants/:tid/users/:uid

Get user details with roles.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "id": "kc-user-uuid",
    "email": "user@example.com",
    "firstName": "Jane",
    "lastName": "Smith",
    "enabled": true,
    "realmRoles": ["tenant_employee", "end_user"],
    "clientRoles": ["view_applications", "process_visa"]
  }
}
```

---

#### PUT /api/tenants/:tid/users/:uid/roles

Update user roles. **Role: `platform_admin` or `tenant_admin`**

**Request:**
```json
{
  "realmRole": "tenant_employee",
  "clientRoles": ["manage_all"]
}
```

All fields optional. `clientRoles` replaces existing client roles.

---

#### PUT /api/tenants/:tid/users/:uid/disable

Disable user. **Role: `platform_admin` or `tenant_admin`**

#### PUT /api/tenants/:tid/users/:uid/enable

Enable user. **Role: `platform_admin` or `tenant_admin`**

#### DELETE /api/tenants/:tid/users/:uid

Remove user from tenant (removes org membership). **Role: `platform_admin` or `tenant_admin`**

---

#### POST /api/tenants/:tid/users/invite

Send invitation. **Role: `platform_admin` or `tenant_admin`**

**Request:**
```json
{
  "email": "newuser@example.com",
  "role": "tenant_employee",
  "expiresInHours": 72
}
```

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "invitation-uuid",
    "email": "newuser@example.com",
    "token": "invitation-token",
    "expiresAt": "2026-03-03T12:00:00.000Z"
  }
}
```

---

#### GET /api/tenants/:tid/users/roles/available

List available client roles for the tenant's product.

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "role-uuid", "name": "manage_all", "description": "Full access" },
    { "id": "role-uuid", "name": "view_applications", "description": "View visa applications" }
  ]
}
```

---

### 6.4 Platform APIs (JWT Required, `platform_admin` Only)

Route: `/api/platform/*`

---

#### GET /api/platform/stats

**Response (200):**
```json
{
  "success": true,
  "data": {
    "totalTenants": 5,
    "activeTenants": 4,
    "totalUsers": 120,
    "totalProducts": 2
  }
}
```

---

#### GET /api/platform/audit-logs

Query params: `?tenantId=uuid&actorId=uuid&action=tenant.created&resourceType=tenant&from=2026-01-01T00:00:00Z&to=2026-12-31T23:59:59Z&page=1&limit=20`

All filters are optional.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "items": [
      {
        "id": "uuid",
        "actorId": "user-uuid",
        "actorType": "USER",
        "action": "tenant.created",
        "resourceType": "tenant",
        "resourceId": "tenant-uuid",
        "tenantId": null,
        "metadata": { "name": "Acme Corp", "alias": "acme-corp" },
        "ipAddress": "127.0.0.1",
        "createdAt": "2026-02-28T12:00:00.000Z"
      }
    ],
    "total": 42
  }
}
```

---

#### GET /api/platform/users

Cross-tenant user search. Query: `?q=searchterm&first=0&max=20`

---

### 6.5 Product Admin APIs (JWT Required, `platform_admin` Only)

Route: `/api/admin/products/*`

---

#### POST /api/admin/products

**Full product onboarding.** Creates Keycloak clients, APISIX route, and DB record in one call.

**Request:**
```json
{
  "name": "Doer School",
  "slug": "doer-school",
  "description": "School management product",
  "frontendUrl": "http://localhost:5174",
  "backendUrl": "localhost",
  "backendPort": 4002
}
```

| Field | Type | Required | Validation |
|-------|------|----------|------------|
| name | string | yes | — |
| slug | string | yes | Lowercase alphanumeric with dashes: `^[a-z0-9]+(-[a-z0-9]+)*$` |
| description | string | no | — |
| frontendUrl | string | no | Used for Keycloak redirect URIs |
| backendUrl | string | no | APISIX upstream host |
| backendPort | integer | no | APISIX upstream port |

**What happens on create:**
1. Validates slug uniqueness in DB
2. Creates public Keycloak client (PKCE, `fullScopeAllowed=false`)
3. Creates confidential backend Keycloak client (for APISIX JWT validation)
4. Adds realm role scope mappings (platform_admin, tenant_admin, tenant_employee, end_user)
5. Moves `organization` scope from optional to default
6. Creates APISIX route with openid-connect + Lua header injection
7. Saves product record in DB
8. Creates audit log entry
9. **Rolls back** Keycloak clients on failure

**Response (201):**
```json
{
  "success": true,
  "data": {
    "id": "product-uuid",
    "name": "Doer School",
    "slug": "doer-school",
    "description": "School management product",
    "frontendUrl": "http://localhost:5174",
    "backendUrl": "localhost",
    "backendPort": 4002,
    "kcPublicClientId": "doer-school",
    "kcPublicClientUuid": "kc-uuid",
    "kcBackendClientId": "doer-school-backend",
    "kcBackendClientUuid": "kc-uuid",
    "kcBackendClientSecret": "generated-secret",
    "apisixRouteId": "product-doer-school",
    "status": "active",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

---

#### GET /api/admin/products

List all products.

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Doer School", "slug": "doer-school", "status": "active", ... }
  ]
}
```

---

#### GET /api/admin/products/:id

Get product detail.

---

#### PUT /api/admin/products/:id

Update product metadata.

**Request:**
```json
{
  "name": "Doer School v2",
  "description": "Updated description",
  "frontendUrl": "http://localhost:5175",
  "backendUrl": "localhost",
  "backendPort": 4003
}
```

All fields optional.

---

#### DELETE /api/admin/products/:id

Deactivate product (sets status to `inactive`, disables APISIX route).

---

#### GET /api/admin/products/:id/roles

List client roles for the product.

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "role-uuid", "name": "manage_students", "description": "Manage student records", "composite": false },
    { "id": "role-uuid", "name": "manage_all", "description": "Full access", "composite": true }
  ]
}
```

---

#### POST /api/admin/products/:id/roles

Create a client role.

**Request:**
```json
{
  "name": "manage_students",
  "description": "Manage student records",
  "composite": false
}
```

---

#### DELETE /api/admin/products/:id/roles/:roleName

Delete a client role.

---

#### POST /api/admin/products/:id/roles/:roleName/composites

Add composite roles to a role.

**Request:**
```json
{
  "roleNames": ["view_students", "enroll_student"]
}
```

---

#### GET /api/admin/products/:id/roles/:roleName/composites

Get composite roles of a role.

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "role-uuid", "name": "view_students" },
    { "id": "role-uuid", "name": "enroll_student" }
  ]
}
```

---

#### GET /api/admin/products/:id/route

Get APISIX route config for the product.

**Response (200):**
```json
{
  "success": true,
  "data": {
    "name": "doer-school-api",
    "uris": ["/api/school", "/api/school/*"],
    "methods": ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    "upstream": { "type": "roundrobin", "nodes": { "localhost:4002": 1 } },
    "plugins": { "openid-connect": { ... }, "cors": { ... }, ... }
  }
}
```

---

#### PUT /api/admin/products/:id/route

Update APISIX route config (merge with default).

**Request:**
```json
{
  "plugins": { "limit-count": { "count": 2000, "time_window": 60 } }
}
```

---

#### POST /api/admin/products/:id/route/toggle

Enable or disable the APISIX route.

**Response (200):**
```json
{
  "success": true,
  "data": { "enabled": false }
}
```

---

#### GET /api/admin/products/:id/tenants

List tenants for this product.

**Response (200):**
```json
{
  "success": true,
  "data": [
    { "id": "uuid", "name": "Acme Corp", "alias": "acme-corp", "status": "active", ... }
  ]
}
```

---

### 6.6 APISIX Gateway Routes Summary

| Route ID | Path | Auth | Rate Limit | Upstream |
|----------|------|------|-----------|----------|
| 1 | `/auth/*` | none | 30/min | Auth Service :3001 |
| 2 | `/api/tenants/*` | JWT | 1000/min | Auth Service :3001 |
| 3 | `/api/platform/*` | JWT | 500/min | Auth Service :3001 |
| 4 | `/api/visa/*` | JWT + headers | 1000/min | Visa Backend :4001 |
| 5 | `/realms/*` | none | — | Keycloak :8080 |
| 6 | `/api/docs*` | none | — | Auth Service :3001 |
| 7 | `/api/admin/*` | JWT | 500/min | Auth Service :3001 |
| dynamic | `/api/{product}/*` | JWT + headers | 1000/min | Product Backend |

---

## 7. Integrating a New Product

This is the step-by-step guide for developers who want to add a new product to the Doer IAM ecosystem.

### Step 1: Register the Product via Admin Portal

Open the Admin Portal (`http://localhost:3002` or `https://admin.yourdomain.com`), log in as `platform_admin`, and click **Products > New Product**.

Fill in:
- **Name**: `Doer HRMS`
- **Slug**: `doer-hrms` (this becomes the Keycloak client ID and API path prefix)
- **Frontend URL**: `http://localhost:5175` (for Keycloak redirect URIs)
- **Backend URL**: `localhost` (APISIX upstream host)
- **Backend Port**: `4003`

Or via API:

```bash
curl -X POST http://localhost:9080/api/admin/products \
  -H "Authorization: Bearer <platform_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Doer HRMS",
    "slug": "doer-hrms",
    "description": "HR management system",
    "frontendUrl": "http://localhost:5175",
    "backendUrl": "localhost",
    "backendPort": 4003
  }'
```

**This automatically creates:**
- Keycloak public client `doer-hrms` (PKCE)
- Keycloak confidential client `doer-hrms-backend` (with secret)
- APISIX route at `/api/hrms/*` with JWT validation + header injection
- Realm role scope mappings + organization default scope

Save the `kcBackendClientSecret` from the response.

### Step 2: Create Client Roles

Via Admin Portal: Products > doer-hrms > Roles tab > Add Role.

Or via API:

```bash
# Create roles
for ROLE in manage_employees view_employees manage_payroll view_payroll; do
  curl -X POST "http://localhost:9080/api/admin/products/<product-id>/roles" \
    -H "Authorization: Bearer <token>" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$ROLE\"}"
done

# Create composite preset
curl -X POST "http://localhost:9080/api/admin/products/<product-id>/roles/manage_employees/composites" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"roleNames": ["view_employees"]}'
```

### Step 3: Build Your Frontend

Use the **PKCE auth flow** with your product's client ID.

```typescript
// Config
const KC_BASE = "http://localhost:8080";   // or https://auth.yourdomain.com
const APISIX_BASE = "http://localhost:9080"; // or https://iam.yourdomain.com
const CLIENT_ID = "doer-hrms";              // your product slug
const REDIRECT_URI = "http://localhost:5175/callback";

// Login: redirect to Keycloak
const verifier = generateCodeVerifier();
sessionStorage.setItem("pkce_verifier", verifier);
const challenge = await generateCodeChallenge(verifier);

window.location.href = `${KC_BASE}/realms/doer/protocol/openid-connect/auth?` +
  `response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}` +
  `&scope=openid&code_challenge=${challenge}&code_challenge_method=S256`;

// Callback: exchange code for tokens
const resp = await fetch(`${APISIX_BASE}/auth/token`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    code: urlParams.get("code"),
    codeVerifier: sessionStorage.getItem("pkce_verifier"),
    redirectUri: REDIRECT_URI,
    clientId: CLIENT_ID,
  }),
});
const tokens = await resp.json();
// Store tokens.access_token and tokens.refresh_token

// API calls: include Bearer token
const data = await fetch(`${APISIX_BASE}/api/hrms/employees`, {
  headers: { "Authorization": `Bearer ${tokens.access_token}` },
});
```

See [Section 8](#8-pkce-auth-flow-for-frontend-developers) for the complete PKCE implementation.

### Step 4: Build Your Backend

Your backend receives requests **through APISIX**, which has already validated the JWT. APISIX injects these headers:

| Header | Value | Example |
|--------|-------|---------|
| `X-User-Id` | Keycloak user UUID | `a1b2c3d4-e5f6-...` |
| `X-User-Email` | User email | `user@example.com` |
| `X-User-Roles` | Comma-separated realm roles | `tenant_employee,end_user` |
| `X-Client-Roles` | Comma-separated product roles | `manage_employees,view_employees` |
| `X-Organization-Id` | Tenant org alias | `acme-corp` |

**Your backend does NOT need any JWT library.** Just read headers:

```typescript
// Express.js example
app.get("/api/hrms/employees", (req, res) => {
  const userId = req.headers["x-user-id"];
  const email = req.headers["x-user-email"];
  const roles = (req.headers["x-client-roles"] || "").split(",");
  const orgId = req.headers["x-organization-id"];

  if (!roles.includes("view_employees") && !roles.includes("manage_employees")) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Fetch employees for this organization
  const employees = db.query("SELECT * FROM employees WHERE org_id = $1", [orgId]);
  res.json(employees);
});
```

See [Section 9](#9-backend-integration-reading-apisix-headers) for more patterns.

### Step 5: Onboard Tenants

Use the existing Tenant API or Admin Portal to create tenants for your product:

```bash
curl -X POST http://localhost:9080/api/tenants \
  -H "Authorization: Bearer <platform_admin_token>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Beta Corp",
    "alias": "beta-corp",
    "product": "doer-hrms",
    "adminEmail": "hr@beta.com",
    "adminFullName": "HR Manager",
    "adminPassword": "Admin1234@pass"
  }'
```

This creates the Keycloak organization and first admin user who can then manage their own employees.

---

## 8. PKCE Auth Flow for Frontend Developers

Full copy-paste PKCE implementation for any framework.

### pkce.ts

```typescript
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

### token-storage.ts

```typescript
export function getAccessToken(): string | null {
  return sessionStorage.getItem("access_token");
}

export function setTokens(accessToken: string, refreshToken?: string): void {
  sessionStorage.setItem("access_token", accessToken);
  if (refreshToken) sessionStorage.setItem("refresh_token", refreshToken);
}

export function clearTokens(): void {
  sessionStorage.removeItem("access_token");
  sessionStorage.removeItem("refresh_token");
  sessionStorage.removeItem("pkce_verifier");
}

export function decodeJwt(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(payload + "=".repeat((4 - (payload.length % 4)) % 4)));
  } catch { return null; }
}
```

### Auth Flow

```typescript
// CONFIG — change these per product
const KC_BASE = "http://localhost:8080";
const APISIX_BASE = "http://localhost:9080";
const CLIENT_ID = "your-product-slug";
const REDIRECT_URI = `${window.location.origin}/callback`;

// 1. LOGIN — redirect to Keycloak
async function login() {
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

  window.location.href = `${KC_BASE}/realms/doer/protocol/openid-connect/auth?${params}`;
}

// 2. CALLBACK — exchange code for tokens (run on /callback page)
async function handleCallback() {
  const code = new URLSearchParams(window.location.search).get("code");
  const verifier = sessionStorage.getItem("pkce_verifier");

  const resp = await fetch(`${APISIX_BASE}/auth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, codeVerifier: verifier, redirectUri: REDIRECT_URI, clientId: CLIENT_ID }),
  });

  const data = await resp.json();
  setTokens(data.access_token, data.refresh_token);
  sessionStorage.removeItem("pkce_verifier");
  window.location.href = "/";
}

// 3. API CALLS — include Bearer token
async function apiCall(path: string, options: RequestInit = {}) {
  const token = getAccessToken();
  return fetch(`${APISIX_BASE}${path}`, {
    ...options,
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}`, ...options.headers },
  });
}

// 4. REFRESH — call before token expires
async function refresh() {
  const refreshToken = sessionStorage.getItem("refresh_token");
  const resp = await fetch(`${APISIX_BASE}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken, clientId: CLIENT_ID }),
  });
  const data = await resp.json();
  setTokens(data.access_token, data.refresh_token);
}

// 5. LOGOUT
async function logout() {
  const refreshToken = sessionStorage.getItem("refresh_token");
  await fetch(`${APISIX_BASE}/auth/logout`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refreshToken, clientId: CLIENT_ID }),
  }).catch(() => {});
  clearTokens();
  window.location.href = "/login";
}
```

### JWT Token Structure

The access token contains these claims:

```json
{
  "sub": "user-uuid",
  "email": "user@example.com",
  "preferred_username": "user@example.com",
  "given_name": "John",
  "family_name": "Doe",
  "realm_access": {
    "roles": ["tenant_employee", "end_user"]
  },
  "resource_access": {
    "doer-hrms": {
      "roles": ["manage_employees", "view_employees"]
    }
  },
  "organization": ["acme-corp"],
  "exp": 1772288000
}
```

To check roles in the frontend:

```typescript
const jwt = decodeJwt(accessToken);
const realmRoles = jwt?.realm_access?.roles || [];
const clientRoles = jwt?.resource_access?.["doer-hrms"]?.roles || [];
const orgId = Array.isArray(jwt?.organization) ? jwt.organization[0] : null;

if (clientRoles.includes("manage_employees")) {
  // Show admin features
}
```

---

## 9. Backend Integration (Reading APISIX Headers)

When a request reaches your backend through APISIX, the JWT has already been validated. Your backend only reads trusted headers.

### Express.js (Node.js)

```typescript
import express from "express";
const app = express();

// Middleware to extract user context
function authContext(req, res, next) {
  req.user = {
    id: req.headers["x-user-id"],
    email: req.headers["x-user-email"],
    realmRoles: (req.headers["x-user-roles"] || "").split(",").filter(Boolean),
    clientRoles: (req.headers["x-client-roles"] || "").split(",").filter(Boolean),
    organizationId: req.headers["x-organization-id"],
  };
  next();
}

app.use(authContext);

// Role-check middleware
function requireRole(...roles) {
  return (req, res, next) => {
    const hasRole = roles.some(r => req.user.clientRoles.includes(r));
    if (!hasRole) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

app.get("/api/hrms/employees", requireRole("view_employees", "manage_employees"), (req, res) => {
  // req.user.organizationId is the tenant alias
  res.json({ employees: [] });
});

app.listen(4003);
```

### Python Flask

```python
from flask import Flask, request, jsonify
from functools import wraps

app = Flask(__name__)

def get_user():
    return {
        "id": request.headers.get("X-User-Id"),
        "email": request.headers.get("X-User-Email"),
        "realm_roles": (request.headers.get("X-User-Roles") or "").split(","),
        "client_roles": (request.headers.get("X-Client-Roles") or "").split(","),
        "organization_id": request.headers.get("X-Organization-Id"),
    }

def require_role(*roles):
    def decorator(f):
        @wraps(f)
        def wrapper(*args, **kwargs):
            user = get_user()
            if not any(r in user["client_roles"] for r in roles):
                return jsonify({"error": "Forbidden"}), 403
            return f(*args, **kwargs)
        return wrapper
    return decorator

@app.route("/api/hrms/employees")
@require_role("view_employees", "manage_employees")
def list_employees():
    user = get_user()
    org_id = user["organization_id"]  # tenant alias
    return jsonify({"employees": []})
```

### Go (net/http)

```go
func authMiddleware(next http.Handler) http.Handler {
    return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        ctx := context.WithValue(r.Context(), "userId", r.Header.Get("X-User-Id"))
        ctx = context.WithValue(ctx, "email", r.Header.Get("X-User-Email"))
        ctx = context.WithValue(ctx, "roles", strings.Split(r.Header.Get("X-Client-Roles"), ","))
        ctx = context.WithValue(ctx, "orgId", r.Header.Get("X-Organization-Id"))
        next.ServeHTTP(w, r.WithContext(ctx))
    })
}
```

### Spring Boot (Java)

```java
@RestController
@RequestMapping("/api/hrms")
public class HrmsController {

    @GetMapping("/employees")
    public List<Employee> listEmployees(
        @RequestHeader("X-User-Id") String userId,
        @RequestHeader("X-User-Email") String email,
        @RequestHeader("X-Client-Roles") String clientRoles,
        @RequestHeader("X-Organization-Id") String orgId
    ) {
        List<String> roles = Arrays.asList(clientRoles.split(","));
        if (!roles.contains("view_employees")) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN);
        }
        return employeeService.findByOrg(orgId);
    }
}
```

---

## 10. Troubleshooting

### Common Issues

| Problem | Cause | Fix |
|---------|-------|-----|
| 401 on protected endpoints | Token expired or missing | Refresh token or re-login |
| 502 Bad Gateway on product APIs | Product backend not running | Start your backend on the configured port |
| APISIX openid-connect error | Invalid client_secret | Re-check backend client secret in Keycloak |
| Organization claim missing from JWT | Scope not set as default | Move `organization` from optional to default scope on the client |
| Roles missing from JWT | `fullScopeAllowed=false` but no scope mappings | Add realm/client role scope mappings |
| `KEYCLOAK_ADMIN` env vars don't work | DB already exists | Use `kc.sh bootstrap-admin user` instead |
| Auth service won't start | Missing env vars | Check `.env` has all required vars |
| CORS errors in browser | APISIX CORS plugin misconfigured | Ensure `allow_origins: "**"` in route config |

### Useful Commands

```bash
# Check APISIX routes
curl -s http://localhost:9180/apisix/admin/routes -H "X-API-KEY: doer_apisix_admin_key_2026" | python3 -m json.tool

# Check Keycloak clients
TOKEN=$(curl -sf -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
  -d "username=admin&password=admin&grant_type=password&client_id=admin-cli" \
  -H "Content-Type: application/x-www-form-urlencoded" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
curl -sf "http://localhost:8080/admin/realms/doer/clients" -H "Authorization: Bearer $TOKEN" | python3 -c "
import sys,json
for c in json.load(sys.stdin):
    print(f\"  {c['clientId']:30s} public={c.get('publicClient',False)}  enabled={c.get('enabled',False)}\")
"

# Check auth-service logs
tail -f /tmp/auth-service.log                  # dev
sudo journalctl -u doer-auth -f               # production

# Check database tables
PGPASSWORD=doer_auth_pass psql -U doer_auth_user -d doer_auth -h localhost -c "\dt"

# Test JWT decode
echo "<access_token>" | cut -d. -f2 | base64 -d 2>/dev/null | python3 -m json.tool
```

### Password Policy

All passwords must meet: minimum 8 characters, 1 uppercase, 1 lowercase, 1 digit, 1 special character, cannot reuse last 3 passwords.

### Role Hierarchy

```
platform_admin          (full system access)
  └── tenant_admin      (manages own organization)
       └── tenant_employee  (operational access in own org)
            └── end_user     (default, self-registered)
```

---

## Quick Reference Card

| What | URL |
|------|-----|
| API Docs (Swagger) | `{GATEWAY}/api/docs` |
| Register user | `POST {GATEWAY}/auth/register` |
| Login (PKCE redirect) | `{KEYCLOAK}/realms/doer/protocol/openid-connect/auth?...` |
| Exchange code | `POST {GATEWAY}/auth/token` |
| Refresh token | `POST {GATEWAY}/auth/refresh` |
| Logout | `POST {GATEWAY}/auth/logout` |
| Create tenant | `POST {GATEWAY}/api/tenants` |
| List tenants | `GET {GATEWAY}/api/tenants` |
| Create user in tenant | `POST {GATEWAY}/api/tenants/:tid/users` |
| Platform stats | `GET {GATEWAY}/api/platform/stats` |
| Create product | `POST {GATEWAY}/api/admin/products` |
| List products | `GET {GATEWAY}/api/admin/products` |
| Manage roles | `GET/POST/DELETE {GATEWAY}/api/admin/products/:id/roles` |
| Toggle route | `POST {GATEWAY}/api/admin/products/:id/route/toggle` |

**Local Gateway:** `http://localhost:9080`
**VPS Gateway:** `https://iam.yourdomain.com`
