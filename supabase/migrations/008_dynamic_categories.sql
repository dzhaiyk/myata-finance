-- Myata Finance v9 - Dynamic categories matching PnL structure
-- Run in Supabase SQL Editor

-- 1. Categories table
CREATE TABLE IF NOT EXISTS public.categories (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income','cogs','opex','below_ebitda','other')),
  pnl_group TEXT,
  sort_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT ALL ON public.categories TO anon;
GRANT USAGE, SELECT ON SEQUENCE categories_id_seq TO anon;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All access categories" ON public.categories;
CREATE POLICY "All access categories" ON public.categories FOR ALL USING (true) WITH CHECK (true);

-- Clear and reseed
DELETE FROM public.categories;

INSERT INTO public.categories (code, name, type, pnl_group, sort_order) VALUES
  -- Income
  ('income_kaspi', 'Доход Kaspi', 'income', 'revenue', 1),
  ('income_cash', 'Доход наличные', 'income', 'revenue', 2),
  ('income_halyk', 'Доход Halyk', 'income', 'revenue', 3),
  ('income_other', 'Прочий доход', 'income', 'revenue', 5),

  -- COGS (Food Cost)
  ('cogs_kitchen', 'Закуп кухня', 'cogs', 'foodcost', 10),
  ('cogs_bar', 'Закуп бар', 'cogs', 'foodcost', 11),
  ('cogs_hookah', 'Закуп кальян', 'cogs', 'foodcost', 12),

  -- ФОТ
  ('payroll_mgmt', 'ФОТ Менеджмент', 'opex', 'payroll', 20),
  ('payroll_kitchen', 'ФОТ Кухня', 'opex', 'payroll', 21),
  ('payroll_bar', 'ФОТ Бар', 'opex', 'payroll', 22),
  ('payroll_hookah', 'ФОТ Дымный коктейль', 'opex', 'payroll', 23),
  ('payroll_hall', 'ФОТ Зал', 'opex', 'payroll', 24),
  ('payroll_transport', 'Развозка', 'opex', 'payroll', 25),
  ('payroll_other', 'ФОТ Прочее', 'opex', 'payroll', 29),

  -- Маркетинг
  ('mkt_smm', 'СММ', 'opex', 'marketing', 30),
  ('mkt_target', 'Таргет', 'opex', 'marketing', 31),
  ('mkt_2gis', '2ГИС', 'opex', 'marketing', 32),
  ('mkt_yandex', 'Яндекс', 'opex', 'marketing', 33),
  ('mkt_google', 'Google', 'opex', 'marketing', 34),
  ('mkt_other', 'Маркетинг прочее', 'opex', 'marketing', 39),

  -- Аренда
  ('rent_premises', 'Аренда помещения', 'opex', 'rent', 40),
  ('rent_warehouse', 'Аренда склада и кровли', 'opex', 'rent', 41),
  ('rent_property_tax', 'Налог на недвижимость', 'opex', 'rent', 42),

  -- Коммунальные
  ('util_electric', 'Электричество', 'opex', 'utilities', 50),
  ('util_water', 'Водоснабжение', 'opex', 'utilities', 51),
  ('util_heating', 'Отопление', 'opex', 'utilities', 52),
  ('util_bi', 'BI Service', 'opex', 'utilities', 53),
  ('util_internet', 'Интернет и связь', 'opex', 'utilities', 54),
  ('util_waste', 'Вывоз мусора', 'opex', 'utilities', 55),
  ('util_other', 'Ком. услуги прочее', 'opex', 'utilities', 59),

  -- OpEx прочее
  ('household', 'Хозтовары', 'opex', 'opex_other', 60),
  ('bank_fee', 'Комиссия банка', 'opex', 'opex_other', 61),
  ('opex_security', 'Система безопасности', 'opex', 'opex_other', 62),
  ('opex_software', 'Программное обеспечение', 'opex', 'opex_other', 63),
  ('opex_menu', 'Меню', 'opex', 'opex_other', 64),
  ('opex_pest', 'Дератизация/дезинсекция', 'opex', 'opex_other', 65),
  ('opex_grease', 'Чистка жироуловителей', 'opex', 'opex_other', 66),
  ('opex_repair', 'Мелкий ремонт', 'opex', 'opex_other', 67),
  ('opex_uniform', 'Форма для персонала', 'opex', 'opex_other', 68),
  ('opex_music', 'Авторские права на музыку', 'opex', 'opex_other', 69),
  ('opex_royalty', 'Роялти', 'opex', 'opex_other', 70),
  ('opex_misc', 'Прочее OpEx', 'opex', 'opex_other', 79),

  -- Налоги
  ('tax_retail', 'Розничный налог', 'below_ebitda', 'taxes', 80),
  ('tax_payroll', 'Налоги по зарплате', 'below_ebitda', 'taxes', 81),
  ('tax_insurance', 'Страхование сотрудников', 'below_ebitda', 'taxes', 82),
  ('tax_alcohol', 'Лицензия на алкоголь', 'below_ebitda', 'taxes', 83),
  ('tax_hookah', 'Лицензия на дымный коктейль', 'below_ebitda', 'taxes', 84),
  ('tax_other', 'Налоги прочее', 'below_ebitda', 'taxes', 89),

  -- CapEx
  ('capex_repair', 'Ремонт (CapEx)', 'below_ebitda', 'capex', 90),
  ('capex_furniture', 'Мебель и техника', 'below_ebitda', 'capex', 91),
  ('capex_other', 'CapEx прочее', 'below_ebitda', 'capex', 99),

  -- Other
  ('internal', 'Внутренние переводы', 'other', 'internal', 100),
  ('dividends', 'Дивиденды', 'other', 'dividends', 101),
  ('uncategorized', 'Не распознано', 'other', 'uncategorized', 999)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type, pnl_group = EXCLUDED.pnl_group, sort_order = EXCLUDED.sort_order;

-- 2. Bank rules tables
DROP TABLE IF EXISTS public.bank_rule_conditions CASCADE;
DROP TABLE IF EXISTS public.bank_rules CASCADE;

CREATE TABLE public.bank_rules (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  logic TEXT DEFAULT 'and' CHECK (logic IN ('and', 'or')),
  category_code TEXT NOT NULL,
  action TEXT DEFAULT 'categorize' CHECK (action IN ('categorize', 'hide')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
GRANT ALL ON public.bank_rules TO anon;
GRANT USAGE, SELECT ON SEQUENCE bank_rules_id_seq TO anon;
ALTER TABLE public.bank_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "All access bank_rules" ON public.bank_rules FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE public.bank_rule_conditions (
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

-- Default rule: hide Kaspi settlements
INSERT INTO public.bank_rules (name, logic, category_code, action) VALUES ('Скрыть Kaspi Pay', 'or', 'income_kaspi', 'hide');
INSERT INTO public.bank_rule_conditions (rule_id, field, operator, value) VALUES
  ((SELECT id FROM public.bank_rules WHERE name = 'Скрыть Kaspi Pay'), 'beneficiary', 'contains', 'Kaspi Pay'),
  ((SELECT id FROM public.bank_rules WHERE name = 'Скрыть Kaspi Pay'), 'beneficiary', 'contains', 'KASPI');
