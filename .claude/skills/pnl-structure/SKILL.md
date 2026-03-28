---
name: pnl-structure
description: P&L structure and aggregation logic for Myata Finance. Use when modifying PnLPage.jsx, adding new expense categories, or changing how daily reports and bank transactions feed into P&L.
---

# Myata Finance — P&L Structure

## File: src/pages/PnLPage.jsx (~400 lines)

## Data Sources
1. daily_reports (submitted only) → revenue by department, cash expenses (payroll, suppliers, tobacco, other)
2. bank_transactions (categorized) → all non-cash expenses (rent, utilities, marketing, taxes, etc.)
3. pnl_data → manual adjustments

## Period Allocation
Bank transactions with period_from/period_to are split across months:
```js
function getTxAmountForMonth(tx, targetYear, targetMonth) {
  if (!tx.period_from || !tx.period_to) → full amount if transaction_date matches
  else → amount / totalMonths if target month in range
}
```
Query loads tx where: transaction_date in range OR period overlaps with range

## PNL_STRUCTURE Array (90+ lines)
Each line: { key, label, level (0=header, 1=group, 2=leaf), section, source, calc }

### REVENUE (level 0, calc: sum_children)
- rev_kitchen → source: daily:dept_kitchen
- rev_bar → source: daily:dept_bar
- rev_hookah → source: daily:dept_hookah
- rev_other → source: daily:dept_other

### EXPENSES (level 0, calc: sum_children)

**CapEx** (level 1): capex_repair, capex_furniture, capex_other → bank:capex_*

**OpEx** (level 1, calc: sum_children):

*ФОТ* (level 1, parent: opex): payroll_mgmt/kitchen/bar/hookah/hall/transport → bank:payroll_*
  payroll_cash → daily:payroll, payroll_other → bank:payroll_other

*Food Cost* (level 1, parent: opex):
  fc_kitchen → both:cogs_kitchen (cash from daily suppliers_kitchen + bank cogs_kitchen)
  fc_bar → both:cogs_bar
  fc_hookah → both:cogs_hookah (cash from daily tobacco)

*Маркетинг* (level 1): mkt_smm/target/2gis/yandex/google/other → bank:mkt_*

*Аренда* (level 1): rent_premises/warehouse/property_tax → bank:rent_*

*Коммунальные* (level 1): util_electric/water/heating/bi/internet/waste/other → bank:util_*

*OpEx прочее* (level 1): household(both), bank_fee, security, software, menu, pest, grease, repair, uniform, music, royalty, misc → bank:opex_*

*Налоги* (level 1): tax_retail/payroll/insurance/alcohol/hookah/other → bank:tax_*

### RESULTS (level 0)
- op_profit = revenue - opex
- net_profit = revenue - expenses (capex + opex) + manual adjustments

### RATIOS (level 0/2)
- margin_pct = op_profit / revenue
- fc_pct = foodcost / revenue
- fc_kitchen_pct = fc_kitchen / rev_kitchen
- fc_bar_pct, fc_hookah_pct

## Source Types
- daily:field → aggregated from daily_reports.data
- bank:category_code → aggregated from bank_transactions by category
- both:category → cash (daily) + non-cash (bank) combined

## Collapse/Expand
- Level 0/1 with calc=sum_children are clickable
- isVisible(line, idx) checks parent + grandparent collapsed state
- Toggle all button: allExpanded state

## View Modes
- month: single month P&L
- ytd: January through selected month cumulative

## Categories Mapping (categories table → PNL_STRUCTURE)
category.code must match the string after "bank:" in source field
Example: bank_transactions.category = 'mkt_2gis' → matched by source: 'bank:mkt_2gis' → line key: 'mkt_2gis'

## Adding New Category
1. Add to categories table (migration)
2. Add line to PNL_STRUCTURE array in PnLPage.jsx
3. Add to CATEGORIES in categorize.js
4. Add keyword rule if applicable
