---
name: bank-import
description: Context for bank statement import in Myata Finance. Use when modifying BankImportPage.jsx or src/lib/categorize.js — Excel parsing, auto-categorization rules, deduplication, period allocation.
---

# Myata Finance — Bank Import

## Files
- src/pages/BankImportPage.jsx (~600 lines)
- src/lib/categorize.js — CATEGORIES map, KEYWORD_RULES, parseBankStatement(), categorizeTransaction()

## Excel Format (Kaspi Business Export)
Columns: [0]№ документа, [1]Дата операции, [2]Дебет, [3]Кредит, [4]Бенефициар, [5]ИИК, [6]БИК, [7]КНП, [8]Назначение
First ~11 rows are metadata. Header row detected by "Дебет" in position [2].
Date format: "30.01.2026 23:42:00" → parsed to "2026-01-30"
Beneficiary: may contain \r\n + ИИН/БИН suffix

## Import Flow (2-step)
1. Parse Excel → apply rules → dedup check → stage rows for preview (NOT saved to DB)
2. User reviews staged rows (can change categories, delete rows, adjust periods) → confirm → insert to DB

## Deduplication
tx_hash = SHA-256 of `date|number|amount|isDebit|beneficiary|purpose` (first 12 bytes hex)
Unique partial index: bank_transactions_tx_hash_unique WHERE tx_hash IS NOT NULL

## Auto-Categorization (2 layers)
Layer 1: KEYWORD_RULES in categorize.js — regex patterns on purpose/beneficiary fields (first match wins)
Layer 2: bank_rules + bank_rule_conditions in DB — multi-condition AND/OR with operators

## Rule Conditions
Fields: beneficiary, purpose, knp, amount, is_debit
Operators by field:
- Text (beneficiary/purpose): contains, not_contains, equals, not_equals, starts_with
- KNP: equals, not_equals, contains
- Amount: gt, gte, lt, lte, equals, between (value="min-max")
- is_debit: equals (value="true"|"false", renders as select Дебет/Кредит)

Logic: AND (all conditions match) or OR (any condition matches)
Actions: categorize (assign category_code) or hide (exclude from import)

## Period Allocation
Each transaction gets period_from/period_to (DATE):
- NULL → amount goes to transaction_date month
- Same month → entire amount to that month (e.g. роялти за прошлый месяц)
- Range → amount / N months evenly (e.g. 2ГИС за 6 месяцев)

PeriodEditor component: badge showing period + popover with presets (Текущий, Пред. месяц, Пред. квартал, Вперёд 3/6 мес, Свой)

## Categories (50+ in DB)
Types: income, cogs, opex, below_ebitda, other
Groups: revenue, foodcost, payroll, marketing, rent, utilities, opex_other, taxes, capex, internal, dividends, uncategorized
Displayed in <optgroup> by TYPE_LABELS

## Key KEYWORD_RULES (categorize.js)
- /кухня/i → cogs_kitchen, /бар/i → cogs_bar, /кальян/i → cogs_hookah
- /аренд/i → rent_main, /роялти/i → opex_royalty
- /розничн.*налог/i → tax_retail, /ИПН|подоходн/i → tax_payroll
- /дивиденд|безвозмезд.*перевод/i → dividends
- /Kaspi Pay|KASPI BANK/i → opex_bank_fees (beneficiary)
- /2ГИС/i → marketing_2gis, /Управляющая компания Мята/i → opex_royalty
