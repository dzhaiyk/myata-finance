-- 012: Add parent_account_id for sub-accounts (terminals → bank account)
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS parent_account_id INTEGER REFERENCES public.accounts(id);

CREATE INDEX IF NOT EXISTS idx_accounts_parent ON public.accounts(parent_account_id);
