-- TASK-007: ключи прав, которые ничего не ограничивали, удалены из приложения
-- (решение владельца 05.09.2026). Строки permissions с ними больше не читаются —
-- убираем, чтобы экран ролей не показывал несуществующие права.
DELETE FROM public.permissions
WHERE permission_key IN ('dashboard.kpi', 'daily_report.create', 'telegram.manage', 'cashflow.edit');
