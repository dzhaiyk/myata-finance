-- Migration 021: Замкнутый контур по банку
--
-- 1. Категория «Зачисление эквайринга»: раньше зачисления Kaspi Pay СКРЫВАЛИСЬ
--    hide-правилом при импорте — сверка «терминалы ↔ зачисления» была невозможна,
--    и Cash Flow не видел карточную выручку. Теперь зачисления сохраняются
--    с этой категорией (в P&L не попадают — выручка уже учтена из отчётов смен).
INSERT INTO public.categories (code, name, type, pnl_group, sort_order)
VALUES ('acquiring_settlement', 'Зачисление эквайринга', 'other', 'acquiring', 102)
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, type = EXCLUDED.type,
  pnl_group = EXCLUDED.pnl_group, sort_order = EXCLUDED.sort_order;

-- 2. Удаляем стандартное hide-правило «Скрыть Kaspi Pay» (из миграции 008):
--    оно прятало и зачисления, и комиссии. Категоризацию теперь делает
--    categorize.js с учётом направления (кредит → зачисление, дебет → комиссия).
--    Пользовательские правила не трогаем — только seeded по имени.
DELETE FROM public.bank_rule_conditions
WHERE rule_id IN (SELECT id FROM public.bank_rules WHERE name = 'Скрыть Kaspi Pay');
DELETE FROM public.bank_rules WHERE name = 'Скрыть Kaspi Pay';

-- 3. Бэкфилл операций по счетам из банковских транзакций.
--    Политика изменилась: КАЖДАЯ строка выписки двигает баланс счёта
--    (категория влияет только на P&L/CF). Раньше uncategorized/internal
--    пропускались — расчётный баланс счёта расходился с банком навсегда.
--    Пересоздаём все bank_import-операции заново с reference_id.
DELETE FROM public.account_transactions WHERE reference_type = 'bank_import';

INSERT INTO public.account_transactions
  (account_id, transaction_date, type, amount, description, reference_type, reference_id, category)
SELECT
  bt.account_id,
  bt.transaction_date,
  CASE WHEN bt.is_debit THEN 'expense' ELSE 'income' END,
  bt.amount,
  COALESCE(NULLIF(bt.beneficiary, ''), NULLIF(bt.purpose, ''), bt.category),
  'bank_import',
  bt.id::TEXT,
  bt.category
FROM public.bank_transactions bt
WHERE bt.account_id IS NOT NULL;

-- Проверка после применения:
-- SELECT COUNT(*) FROM public.account_transactions WHERE reference_type='bank_import';
-- SELECT COUNT(*) FROM public.bank_transactions WHERE account_id IS NOT NULL;
-- (числа должны совпасть)
