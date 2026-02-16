-- Bank import improvements: deduplication, extended rule conditions

-- 1. Transaction hash for deduplication
ALTER TABLE public.bank_transactions
  ADD COLUMN IF NOT EXISTS tx_hash TEXT;

-- Partial unique index: only enforced on non-null hashes (existing rows without hash are unaffected)
CREATE UNIQUE INDEX IF NOT EXISTS bank_transactions_tx_hash_unique
  ON public.bank_transactions (tx_hash) WHERE tx_hash IS NOT NULL;

-- 2. Extend bank_rule_conditions field constraint to include 'is_debit'
ALTER TABLE public.bank_rule_conditions
  DROP CONSTRAINT IF EXISTS bank_rule_conditions_field_check;
ALTER TABLE public.bank_rule_conditions
  ADD CONSTRAINT bank_rule_conditions_field_check
  CHECK (field IN ('beneficiary', 'purpose', 'knp', 'amount', 'is_debit'));

-- 3. Extend bank_rule_conditions operator constraint for new operators
ALTER TABLE public.bank_rule_conditions
  DROP CONSTRAINT IF EXISTS bank_rule_conditions_operator_check;
ALTER TABLE public.bank_rule_conditions
  ADD CONSTRAINT bank_rule_conditions_operator_check
  CHECK (operator IN ('contains', 'not_contains', 'equals', 'not_equals', 'starts_with', 'gt', 'gte', 'lt', 'lte', 'between'));
