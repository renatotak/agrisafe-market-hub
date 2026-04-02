-- Migration: Regional Prices and Ag Input Intelligence
-- Creates tables for storing regional commodity prices and Embrapa APIs equivalents

-- 1. Regional Prices
CREATE TABLE IF NOT EXISTS public.commodity_prices_regional (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    commodity_id VARCHAR NOT NULL,
    location VARCHAR NOT NULL, -- e.g., 'Sorriso, MT', 'Paranaguá, PR'
    price DECIMAL(10, 2) NOT NULL,
    variation VARCHAR, -- e.g., '+1.5%'
    lat DECIMAL(9, 6),
    lng DECIMAL(9, 6),
    source VARCHAR NOT NULL, -- e.g., 'Notícias Agrícolas'
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for querying prices by commodity quickly
CREATE INDEX IF NOT EXISTS idx_regional_prices_commodity ON public.commodity_prices_regional(commodity_id, recorded_at DESC);

-- 2. Scraped Events (Fallback Database)
CREATE TABLE IF NOT EXISTS public.scraped_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR NOT NULL,
    url VARCHAR,
    date_raw VARCHAR,
    date_start DATE,
    date_end DATE,
    location VARCHAR,
    description TEXT,
    source VARCHAR NOT NULL,
    status VARCHAR DEFAULT 'pending_review', -- pending, approved, hidden
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Ag Input Intelligence (Mock Embrapa format)
CREATE TABLE IF NOT EXISTS public.ag_inputs_registry (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    brand_name VARCHAR NOT NULL,
    active_ingredient VARCHAR NOT NULL,
    classification VARCHAR NOT NULL, -- Herbicida, Fungicida, Inseticida Biológico
    target_crops TEXT, -- Comma separated or JSON array
    toxicity_class VARCHAR,
    source VARCHAR DEFAULT 'Embrapa AgroAPI',
    is_biological BOOLEAN DEFAULT FALSE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Ensure RLS is enabled for the new tables
ALTER TABLE public.commodity_prices_regional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scraped_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ag_inputs_registry ENABLE ROW LEVEL SECURITY;

-- Allow read access to authenticated users
CREATE POLICY "Allow read access to authenticated users on commodity_prices_regional" ON public.commodity_prices_regional FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow read access to authenticated users on scraped_events" ON public.scraped_events FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Allow read access to authenticated users on ag_inputs_registry" ON public.ag_inputs_registry FOR SELECT USING (auth.role() = 'authenticated');
