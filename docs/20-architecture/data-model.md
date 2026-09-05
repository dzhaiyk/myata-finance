---
title: Модель данных
summary: карта таблиц Supabase: таблица → домен → назначение → ключевые ограничения; три источника доходов/расходов и как из них собирается P&L
read_when: пишешь запрос или миграцию, ищешь, где хранится цифра, или сомневаешься, откуда P&L берёт строку
domain: -
status: inferred
updated: 2026-09-05
---

# Модель данных

23 миграции в `supabase/migrations/001…023`. Полная схема — в скилле `.claude/skills/supabase-migration`. Здесь — карта.

## Таблицы
| Таблица | Домен | Назначение | Ключевые ограничения |
|---|---|---|---|
| `daily_reports` | shift | отчёт смены; всё содержимое в JSONB `data` | `report_date` UNIQUE; status draft/submitted (CHECK из 001 допускает ещё `approved`, 007 его не снял) |
| `departments` | — | справочник отделов: код, название, где предлагается (выручка/персонал/закуп), склад в iiko | code UNIQUE; на него ссылаются `positions`, `staff`, `suppliers`; создан миграцией 025 |
| `suppliers` | shift | справочник поставщиков для автоподсказок | `category` → `departments.code` (до 025 был CHECK со списком названий) |
| `settings` | shift/control/access | key → JSONB: `shift.cutoff_hour`, `closures`, `owner_cash_opening`, `telegram.notifications`, `general` (`app_title`, `restaurant_name`, `company`, `logo_url`, `currency`, `locale`, `timezone`) | key PK |
| `bank_transactions` | bank | строка выписки; `transaction_date` — TEXT операционной даты | `tx_hash` UNIQUE (дедуп); `period_from/to` (P&L по периодам); `account_id` → accounts; `review_note` (к проверке) |
| `bank_rules`, `bank_rule_conditions` | bank | правила категоризации: заведённые в UI (sort_order 0) и перенесённые из кода (миграция 027, sort_order 10…700); первое совпавшее выигрывает | logic and/or; action categorize/hide; условие по `beneficiary`/`purpose`/`knp`/`amount`/`is_debit`, оператор в т. ч. `matches` (регулярка) |
| `categories` | bank/reporting | план счетов: код → тип (income/cogs/opex/below_ebitda/other), группа P&L; `department` + `name_template` — подпись собирается из названия отдела (миграция 026); `parent_code` — подстатья, один уровень (миграция 028); экран «Справочники → Статьи» | code UNIQUE; канон кодов = миграция 008 (тест `category-contract.test.js`) |
| `accounts` | accounts | касса, банки, депозиты, терминалы; терминал → `parent_account_id` банка | type IN (cash/bank/deposit/terminal) |
| `account_transactions` | accounts | движение по счёту; каждая строка выписки создаёт запись (`reference_type='bank_import'`) | type income/expense/transfer_in/transfer_out; reference_type CHECK |
| `account_balances` | accounts | сверка остатка на дату; `discrepancy` — GENERATED = actual − expected | UNIQUE(account_id, balance_date) |
| `pnl_data` | reporting | `type='historical'` — импорт Excel 2022–2025 (заменяет расчёт); иначе ручная корректировка (прибавляется) | UNIQUE снят в 020: historical и корректировка сосуществуют |
| `cashflow_data` | reporting | создана в 001, кодом не используется | UNIQUE(year, month, category) |
| `positions`, `staff` | payroll | должности (ставка, %), сотрудники (override, увольнение) | `department` → `departments.code` (до 025 был CHECK со списком названий) |
| `payroll_periods`, `payroll_details` | payroll | ведомость за половину месяца; строки по сотрудникам | period IN (1,2); status draft/calculated/paid; UNIQUE(period_id, staff_id) |
| `investors`, `investor_transactions` | investors | учредители, доли; операции investment/dividend/share_purchase/share_sale | status active/exited |
| `roles`, `permissions`, `app_users` | access | роли, права (role_id × key), пользователи с паролем в открытом виде | username UNIQUE; UNIQUE(role_id, permission_key) |
| `profiles` | — | наследие Supabase Auth, не используется | — |

## Три источника доходов и расходов
Одной таблицы «доходы/расходы» нет. P&L собирается на лету (`src/lib/pnlCompute.js`):

| Источник | Что даёт | Ключевые поля |
|---|---|---|
| `daily_reports.data` | выручка по отделам и типам оплат, наличные расходы, касса | `departments[]` (с 025 каждый элемент несёт `code`), `revenue[]`, `terminals{}`, `withdrawals{suppliers_kitchen, suppliers_bar, tobacco, payroll, other, cash_withdrawals}`, `cash_start`, `cash_end`, `discrepancy` |
| `bank_transactions` | все безналичные расходы и прочие поступления | `category`, `is_debit`, `period_from/to` |
| `pnl_data` | история 2022–2025 (`historical`) и ручные правки | `year`, `month`, `category`, `amount`, `type` |

Тонкости: строка `tobacco` с именем «Аппараты» — CapEx, не закуп. В `payroll` в P&L идёт только техперсонал, остальное — авансы. `cash_withdrawals` с комментарием про зарплату — выплата ЗП, остальное — вынос денег. Категории `uncategorized`, `internal`, `acquiring_settlement`, `cash_withdrawal` в P&L не попадают (перемещение денег, а не расход). Порядок расчёта и знаки — правила домена reporting.

Cash Flow считает отдельно: по дате платежа, без распределения по периодам.

## Чего в базе нет
Наличные у учредителей не являются счётом: снятое со счёта уходит из контура и возвращается взносом, зарплатой или дивидендами; разница видна на «Контроле» (домен control).

Исходный документ: `docs/Модель-данных.md` (перенесено 2026-09-04).
