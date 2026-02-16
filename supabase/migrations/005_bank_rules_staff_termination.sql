-- Myata Finance v6 - Categorization rules, staff termination
-- Run in Supabase SQL Editor

-- 1. Bank categorization rules (auto-assign categories by keyword matching)
CREATE TABLE IF NOT EXISTS public.bank_rules (
  id SERIAL PRIMARY KEY,
  field TEXT NOT NULL CHECK (field IN ('beneficiary', 'purpose')),
  keyword TEXT NOT NULL,
  category TEXT NOT NULL,
  action TEXT DEFAULT 'categorize' CHECK (action IN ('categorize', 'hide')),
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(field, keyword)
);

GRANT ALL ON public.bank_rules TO anon;
GRANT USAGE, SELECT ON SEQUENCE bank_rules_id_seq TO anon;
ALTER TABLE public.bank_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access bank_rules" ON public.bank_rules FOR ALL USING (true) WITH CHECK (true);

-- 2. Add termination fields to staff (soft delete)
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS terminated_at DATE;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS termination_reason TEXT;

-- 3. Pre-populate common Kaspi income rule (hide Kaspi Pay receipts)
INSERT INTO public.bank_rules (field, keyword, category, action)
VALUES 
  ('beneficiary', 'Kaspi Pay', 'income_kaspi', 'hide'),
  ('beneficiary', 'KASPI', 'income_kaspi', 'hide')
ON CONFLICT (field, keyword) DO NOTHING;
