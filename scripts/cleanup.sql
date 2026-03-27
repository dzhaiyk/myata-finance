-- ============================================================
-- ОЧИСТКА ДУБЛЕЙ — Myata Finance
-- ВНИМАНИЕ: Выполнять ТОЛЬКО после проверки результатов audit.sql
-- Каждый блок запускать ОТДЕЛЬНО, проверяя результат
-- ============================================================

-- ============================================================
-- РЕЗУЛЬТАТЫ АУДИТА (2026-03-26):
--
-- daily_reports: 85, все submitted, дублей НЕТ
-- bank_transactions: 421, дублей НЕТ
-- account_transactions: 92, ВСЕ с reference_type = 'daily_report'
--
-- ПРОБЛЕМА: на 6 датах создано несколько транзакций вместо одной:
--   2026-01-08: 2 tx (ids: 8, 10)
--   2026-01-26: 2 tx (ids: 28, 30)
--   2026-01-27: 2 tx (ids: 29, 31) — точный дубль 169391
--   2026-02-18: 4 tx (ids: 9, 12, 17, 53)
--   2026-03-16: 3 tx (ids: 54, 66, 79)
--   2026-03-20: 4 tx (ids: 83, 84, 85, 86)
--
-- Причина: при reopen+resubmit старые транзакции не удалялись.
-- Корректный подход: удалить ВСЕ транзакции на этих датах,
-- затем пересоздать корректные через повторный submit отчётов.
-- ============================================================

-- ============================================================
-- ШАГ 1: Удалить ВСЕ лишние транзакции на проблемных датах
-- (потом пересоздадутся правильно при resubmit)
-- ============================================================

-- Проверить что будет удалено:
SELECT id, transaction_date, type, amount, description, created_at
FROM account_transactions
WHERE reference_type = 'daily_report'
AND transaction_date IN ('2026-01-08', '2026-01-26', '2026-01-27',
                         '2026-02-18', '2026-03-16', '2026-03-20')
ORDER BY transaction_date, id;

-- Удалить (раскомментировать после проверки):
-- DELETE FROM account_transactions
-- WHERE reference_type = 'daily_report'
-- AND transaction_date IN ('2026-01-08', '2026-01-26', '2026-01-27',
--                          '2026-02-18', '2026-03-16', '2026-03-20');

-- ============================================================
-- ШАГ 2: Вернуть эти 6 отчётов в черновик
-- (чтобы можно было заново отправить и создать 1 транзакцию)
-- ============================================================

-- Проверить:
SELECT id, report_date, status, total_revenue
FROM daily_reports
WHERE report_date IN ('2026-01-08', '2026-01-26', '2026-01-27',
                      '2026-02-18', '2026-03-16', '2026-03-20')
ORDER BY report_date;

-- Вернуть в черновик (раскомментировать после проверки):
-- UPDATE daily_reports
-- SET status = 'draft', submitted_at = NULL
-- WHERE report_date IN ('2026-01-08', '2026-01-26', '2026-01-27',
--                       '2026-02-18', '2026-03-16', '2026-03-20');

-- ============================================================
-- ШАГ 3: После шагов 1-2, открыть каждый из 6 отчётов в UI
-- и нажать "Отправить" — создастся ровно 1 корректная транзакция.
-- ============================================================

-- ============================================================
-- ШАГ 4: Проверка после очистки
-- ============================================================

-- Должно быть ровно 85 транзакций (по одной на каждый отчёт):
SELECT COUNT(*) as total_tx,
       COUNT(DISTINCT transaction_date) as unique_dates
FROM account_transactions
WHERE reference_type = 'daily_report';

-- Не должно быть дат с > 1 транзакцией:
SELECT transaction_date, COUNT(*) as cnt
FROM account_transactions
WHERE reference_type = 'daily_report'
GROUP BY transaction_date
HAVING COUNT(*) > 1;

-- Сводка:
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
