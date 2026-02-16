-- Period allocation for bank transactions
-- Allows assigning transactions to accounting periods different from payment date
-- period_from/period_to = NULL → standard behavior (amount goes to transaction_date month)
-- period_from = period_to month → entire amount goes to that month
-- period_from ≠ period_to → amount is split evenly across all months in range

ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS period_from DATE,
  ADD COLUMN IF NOT EXISTS period_to DATE;

-- Index for efficient P&L queries that filter by period overlap
CREATE INDEX IF NOT EXISTS idx_bank_tx_period
  ON public.bank_transactions (period_from, period_to)
  WHERE period_from IS NOT NULL;
