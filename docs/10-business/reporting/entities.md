---
title: Сущности домена reporting
summary: строка P&L (PNL_STRUCTURE), запись pnl_data (historical / корректировка), структура Cash Flow
read_when: добавляешь строку отчёта или категорию
domain: reporting
status: inferred
updated: 2026-09-04
---

# Сущности

## Строка P&L (`PNL_STRUCTURE`, `src/lib/pnlCompute.js`)
Поля: `key`, `label`, `level` (0..3), `section` (revenue / cogs / opex / capex / result), `source` — `daily:<поле>`, `bank:<код>`, `both:<код>`, `calc`. Порядок в массиве = порядок в отчёте. Новая категория расхода = новая строка здесь + код в миграции + правило категоризации (BR-BNK-015).

## Запись `pnl_data`
Поля: `year`, `month`, `category` (ключ строки P&L), `amount`, `type` (`historical` | `expense`), `description`, `created_by`. Historical заменяет месяц (BR-RPT-002); остальные прибавляются (BR-RPT-001). Уникальность снята (миграция 020): historical и корректировка одной категории сосуществуют.

## Структура Cash Flow (`CashFlowPage.jsx`)
Секции operating / investing / financing / net; строки `cf_*` с источниками аналогично P&L, но по датам платежей (BR-RPT-011). Таблица `cashflow_data` не используется.
