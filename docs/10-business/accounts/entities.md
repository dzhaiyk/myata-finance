---
title: Сущности домена accounts
summary: счёт, движение по счёту, сверка остатка
read_when: меняешь поля счетов или движений
domain: accounts
status: inferred
updated: 2026-09-04
---

# Сущности

## Счёт (`accounts`)
Поля: `name`, `type` (cash/bank/deposit/terminal), `bank_name`, `initial_balance`, `current_balance` (после сверки), `parent_account_id`, `is_active`, `sort_order`. Состояний нет (активен / неактивен).

## Движение по счёту (`account_transactions`)
Поля: `account_id`, `transaction_date`, `type` (income/expense/transfer_in/transfer_out), `amount`, `category`, `description`, `reference_type` (daily_report/bank_import/manual/auto_settlement), `reference_id`, `linked_transaction_id`.
**Инварианты**: строка выписки ↔ ровно одно движение (BR-BNK-013); перевод ↔ пара движений (BR-ACC-004).

## Сверка (`account_balances`)
Поля: `account_id`, `balance_date`, `expected_balance`, `actual_balance`, `discrepancy` (GENERATED). Одна на счёт и дату.
