# Kabadiwala Connect — Backend API

Backend for **Kabadiwala Connect**, a vernacular, low-literacy, offline-tolerant platform connecting informal e-waste collectors (kabadiwalas) with authorized recyclers under India's E-Waste (Management) Rules, 2022.

## Tech Stack

| Layer | Choice |
|---|---|
| Runtime | Node.js (LTS) + Express |
| Database | PostgreSQL |
| ORM | Prisma |
| Auth | JWT + OTP (phone-based, no passwords) |
| Validation | Zod |
| File Uploads | Multer (local/cloud) |
| Jobs | node-cron |

## Quick Start

### Prerequisites

- Node.js 18+ (LTS)
- PostgreSQL 14+
- npm

### 1. Clone & Install

```bash
cd kabadiwala-connect-backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your PostgreSQL connection string and JWT secret
```

### 3. Set Up Database

**Option A — From SQL schema (recommended for first setup):**

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE kabadiwala_connect;"

# Apply the schema
psql -U postgres -d kabadiwala_connect -f 01_schema.sql
```

**Option B — Via Prisma:**

```bash
# Generate Prisma client
npx prisma generate

# Push schema to DB (creates tables if they don't exist)
npx prisma db push
```

### 4. Seed Demo Data

```bash
npm run db:seed
```

This creates:
- 10 material categories (PCB, BAT, CRT, CBL, etc.) + 3 battery sub-categories
- 3 demo recyclers (Mumbai, Noida, Bengaluru) with material rates
- 30 days of price history per category

### 5. Start the Server

```bash
# Development (with hot-reload)
npm run dev

# Production
npm start
```

Server starts at `http://localhost:3000`.

## Core API Endpoints

### Health Check
```
GET /api/health
```

### Auth (OTP-based)
```
POST /api/auth/send-otp          { phone }
POST /api/auth/verify-otp        { phone, otp }
GET  /api/auth/me                [Auth]
```

### Materials & Lots
```
GET  /api/categories
POST /api/lots                   [Auth] + image upload
GET  /api/lots                   [Auth]
GET  /api/lots/:id               [Auth]
PATCH /api/lots/:id/status       [Auth]
GET  /api/lots/:id/matches       [Auth] — ranked recyclers
```

### Prices
```
GET  /api/prices?category_id=
GET  /api/prices/board
GET  /api/prices/trend?category_id=&days=30
POST /api/prices                 [Admin]
```

### Recyclers
```
GET  /api/recyclers
GET  /api/recyclers/:id
POST /api/recyclers              [Admin]
PATCH /api/recyclers/:id         [Admin]
PUT  /api/recyclers/:id/rates    [Admin]
GET  /api/recyclers/:id/rates
```

### Transactions
```
POST  /api/transactions                    [Auth]
GET   /api/transactions                    [Auth]
GET   /api/transactions/:id                [Auth]
PATCH /api/transactions/:id/status         [Auth]
POST  /api/transactions/:id/handover       [Auth] + photo uploads
POST  /api/transactions/traceability/:id/confirm  [Admin]
```

### Collector Ledger
```
GET /api/collectors/:id/ledger   [Auth]
```

### Offline Sync
```
POST /api/sync/batch             [Auth]
```

### Safety Guidance
```
GET /api/safety/guidance?category_code=BAT&lang=hi
```

## Transaction Lifecycle

```
quoted → accepted → in_transit → handed_over → confirmed → completed
  ↓         ↓          ↓             ↓
cancelled cancelled  cancelled    cancelled
```

## Auth Roles

| Role | Description |
|------|-------------|
| `collector` | E-waste collectors (kabadiwalas) — phone/OTP auth |
| `admin` | Ops/admin staff — manages recyclers, confirms handovers |

> Recycler-side actions are admin-mediated for the MVP (no self-service recycler accounts).

## Offline-First Support

The `/api/sync/batch` endpoint accepts an array of offline-queued writes:

```json
{
  "entries": [
    {
      "idempotency_key": "unique-client-key-1",
      "operation": "create_lot",
      "payload": { "category_id": "...", "approximate_weight": 5.5 },
      "client_timestamp": "2026-09-04T10:00:00Z"
    }
  ]
}
```

Operations: `create_lot`, `update_lot_status`, `create_transaction`, `update_transaction_status`, `create_handover`.

## Cron Jobs

| Job | Schedule | Purpose |
|-----|----------|---------|
| Price Trend | Every 6h | Aggregates recycler rates into price_history |
| Model Retrain | Daily 2AM | Triggers external AI retrain when feedback threshold met |

## Prisma Commands

```bash
npx prisma generate    # Generate Prisma Client
npx prisma db push     # Push schema to DB
npx prisma studio      # Visual DB editor
npx prisma migrate dev # Create a migration
```

## Project Structure

```
kabadiwala-connect-backend/
├── prisma/           # Schema + seed
├── config/           # DB, cloud storage, constants
├── models/           # Thin Prisma wrappers per dataset
├── controllers/      # Request handlers (thin)
├── routes/           # Express route definitions + validation
├── services/         # Business logic
├── middleware/        # Auth, upload, validation, error handling
├── jobs/             # Cron jobs
├── utils/            # Logger, response formatter, geo, reference generator
├── uploads/          # Local file uploads (dev)
├── app.js            # Express app setup
└── server.js         # Server entry point
```
