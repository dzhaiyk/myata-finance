---
name: supabase-migration
description: Generate SQL migrations for Myata Finance Supabase database. Use when creating or modifying tables, adding columns, constraints, indexes, or RLS policies. Contains full current schema and conventions.
---

# Myata Finance — Supabase Migrations

## Convention
Path: supabase/migrations/NNN_name.sql (3-digit, sequential)
Always: IF NOT EXISTS / IF EXISTS for idempotency, public. schema prefix
Next number: 013

## Current Migrations
001_init.sql — roles, permissions, profiles, daily_reports, bank_transactions, pnl_data, cashflow_data, settings
002_simple_auth.sql — app_users (custom auth replacing Supabase Auth), anon grants
003_staff_payroll.sql — positions, staff, suppliers, payroll_periods, payroll_details
004_add_accountant_role.sql — Бухгалтер role
005_bank_rules_staff_termination.sql — old bank_rules (single keyword), staff termination fields
006_accounts.sql — accounts, account_transactions, account_balances
007_daily_report_status.sql — status/submitted_at/updated_at on daily_reports
008_dynamic_categories.sql — categories (50+), new bank_rules + bank_rule_conditions (multi-condition)
009_fix_daily_reports_fk.sql — removed broken FK to profiles
010_period_allocation.sql — period_from/period_to on bank_transactions
011_bank_import_improvements.sql — tx_hash dedup, extended field/operator constraints
012_account_parent.sql — parent_account_id for sub-accounts

## Key Tables

app_users: id UUID PK, username TEXT UNIQUE, password_hash TEXT, full_name TEXT, role_id INT→roles, is_active BOOL, last_login TIMESTAMPTZ

daily_reports: id SERIAL PK, report_date DATE UNIQUE, manager_id UUID, manager_name TEXT, status TEXT('draft','submitted'), data JSONB, total_revenue/total_withdrawals/cash_discrepancy NUMERIC, submitted_at/updated_at TIMESTAMPTZ

bank_transactions: id SERIAL PK, transaction_date TEXT, amount NUMERIC(15,2), is_debit BOOL, beneficiary/purpose/knp TEXT, category TEXT, confidence TEXT, import_file TEXT, import_batch_id UUID, tx_hash TEXT (unique partial index), period_from/period_to DATE

categories: id SERIAL PK, code TEXT UNIQUE, name TEXT, type TEXT('income','cogs','opex','below_ebitda','other'), pnl_group TEXT, sort_order INT, is_active BOOL

bank_rules: id SERIAL PK, name TEXT, logic TEXT('and','or'), category_code TEXT, action TEXT('categorize','hide'), is_active BOOL
bank_rule_conditions: id SERIAL PK, rule_id INT→bank_rules CASCADE, field TEXT('beneficiary','purpose','knp','amount','is_debit'), operator TEXT('contains','not_contains','equals','not_equals','starts_with','gt','gte','lt','lte','between'), value TEXT, sort_order INT

accounts: id SERIAL PK, name TEXT, type TEXT('cash','bank','deposit','terminal'), bank_name TEXT, initial_balance NUMERIC(15,2), current_balance NUMERIC(15,2), sort_order INT, color/icon TEXT, is_active BOOL, parent_account_id INT→accounts

account_transactions: id SERIAL PK, account_id INT→accounts, transaction_date DATE, type TEXT('income','expense','transfer_in','transfer_out'), amount NUMERIC(15,2), category/counterparty/description TEXT, reference_type TEXT('daily_report','bank_import','manual','auto_settlement'), linked_transaction_id INT

staff: id SERIAL PK, full_name TEXT, position_id INT→positions, department TEXT, phone TEXT, daily_rate_override/sales_pct_override NUMERIC, is_active BOOL, terminated_at DATE, termination_reason TEXT

## RLS Pattern
All tables: ENABLE ROW LEVEL SECURITY + policy "All access" FOR ALL USING (true) WITH CHECK (true)
All tables granted to anon (custom auth, not Supabase Auth)

## Migration Template
```sql
-- Migration NNN: Description
ALTER TABLE public.table ADD COLUMN IF NOT EXISTS col TYPE DEFAULT val;
CREATE INDEX IF NOT EXISTS idx_name ON public.table (col);
ALTER TABLE public.table DROP CONSTRAINT IF EXISTS old; ADD CONSTRAINT new CHECK (...);
```
