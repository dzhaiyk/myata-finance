-- Migration 015: Add audit fields to pnl_data
ALTER TABLE public.pnl_data ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.pnl_data ADD COLUMN IF NOT EXISTS created_by TEXT;
