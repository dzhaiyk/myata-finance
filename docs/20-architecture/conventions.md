---
title: Конвенции кода
summary: структура папок, именование, паттерн данных, стиль UI, тесты, миграции, коммиты с id правил
read_when: пишешь код, миграцию или тест
domain: -
status: inferred
updated: 2026-09-05
---

# Конвенции

## Структура
- Страница → `src/pages/<Name>Page.jsx`; общий компонент → `src/components/<Name>.jsx`; расчёт/утилита → `src/lib/<name>.js`; тест → `src/lib/__tests__/<name>.test.js`.
- Новый модуль: миграция → страница → маршрут в `App.jsx` → пункт меню в `Layout.jsx` с правом → ключ права в `store.js` → документы домена.
- Алиас `@` → `./src` (`vite.config.js`).

## Код
- Функциональные компоненты с хуками; camelCase для переменных, PascalCase для компонентов; суффикс `Page` только у страниц.
- Данные: страница вызывает `supabase.from(...)` напрямую; объёмные выборки — `fetchAll(() => supabase.from(...).order('id'))`.
- Расчёты — чистые функции в `src/lib`, без React и без Supabase-клиента внутри (клиент передаётся параметром, как в `bankImport.js`), чтобы тестировались в Node.
- Комментарии — на русском, объясняют «почему», а не «что»; рядом с реализацией правила — `// BR-<DOM>-NNN`.
- Деньги — `NUMERIC(15,2)` в базе, `Number` в коде; форматирование через `fmt()` (`src/lib/utils.js`), валюта ₸ без копеек.
- Даты: операционный день через `getBusinessDate` / `businessDateFromParts` (`src/lib/dates.js`); `bank_transactions.transaction_date` — TEXT `YYYY-MM-DD`.

## UI
- Тёмная тема: фон slate-925, акцент brand-500 (#22c55e), вторичный mint; шрифты DM Sans / Plus Jakarta Sans / JetBrains Mono.
- Только Tailwind-классы + кастомные `.card`, `.btn-primary`, `.btn-secondary`, `.input`, `.badge`, `.table-header`, `.label` из `src/index.css`.
- Весь UI на русском.

## Тесты
- `node:test`, запуск `npm test`; фреймворков нет. Тест на правило: `describe('BR-<DOM>-NNN …')` или файл `br-<dom>-nnn.test.js`.
- Контракт кодов категорий: `category-contract.test.js` сверяет миграции таблицы `categories` (008, 021, 022) с сидом правил (027), сидом P&L (`pnlSeed.js`), группами Cash Flow и служебными категориями `NON_PNL_CATEGORIES`. Списка категорий в коде нет (TASK-026): новая статья заводится миграцией или в Справочниках.

## Миграции
- `supabase/migrations/NNN_<slug>.sql`, следующий номер; идемпотентно (`IF NOT EXISTS`); RLS-политика обязательна (пока открытая); применяются вручную до пуша кода.
- `CREATE POLICY IF NOT EXISTS` в PostgreSQL не существует (миграция 016 как написана не выполнится) — использовать `DROP POLICY IF EXISTS` + `CREATE POLICY`.

## Коммиты
- Английские идентификаторы, русское описание допустимо: `feat(control): дивиденды наличными [BR-CTL-007, TASK-012]`.
- Изменил поведение — документ, тест и строка в `docs/INDEX.md` в том же коммите.
