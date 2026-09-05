---
title: Архитектура: модули и границы
summary: SPA без бэкенда: страницы напрямую ходят в Supabase; расчёты в src/lib; единственная серверная часть — Netlify Function для iiko; карта модуль → домен
read_when: добавляешь страницу или модуль, ищешь, где живёт расчёт, или решаешь, куда положить новый код
domain: -
status: inferred
updated: 2026-09-06
---

# Архитектура

## Слои
```
Браузер: React 18 + React Router 7 + Zustand + Tailwind
  src/pages/*      — экраны; каждый сам грузит данные из Supabase (useState/useEffect), общих хуков данных нет
  src/components/* — Layout (навигация, права), StatementUploadCard, investments/*
  src/lib/*        — расчёты и инфраструктура (чистые функции, покрыты тестами node:test)
Supabase Cloud (PostgreSQL + PostgREST) — единственная база; RLS открыт, авторизация только на клиенте
Netlify — хостинг dist/ и функция /api/iiko (netlify/functions/iiko.js)
Внешние: Telegram Bot API (из браузера), iiko (через функцию), файлы выписок Kaspi/Halyk (разбор в браузере)
```

Точка входа `src/main.jsx` (ErrorBoundary) → `src/App.jsx` (роутер, `ProtectedRoute` проверяет только наличие сессии, права — в `Layout.jsx` и внутри страниц).

## Модули → домены
| Модуль (код) | Домен | Что делает |
|---|---|---|
| `pages/DailyReportPage.jsx` (1178 стр.), `lib/dates.js`, `components/StatementUploadCard.jsx` | shift | отчёт смены, касса, терминалы, PDF/WhatsApp, загрузка выписок менеджером |
| `pages/BankImportPage.jsx`, `lib/bankImport.js`, `lib/categorize.js`, `lib/halykStatement.js`, `lib/pdfText.js`, `lib/categories.js` | bank | разбор выписок, правила категоризации, дедупликация |
| `pages/AccountsPage.jsx` | accounts | счета, переводы, сверка остатков |
| `pages/PnLPage.jsx`, `pages/CashFlowPage.jsx`, `pages/DashboardPage.jsx`, `pages/AnalyticsPage.jsx`, `lib/pnlCompute.js`, `lib/pnl.js` | reporting | P&L, Cash Flow, дашборд, аналитика |
| `pages/ControlPage.jsx`, `lib/reconcile.js` | control | сверки замкнутого контура |
| `pages/PayrollPage.jsx`, `pages/StaffPage.jsx` | payroll | ведомости, персонал, должности |
| `pages/InvestmentsPage.jsx`, `components/investments/*` | investors | учредители, дивиденды, доли |
| `pages/UsersPage.jsx`, `pages/RolesPage.jsx`, `pages/SettingsPage.jsx`, `pages/LoginPage.jsx`, `lib/store.js`, `components/Layout.jsx` | access | пользователи, роли, права, настройки |
| `pages/SuppliersPage.jsx` | shift (справочник) | поставщики для автоподсказок в отчёте смены |
| `lib/iiko.js`, `netlify/functions/iiko.js`, `lib/telegram.js`, `lib/supabase.js`, `lib/fetchAll.js`, `lib/utils.js` | — (инфраструктура) | интеграции и утилиты, см. `integrations.md` |
| `index.css`, `tailwind.config.js`, `lib/theme.js`, `lib/chartTheme.js`, `lib/staleReload.js` | — | палитра на переменных и две темы, шкала кеглей, оформление графиков, самолечение устаревшей вкладки |

Список доменов и их границы — `docs/10-business/_domains.md`.

## Правила устройства
- Расчёт живёт в `src/lib` как чистая функция и покрывается тестом; страница только вызывает его. Прецедент: дашборд считал P&L своей копией и расходился с P&L — расчёт вынесен в `pnlCompute.js` (04.09.2026). Аналитика пока считает food cost и ФОТ своей копией — см. открытые вопросы домена reporting.
- Объёмные выборки — только через `fetchAll` (`lib/fetchAll.js`): PostgREST отдаёт максимум 1000 строк молча.
- Секреты не попадают в бандл: всё с префиксом `VITE_` видно в браузере; серверные ключи — только в Netlify Function.
- Новые зависимости не добавляются без согласования: `npm install` на машине владельца блокирован TLS-перехватом; PDF-парсер написан вручную.

## Размеры и долг
Самые крупные файлы: DailyReportPage 1178, BankImportPage 863, AccountsPage 697, InvestmentsPage 665, AnalyticsPage 616, CashFlowPage 612 строк. Мёртвый код: `reconcile.checkPayroll`, `telegram.formatBankImportNotification`, `iiko.getDepartments/getOlapColumns`. Дубли: распределение по периодам (`lib/pnl.js` и помощники в `BankImportPage.jsx:31-60`).

Исходники: `Blueprint.md` (07.05.2026, перенесено 2026-09-04), `CLAUDE.md`-энциклопедия (перенесено 2026-09-04).
