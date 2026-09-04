---
title: Локальный запуск и команды
summary: npm run dev/build/preview/test, имена env-переменных (фронт и Netlify), как применять миграции, чего нельзя (npm install)
read_when: разворачиваешь проект, запускаешь тесты или добавляешь переменную окружения
domain: -
status: confirmed
updated: 2026-09-05
---

# Запуск

## Команды
| Что | Команда |
|---|---|
| Dev-сервер | `npm run dev` (Vite; в Claude Code — через Browser pane, не через Bash) |
| Сборка | `npm run build` → `dist/` |
| Превью сборки | `npm run preview` |
| Тесты | `npm test` → `node --test src/lib/__tests__/*.test.js` (Node 22) |
| Проверка типов / линт | нет (JavaScript без TypeScript и ESLint) |
| Миграции | вручную: содержимое `supabase/migrations/NNN_*.sql` в SQL-редакторе Supabase (или через MCP `execute_sql`), до пуша зависимого кода |

## Переменные окружения
Фронтенд (`.env`, шаблон `.env.example`; всё с `VITE_` попадает в бандл):
`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_TELEGRAM_BOT_TOKEN`, `VITE_TELEGRAM_CHAT_ID`, `VITE_IIKO_PROXY_KEY` (необязательно), `VITE_IIKO_PROXY_URL` (по умолчанию `/api/iiko`).

Только в панели Netlify (во фронтенд не попадают): `IIKO_SERVER_URL` (подтверждён поддержкой: `https://too-rim-partners.iiko.it`, без `/resto`), `IIKO_LOGIN`, `IIKO_PASSWORD` (SHA1 функция считает сама — вручную и через онлайн-сервисы не хешировать) или `IIKO_PASS_SHA1`; для iikoCloud `IIKO_API_LOGIN`, `IIKO_API_HOST`; `IIKO_PROXY_KEY`. Значения вводит владелец; в репозитории и переписке их быть не должно. `.env` не читать и не коммитить.

Без Supabase-переменных приложение стартует с заглушкой `placeholder.supabase.co` и ничего не грузит.

## Ограничения машины владельца
- `npm install` блокируется TLS-перехватом — новые зависимости не добавлять; `node_modules` уже на месте.
- Данные для аудита (`docs/Accounting`) лежат в основном чекауте, не в worktree; скрипты `tools/audit/*.py` (Python 3, `openpyxl`) ходят туда по абсолютным путям.

## Проверка перед пушем
`npm test` и `npm run build` зелёные; миграция (если есть) применена; документы обновлены (см. `/handoff`).
