# Doer IAM — Getting Started (Local Development)

> **Version**: 1.0 | **Last updated**: 2026-03-01
>
> Step-by-step guide to set up the entire Doer IAM system from scratch on a local machine.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Database Setup](#2-database-setup)
3. [Start Docker Infrastructure](#3-start-docker-infrastructure)
4. [Start Keycloak](#4-start-keycloak)
5. [Configure Keycloak Realm](#5-configure-keycloak-realm)
6. [Start Auth Service](#6-start-auth-service)
7. [Configure APISIX Routes](#7-configure-apisix-routes)
8. [Start Admin Portal](#8-start-admin-portal)
9. [Create a Product](#9-create-a-product)
10. [Create a Tenant](#10-create-a-tenant)
11. [Start Demo Products](#11-start-demo-products)
12. [Test the System](#12-test-the-system)
13. [Full Reset (Clean Slate)](#13-full-reset-clean-slate)
14. [Service Ports Reference](#14-service-ports-reference)
15. [Default Credentials](#15-default-credentials)
16. [RBAC Architecture](#16-rbac-architecture)

---

## 1. Prerequisites

| Dependency     | Version   | Notes                                          |
| -------------- | --------- | ---------------------------------------------- |
| Node.js        | >= 18     | For auth-service, admin-portal, demo products  |
| PostgreSQL     | >= 15     | Local install, accessible via `psql`            |
| Docker         | >= 24     | For Redis, APISIX, etcd, Prometheus, Grafana   |
| Java           | >= 21     | Keycloak runtime                               |
| Keycloak       | 26.5.4    | Pre-downloaded at `keycloak-26.5.4/`           |

Make sure PostgreSQL is running and you can connect:

```bash
psql -U anis -d postgres -c "SELECT 1;"
```

---

## 2. Database Setup

Create the database roles and databases:

```bash
psql -U anis -d postgres <<'SQL'
-- Keycloak database
CREATE ROLE keycloak_user WITH LOGIN PASSWORD 'keycloak_pass_2026';
CREATE DATABASE keycloak OWNER keycloak_user;

-- Auth service database
CREATE ROLE doer_auth_user WITH LOGIN PASSWORD 'doer_auth_pass';
CREATE DATABASE doer_auth OWNER doer_auth_user;
SQL
```

Verify:

```bash
psql -U anis -d postgres -c "\l" | grep -E "keycloak|doer_auth"
```

---

## 3. Start Docker Infrastructure

This starts Redis, etcd, APISIX, Prometheus, and Grafana:

```bash
cd ~/code/IAM
docker compose up -d
```

Verify all containers are running:

```bash
docker compose ps
```

Expected containers: `doer-redis`, `doer-etcd`, `doer-apisix`, `doer-prometheus`, `doer-grafana`.

---

## 4. Start Keycloak

```bash
cd ~/code/IAM
bash scripts/start-keycloak.sh
```

Wait until you see `Keycloak ... started in Xs` in the log output.

Then bootstrap the admin user (only needed on fresh DB):

```bash
~/code/IAM/keycloak-26.5.4/bin/kc.sh bootstrap-admin user --username admin --password admin
```

Verify by opening **http://localhost:8080** and logging in with `admin` / `admin`.

---

## 5. Configure Keycloak Realm

The setup script is idempotent — safe to run multiple times:

```bash
cd ~/code/IAM
bash scripts/setup-realm.sh
```

This creates:
- **Realm**: `doer`
- **Realm roles**: `platform_admin`, `tenant_admin`, `tenant_employee`, `end_user`
- **Clients**: `doer-auth-svc` (service account), `doer-admin` (admin portal)
- **Admin user**: assigned `platform_admin` role
- **Organizations** feature enabled on the realm

---

## 6. Start Auth Service

```bash
cd ~/code/IAM/services/auth-service
npm install   # first time only
npm run start:dev
```

The service:
- Runs on **port 3001**
- Auto-runs TypeORM migrations (creates tables in `doer_auth`)
- Connects to Keycloak via service account (`doer-auth-svc`)
- Swagger docs at **http://localhost:3001/api/docs**

---

## 7. Configure APISIX Routes

```bash
cd ~/code/IAM
bash config/apisix/setup-routes.sh
```

This configures:
- Route 1: Auth service public endpoints (`/api/auth/*`)
- Route 2: Auth service admin endpoints (`/api/admin/*`, `/api/tenants/*`)
- Route 3: Admin portal static files

---

## 8. Start Admin Portal

```bash
cd ~/code/IAM/services/admin-portal
npm install   # first time only
npm run dev
```

Open **http://localhost:5174** and log in with `admin` / `admin` (platform admin).

---

## 9. Create a Product

In the Admin Portal, navigate to **Products > Create New Product**.

### Product Info

| Field        | Value                     |
| ------------ | ------------------------- |
| Name         | `Doer Visa`               |
| Slug         | `doer-visa`               |
| Description  | `Visa application system` |

### Infrastructure

| Field        | Value                     |
| ------------ | ------------------------- |
| Frontend URL | `http://localhost:5173`    |
| Backend Host | `localhost`                |
| Backend Port | `4001`                    |

### Permissions (Step 1)

Define the granular capabilities:

| Permission             | Description                         |
| ---------------------- | ----------------------------------- |
| `create_application`   | Submit new visa applications        |
| `view_application`     | View visa applications              |
| `process_application`  | Process visa applications           |
| `approve_application`  | Approve or reject applications      |
| `manage_all`           | Full administrative access          |

### Roles (Step 2)

Define roles that bundle permissions:

| Role       | Description      | Permissions                                                                              |
| ---------- | ---------------- | ---------------------------------------------------------------------------------------- |
| `admin`    | Full access      | `create_application`, `view_application`, `process_application`, `approve_application`, `manage_all` |
| `employee` | Can process      | `create_application`, `view_application`, `process_application`                          |
| `student`  | Can apply & view | `create_application`, `view_application`                                                 |

### Default Role (Step 3)

Select **`student`** as the default role for self-registration.

Click **Create Product**.

---

## 10. Create a Tenant

In the Admin Portal, navigate to **Tenants > Create Tenant**.

| Field          | Value               |
| -------------- | ------------------- |
| Product        | `doer-visa`         |
| Tenant Name    | `ACME Corp`         |
| Alias          | `acme`              |
| Admin Email    | `admin@acme.com`    |
| Admin Password | `Test1234@pass`     |

This creates:
- A Keycloak organization named `acme`
- A tenant admin user (`admin@acme.com`) with `tenant_admin` role and `admin` client role
- Email is auto-verified

---

## 11. Start Demo Products

Open two new terminals:

**Terminal — Visa API Backend:**

```bash
cd ~/code/IAM/dummy-products/doer-visa-api
npm install   # first time only
npm run dev
```

Runs on **port 4001**.

**Terminal — Visa Frontend:**

```bash
cd ~/code/IAM/dummy-products/doer-visa-frontend
npm install   # first time only
npm run dev
```

Runs on **port 5173**.

---

## 12. Test the System

### Log in as Tenant Admin

1. Open **http://localhost:5173**
2. Click **Sign in with Keycloak**
3. Log in with `admin@acme.com` / `Test1234@pass`
4. You should see the Dashboard with `admin` role capabilities

### Create Users (as Tenant Admin)

1. Go to **Users** page
2. Add a new user with email, name, password
3. Assign a **Product Role** (e.g., `employee` or `student`)

### Self-Registration (as End User)

1. Log out or open a private browser window
2. Open **http://localhost:5173**
3. Click **Create New Account**
4. Fill in the registration form with tenant alias `acme`
5. The user will be auto-assigned the `student` role

### Test Visa Application Workflow

1. As a `student`: create a visa application
2. As an `employee`: process the application
3. As an `admin`: approve or reject the application

### Verify Profile Page

The **Profile** page shows:
- Left panel: decoded JWT token (frontend)
- Right panel: `/me` endpoint response (backend via APISIX headers)

Both should show matching identity, organization, and roles.

---

## 13. Full Reset (Clean Slate)

To wipe everything and start over:

```bash
# 1. Stop all running Node.js services (Ctrl+C in each terminal)

# 2. Stop Docker and remove volumes
cd ~/code/IAM && docker compose down -v

# 3. Kill Keycloak connections and drop databases
psql -U anis -d postgres -c "
  SELECT pg_terminate_backend(pid)
  FROM pg_stat_activity
  WHERE datname IN ('keycloak', 'doer_auth')
    AND pid <> pg_backend_pid();
"

psql -U anis -d postgres <<'SQL'
DROP DATABASE IF EXISTS keycloak;
DROP DATABASE IF EXISTS doer_auth;
DROP ROLE IF EXISTS keycloak_user;
DROP ROLE IF EXISTS doer_auth_user;
SQL

# 4. Start fresh from Step 2
```

---

## 14. Service Ports Reference

| Service           | Port  | URL                          |
| ----------------- | ----- | ---------------------------- |
| Keycloak          | 8080  | http://localhost:8080        |
| Auth Service      | 3001  | http://localhost:3001        |
| Auth Service Docs | 3001  | http://localhost:3001/api/docs |
| Admin Portal      | 5174  | http://localhost:5174        |
| Doer Visa Frontend| 5173  | http://localhost:5173        |
| Doer Visa API     | 4001  | http://localhost:4001        |
| APISIX Gateway    | 9080  | http://localhost:9080        |
| APISIX Control    | 9092  | http://localhost:9092        |
| Redis             | 6379  | localhost:6379               |
| etcd              | 2379  | localhost:2379               |
| Grafana           | 3000  | http://localhost:3000        |
| Prometheus        | 9090  | http://localhost:9090        |

---

## 15. Default Credentials

| Account                | Username/Email     | Password         | Context         |
| ---------------------- | ------------------ | ---------------- | --------------- |
| Keycloak Admin Console | `admin`            | `admin`          | Keycloak UI     |
| Platform Admin (IAM)   | `admin`            | `admin`          | Admin Portal    |
| Tenant Admin (example) | `admin@acme.com`   | `Test1234@pass`  | Doer Visa       |

---

## 16. RBAC Architecture

The system implements a two-level RBAC model using Keycloak's composite roles:

```
Permissions (granular capabilities)
    |
    v
Roles (groups of permissions)
    |
    v
Users (assigned roles, inherit permissions)
```

### How It Maps to Keycloak

| RBAC Concept | Keycloak Concept       | Example                    |
| ------------ | ---------------------- | -------------------------- |
| Permission   | Simple client role     | `create_application`       |
| Role         | Composite client role  | `employee`                 |
| User         | Keycloak user          | `john@acme.com`            |

### Token Behavior

When a user with role `employee` (which bundles `create_application` + `view_application`) logs in, their JWT contains:

```json
{
  "resource_access": {
    "doer-visa": {
      "roles": ["employee", "create_application", "view_application"]
    }
  }
}
```

Keycloak automatically expands composite roles, so both the role name AND all bundled permission names appear in the token. This allows backend services to check either roles or permissions.

### Product Creation Flow

1. **Platform admin** defines permissions during product creation
2. **Platform admin** defines roles and maps permissions to each role
3. **Platform admin** selects a default role for self-registration
4. **Tenant admins** assign roles to users (not individual permissions)
5. **Self-registered users** automatically get the default role
