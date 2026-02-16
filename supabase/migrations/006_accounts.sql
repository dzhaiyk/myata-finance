-- Myata Finance v7 - Accounts & Money Flow Control
-- Run in Supabase SQL Editor

-- 1. Accounts (счета)
CREATE TABLE IF NOT EXISTS public.accounts (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cash','bank','deposit','terminal')),
  bank_name TEXT, -- Kaspi, Halyk, etc.
  currency TEXT DEFAULT 'KZT',
  initial_balance NUMERIC(15,2) DEFAULT 0,
  current_balance NUMERIC(15,2) DEFAULT 0,
  sort_order INTEGER DEFAULT 0,
  color TEXT DEFAULT '#22c55e',
  icon TEXT DEFAULT '💵',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON public.accounts TO anon;
GRANT USAGE, SELECT ON SEQUENCE accounts_id_seq TO anon;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access accounts" ON public.accounts FOR ALL USING (true) WITH CHECK (true);

-- Pre-populate default accounts
INSERT INTO public.accounts (name, type, bank_name, icon, color, sort_order) VALUES
  ('Касса (Наличные)', 'cash', NULL, '💵', '#22c55e', 1),
  ('Kaspi Расчётный', 'bank', 'Kaspi', '🏦', '#f59e0b', 2),
  ('Kaspi Депозит', 'deposit', 'Kaspi', '💰', '#8b5cf6', 3),
  ('Halyk Расчётный', 'bank', 'Halyk', '🏦', '#3b82f6', 4),
  ('Kaspi Терминал', 'terminal', 'Kaspi', '📱', '#f97316', 5),
  ('Halyk Терминал', 'terminal', 'Halyk', '📱', '#60a5fa', 6)
ON CONFLICT DO NOTHING;

-- 2. Account transactions (все движения денег)
CREATE TABLE IF NOT EXISTS public.account_transactions (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES public.accounts(id),
  transaction_date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','expense','transfer_in','transfer_out')),
  amount NUMERIC(15,2) NOT NULL,
  category TEXT, -- links to bank_transactions categories or custom
  counterparty TEXT, -- who: supplier, kaspi pay, etc.
  description TEXT,
  reference_id TEXT, -- link to daily_report id or bank_transaction id
  reference_type TEXT CHECK (reference_type IN ('daily_report','bank_import','manual','auto_settlement')),
  linked_transaction_id INTEGER, -- for transfers: points to the other side
  is_reconciled BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_acctx_account_date ON public.account_transactions(account_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_acctx_date ON public.account_transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_acctx_ref ON public.account_transactions(reference_type, reference_id);

GRANT ALL ON public.account_transactions TO anon;
GRANT USAGE, SELECT ON SEQUENCE account_transactions_id_seq TO anon;
ALTER TABLE public.account_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access account_transactions" ON public.account_transactions FOR ALL USING (true) WITH CHECK (true);

-- 3. Daily balance snapshots (ежедневная сверка)
CREATE TABLE IF NOT EXISTS public.account_balances (
  id SERIAL PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES public.accounts(id),
  balance_date DATE NOT NULL,
  expected_balance NUMERIC(15,2) DEFAULT 0, -- calculated from transactions
  actual_balance NUMERIC(15,2), -- manually entered by user
  discrepancy NUMERIC(15,2) GENERATED ALWAYS AS (
    CASE WHEN actual_balance IS NOT NULL THEN actual_balance - expected_balance ELSE NULL END
  ) STORED,
  verified_by UUID,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_id, balance_date)
);

GRANT ALL ON public.account_balances TO anon;
GRANT USAGE, SELECT ON SEQUENCE account_balances_id_seq TO anon;
ALTER TABLE public.account_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access account_balances" ON public.account_balances FOR ALL USING (true) WITH CHECK (true);
