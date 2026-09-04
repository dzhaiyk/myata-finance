---
title: Сущности домена shift
summary: отчёт смены (daily_reports.data), поставщик; состояния draft → submitted
read_when: меняешь структуру данных отчёта или его статусы
domain: shift
status: inferred
updated: 2026-09-04
---

# Сущности

## Отчёт смены (`daily_reports`)
**Назначение.** Один операционный день: выручка, изъятия из кассы, остатки, терминалы.

**Ключевые поля**: `report_date` (уникальна), `status`, `manager_name`, `submitted_at`; в JSONB `data`: `departments[] {name, amount}`, `revenue[] {type, amount, checks}`, `terminals {accountId: amount}`, `withdrawals {suppliers_kitchen[], suppliers_bar[], tobacco[], payroll[], other[], cash_withdrawals[]}` (строки `{name, amount, comment}`), `cash_start`, `cash_end`, `discrepancy`. Дублирующие колонки для списков: `total_revenue`, `total_withdrawals`, `cash_discrepancy`.

**Состояния**
```mermaid
stateDiagram-v2
  [*] --> draft: менеджер создаёт
  draft --> submitted: «Отправить» (BR-SHF-010, BR-SHF-011)
  submitted --> draft: «Вернуть в черновик», право daily_report.edit (BR-SHF-004)
  submitted --> [*]: удаление, право daily_report.edit
```

**Инварианты**
- Одна дата — один отчёт (BR-SHF-003).
- `discrepancy = cash_end − (cash_start + наличные − изъятия)` (BR-SHF-006).
- Сумма отделов = сумма оплат с допуском 1 ₸ (BR-SHF-018) — не enforced в форме.

## Поставщик (`suppliers`)
**Назначение.** Автоподсказки имён в секциях закупа. Поля: `name`, `category` (Кухня/Бар/Кальян/Хозтовары/Прочее), `is_active`. Состояний нет.
