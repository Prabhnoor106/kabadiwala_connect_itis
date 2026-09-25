# Kabadiwala Connect

A vernacular (Hindi / Marathi / English), low-literacy-friendly, offline-tolerant, mobile-first platform that connects informal e-waste collectors (**kabadiwalas**) with **authorized recyclers** under India's **E-Waste (Management) Rules, 2022**.

Collectors photograph and weigh a lot, get a transparent rule-based valuation and live market prices, are matched to nearby authorized recyclers, and run the deal through a verifiable handover with a public chain-of-custody receipt. Recyclers self-manage their buying rates, availability and incoming pickups. Admins verify facilities, monitor the platform, and curate the price/AI datasets.

This repository is a **single full-stack app**:

- **Backend** — Node.js + Express REST API, Prisma ORM over PostgreSQL.
- **Frontend** — Vite + React 18 SPA (in [`frontend/`](frontend/)), three role-scoped areas behind a shared login.

> **🚀 Deploying?** See **[DEPLOYMENT.md](DEPLOYMENT.md)** — step-by-step setup on **Vercel** (frontend) + **Render** (backend), using your existing Supabase database. The repo ships with [`render.yaml`](render.yaml) and [`vercel.json`](vercel.json) so both platforms configure themselves.

---

## Table of contents

- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Setup](#setup)
  - [1. Install dependencies](#1-install-dependencies)
  - [2. Configure environment](#2-configure-environment)
  - [3. Create the database schema](#3-create-the-database-schema)
  - [4. Seed demo data](#4-seed-demo-data)
- [Running the app](#running-the-app)
- [Demo logins](#demo-logins)
- [Authentication & roles](#authentication--roles)
- [Transaction lifecycle](#transaction-lifecycle)
- [Valuation (how the estimate is computed)](#valuation-how-the-estimate-is-computed)
- [Traceability & public verification](#traceability--public-verification)
- [Offline-first sync](#offline-first-sync)
- [API surface](#api-surface)
- [Cron jobs](#cron-jobs)
- [Testing](#testing)
- [Project status & verification](#project-status--verification)
- [Project structure](#project-structure)
- [Scripts reference](#scripts-reference)

---

## Architecture

| Layer | Choice |
|---|---|
| Runtime | Node.js 18+ (developed on 24) + Express 4 |
| Database | PostgreSQL (local **or** Supabase — same connection string) |
| ORM | Prisma 6 |
| Collector auth | Phone + OTP, with an optional 4–6 digit PIN fast-path |
| Recycler auth | Email + password (self-service registration) |
| Admin auth | Email + password |
| Sessions | JWT (`Authorization: Bearer <token>`) |
| Validation | Zod (every route validates params/query/body) |
| Uploads | Multer → local `./uploads` (dev) or ImageKit / S3-compatible (prod) |
| Jobs | node-cron |
| Frontend | Vite 5, React 18, react-router-dom 6, Tailwind CSS 3, Recharts |

**Backend layering:** `routes → controllers (thin) → services (business logic) → models (thin Prisma wrappers)`. All enums and the transaction state machine live in [`config/constants.js`](config/constants.js) and mirror the SQL schema. Every API response uses one envelope: `{ success, message, data, pagination? }`.

**Frontend:** the API client in [`frontend/src/lib/api.js`](frontend/src/lib/api.js) is the single place that talks to the backend — it attaches the JWT, unwraps the envelope to `data` (or `{ items, pagination }` when the response is a paginated list), and shapes errors. Screens are lazy-loaded per role so a collector on a slow connection downloads only the collector bundle.

---

## Prerequisites

- **Node.js 18+** and npm
- **PostgreSQL 14+** — a local server, or a free [Supabase](https://supabase.com) project (recommended; the app uses the standard connection string, no Supabase-specific code)

---

## Setup

### 1. Install dependencies

Backend (root) and frontend have separate `package.json` files:

```bash
npm install
npm install --prefix frontend
```

### 2. Configure environment

```bash
cp .env.example .env
```

Then edit `.env`. The only values you *must* set to boot are `DATABASE_URL` and `JWT_SECRET`:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string. **Local:** `postgresql://postgres:<pw>@localhost:5432/kabadiwala_connect`. **Supabase:** Project → Settings → Database → Connection string (URI). |
| `JWT_SECRET` | Long random string. Generate one with `openssl rand -base64 48`. |
| `JWT_EXPIRES_IN` | Token lifetime (default `7d`). |
| `BCRYPT_ROUNDS` | Password/PIN hashing cost (10 dev, 12 prod). |
| `PORT` | Backend port (default `3000`). |
| `CORS_ORIGIN` | Comma-separated allowlist of frontend origins. Default `http://localhost:5173` (the Vite dev server). |
| `SMS_PROVIDER` | `console` (default) prints the OTP to the server log **and returns it in the API response** when `NODE_ENV` is not `production` — that is how you log in as a collector in development. |
| `CLOUD_STORAGE_PROVIDER` | Empty → uploads saved to `./uploads` locally. Set `imagekit` or `s3` and fill the matching keys for cloud storage. |
| `AI_SERVICE_ENABLED` | `false`. There is no trained model; valuation is a documented rule and anomaly detection is a statistical check (both labelled as such in responses). Only set `true` if you run a real model service. |

> The frontend needs no env for local dev — [`frontend/vite.config.js`](frontend/vite.config.js) proxies `/api` to `http://localhost:3000`. For a deployed frontend, set `VITE_API_BASE_URL` to the API origin at build time.

### 3. Create the database schema

Point `DATABASE_URL` at an empty database, then apply the schema:

```bash
npm run db:setup
```

This runs [`scripts/applySchema.js`](scripts/applySchema.js), which executes the SQL in [`01_schema.sql`](01_schema.sql) (tables, enums, indexes). Then generate the Prisma client:

```bash
npm run db:generate
```

<details>
<summary>Alternative: Prisma-managed schema</summary>

If you prefer Prisma to own the schema instead of the raw SQL file:

```bash
npm run db:push       # prisma db push — create tables from prisma/schema.prisma
```
</details>

Verify the database is reachable and populated at any time with:

```bash
npm run db:verify
```

### 4. Seed demo data

```bash
npm run db:seed
```

This is **idempotent** — re-running upserts reference data and skips existing demo lots. Pass `--fresh` to wipe transactional data (lots, transactions, traceability, samples, sync log) and rebuild it:

```bash
npm run db:seed -- --fresh
```

The seed creates realistic data covering **every table and every lifecycle state** so every screen has something meaningful to render: 12 material categories + 7 sub-categories, 6 recyclers (authorized / pending / suspended), per-recycler buying rates, 90 days of price history, 5 collectors, and 18 lots driven to each transaction state (quoted, accepted, in_transit, handed_over, confirmed, completed, cancelled, disputed, plus draft/active lots and offline-sync log entries).

---

## Running the app

Run the backend and frontend in two terminals:

```bash
# Terminal 1 — backend API at http://localhost:3000
npm run dev          # hot-reload (node --watch); use `npm start` for production
```

```bash
# Terminal 2 — frontend at http://localhost:5173
npm run frontend:dev
```

Open **http://localhost:5173** and sign in with a demo account below.

Production frontend build (outputs static assets to `frontend/dist/`):

```bash
npm run frontend:build
```

Health check (also reports DB connectivity):

```bash
curl http://localhost:3000/api/health
```

---

## Demo logins

Created by `npm run db:seed`:

| Role | Credentials | How to log in |
|---|---|---|
| **Admin** | `admin@kabadiwala.local` / `admin1234` | Email + password |
| **Recycler** | `ops@greentech-ewaste.in` / `recycler1234` | Email + password (all seeded recyclers share this password) |
| **Collector** | phone `9812345670`, PIN `1234` | PIN fast-path, **or** request an OTP — in dev the OTP is printed to the backend log and returned in the API response. A second collector `9812345671` has PIN `4321`. |

Other seeded recyclers (same password) let you see non-authorized states: `contact@ecorecycle.in` (authorized), `info@sahyadrimetals.in` (pending), `admin@deccanscrap.in` (suspended).

---

## Authentication & roles

Three roles, each with its own login, all issued a JWT carrying `{ id, phone|email, role }`. Authorization is enforced per-route by `authenticate` + `authorize(...roles)` middleware; recycler rate-setting additionally requires `requireAuthorizedRecycler` (a pending/suspended recycler can browse but not publish buying rates).

| Role | Who | Can do |
|---|---|---|
| `collector` | Kabadiwalas | Create/manage lots, get valuations & prices, view ranked recycler matches, request pickups, record handovers, track earnings, read safety guidance. |
| `recycler` | Authorized recycling facilities (self-register) | Manage buying rates & availability, review incoming pickup requests, accept/reject, confirm handovers, mark payment, edit their profile. |
| `admin` | Platform operations | Verify/authorize recyclers, verify collectors, monitor lots & transactions, record market prices, review analytics and dataset health. |

The **first** admin can self-register via `POST /api/auth/admin/register`; after that, creating admins requires an existing admin token.

---

## Transaction lifecycle

The state machine is the single source of truth (`TRANSACTION_TRANSITIONS` + `TRANSITION_ACTORS` in [`config/constants.js`](config/constants.js)) and is enforced on every write — including offline-synced ones.

```
quoted ─▶ accepted ─▶ in_transit ─▶ handed_over ─▶ confirmed ─▶ completed
            │            │              │
            ▼            ▼              ▼
        cancelled    cancelled/     cancelled/
                     disputed       disputed  ──▶ (resolved) completed | cancelled
```

- **`completed`** and **`cancelled`** are terminal.
- Money-skipping shortcuts (e.g. `quoted → completed`) are illegal.
- Only a **recycler** (or admin) may `accept`, `confirm`, and `complete`; a **collector** may `cancel`, `dispute`, and record `in_transit` / `handed_over`.

---

## Valuation (how the estimate is computed)

The lot estimate is a **transparent rule, never a model prediction**:

```
estimated_value = reference_price_per_kg × approximate_weight × condition_factor
```

`condition_factor`: `working 1.15`, `mixed 1.00`, `non_working 0.90`, `damaged 0.75`. Responses carry `method: "rule_based_price_x_weight"` and a plain-language `reason` + `disclaimer` so the number is never presented as an AI output. If price data or a valid weight is missing, the API returns `{ estimated_value: null, method: "unavailable" }` rather than a fabricated figure.

---

## Traceability & public verification

Every physical handover creates a traceability record with a **handover reference number** of the form `HRN-YYYYMMDD-XXXX`, weight, geolocation, timestamps, and photos. Anyone holding a paper slip can verify the chain of custody — no login required:

- **API:** `GET /api/traceability/verify/:reference`
- **UI:** `http://localhost:5173/verify/HRN-20260905-A3F7`

---

## Offline-first sync

Collectors often work without connectivity. The client queues writes locally and flushes them to `POST /api/sync/batch` with an idempotency key per entry:

```json
{
  "entries": [
    {
      "idempotency_key": "unique-client-key-1",
      "operation": "create_lot",
      "payload": { "category_id": "…", "approximate_weight": 5.5, "condition": "mixed" },
      "client_timestamp": "2026-09-04T10:00:00Z"
    }
  ]
}
```

Supported operations: `create_lot`, `update_lot_status`, `create_transaction`, `update_transaction_status`, `create_handover`. **Each queued write is replayed through the same service layer as an online request**, so business rules (recycler authorization, the transaction state machine, actor-role checks, server-side valuation) are enforced identically — an offline device cannot jump a transaction to `completed` or transact with an unauthorized recycler. Duplicate keys are ignored; entries that violate a rule are recorded as conflicts rather than applied.

---

## API surface

Base path: `/api`. All authenticated routes expect `Authorization: Bearer <token>`.

**Auth**
```
POST /auth/send-otp                 { phone }
POST /auth/verify-otp               { phone, otp }
POST /auth/collector/login-pin      { phone, pin }
PUT  /auth/collector/pin            { pin }                 [collector]
POST /auth/recycler/register        { business_name, contact_email, password, … }
POST /auth/recycler/login           { contact_email, password }
POST /auth/admin/register           { email, password }     (first is open; then [admin])
POST /auth/admin/login              { email, password }
GET  /auth/me                                               [auth]
PATCH /auth/language | /auth/location                       [collector]
```

**Materials, lots & valuation**
```
GET   /categories
POST  /lots/estimate                [auth]  live valuation, nothing saved
POST  /lots                         [auth]  multipart, image field `image`
GET   /lots                         [auth]  caller-scoped
GET   /lots/:id                     [auth]
PATCH /lots/:id | /lots/:id/status  [auth]
DELETE /lots/:id                    [auth]  drafts with no history only
GET   /lots/:id/matches             [auth]  ranked authorized recyclers
GET   /lots/:id/traceability        [auth]  full timeline
```

**Prices**
```
GET  /prices/board                  full board (public)
GET  /prices?category_id=           single category
GET  /prices/trend?category_id=&days=30
GET  /prices/speak?category_id=&lang=hi   spoken-price text for TTS
POST /prices                        [admin]
```

**Recyclers** (self-service under `/me`, admin management under `/:id`)
```
GET   /recyclers                              directory
GET   /recyclers/:id | /recyclers/:id/rates
GET   /recyclers/me/dashboard                 [recycler]
GET   /recyclers/me/profile                   [recycler]
PATCH /recyclers/me/profile                   [recycler]
PATCH /recyclers/me/availability              [recycler]
GET   /recyclers/me/rates                     [recycler]
PUT   /recyclers/me/rates                     [recycler, authorized]
DELETE /recyclers/me/rates/:category_id       [recycler]
GET   /recyclers/me/incoming                  [recycler]
POST  /recyclers                              [admin]
PATCH /recyclers/:id/authorization            [admin]
```

**Transactions**
```
POST  /transactions                          [auth]  request pickup at a quoted price
GET   /transactions | /transactions/:id      [auth]  role-scoped
PATCH /transactions/:id/status               [auth]  lifecycle transition
POST  /transactions/:id/handover             [auth]  multipart, photo field `photos`
GET   /transactions/:id/handover             [auth]
POST  /transactions/traceability/:id/confirm [auth]  recycler confirms receipt
```

**Collector ledger, admin, traceability, sync, safety**
```
GET  /collectors/me/dashboard | /collectors/me/ledger   [collector]
GET  /admin/stats | /analytics | /attention | /datasets | /collectors | /lots | /admins   [admin]
PATCH /admin/collectors/:id/verification                                                  [admin]
POST /admin/prices                                                                        [admin]
GET  /traceability/verify/:reference          public
POST /sync/batch                              [auth]
GET  /safety/guidance?category_code=BAT&lang=hi   public
POST /upload | GET /upload/auth               [auth]   (ImageKit signing params)
```

---

## Cron jobs

| Job | Schedule (`.env`) | Purpose |
|---|---|---|
| Price trend | `PRICE_TREND_CRON` (default every 6h) | Aggregates recycler rates into `price_history`. |
| Model retrain | `MODEL_RETRAIN_CRON` (default daily 02:00) | No-op unless `AI_SERVICE_ENABLED=true` and enough unapplied feedback has accumulated. |

---

## Testing

```bash
npm test
```

Runs the Node built-in test runner over `tests/*.test.js` (**24 tests, no database required**):

- **`stateMachine.test.js`** — the transaction state machine: the happy path is legal end-to-end, terminal states are terminal, money-skipping shortcuts are rejected, and only the right role can drive each transition.
- **`valuation.test.js`** — the rule-based estimate: condition factors are ordered and correct, and a non-positive/non-numeric weight yields an honest `unavailable` (never a fabricated number).
- **`reference.test.js`** — handover reference format `HRN-YYYYMMDD-XXXX`, its round-trip with the validator, and batch uniqueness.
- **`response.test.js`** — the response envelope contract the frontend `api.js` depends on (data unwrapping; `pagination` only at the top level).

Frontend production build (also a compile-time check of all 22 screens):

```bash
npm run frontend:build
```

---

## Project status & verification

What has been verified in this repository, without a database connection:

- ✅ `npm test` — 24/24 passing.
- ✅ `npm run frontend:build` — succeeds; all 22 screens (login + public verify, 9 collector, 5 recycler, 6 admin) compile and bundle.
- ✅ Backend module graph loads cleanly (no circular deps, all imports resolve).
- ✅ Contract check — every API call the frontend makes maps to a real client method **and** a real backend route with matching authorization.

**End-to-end runtime verification requires a running PostgreSQL server.** The steps under [Setup](#setup) are the exact path to a working instance on your machine (local Postgres or a Supabase project — the code is identical for both). After `db:setup` + `db:seed`, sign in with the demo accounts and the full flow works against real data: collector creates a lot → gets a rule-based valuation and live prices → is matched to authorized recyclers → requests a pickup → recycler accepts → handover is recorded with photos and a reference number → recycler confirms → payment is marked → transaction completes, and the handover is publicly verifiable at `/verify/:reference`.

---

## Project structure

```
kabadiwalaConnect/
├── 01_schema.sql              # Canonical PostgreSQL schema (applied by db:setup)
├── 02_migration_additive.sql  # Additive migration
├── app.js                     # Express app: middleware + route mounting
├── server.js                  # HTTP server entry point + cron bootstrap
├── config/                    # db (Prisma singleton), constants, storage
├── models/                    # Thin Prisma wrappers per dataset
├── controllers/               # Request handlers (thin)
├── routes/                    # Express routes + Zod validation
├── services/                  # Business logic (transactions, pricing, sync, auth…)
├── middleware/                # auth, upload, validate, error handling
├── jobs/                      # node-cron jobs
├── utils/                     # logger, response envelope, geo, reference generator
├── scripts/                   # applySchema.js, verifyDb.js
├── prisma/                    # schema.prisma + seed.js
├── tests/                     # node --test suite (DB-free)
├── uploads/                   # Local file uploads (dev)
└── frontend/                  # Vite + React SPA
    ├── vite.config.js         # dev proxy /api → :3000
    └── src/
        ├── lib/api.js         # single API client
        ├── context/           # AppContext (auth/session)
        ├── components/        # Layout, UI primitives, Icon, Timeline
        └── pages/             # Login, VerifyHandover, collector/*, recycler/*, admin/*
```

---

## Scripts reference

| Command | Description |
|---|---|
| `npm run dev` / `npm start` | Backend with hot-reload / production |
| `npm run frontend:dev` / `npm run frontend:build` | Frontend dev server / production build |
| `npm run db:setup` | Apply `01_schema.sql` to `DATABASE_URL` |
| `npm run db:generate` | Generate the Prisma client |
| `npm run db:push` | Push `schema.prisma` to the DB (Prisma-managed alternative) |
| `npm run db:seed` [`-- --fresh`] | Seed demo data (idempotent; `--fresh` rebuilds transactional data) |
| `npm run db:verify` | Check DB connectivity and row counts |
| `npm run db:studio` | Open Prisma Studio |
| `npm test` | Run the DB-free unit test suite |
