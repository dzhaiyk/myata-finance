-- Migration 013: Add account_id to bank_transactions
-- Links each bank transaction to the account whose statement was imported

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS account_id INTEGER REFERENCES public.accounts(id);

CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_id
  ON public.bank_transactions (account_id);
