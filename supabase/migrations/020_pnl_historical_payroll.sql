-- Migration 020: Историческая P&L + ручные корректировки + зарплата
--
-- 1. pnl_data: снимаем UNIQUE(year, month, category) — теперь для одного месяца
--    могут сосуществовать строка type='historical' (импорт 2022–2025) и ручная
--    корректировка той же категории. Расчёт складывает их (computeMonthValues).
ALTER TABLE public.pnl_data DROP CONSTRAINT IF EXISTS pnl_data_year_month_category_key;
CREATE INDEX IF NOT EXISTS idx_pnl_data_ym_cat ON public.pnl_data(year, month, category);

-- 2. payroll_details: флаг ручной корректировки аванса.
--    Без него авто-подтяжка авансов из отчётов затирала ручные правки при каждой загрузке.
ALTER TABLE public.payroll_details ADD COLUMN IF NOT EXISTS manual_advances BOOLEAN DEFAULT false;
