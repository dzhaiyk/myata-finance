-- Myata Finance v9 - Dynamic categories, multi-condition bank rules
-- Run in Supabase SQL Editor

-- 1. Expense/Income categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','cogs','opex','below_ebitda','other')),
  pnl_group TEXT, -- revenue, cogs, payroll, rent, utilities, marketing, tax, etc.
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON public.categories TO anon;
GRANT USAGE, SELECT ON SEQUENCE categories_id_seq TO anon;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- Seed default categories
INSERT INTO public.categories (code, name, type, pnl_group, sort_order) VALUES
  -- Income
  ('income_kaspi', 'Доход Kaspi', 'income', 'revenue', 1),
  ('income_cash', 'Доход наличные', 'income', 'revenue', 2),
  ('income_halyk', 'Доход Halyk', 'income', 'revenue', 3),
  ('income_delivery', 'Доход доставка', 'income', 'revenue', 4),
  ('income_other', 'Прочий доход', 'income', 'revenue', 5),
  -- COGS
  ('cogs_kitchen', 'Закуп Кухня', 'cogs', 'cogs', 10),
  ('cogs_bar', 'Закуп Бар', 'cogs', 'cogs', 11),
  ('cogs_hookah', 'Закуп Кальян', 'cogs', 'cogs', 12),
  ('cogs_other', 'Закуп Прочее', 'cogs', 'cogs', 13),
  -- OpEx
  ('payroll', 'ЗП и авансы', 'opex', 'payroll', 20),
  ('payroll_tax', 'Налоги на ЗП', 'opex', 'payroll', 21),
  ('rent', 'Аренда', 'opex', 'rent', 22),
  ('utilities', 'Коммунальные услуги', 'opex', 'utilities', 23),
  ('marketing', 'Маркетинг / Реклама', 'opex', 'marketing', 24),
  ('repair', 'Ремонт и обслуживание', 'opex', 'opex_other', 25),
  ('cleaning', 'Клининг', 'opex', 'opex_other', 26),
  ('security', 'Охрана', 'opex', 'opex_other', 27),
  ('software', 'Софт и подписки', 'opex', 'opex_other', 28),
  ('delivery_fee', 'Комиссия доставки', 'opex', 'opex_other', 29),
  ('household', 'Хозтовары', 'opex', 'opex_other', 30),
  ('uniform', 'Униформа', 'opex', 'opex_other', 31),
  ('transport', 'Транспорт / Логистика', 'opex', 'opex_other', 32),
  ('bank_fee', 'Комиссия банка', 'opex', 'bank_fees', 33),
  ('opex_other', 'Прочие OpEx', 'opex', 'opex_other', 39),
  -- Below EBITDA
  ('tax', 'Налоги (КПН/НДС)', 'below_ebitda', 'tax', 40),
  ('capex', 'CapEx (оборудование)', 'below_ebitda', 'capex', 41),
  ('depreciation', 'Амортизация', 'below_ebitda', 'depreciation', 42),
  ('dividends', 'Дивиденды', 'below_ebitda', 'dividends', 43),
  ('loan', 'Погашение кредита', 'below_ebitda', 'loan', 44),
  ('internal', 'Внутренние переводы', 'other', 'internal', 50),
  ('uncategorized', 'Не распознано', 'other', 'uncategorized', 99)
ON CONFLICT (code) DO NOTHING;

-- 2. Rebuild bank_rules for multi-condition support
-- Drop old table and recreate
DROP TABLE IF EXISTS public.bank_rules CASCADE;

CREATE TABLE public.bank_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  logic TEXT DEFAULT 'and' CHECK (logic IN ('and', 'or')),
  category_code TEXT NOT NULL,
  action TEXT DEFAULT 'categorize' CHECK (action IN ('categorize', 'hide')),
  is_active BOOLEAN DEFAULT true,
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

GRANT ALL ON public.bank_rules TO anon;
GRANT USAGE, SELECT ON SEQUENCE bank_rules_id_seq TO anon;
ALTER TABLE public.bank_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access bank_rules" ON public.bank_rules FOR ALL USING (true) WITH CHECK (true);

-- 3. Rule conditions (multiple per rule)
CREATE TABLE IF NOT EXISTS public.bank_rule_conditions (
  id SERIAL PRIMARY KEY,
  rule_id INTEGER NOT NULL REFERENCES public.bank_rules(id) ON DELETE CASCADE,
  field TEXT NOT NULL CHECK (field IN ('beneficiary', 'purpose', 'knp', 'amount')),
  operator TEXT NOT NULL CHECK (operator IN ('contains', 'equals', 'starts_with', 'gt', 'lt')),
  value TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0
);

GRANT ALL ON public.bank_rule_conditions TO anon;
GRANT USAGE, SELECT ON SEQUENCE bank_rule_conditions_id_seq TO anon;
ALTER TABLE public.bank_rule_conditions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access bank_rule_conditions" ON public.bank_rule_conditions FOR ALL USING (true) WITH CHECK (true);

-- 4. Re-insert default Kaspi hide rules
INSERT INTO public.bank_rules (name, logic, category_code, action) VALUES
  ('Скрыть поступления Kaspi', 'or', 'income_kaspi', 'hide');

INSERT INTO public.bank_rule_conditions (rule_id, field, operator, value) VALUES
  ((SELECT id FROM public.bank_rules WHERE name = 'Скрыть поступления Kaspi'), 'beneficiary', 'contains', 'Kaspi Pay'),
  ((SELECT id FROM public.bank_rules WHERE name = 'Скрыть поступления Kaspi'), 'beneficiary', 'contains', 'KASPI');
