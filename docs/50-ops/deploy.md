---
title: Деплой
summary: push в main → Netlify собирает dist/ (Node 22, SPA-редирект); серверные переменные iiko только в панели Netlify; план переезда на VPS
read_when: выкатываешь изменения, меняешь env-переменные или готовишь переезд на VPS
domain: -
status: inferred
updated: 2026-09-04
---

# Деплой

## Сейчас: Netlify
- Триггер: push в ветку `main`. Netlify выполняет `npm run build`, публикует `dist/`, SPA-редирект `/* → /index.html` (`netlify.toml`).
- Netlify Function `netlify/functions/iiko.js` доступна как `/api/iiko`.
- Переменные окружения задаются в панели Netlify (Site configuration → Environment variables). Имена — `docs/50-ops/setup.md`. После изменения переменных нужен повторный деплой.
- Миграции Supabase Netlify не применяет: новые файлы `supabase/migrations/NNN_*.sql` выполняются вручную в SQL-редакторе Supabase (или через MCP) **до** пуша кода, который от них зависит.

## Проверка после деплоя
1. Открыть сайт, войти, открыть «Контроль» за текущий месяц — все карточки загрузились без ошибок в консоли.
2. Если менялся iiko: `POST /api/iiko {"action":"departments"}` с заголовком `x-proxy-key` (см. `docs/20-architecture/integrations.md`).

## План: VPS (self-hosted Supabase)
Решение владельца (август 2026): перенести базу на свой VPS. При переезде: поднять `db-max-rows` в PostgREST (постраничная загрузка `fetchAll` при этом остаётся), применить миграции 019+ вручную, закрыть открытый RLS и plain-text пароли — см. `docs/20-architecture/security.md` и `docs/30-decisions/_index.md`.
