-- 030 · Структура Cash Flow в базе
-- ADR-0011, TASK-029 (этап 3).
--
-- Строки CF — порядок, подписи, уровень, раздел — и привязка статей банка к
-- строкам живут здесь. Формулы (итоги разделов, чистое изменение) остаются
-- в src/lib/cashflowCompute.js и находят строку по key.
--
-- Привязка статей своя, независимая от P&L (решение владельца 05.09.2026):
-- одна строка CF собирает несколько статей, поэтому — отдельная таблица.
--
-- Seed сгенерирован из CF_STRUCTURE и семи списков категорий; полный список
-- полей снят из данных (key, label, level, calc, section), не перечислен
-- вручную. Контрольные суммы md5: строки 07626bb4bcd6cb7428425c89fa1dcd94,
-- привязки 9cdc1b9255fb2757a1f624397c36040d. Повторный запуск не задваивает.

CREATE TABLE IF NOT EXISTS public.cf_lines (
  id SERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  level INTEGER NOT NULL DEFAULT 0,
  section TEXT NOT NULL CHECK (section IN ('operating','investing','financing','total')),
  calc TEXT CHECK (calc IN ('sum_children','net')),
  parent_key TEXT REFERENCES public.cf_lines(key),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
COMMENT ON TABLE public.cf_lines IS
  'Строки Cash Flow: порядок, подписи, вложенность. Формулы — в src/lib/cashflowCompute.js по key (ADR-0011).';

CREATE TABLE IF NOT EXISTS public.cf_line_categories (
  id SERIAL PRIMARY KEY,
  cf_key TEXT NOT NULL REFERENCES public.cf_lines(key) ON DELETE CASCADE,
  category_code TEXT NOT NULL REFERENCES public.categories(code),
  sort_order INTEGER NOT NULL DEFAULT 0,
  UNIQUE (cf_key, category_code)
);
COMMENT ON TABLE public.cf_line_categories IS
  'Какие статьи (дебеты банка) складываются в строку Cash Flow. Своя привязка, независимая от P&L (решение владельца 05.09.2026).';

GRANT ALL ON public.cf_lines TO anon;
GRANT ALL ON public.cf_line_categories TO anon;
GRANT USAGE, SELECT ON SEQUENCE cf_lines_id_seq TO anon;
GRANT USAGE, SELECT ON SEQUENCE cf_line_categories_id_seq TO anon;
ALTER TABLE public.cf_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cf_line_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "All access cf_lines" ON public.cf_lines;
CREATE POLICY "All access cf_lines" ON public.cf_lines FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "All access cf_line_categories" ON public.cf_line_categories;
CREATE POLICY "All access cf_line_categories" ON public.cf_line_categories FOR ALL USING (true) WITH CHECK (true);

INSERT INTO public.cf_lines (key, label, level, section, calc, sort_order)
SELECT key, label, level, section, calc, sort_order
FROM jsonb_to_recordset('[{"key":"cf_operating","label":"ОПЕРАЦИОННАЯ ДЕЯТЕЛЬНОСТЬ","level":0,"section":"operating","calc":"sum_children","sort_order":10},{"key":"cf_cash_revenue","label":"Наличная выручка","level":1,"section":"operating","calc":null,"sort_order":20},{"key":"cf_acquiring","label":"Зачисления с терминалов (эквайринг)","level":1,"section":"operating","calc":null,"sort_order":30},{"key":"cf_bank_income","label":"Прочие поступления (банк)","level":1,"section":"operating","calc":null,"sort_order":40},{"key":"cf_cash_expenses","label":"Наличные расходы","level":1,"section":"operating","calc":"sum_children","sort_order":50},{"key":"cf_cash_suppliers_kitchen","label":"Закуп кухня (нал)","level":2,"section":"operating","calc":null,"sort_order":60},{"key":"cf_cash_suppliers_bar","label":"Закуп бар (нал)","level":2,"section":"operating","calc":null,"sort_order":70},{"key":"cf_cash_tobacco","label":"Закуп кальян (нал)","level":2,"section":"operating","calc":null,"sort_order":80},{"key":"cf_cash_payroll","label":"ЗП, авансы, техперсонал (нал)","level":2,"section":"operating","calc":null,"sort_order":90},{"key":"cf_cash_other","label":"Хозрасходы (нал)","level":2,"section":"operating","calc":null,"sort_order":100},{"key":"cf_cash_withdrawal","label":"Инкассация (прочее)","level":2,"section":"operating","calc":null,"sort_order":110},{"key":"cf_bank_opex","label":"Операционные расходы (банк)","level":1,"section":"operating","calc":"sum_children","sort_order":120},{"key":"cf_bank_payroll","label":"ФОТ (безнал)","level":2,"section":"operating","calc":null,"sort_order":130},{"key":"cf_bank_cogs","label":"Закуп (безнал)","level":2,"section":"operating","calc":null,"sort_order":140},{"key":"cf_bank_rent","label":"Аренда","level":2,"section":"operating","calc":null,"sort_order":150},{"key":"cf_bank_utilities","label":"Коммунальные","level":2,"section":"operating","calc":null,"sort_order":160},{"key":"cf_bank_marketing","label":"Маркетинг","level":2,"section":"operating","calc":null,"sort_order":170},{"key":"cf_bank_taxes","label":"Налоги","level":2,"section":"operating","calc":null,"sort_order":180},{"key":"cf_bank_other_opex","label":"Прочие OpEx (безнал)","level":2,"section":"operating","calc":null,"sort_order":190},{"key":"cf_investing","label":"ИНВЕСТИЦИОННАЯ ДЕЯТЕЛЬНОСТЬ","level":0,"section":"investing","calc":"sum_children","sort_order":200},{"key":"cf_capex_repair","label":"Ремонт","level":1,"section":"investing","calc":null,"sort_order":210},{"key":"cf_capex_furniture","label":"Мебель и техника","level":1,"section":"investing","calc":null,"sort_order":220},{"key":"cf_capex_hookah","label":"Аппараты (кальян)","level":1,"section":"investing","calc":null,"sort_order":230},{"key":"cf_capex_other","label":"CapEx прочее","level":1,"section":"investing","calc":null,"sort_order":240},{"key":"cf_financing","label":"ФИНАНСОВАЯ ДЕЯТЕЛЬНОСТЬ","level":0,"section":"financing","calc":"sum_children","sort_order":250},{"key":"cf_dividends","label":"Дивиденды выплаченные","level":1,"section":"financing","calc":null,"sort_order":260},{"key":"cf_investments_in","label":"Взносы учредителей","level":1,"section":"financing","calc":null,"sort_order":270},{"key":"cf_cash_withdrawal_bank","label":"Снятие наличных со счёта","level":1,"section":"financing","calc":null,"sort_order":280},{"key":"cf_bank_internal","label":"Внутренние переводы (нетто)","level":1,"section":"financing","calc":null,"sort_order":290},{"key":"cf_net_change","label":"ЧИСТОЕ ИЗМЕНЕНИЕ ДС","level":0,"section":"total","calc":"net","sort_order":300}]'::jsonb)
  AS x(key text, label text, level int, section text, calc text, sort_order int)
WHERE NOT EXISTS (SELECT 1 FROM public.cf_lines);

INSERT INTO public.cf_line_categories (cf_key, category_code, sort_order)
SELECT cf_key, category_code, sort_order
FROM jsonb_to_recordset('[{"cf_key":"cf_bank_payroll","category_code":"payroll_mgmt","sort_order":10},{"cf_key":"cf_bank_payroll","category_code":"payroll_kitchen","sort_order":20},{"cf_key":"cf_bank_payroll","category_code":"payroll_bar","sort_order":30},{"cf_key":"cf_bank_payroll","category_code":"payroll_hookah","sort_order":40},{"cf_key":"cf_bank_payroll","category_code":"payroll_hall","sort_order":50},{"cf_key":"cf_bank_payroll","category_code":"payroll_transport","sort_order":60},{"cf_key":"cf_bank_payroll","category_code":"payroll_other","sort_order":70},{"cf_key":"cf_bank_cogs","category_code":"cogs_kitchen","sort_order":10},{"cf_key":"cf_bank_cogs","category_code":"cogs_bar","sort_order":20},{"cf_key":"cf_bank_cogs","category_code":"cogs_hookah","sort_order":30},{"cf_key":"cf_bank_rent","category_code":"rent_premises","sort_order":10},{"cf_key":"cf_bank_rent","category_code":"rent_warehouse","sort_order":20},{"cf_key":"cf_bank_rent","category_code":"rent_property_tax","sort_order":30},{"cf_key":"cf_bank_utilities","category_code":"util_electric","sort_order":10},{"cf_key":"cf_bank_utilities","category_code":"util_water","sort_order":20},{"cf_key":"cf_bank_utilities","category_code":"util_heating","sort_order":30},{"cf_key":"cf_bank_utilities","category_code":"util_bi","sort_order":40},{"cf_key":"cf_bank_utilities","category_code":"util_internet","sort_order":50},{"cf_key":"cf_bank_utilities","category_code":"util_waste","sort_order":60},{"cf_key":"cf_bank_utilities","category_code":"util_other","sort_order":70},{"cf_key":"cf_bank_marketing","category_code":"mkt_smm","sort_order":10},{"cf_key":"cf_bank_marketing","category_code":"mkt_target","sort_order":20},{"cf_key":"cf_bank_marketing","category_code":"mkt_2gis","sort_order":30},{"cf_key":"cf_bank_marketing","category_code":"mkt_yandex","sort_order":40},{"cf_key":"cf_bank_marketing","category_code":"mkt_google","sort_order":50},{"cf_key":"cf_bank_marketing","category_code":"mkt_other","sort_order":60},{"cf_key":"cf_bank_taxes","category_code":"tax_retail","sort_order":10},{"cf_key":"cf_bank_taxes","category_code":"tax_payroll","sort_order":20},{"cf_key":"cf_bank_taxes","category_code":"tax_insurance","sort_order":30},{"cf_key":"cf_bank_taxes","category_code":"tax_alcohol","sort_order":40},{"cf_key":"cf_bank_taxes","category_code":"tax_hookah","sort_order":50},{"cf_key":"cf_bank_taxes","category_code":"tax_other","sort_order":60},{"cf_key":"cf_bank_other_opex","category_code":"household","sort_order":10},{"cf_key":"cf_bank_other_opex","category_code":"bank_fee","sort_order":20},{"cf_key":"cf_bank_other_opex","category_code":"opex_security","sort_order":30},{"cf_key":"cf_bank_other_opex","category_code":"opex_software","sort_order":40},{"cf_key":"cf_bank_other_opex","category_code":"opex_menu","sort_order":50},{"cf_key":"cf_bank_other_opex","category_code":"opex_pest","sort_order":60},{"cf_key":"cf_bank_other_opex","category_code":"opex_grease","sort_order":70},{"cf_key":"cf_bank_other_opex","category_code":"opex_repair","sort_order":80},{"cf_key":"cf_bank_other_opex","category_code":"opex_uniform","sort_order":90},{"cf_key":"cf_bank_other_opex","category_code":"opex_music","sort_order":100},{"cf_key":"cf_bank_other_opex","category_code":"opex_royalty","sort_order":110},{"cf_key":"cf_bank_other_opex","category_code":"opex_misc","sort_order":120},{"cf_key":"cf_capex_repair","category_code":"capex_repair","sort_order":10},{"cf_key":"cf_capex_furniture","category_code":"capex_furniture","sort_order":10},{"cf_key":"cf_capex_other","category_code":"capex_other","sort_order":10}]'::jsonb)
  AS x(cf_key text, category_code text, sort_order int)
WHERE NOT EXISTS (SELECT 1 FROM public.cf_line_categories);
