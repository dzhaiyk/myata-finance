---
title: Реестр решений (ADR)
summary: ADR-0001…0012 — одна строка на решение со статусом
read_when: хочешь понять, почему сделано так, или собираешься это менять
domain: -
status: confirmed
updated: 2026-09-06
---

| ADR | Решение | Статус |
|---|---|---|
| ADR-0001 | SPA без бэкенда, Supabase как единственная база | accepted |
| ADR-0002 | Своя авторизация вместо Supabase Auth | accepted |
| ADR-0003 | JSONB для данных отчёта смены | accepted |
| ADR-0004 | Категоризация: правила в базе → правила в коде, первое совпадение | accepted |
| ADR-0005 | iiko через Netlify Function | accepted |
| ADR-0006 | PDF-выписки Halyk без внешних библиотек | accepted |
| ADR-0007 | fetchAll против лимита 1000 строк; на VPS поднять db-max-rows | accepted |
| ADR-0008 | Переезд на VPS (self-hosted Supabase) | superseded by ADR-0012 |
| ADR-0009 | Расчёты как чистые функции в src/lib, общий код для всех экранов | accepted |
| ADR-0010 | Ничего специфичного для заведения в коде: настройки, справочники, seed, переводы | accepted |
| ADR-0011 | Справочники — отдельный модуль; структура отчётов в базе, формулы в коде | accepted |
| ADR-0012 | Свой сервер и свой API: Postgres на VPS в Алматы, Node перед базой, одна база с tenant_id; Supabase и Netlify уходят | accepted |
| ADR-0013 | Палитра на переменных, две темы, системный шрифт | accepted | 2026-09-06 |
