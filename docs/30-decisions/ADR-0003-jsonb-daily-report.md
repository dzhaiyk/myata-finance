---
title: ADR-0003 JSONB для данных отчёта смены
summary: весь отчёт смены хранится в daily_reports.data (JSONB), а не в нормализованных таблицах
read_when: сомневаешься, почему сделано так, или хочешь это изменить
domain: -
status: accepted
updated: 2026-09-04
---

# ADR-0003 · JSONB для данных отчёта смены

## Контекст
Форма отчёта смены менялась часто: секции изъятий, терминалы, типы оплат, комментарии.

## Варианты
1. Нормализованные таблицы (revenue_lines, withdrawal_lines, …) — плюсы: SQL-агрегации, ограничения; минусы: каждая правка формы — миграция.
2. Одна строка на день с JSONB `data` — плюсы: форма и хранение меняются вместе, одна запись = один день; минусы: агрегации в JS, нет CHECK на структуру.

## Решение
Вариант 2: `daily_reports.data` содержит `departments[]`, `revenue[]`, `terminals{}`, `withdrawals{}`, `cash_start`, `cash_end`, `discrepancy`. Суммы дублируются в колонках `total_revenue`, `total_withdrawals`, `cash_discrepancy` для списков.

## Последствия
- Все расчёты по сменам — в JS (`pnlCompute.js`, `reconcile.js`); SQL-запросы к JSONB — только для аудита.
- Структура `data` описана в `docs/20-architecture/data-model.md`; изменение структуры — правило домена shift.

## Статус
accepted · миграция 001 · зафиксировано 2026-09-04
