---
title: Безопасность и доступ
summary: своя авторизация по логину/паролю (пароли в открытом виде), сессия в localStorage, права только на клиенте, RLS открыт для anon, ключи Telegram в бандле
read_when: трогаешь вход, права, RLS, секреты или готовишь переезд на VPS
domain: -
status: inferred
updated: 2026-09-04
---

# Безопасность

## Как устроено сейчас
- Авторизация своя, не Supabase Auth: `app_users` (username, `password_hash` — фактически открытый пароль, сравнение строкой в `src/lib/store.js:78`). Сессия — `localStorage['myata_session'] = {userId}`; при старте `store.initialize()` проверяет активность пользователя.
- Права: таблица `permissions` (role_id × permission_key), 30 ключей в `store.js:91-121`; `hasPermission(key)`; роль «Админ» определяется по имени роли и получает всё.
- Маршруты права не проверяют (`App.jsx` — только наличие сессии); гейтинг в меню `Layout.jsx` и внутри страниц. Страница, не проверяющая право внутри (например, P&L), открыта по прямому URL любому вошедшему.
- RLS включён на всех таблицах, но политики `USING (true) WITH CHECK (true)` + `GRANT ALL TO anon`: anon-ключ даёт полный доступ к базе.
- Telegram-токен и chat_id — `VITE_*`, попадают в бандл. iiko — только в Netlify Function; `IIKO_PROXY_KEY` защищает функцию от посторонних, но `VITE_IIKO_PROXY_KEY` виден в исходниках.
- Аудита действий нет; `created_by` есть только у `pnl_data` и `investor_transactions`.

## Известные риски (приоритет)
1. Пароли в открытом виде и открытый RLS — критично; закрывается при переезде на VPS (серверная авторизация, хеширование, политики по ролям).
2. Права объявлены, но не проверяются: `dashboard.kpi`, `pnl.edit`, `cashflow.edit`, `daily_report.create`, `telegram.manage`.
3. Telegram-токен в бандле — вынести в функцию вместе с серверной частью.

Правила прав по доменам — `docs/10-business/<домен>/permissions.md`; общая матрица — домен access.
