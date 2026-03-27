-- ============================================================
-- АУДИТ ЦЕЛОСТНОСТИ ДАННЫХ — Myata Finance
-- Запускать в Supabase SQL Editor, блок за блоком
-- ============================================================

-- ============================================================
-- 1. ДУБЛИ В DAILY_REPORTS
-- ============================================================

-- 1.1 Дубли по report_date (не должно быть двух отчётов за одну дату)
SELECT report_date, COUNT(*) as cnt, array_agg(id) as ids
FROM daily_reports
GROUP BY report_date
HAVING COUNT(*) > 1;

-- 1.2 Все отчёты — обзор (проверить визуально на подозрительные дубли)
SELECT id, report_date, status, total_revenue, total_withdrawals,
       data->>'cash_start' as cash_start,
       data->>'cash_end' as cash_end,
       created_at, updated_at
FROM daily_reports
ORDER BY report_date DESC;

-- ============================================================
-- 2. ДУБЛИ В ACCOUNT_TRANSACTIONS
-- ============================================================

-- 2.1 Дублирующиеся транзакции (одна дата + сумма + тип + описание + reference)
SELECT account_id, transaction_date, type, amount, description, reference_type,
       COUNT(*) as cnt, array_agg(id) as ids
FROM account_transactions
GROUP BY account_id, transaction_date, type, amount, description, reference_type
HAVING COUNT(*) > 1;

-- 2.2 Транзакции от daily_report — сопоставление с отчётами
SELECT at2.id as tx_id, at2.transaction_date, at2.type, at2.amount,
       at2.description, at2.reference_type,
       dr.id as report_id, dr.status, dr.total_revenue
FROM account_transactions at2
LEFT JOIN daily_reports dr ON dr.report_date = at2.transaction_date::text
WHERE at2.reference_type = 'daily_report'
ORDER BY at2.transaction_date DESC;

-- 2.3 Осиротевшие транзакции (reference_type = daily_report, но нет submitted отчёта)
SELECT at2.*
FROM account_transactions at2
WHERE at2.reference_type = 'daily_report'
AND NOT EXISTS (
  SELECT 1 FROM daily_reports dr
  WHERE dr.report_date = at2.transaction_date::text
  AND dr.status = 'submitted'
);

-- 2.4 Сколько транзакций daily_report на каждую дату (должно быть ≤ 1)
SELECT transaction_date, COUNT(*) as cnt, array_agg(id) as ids,
       array_agg(amount) as amounts
FROM account_transactions
WHERE reference_type = 'daily_report'
GROUP BY transaction_date
HAVING COUNT(*) > 1;

-- ============================================================
-- 3. ДУБЛИ В BANK_TRANSACTIONS
-- ============================================================

-- 3.1 Дубли по tx_hash
SELECT tx_hash, COUNT(*) as cnt, array_agg(id) as ids
FROM bank_transactions
WHERE tx_hash IS NOT NULL
GROUP BY tx_hash
HAVING COUNT(*) > 1;

-- 3.2 Транзакции без tx_hash (старые импорты, потенциальные дубли)
SELECT id, transaction_date, amount, beneficiary, purpose, import_file, import_batch_id
FROM bank_transactions
WHERE tx_hash IS NULL
ORDER BY transaction_date;

-- 3.3 Потенциальные дубли без хеша (одна дата + сумма + бенефициар)
SELECT transaction_date, amount, beneficiary, is_debit,
       COUNT(*) as cnt, array_agg(id) as ids
FROM bank_transactions
WHERE tx_hash IS NULL
GROUP BY transaction_date, amount, beneficiary, is_debit
HAVING COUNT(*) > 1;

-- ============================================================
-- 4. СВОДКА АУДИТА
-- ============================================================

SELECT 'daily_reports' as table_name, COUNT(*) as total,
       COUNT(*) FILTER (WHERE status = 'submitted') as col_a,
       COUNT(*) FILTER (WHERE status = 'draft') as col_b,
       'submitted / drafts' as legend
FROM daily_reports
UNION ALL
SELECT 'account_transactions', COUNT(*),
       COUNT(*) FILTER (WHERE reference_type = 'daily_report'),
       COUNT(*) FILTER (WHERE reference_type = 'manual'),
       'daily_report / manual'
FROM account_transactions
UNION ALL
SELECT 'bank_transactions', COUNT(*),
       COUNT(*) FILTER (WHERE category IS DISTINCT FROM 'uncategorized'),
       COUNT(*) FILTER (WHERE category = 'uncategorized'),
       'categorized / uncategorized'
FROM bank_transactions;
