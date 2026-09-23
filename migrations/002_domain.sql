-- Production domain. Top-level entities have relational columns; nested
-- station records, outputs, destinations, holds, corrections, lot uses and
-- recipe versions are kept as JSONB aggregates to preserve the domain model.
CREATE TABLE IF NOT EXISTS routes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    stations JSONB NOT NULL DEFAULT '[]'::jsonb,
    start_material TEXT NOT NULL,
    note TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    prefix TEXT NOT NULL,
    route_id TEXT NOT NULL REFERENCES routes(id),
    recipe_id TEXT
);

CREATE TABLE IF NOT EXISTS pack_sizes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    grams NUMERIC(12,3) NOT NULL CHECK (grams > 0)
);

CREATE TABLE IF NOT EXISTS suppliers (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    supplies TEXT NOT NULL DEFAULT '',
    contact TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS output_categories (
    id BIGSERIAL PRIMARY KEY,
    station TEXT NOT NULL,
    name TEXT NOT NULL,
    kind TEXT NOT NULL CHECK (kind IN ('useful', 'byproduct', 'waste')),
    custom BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE(station, name, kind)
);

CREATE TABLE IF NOT EXISTS thresholds (
    id TEXT PRIMARY KEY DEFAULT 'default',
    variance_pct JSONB NOT NULL DEFAULT '{}'::jsonb,
    waste_pct NUMERIC(8,3) NOT NULL DEFAULT 5,
    low_stock_kg NUMERIC(12,3) NOT NULL DEFAULT 50,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recipes (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    product_id TEXT NOT NULL REFERENCES products(id),
    current_version INTEGER NOT NULL DEFAULT 1,
    versions JSONB NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS batches (
    id TEXT PRIMARY KEY,
    product_id TEXT NOT NULL REFERENCES products(id),
    product TEXT NOT NULL,
    route_id TEXT NOT NULL REFERENCES routes(id),
    started_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'hold', 'completed')),
    next_station TEXT,
    start_input JSONB NOT NULL,
    recipe_id TEXT,
    recipe_version INTEGER,
    ingredients JSONB,
    records JSONB NOT NULL DEFAULT '[]'::jsonb,
    holds JSONB NOT NULL DEFAULT '[]'::jsonb,
    corrections JSONB NOT NULL DEFAULT '[]'::jsonb,
    completed_at TIMESTAMPTZ,
    note TEXT,
    created_by INTEGER REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_batches_status ON batches(status);
CREATE INDEX IF NOT EXISTS idx_batches_started_at ON batches(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_batches_next_station ON batches(next_station);

CREATE TABLE IF NOT EXISTS lots (
    id TEXT PRIMARY KEY,
    material TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('Raw material', 'Intermediate', 'By-product', 'Rework', 'Finished goods')),
    received NUMERIC(14,3) NOT NULL CHECK (received >= 0),
    available NUMERIC(14,3) NOT NULL CHECK (available >= 0),
    unit TEXT NOT NULL CHECK (unit IN ('kg', 'units')),
    source JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    uses JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_lots_material ON lots(material);
CREATE INDEX IF NOT EXISTS idx_lots_category ON lots(category);
