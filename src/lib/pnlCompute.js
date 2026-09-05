// Расчёт P&L: одна логика для страницы P&L и для дашборда.
// Раньше дашборд считал по собственной копии и расходился с отчётом —
// в частности, не знал про исторические данные 2022–2025.
import { getTxAmountForMonth } from './pnl.js'
import { isPnlCategory } from './categories.js'
import { isTechStaff } from './reconcile.js'
import { departmentCode, departmentByCode, isCapexRow } from './config.js'
import { getPnlStructure } from './pnlStructure.js'

// P&L structure matching the restaurant's actual format
// Each line: { key, label, level (0=header,1=group,2=sub), source, calc }
// Структура отчёта: seed и запасной вариант — в pnlSeed.js; живая — pnlStructure.js
export { PNL_STRUCTURE } from './pnlSeed.js'

/**
 * Подпись строки отчёта. У строк, привязанных к отделу, название берётся из
 * справочника: переименование отдела должно быть видно в P&L, а не только в форме.
 * Пока справочник не загружен, показывается статичная подпись.
 */
export function pnlLabel(line) {
  if (!line?.dept) return line?.label || ''
  const dep = departmentByCode(line.dept)
  if (!dep) return line.label || ''
  return line.labelPrefix ? `${line.labelPrefix} ${dep.name}` : dep.name
}

// живая структура — из базы, иначе константа
const structure = () => getPnlStructure()

export function computeMonthValues(targetYear, targetMonth, allDailyReports, allBankTx, allAdjustments) {
  const v = {}

  // Filter data for this specific month
  const monthReports = allDailyReports.filter(r => {
    const d = new Date(r.report_date)
    return d.getFullYear() === targetYear && d.getMonth() + 1 === targetMonth
  })

  // Check for historical data and manual adjustments
  const historicalData = allAdjustments.filter(a =>
    a.year === targetYear && a.month === targetMonth && a.type === 'historical'
  )
  const manualAdj = allAdjustments.filter(a =>
    a.year === targetYear && a.month === targetMonth && a.type !== 'historical'
  )

  if (historicalData.length > 0 && monthReports.length === 0) {
    // Use historical data — set each category directly
    historicalData.forEach(h => {
      if (h.category) v[h.category] = (v[h.category] || 0) + Number(h.amount)
    })
  } else {
    // Use live data (daily reports + bank transactions)
    let revK = 0, revB = 0, revH = 0, revO = 0
    const unknownDepartments = new Set()
    monthReports.forEach(r => {
      const depts = (r.data?.departments) || []
      depts.forEach(d => {
        const a = Number(d.amount) || 0
        // в новых отчётах есть code; название читается ради записей до миграции 025
        const code = departmentCode(d.code ?? d.name)
        if (code === 'kitchen') revK += a
        else if (code === 'bar') revB += a
        else if (code === 'hookah') revH += a
        else {
          revO += a
          // Нераспознанное название не должно тонуть молча: сумма попадает
          // в «Прочее», но вызывающий видит, из-за чего (ADR-0010).
          if (a !== 0) unknownDepartments.add(String(d.name ?? ''))
        }
      })
    })
    v.unknown_departments = [...unknownDepartments]
    v.rev_kitchen = revK; v.rev_bar = revB; v.rev_hookah = revH; v.rev_other = revO
    v.revenue = revK + revB + revH + revO

    // Cash expenses from daily reports
    let cashKitchen = 0, cashBar = 0, cashHookah = 0, cashOther = 0, cashHookahCapex = 0, cashTech = 0
    monthReports.forEach(r => {
      const w = r.data?.withdrawals || {}
      // Техперсонал платится ежедневно из кассы и в ведомости ЗП не участвует
      ;(w.payroll || []).forEach(row => { if (isTechStaff(row.name)) cashTech += Number(row.amount) || 0 })
      ;(w.suppliers_kitchen || []).forEach(row => cashKitchen += Number(row.amount) || 0)
      ;(w.suppliers_bar || []).forEach(row => cashBar += Number(row.amount) || 0)
      ;(w.tobacco || []).forEach(row => {
        const amt = Number(row.amount) || 0
        if (isCapexRow(row.name)) cashHookahCapex += amt
        else cashHookah += amt
      })
      ;(w.other || []).forEach(row => cashOther += Number(row.amount) || 0)
    })

    // Bank expenses by category — period-aware
    // Кредиты (возвраты) уменьшают расход по категории, дебеты — увеличивают
    const bankByCat = {}
    allBankTx.forEach(tx => {
      if (!isPnlCategory(tx.category)) return
      const txAmount = getTxAmountForMonth(tx, targetYear, targetMonth)
      if (txAmount !== 0) {
        const signed = tx.is_debit ? txAmount : -txAmount
        bankByCat[tx.category] = (bankByCat[tx.category] || 0) + signed
      }
    })
    const bk = (cat) => bankByCat[cat] || 0

    // Assign bank values to PNL keys
    structure().forEach(line => {
      if (!line.source) return
      if (line.source.startsWith('bank:')) {
        const cat = line.source.replace('bank:', '')
        v[line.key] = bk(cat)
      } else if (line.source.startsWith('both:')) {
        const cat = line.source.replace('both:', '')
        if (line.key === 'fc_kitchen') v[line.key] = cashKitchen + bk(cat)
        else if (line.key === 'fc_bar') v[line.key] = cashBar + bk(cat)
        else if (line.key === 'fc_hookah') v[line.key] = cashHookah + bk(cat)
        else if (line.key === 'payroll_other') v[line.key] = cashTech + bk(cat)
        else if (line.key === 'opex_household') v[line.key] = cashOther + bk(cat)
        // Доход: у bk() дебет со знаком «+», поэтому для выручки знак переворачиваем
        else if (line.section === 'revenue') v[line.key] = (line.key === 'rev_other' ? revO : 0) - bk(cat)
        else v[line.key] = bk(cat)
      }
    })

    // Add hookah equipment to CapEx прочее
    v.capex_other = (v.capex_other || 0) + cashHookahCapex
  }

  // Apply manual adjustments on top
  let legacyNet = 0 // старые корректировки без категории — прямо в прибыль
  manualAdj.forEach(a => {
    const amt = Number(a.amount) || 0
    if (a.category) v[a.category] = (v[a.category] || 0) + amt
    else legacyNet += a.type === 'income' ? amt : -amt
  })

  // Calculate group sums
  const groups = ['capex', 'payroll', 'foodcost', 'marketing', 'rent', 'utilities', 'opex_other', 'taxes']
  groups.forEach(gKey => {
    const gIdx = structure().findIndex(l => l.key === gKey)
    if (gIdx < 0) return
    const gLevel = structure()[gIdx].level
    let sum = 0
    for (let i = gIdx + 1; i < structure().length; i++) {
      const line = structure()[i]
      if (line.level <= gLevel) break
      if (line.level === gLevel + 1 && !line.calc) sum += v[line.key] || 0
    }
    v[gKey] = sum
  })

  v.revenue = (v.rev_kitchen || 0) + (v.rev_bar || 0) + (v.rev_hookah || 0) + (v.rev_other || 0)
  v.opex = (v.payroll || 0) + (v.foodcost || 0) + (v.marketing || 0) + (v.rent || 0) + (v.utilities || 0) + (v.opex_other || 0) + (v.taxes || 0)
  v.expenses = (v.capex || 0) + v.opex
  v.op_profit = v.revenue - v.opex + legacyNet
  v.net_profit = v.revenue - v.expenses + legacyNet

  // Ratios
  v.margin_pct = v.revenue > 0 ? v.op_profit / v.revenue : 0
  v.fc_pct = v.revenue > 0 ? (v.foodcost || 0) / v.revenue : 0
  v.fc_kitchen_pct = (v.rev_kitchen || 0) > 0 ? ((v.fc_kitchen || 0) / v.rev_kitchen) : 0
  v.fc_bar_pct = (v.rev_bar || 0) > 0 ? ((v.fc_bar || 0) / v.rev_bar) : 0
  v.fc_hookah_pct = (v.rev_hookah || 0) > 0 ? ((v.fc_hookah || 0) / v.rev_hookah) : 0

  return v
}


/**
 * Суммирует значения P&L за несколько месяцев одного года.
 * Проценты пересчитываются от итогов, а не складываются.
 * @param {number[]} months номера месяцев 1..12
 */
export function sumMonths(year, months, dailyReports, bankTx, adjustments) {
  const totals = {}
  for (const m of months) {
    const mv = computeMonthValues(year, m, dailyReports, bankTx, adjustments)
    structure().forEach(line => { totals[line.key] = (totals[line.key] || 0) + (mv[line.key] || 0) })
  }
  totals.margin_pct = totals.revenue > 0 ? totals.op_profit / totals.revenue : 0
  totals.fc_pct = totals.revenue > 0 ? totals.foodcost / totals.revenue : 0
  totals.fc_kitchen_pct = totals.rev_kitchen > 0 ? totals.fc_kitchen / totals.rev_kitchen : 0
  totals.fc_bar_pct = totals.rev_bar > 0 ? totals.fc_bar / totals.rev_bar : 0
  totals.fc_hookah_pct = totals.rev_hookah > 0 ? totals.fc_hookah / totals.rev_hookah : 0
  return totals
}
