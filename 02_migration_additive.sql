-- ============================================================
-- Kabadiwala Connect — Additive Migration 02
-- Adds recycler + admin authentication and the `disputed`
-- transaction state. Purely additive: no existing table,
-- column, constraint or relationship is altered or dropped.
-- Safe to run more than once.
-- ============================================================

-- ---------- 1. Recycler self-service authentication ----------
ALTER TABLE recyclers ADD COLUMN IF NOT EXISTS password_hash  VARCHAR(255);
ALTER TABLE recyclers ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE;

-- contact_email becomes the recycler login identifier, so it must be unique.
-- Partial index: existing rows with NULL email stay valid.
CREATE UNIQUE INDEX IF NOT EXISTS uq_recyclers_contact_email
  ON recyclers (contact_email)
  WHERE contact_email IS NOT NULL;

-- ---------- 2. Optional collector PIN (OTP stays primary) ----------
-- Collectors remain phone + OTP based. A PIN is an optional convenience
-- for repeat logins on a shared/low-end device; never required.
ALTER TABLE collectors ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255);

-- ---------- 3. Admin accounts ----------
CREATE TABLE IF NOT EXISTS admins (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email          VARCHAR(150) NOT NULL UNIQUE,
  password_hash  VARCHAR(255) NOT NULL,
  full_name      VARCHAR(150),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ---------- 4. `disputed` transaction status ----------
-- Enum values cannot be added inside a transaction block in older
-- PostgreSQL versions, and IF NOT EXISTS makes the re-run safe.
ALTER TYPE transaction_status ADD VALUE IF NOT EXISTS 'disputed';

-- ---------- 5. Supporting indexes for the new query paths ----------
-- Recycler dashboard: "my transactions, newest first"
CREATE INDEX IF NOT EXISTS idx_transactions_recycler_status
  ON transactions (recycler_id, status);

-- Collector dashboard + admin monitoring
CREATE INDEX IF NOT EXISTS idx_transactions_status
  ON transactions (status);

-- Lot feed for recyclers: open lots by category
CREATE INDEX IF NOT EXISTS idx_lots_status_category
  ON lots (status, category_id);

-- Traceability lookup by human-quoted reference number
CREATE INDEX IF NOT EXISTS idx_traceability_reference
  ON traceability (handover_reference_number);
