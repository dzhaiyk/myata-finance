---
title: Правила домена access
summary: 8 правил BR-ACS-*: вход и сессия, роли, ключи прав, гейтинг, кто ставит категории, доступ менеджеров к банкам, настройки, Telegram-события
read_when: меняешь вход, роли, права, настройки или уведомления
domain: access
status: partial
updated: 2026-09-04
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
**Правило.** 30 ключей (`store.js:91-121`): daily_report.view/create/edit, pnl.view/edit, cashflow.view/edit, bank_import.view/upload/categorize, dashboard.view/kpi, staff.view/manage, suppliers.view/manage, accounts.manage, payroll.view/manage, users.view/manage, roles.view/manage, investments.view/edit/manage, settings.view/edit, telegram.manage. Права роли — строки `permissions (role_id, permission_key, allowed)`; проверка `hasPermission(key)`.
**Статус.** INFERRED · источник: `store.js:47-67,91-121`
**Реализация.** `store.js`, `RolesPage.jsx`

### BR-ACS-004 · Где проверяются права
**Правило.** Маршруты проверяют только наличие сессии; права проверяются в меню (`Layout.jsx`) и внутри страниц/действий. Не проверяются нигде: `dashboard.kpi`, `pnl.edit`, `cashflow.edit`, `daily_report.create`, `telegram.manage`. Страница P&L не проверяет право внутри.
**Статус.** INFERRED · источник: `App.jsx:22-31`, `Layout.jsx:8-24,60`, `PnLPage.jsx:19`
**Реализация.** `App.jsx`, `Layout.jsx` — см. TASK-007

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
