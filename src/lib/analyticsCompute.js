// Показатели аналитики поверх той же формулы, что и P&L (BR-RPT-023, TASK-005).
// До 05.09.2026 страница считала food cost и ФОТ своей копией логики и делила
// историческую выручку 50/30/20 без данных — цифры расходились с P&L.
// Чистые функции: данные приходят параметрами, ни базы, ни React.
import { computeMonthValues } from './pnlCompute.js'
import { getPnlStructure } from './pnlStructure.js'
import { pnlLabel } from './pnlCompute.js'
import { isFoodCostAnomaly, THRESHOLDS } from './config.js'

const pct = (num, den) => (den > 0 ? (num / den) * 100 : null)

/**
 * Помесячный ряд food cost и доли ФОТ. Месяцы без выручки пропускаются.
 * Food cost по отделу — null, если выручки отдела нет: на графике пропуск,
 * а не выдуманная доля (решение владельца 05.09.2026, BR-RPT-013 отменено).
 * @param {{reports: object[], bankTx: object[], adjustments: object[], years: number[]}} p
 */
export function monthlyTrends({ reports, bankTx, adjustments, years }) {
  const out = []
  for (const year of years) {
    for (let month = 1; month <= 12; month++) {
      const v = computeMonthValues(year, month, reports, bankTx, adjustments)
      if (!(v.revenue > 0)) continue
      const payroll = v.payroll || 0
      out.push({
        year, month,
        revenue: v.revenue,
        fcTotal: (v.fc_pct || 0) * 100,
        fcKitchen: pct(v.fc_kitchen || 0, v.rev_kitchen || 0),
        fcBar: pct(v.fc_bar || 0, v.rev_bar || 0),
        fcHookah: pct(v.fc_hookah || 0, v.rev_hookah || 0),
        anomaly: isFoodCostAnomaly(v.fc_pct || 0),
        payrollPct: (payroll / v.revenue) * 100,
        alert: payroll / v.revenue > THRESHOLDS.payrollShareAlert,
      })
    }
  }
  return out
}

/** Группы OpEx для поиска аномалий — из структуры P&L, не из списков в коде. */
export const ANOMALY_GROUPS = ['payroll', 'rent', 'utilities', 'marketing', 'taxes', 'opex_other']

const groupLabel = (key) => {
  const line = getPnlStructure().find(l => l.key === key)
  return line ? pnlLabel(line) : key
}

/**
 * Аномалии расходов: текущий месяц против среднего за 12 предыдущих
 * (порог — среднее + 1,5 σ, минимум 3 месяца с данными).
 * @param {{reports: object[], bankTx: object[], adjustments: object[], now?: Date}} p
 */
export function expenseAnomalies({ reports, bankTx, adjustments, now = new Date() }) {
  const currentY = now.getFullYear()
  const currentM = now.getMonth() + 1
  const current = computeMonthValues(currentY, currentM, reports, bankTx, adjustments)
  const history = []
  for (let i = 1; i <= 12; i++) {
    let m = currentM - i, y = currentY
    if (m <= 0) { m += 12; y-- }
    history.push(computeMonthValues(y, m, reports, bankTx, adjustments))
  }
  return ANOMALY_GROUPS.map(key => {
    const values = history.map(v => v[key] || 0).filter(t => t > 0)
    if (values.length < 3) return null
    const mean = values.reduce((s, v) => s + v, 0) / values.length
    const stddev = Math.sqrt(values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length)
    const currentVal = current[key] || 0
    const deviation = stddev > 0 ? (currentVal - mean) / stddev : 0
    return {
      key, label: groupLabel(key),
      mean: Math.round(mean), current: Math.round(currentVal),
      deviation: deviation.toFixed(1),
      isAnomaly: currentVal > mean + 1.5 * stddev,
    }
  }).filter(Boolean)
}
