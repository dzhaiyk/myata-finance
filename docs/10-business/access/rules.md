---
title: Правила домена access
summary: 8 правил BR-ACS-*: вход и сессия, роли, ключи прав, гейтинг, кто ставит категории, доступ менеджеров к банкам, настройки, Telegram-события
read_when: меняешь вход, роли, права, настройки или уведомления
domain: access
status: partial
updated: 2026-09-05
---

# Правила BR-ACS-*

### BR-ACS-001 · Вход и сессия
**Правило.** Вход по логину (≥ 3 символов) и паролю из `app_users`; пароль сравнивается со столбцом `password_hash` как строка (хеширования нет); неактивный пользователь не входит. Сессия — `localStorage.myata_session = {userId}`; при старте проверяется, что пользователь существует и активен.
**Статус.** INFERRED · источник: `src/lib/store.js:5,39,78-80`, миграция 002
**Реализация.** `store.js`, `LoginPage.jsx`

### BR-ACS-002 · Роли
**Правило.** Роли: Админ (id 1, системная), Учредитель, Управляющий, Менеджер (по умолчанию для новых), Бухгалтер. Роль «Админ» определяется по имени и получает все права автоматически.
**Статус.** INFERRED · источник: миграции 001:13-17, 004:2; `store.js:39,50,65`. Список ролей в UI зашит без «Бухгалтера» (`UsersPage.jsx:7`) — open-questions #1
**Реализация.** `store.js`, `UsersPage.jsx`, `RolesPage.jsx`

### BR-ACS-003 · Ключи прав
**Правило.** 29 ключей (`ALL_PERMISSIONS` в `store.js`): daily_report.view/edit, pnl.view/edit, cashflow.view, bank_import.view/upload/categorize, dashboard.view, staff.view/manage, suppliers.view/manage, accounts.manage, timesheet.view/manage, payroll.view/manage, users.view/manage, roles.view/manage, investments.view/edit/manage, dictionaries.view/manage, settings.view/edit. Каждый ключ что-то ограничивает; ключ без проверки в коде не заводится. Права роли — строки `permissions (role_id, permission_key, allowed)`; проверка `hasPermission(key)`; суперроль получает все.
**Основание.** 05.09.2026 (Жайык) удалены четыре ключа, которые ничего не ограничивали: `dashboard.kpi`, `daily_report.create`, `telegram.manage` покрыты `dashboard.view`, `daily_report.edit`, `settings.edit`; у `cashflow.edit` не было действия — страница Cash Flow только для чтения. Строки `permissions` с ними удалены миграцией 032.
**Статус.** INFERRED · источник: `store.js:47-67,91-121`
**Реализация.** `store.js`, `RolesPage.jsx`

### BR-ACS-004 · Где проверяются права
**Правило.** Маршрут закрыт тем же правом, что и пункт меню (`NAV` в `Layout.jsx`): без права просмотра прямая ссылка ведёт на первую доступную страницу, без единого права — сообщение. Действия внутри страниц проверяются своими ключами: ручные корректировки P&L — `pnl.edit`.
**Статус.** CONFIRMED · 2026-09-05 · Жайык · вопрос #2 `open-questions.md`
**Реализация.** `src/lib/routeAccess.js` (`canOpenPath`, `firstAllowedPath`), `RouteGuard` в `App.jsx`, `PnLPage.jsx` · тест `routeAccess.test.js`

### BR-ACS-005 · Кто ставит категории выпискам
**Правило.** Категории строкам выписок ставят только учредитель или бухгалтер (`bank_import.categorize`); менеджеры получают только `bank_import.upload`.
**Статус.** CONFIRMED · 2026-09-04 · Жайык · источник: интервью
**Реализация.** `BankImportPage.jsx:204`, `StatementUploadCard.jsx`

### BR-ACS-006 · Доступ менеджеров к приложениям банков
**Правило.** Менеджеры смен имеют доступ к приложениям Kaspi Business и Halyk для выгрузки выписок; платежи они могут создавать, но подтверждает только учредитель; видимость остатков допустима.
**Статус.** CONFIRMED · 2026-09-04 · Жайык · источник: интервью
**Реализация.** вне продукта (организационное правило)

### BR-ACS-007 · Системные настройки
**Правило.** Настройки хранятся в `settings (key, value JSONB)`: `shift.cutoff_hour` (час отсечки, UI в «Настройках»), `closures`, `owner_cash_opening` (только SQL), `general`, `telegram` (bot_token, chat_id, флаги — кодом не читается, уведомления идут из env-переменных).
**Статус.** INFERRED · источник: миграция 001:121-131, `dates.js:33-50`, `telegram.js:3-4`
**Реализация.** `SettingsPage.jsx`, `dates.js`

### BR-ACS-008 · События Telegram
**Правило.** В чат `VITE_TELEGRAM_CHAT_ID` уходят: итоги отправленной смены; алерт при |расхождении кассы| > 1000; сводка после загрузки выписки (период, новых, без категории, сошлись ли остатки). Ошибки отправки не блокируют учёт.
**Статус.** INFERRED · источник: `telegram.js`, `DailyReportPage.jsx:441-447`, `StatementUploadCard.jsx:80`
**Реализация.** `telegram.js`, `bankImport.js` (formatStatementUploadNotification) · тест `bankImport.test.js`
