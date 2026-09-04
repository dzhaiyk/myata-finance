---
title: Сущности домена control
summary: у контроля нет своих таблиц: настройки closures и owner_cash_opening, результат сверки (в памяти)
read_when: добавляешь настройку или новый блокер
domain: control
status: inferred
updated: 2026-09-04
---

# Сущности

## Настройки (`settings`)
- `closures` → `[{from, to, reason}]` — дни закрытия (BR-SHF-013, BR-CTL-004).
- `owner_cash_opening` → `{ "<год>": сумма, note }` — остаток наличных у учредителей на 1 января (BR-CTL-013).
- `shift` → `{ cutoff_hour }` — час отсечки (BR-SHF-001).

## Результат сверки (в памяти, `ControlPage.jsx` → `checks`)
`open {drafts, uncategorized}`, `missing[]`, `freshness`, `review[]`, `revenue[]`, `cashDisc[]`, `acquiring {byBank, ok}`, `payroll {accrued, trackedPaid, fromOwners, ok}`, `transitRows[]`, `owners {unexplained, ok, opening, withdrawn, returned, fromOwners, cashDiv}`, `accountChecks[]`. Не сохраняется.
