-- ============================================================
-- Kabadiwala Connect — PostgreSQL Schema
-- Source of truth for all table/column/enum names
-- ============================================================

-- ======================== ENUM TYPES ========================

CREATE TYPE lot_status AS ENUM (
  'draft', 'active', 'matched', 'in_transaction', 'completed', 'expired'
);

CREATE TYPE lot_condition AS ENUM (
  'working', 'non_working', 'damaged', 'mixed'
);

CREATE TYPE source_type AS ENUM (
  'household', 'commercial', 'industrial', 'institutional'
);

CREATE TYPE transaction_status AS ENUM (
  'quoted', 'accepted', 'in_transit', 'handed_over', 'confirmed', 'completed', 'cancelled'
);

CREATE TYPE payment_status AS ENUM (
  'pending', 'partial', 'completed', 'refunded'
);

CREATE TYPE payment_method AS ENUM (
  'cash', 'upi', 'bank_transfer', 'other'
);

CREATE TYPE authorization_status AS ENUM (
  'authorized', 'pending', 'suspended', 'revoked'
);

CREATE TYPE preferred_language AS ENUM (
  'hi', 'mr', 'en'
);

CREATE TYPE training_sample_source AS ENUM (
  'lot_completion', 'transaction', 'manual_upload'
);

-- ======================== TABLES ========================

-- collectors (deliberately minimal — no name/address/ID-proof)
CREATE TABLE collectors (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone               VARCHAR(15) NOT NULL UNIQUE,
  otp_secret          VARCHAR(6),
  otp_expires_at      TIMESTAMPTZ,
  preferred_language  preferred_language DEFAULT 'hi',
  location_lat        DECIMAL(10, 8),
  location_lng        DECIMAL(11, 8),
  is_verified         BOOLEAN DEFAULT FALSE,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- material_categories (hierarchical via parent_id)
CREATE TABLE material_categories (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          VARCHAR(100) NOT NULL,
  code          VARCHAR(20) NOT NULL UNIQUE,
  description   TEXT,
  icon_url      VARCHAR(255),
  hazard_level  INTEGER DEFAULT 0,   -- 0=safe, 1=low, 2=medium, 3=high
  parent_id     UUID REFERENCES material_categories(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- lots (a collector's batch of scrap material)
CREATE TABLE lots (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id            UUID NOT NULL REFERENCES collectors(id),
  category_id             UUID NOT NULL REFERENCES material_categories(id),
  sub_category_id         UUID REFERENCES material_categories(id),
  image_url               VARCHAR(255),
  approximate_weight      DECIMAL(10, 2) NOT NULL,
  condition               lot_condition NOT NULL DEFAULT 'mixed',
  source_type             source_type NOT NULL DEFAULT 'household',
  estimated_value         DECIMAL(10, 2),
  status                  lot_status DEFAULT 'draft',
  collection_location_lat DECIMAL(10, 8),
  collection_location_lng DECIMAL(11, 8),
  collection_address      TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_lots_collector ON lots(collector_id);
CREATE INDEX idx_lots_category ON lots(category_id);
CREATE INDEX idx_lots_status ON lots(status);

-- recyclers
CREATE TABLE recyclers (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name           VARCHAR(200) NOT NULL,
  registration_number     VARCHAR(100) UNIQUE,
  authorization_status    authorization_status DEFAULT 'pending',
  contact_phone           VARCHAR(15),
  contact_email           VARCHAR(100),
  address                 TEXT,
  location_lat            DECIMAL(10, 8),
  location_lng            DECIMAL(11, 8),
  pickup_available        BOOLEAN DEFAULT FALSE,
  max_pickup_distance_km  INTEGER DEFAULT 50,
  operating_hours         VARCHAR(100),
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- recycler_materials (rates per material per recycler)
CREATE TABLE recycler_materials (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recycler_id   UUID NOT NULL REFERENCES recyclers(id) ON DELETE CASCADE,
  category_id   UUID NOT NULL REFERENCES material_categories(id),
  buying_price  DECIMAL(10, 2) NOT NULL,
  unit          VARCHAR(20) DEFAULT 'kg',
  min_quantity  DECIMAL(10, 2) DEFAULT 0,
  last_updated  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(recycler_id, category_id)
);

-- price_history (append-only — INSERT only, no UPDATE)
CREATE TABLE price_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id     UUID NOT NULL REFERENCES material_categories(id),
  location        VARCHAR(100),
  buying_price    DECIMAL(10, 2) NOT NULL,
  selling_price   DECIMAL(10, 2),
  source          VARCHAR(100),      -- e.g. 'recycler_update', 'market_survey'
  recorded_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_price_history_category ON price_history(category_id);
CREATE INDEX idx_price_history_recorded ON price_history(recorded_at);

-- transactions
CREATE TABLE transactions (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id                UUID NOT NULL REFERENCES lots(id),
  collector_id          UUID NOT NULL REFERENCES collectors(id),
  recycler_id           UUID NOT NULL REFERENCES recyclers(id),
  offered_price         DECIMAL(10, 2) NOT NULL,
  final_price           DECIMAL(10, 2),
  final_weight          DECIMAL(10, 2),
  status                transaction_status DEFAULT 'quoted',
  payment_status        payment_status DEFAULT 'pending',
  payment_method        payment_method,
  status_history        JSONB DEFAULT '[]',
  pickup_scheduled_at   TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  cancellation_reason   TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_transactions_collector ON transactions(collector_id);
CREATE INDEX idx_transactions_recycler ON transactions(recycler_id);
CREATE INDEX idx_transactions_lot ON transactions(lot_id);

-- traceability (handover record)
CREATE TABLE traceability (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id              UUID NOT NULL UNIQUE REFERENCES transactions(id),
  handover_reference_number   VARCHAR(20) NOT NULL UNIQUE,
  actual_weight               DECIMAL(10, 2) NOT NULL,
  handover_location_lat       DECIMAL(10, 8),
  handover_location_lng       DECIMAL(11, 8),
  handover_timestamp          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  collector_confirmed         BOOLEAN DEFAULT TRUE,
  collector_confirmed_at      TIMESTAMPTZ DEFAULT NOW(),
  recycler_confirmed          BOOLEAN DEFAULT FALSE,
  recycler_confirmed_at       TIMESTAMPTZ,
  notes                       TEXT,
  created_at                  TIMESTAMPTZ DEFAULT NOW()
);

-- traceability_photos
CREATE TABLE traceability_photos (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  traceability_id   UUID NOT NULL REFERENCES traceability(id) ON DELETE CASCADE,
  photo_url         VARCHAR(255) NOT NULL,
  photo_type        VARCHAR(50) DEFAULT 'handover',
  uploaded_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ai_training_samples
CREATE TABLE ai_training_samples (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_url     VARCHAR(255) NOT NULL,
  category_id   UUID REFERENCES material_categories(id),
  weight        DECIMAL(10, 2),
  price         DECIMAL(10, 2),
  location      VARCHAR(100),
  source        training_sample_source DEFAULT 'lot_completion',
  quality_notes TEXT,
  lot_id        UUID REFERENCES lots(id),
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ADDITIONS (not in original schema — approved via §7 flag-back)
-- ============================================================

-- sync_log (offline-write outbox / conflict tracker)
CREATE TYPE sync_operation AS ENUM (
  'create_lot', 'update_lot_status', 'create_transaction',
  'update_transaction_status', 'create_handover'
);

CREATE TYPE sync_status AS ENUM (
  'pending', 'applied', 'conflict', 'rejected'
);

CREATE TABLE sync_log (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  collector_id      UUID NOT NULL REFERENCES collectors(id),
  idempotency_key   VARCHAR(64) NOT NULL UNIQUE,
  operation         sync_operation NOT NULL,
  payload           JSONB NOT NULL,
  client_timestamp  TIMESTAMPTZ NOT NULL,
  server_timestamp  TIMESTAMPTZ DEFAULT NOW(),
  status            sync_status DEFAULT 'pending',
  conflict_detail   TEXT,
  resolved_at       TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sync_log_collector ON sync_log(collector_id);
CREATE INDEX idx_sync_log_status ON sync_log(status);

-- ml_feedback (ground-truth corrections for AI retraining)
CREATE TABLE ml_feedback (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  training_sample_id    UUID NOT NULL REFERENCES ai_training_samples(id) ON DELETE CASCADE,
  corrected_category    UUID REFERENCES material_categories(id),
  corrected_weight      DECIMAL(10, 2),
  corrected_price       DECIMAL(10, 2),
  feedback_source       VARCHAR(20) NOT NULL DEFAULT 'collector',
  notes                 TEXT,
  applied_to_model      BOOLEAN DEFAULT FALSE,
  created_at            TIMESTAMPTZ DEFAULT NOW()
);
