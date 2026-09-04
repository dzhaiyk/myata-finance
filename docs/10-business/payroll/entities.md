---
title: Сущности домена payroll
summary: должность, сотрудник, ведомость (draft → calculated → paid), строка ведомости
read_when: меняешь поля персонала или статусы ведомости
domain: payroll
status: inferred
updated: 2026-09-04
---

# Сущности

## Должность (`positions`)
`name`, `department` (Кухня/Бар/Кальян/Зал/Менеджмент/Прочее), `daily_rate`, `sales_pct`. Для автоматизации методики нужны тип бонуса и параметр (`manager_pct_total`, `admin_pct_shift_days`, `waiter_service_share`, `bar_pct_shift_days`, `kitchen_margin_pct`, `hookah_pool`, `fixed_half_month`) — их пока нет (TASK-011).

## Сотрудник (`staff`)
`full_name`, `position_id`, `department`, `daily_rate_override`, `sales_pct_override`, `terminated_at`, `termination_reason`. Связь с авансами отчётов — по имени (BR-PAY-004).

## Ведомость (`payroll_periods`)
`year`, `month`, `period` (1|2), `status`, `paid_date`. Одна на год-месяц-период.
```mermaid
stateDiagram-v2
  [*] --> draft: первое сохранение
  draft --> calculated: сохранение расчёта
  calculated --> paid: «Отметить как выплачено», payroll.manage; ставки замораживаются (BR-PAY-003)
```

## Строка ведомости (`payroll_details`)
`days_worked`, `daily_rate`, `daily_total`, `sales_amount`, `sales_pct`, `sales_bonus`, `advances`, `manual_advances`, `deductions`, `total_earned`, `total_payout`. Одна на ведомость и сотрудника (BR-PAY-002).
