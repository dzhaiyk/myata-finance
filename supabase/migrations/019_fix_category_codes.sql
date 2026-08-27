-- Migration 019: Унификация кодов категорий
-- Авто-категоризация (categorize.js) писала старые коды, которых нет
-- в таблице categories и в PNL_STRUCTURE/Cash Flow — эти суммы выпадали из P&L.
-- Перекодируем существующие bank_transactions (и bank_rules на всякий случай)
-- на коды из миграции 008.

BEGIN;

CREATE TEMP TABLE _cat_remap (old_code TEXT PRIMARY KEY, new_code TEXT NOT NULL);
INSERT INTO _cat_remap (old_code, new_code) VALUES
  ('marketing_smm',    'mkt_smm'),
  ('marketing_target', 'mkt_target'),
  ('marketing_2gis',   'mkt_2gis'),
  ('marketing_yandex', 'mkt_yandex'),
  ('marketing_google', 'mkt_google'),
  ('marketing_other',  'mkt_other'),
  ('rent_main',        'rent_premises'),
  ('rent_storage',     'rent_warehouse'),
  ('util_trash',       'util_waste'),
  ('opex_supplies',    'household'),
  ('opex_bank_fees',   'bank_fee'),
  ('opex_kao',         'opex_music'),
  ('opex_other',       'opex_misc'),
  ('capex_equipment',  'capex_furniture'),
  ('payroll',          'payroll_other'),
  ('internal_transfer','internal'),
  ('revenue_kitchen',  'income_other'),
  ('revenue_bar',      'income_other'),
  ('revenue_hookah',   'income_other'),
  ('revenue_other',    'income_other');

UPDATE public.bank_transactions bt
SET category = r.new_code
FROM _cat_remap r
WHERE bt.category = r.old_code;

UPDATE public.bank_rules br
SET category_code = r.new_code
FROM _cat_remap r
WHERE br.category_code = r.old_code;

DROP TABLE _cat_remap;

COMMIT;

-- Проверка после применения: не должно остаться кодов вне таблицы categories
-- SELECT category, COUNT(*) FROM public.bank_transactions
-- WHERE category NOT IN (SELECT code FROM public.categories)
-- GROUP BY category;
