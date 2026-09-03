---
name: daily-report
description: Context for the daily report form in Myata Finance. Use when modifying DailyReportPage.jsx — form structure, cash reconciliation, PDF generation, WhatsApp sharing, or journal view.
---

# Myata Finance — Daily Report

## File: src/pages/DailyReportPage.jsx (~700 lines)

## Modes
- journal: list of reports + date picker + new report button. Resets on every nav click via useLocation().key
- form: 3-block report form (draft or submitted)

## Dependencies
jsPDF with Roboto font files at /public/fonts/Roboto-Regular.ttf and Roboto-Bold.ttf for Cyrillic PDF support

## Form Structure

### Constants
```js
SECTIONS = [
  { key: 'suppliers_kitchen', label: 'Закуп Кухня', supplierCat: 'Кухня' },
  { key: 'suppliers_bar', label: 'Закуп Бар', supplierCat: 'Бар' },
  { key: 'tobacco', label: 'Закуп Кальян', fixed: true },
  { key: 'payroll', label: 'Авансы персоналу', isPayroll: true },
  { key: 'other', label: 'Прочие расходы', fixed: true },
  { key: 'cash_withdrawals', label: 'Изъятия из кассы' },
]
FIXED_ROWS = {
  tobacco: ['Табак', 'Угли', 'Расходники кальян', 'Аппараты', 'Доставка'],
  other: ['Хозтовары', 'Мелкий ремонт', 'Доставка (Яндекс)', 'Канцтовары', 'Прочее'],
}
PAYMENT_TYPES = ['Наличные', 'Kaspi', 'Halyk', 'Wolt', 'Glovo', 'Yandex Eda', 'Прочее']
DEPARTMENTS = ['Кухня', 'Бар', 'Кальян', 'Прочее']
```

### BLOCK 1: ДОХОДЫ (green)
- Выручка по отделам: departments[] = {name, amount}
- Доходы по типам оплат: revenue[] = {type, amount, checks}
- Терминалы: terminals = {accountId: amount} — sub-accounts with parent_account_id
- Сверка выручки: revenueDiscrepancy = totalDeptRevenue - totalRevenue

### BLOCK 2: РАСХОДЫ (red)
- Each SECTION: withdrawals[key][] = {name, amount, comment}
- cash_withdrawals: {amount, comment} (no name field)
- Supplier suggestions from DB, staff suggestions for payroll
- totalWithdrawals = sum of all SECTIONS

### BLOCK 3: КАССА (blue)
- cashStart: auto-loaded from accounts(type='cash') balance, disabled field
- cashEnd: manual input (фактический остаток на конец смены)
- cashSales = revenue['Наличные'].amount
- cashExpected = cashStart + cashSales - totalWithdrawals
- discrepancy = cashEnd - cashExpected
- Thresholds: 0 → green, ≤500 → yellow, >500 → red

## Submit Flow
1. Save to DB (status='submitted')
2. Sync cash account balance (creates account_transaction if diff)
3. Telegram notification (formatDailyReportNotification)
4. Auto-generate PDF (generatePDF → doc.save())
5. Open WhatsApp with text summary (buildWhatsAppText)
6. Return to journal (setMode('journal'))

## PDF Generation
- Uses jsPDF with Roboto font for Cyrillic
- Title: "Myata 4YOU — Отчёт за {date}"
- 3 blocks with colored headers: ДОХОДЫ (green), РАСХОДЫ (red), КАССА (blue)
- Helper functions: sectionHeader(title, rgb), divider(), boldDivider(), row(label, value)
- Page break check: if (y > 257 - needed) addPage()
- Footer: generated timestamp + page numbers

## Data Payload (daily_reports.data JSONB)
```json
{
  "date", "manager", "cash_start", "cash_end",
  "withdrawals": { "suppliers_kitchen": [...], "suppliers_bar": [...], "tobacco": [...], "payroll": [...], "other": [...], "cash_withdrawals": [...] },
  "revenue": [{ "type", "amount", "checks" }],
  "departments": [{ "name", "amount" }],
  "terminals": { "accountId": "amount" },
  "total_revenue", "total_dept_revenue", "total_withdrawals", "cash_expected", "discrepancy"
}
```

## Backward Compatibility
- cash_actual (old) → cashEnd (new)
- cash_deposit (old) → ignored
- inkassation (old) → removed
- cash_withdrawals: empty array if missing in old reports
