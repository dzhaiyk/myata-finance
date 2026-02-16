-- Myata Finance v8 - Daily Report draft/submitted status
-- Run in Supabase SQL Editor

ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'submitted'));
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;
ALTER TABLE public.daily_reports ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
