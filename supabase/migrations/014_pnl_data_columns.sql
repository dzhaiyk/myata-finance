-- Migration 014: Add description and type columns to pnl_data
ALTER TABLE public.pnl_data ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE public.pnl_data ADD COLUMN IF NOT EXISTS type TEXT;
