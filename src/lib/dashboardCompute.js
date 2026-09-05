// Дашборд: какие месяцы года считать закрытыми и что по ним показывать.
// Сами суммы — sumMonths из pnlCompute (BR-RPT-023); здесь только выбор месяцев
// и подписи групп из структуры P&L, а не литералы в странице.
import { sumMonths, pnlLabel } from './pnlCompute.js'
import { getPnlStructure } from './pnlStructure.js'

/**
 * Закрытые месяцы года (0-based): прошедшие, по которым есть банковская
 * выписка или исторические строки pnl_data (2022–2025 живут только там).
 * Транзакции соседних лет, подгруженные распределением периода, не считаются.
 * @returns {number[]} отсортированные номера месяцев 0..11
 */
export function closedMonths({ year, bankTx, adjustments, now = new Date() }) {
  const currentMonth = now.getFullYear() === year ? now.getMonth() : (now.getFullYear() > year ? 12 : 0)
  const months = new Set()
  for (const tx of bankTx || []) {
    const d = new Date(tx.transaction_date)
    if (d.getFullYear() !== year) continue
    if (d.getMonth() < currentMonth) months.add(d.getMonth())
  }
  for (const a of adjustments || []) {
    if (a.type === 'historical' && a.year === year && a.month - 1 < currentMonth) months.add(a.month - 1)
  }
  return [...months].sort((a, b) => a - b)
}

/** Группы расходов дашборда — ключи структуры P&L в порядке показа. */
export const EXPENSE_GROUPS = ['payroll', 'foodcost', 'marketing', 'rent', 'utilities', 'opex_other', 'taxes', 'capex']

export function groupLabel(key) {
  const line = getPnlStructure().find(l => l.key === key)
  return line ? pnlLabel(line) : key
}

/**
 * Сводка года по закрытым месяцам: итоги, помесячный ряд и доли групп расходов.
 */
export function dashboardSummary({ year, reports, bankTx, adjustments, now = new Date() }) {
  const months = closedMonths({ year, bankTx, adjustments, now })
  const totals = sumMonths(year, months.map(m => m + 1), reports, bankTx, adjustments)
  const monthly = Array.from({ length: 12 }, (_, i) => {
    if (!months.includes(i)) return { month: i, revenue: 0, expenses: 0 }
    const v = sumMonths(year, [i + 1], reports, bankTx, adjustments)
    return { month: i, revenue: v.revenue, expenses: v.expenses }
  })
  const expenseGroups = EXPENSE_GROUPS
    .map(key => ({ key, label: groupLabel(key), value: totals[key] || 0 }))
    .filter(g => g.value > 0)
  return { months, totals, monthly, expenseGroups }
}
