// Расчёт P&L: одна логика для страницы P&L и для дашборда.
// Раньше дашборд считал по собственной копии и расходился с отчётом —
// в частности, не знал про исторические данные 2022–2025.
import { getTxAmountForMonth } from './pnl.js'
import { isPnlCategory } from './categories.js'
import { isTechStaff } from './reconcile.js'

// P&L structure matching the restaurant's actual format
// Each line: { key, label, level (0=header,1=group,2=sub), source, calc }
// source: 'daily:field' | 'bank:category_code' | 'calc' | 'manual'
export const PNL_STRUCTURE = [
  // === REVENUE ===
  { key: 'revenue', label: 'ДОХОДЫ', level: 0, section: 'revenue', calc: 'sum_children' },
  { key: 'rev_kitchen', label: 'Кухня', level: 2, section: 'revenue', source: 'daily:dept_kitchen' },
  { key: 'rev_bar', label: 'Бар', level: 2, section: 'revenue', source: 'daily:dept_bar' },
  { key: 'rev_hookah', label: 'Кальян', level: 2, section: 'revenue', source: 'daily:dept_hookah' },
  // Прочий доход приходит из двух мест: отдел «Прочее» в отчёте смены и
  // поступления на счёт, не связанные с эквайрингом (например, аренда места
  // под станции зарядки). У банковских строк знак обратный: кредит = доход.
  { key: 'rev_other', label: 'Прочее', level: 2, section: 'revenue', source: 'both:income_other', dailyField: 'dept_other' },

  // === EXPENSES ===
  { key: 'expenses', label: 'РАСХОДЫ', level: 0, section: 'expenses', calc: 'sum_children' },

  // CapEx
  { key: 'capex', label: 'CapEx (инвестиции)', level: 1, section: 'expenses', calc: 'sum_children' },
  { key: 'capex_repair', label: 'Ремонт', level: 2, section: 'expenses', source: 'bank:capex_repair' },
  { key: 'capex_furniture', label: 'Мебель и техника', level: 2, section: 'expenses', source: 'bank:capex_furniture' },
  { key: 'capex_other', label: 'CapEx прочее', level: 2, section: 'expenses', source: 'bank:capex_other' },

  // OpEx
  { key: 'opex', label: 'OpEx (ежемесячные расходы)', level: 1, section: 'expenses', calc: 'sum_children' },

  // ФОТ
  { key: 'payroll', label: 'ФОТ', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'payroll_mgmt', label: 'ФОТ Менеджмент', level: 3, section: 'expenses', source: 'bank:payroll_mgmt' },
  { key: 'payroll_kitchen', label: 'ФОТ Кухня', level: 3, section: 'expenses', source: 'bank:payroll_kitchen' },
  { key: 'payroll_bar', label: 'ФОТ Бар', level: 3, section: 'expenses', source: 'bank:payroll_bar' },
  { key: 'payroll_hookah', label: 'ФОТ Кальян', level: 3, section: 'expenses', source: 'bank:payroll_hookah' },
  { key: 'payroll_hall', label: 'ФОТ Зал', level: 3, section: 'expenses', source: 'bank:payroll_hall' },
  { key: 'payroll_transport', label: 'Развозка', level: 3, section: 'expenses', source: 'bank:payroll_transport' },
  { key: 'payroll_other', label: 'ФОТ Прочее', level: 3, section: 'expenses', source: 'both:payroll_other' },

  // Food Cost
  { key: 'foodcost', label: 'Food cost', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'fc_kitchen', label: 'Закуп кухня', level: 3, section: 'expenses', source: 'both:cogs_kitchen', dailyField: 'suppliers_kitchen' },
  { key: 'fc_bar', label: 'Закуп бар', level: 3, section: 'expenses', source: 'both:cogs_bar', dailyField: 'suppliers_bar' },
  { key: 'fc_hookah', label: 'Закуп кальян', level: 3, section: 'expenses', source: 'both:cogs_hookah', dailyField: 'tobacco' },

  // Маркетинг
  { key: 'marketing', label: 'Маркетинг', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'mkt_smm', label: 'СММ', level: 3, section: 'expenses', source: 'bank:mkt_smm' },
  { key: 'mkt_target', label: 'Таргет', level: 3, section: 'expenses', source: 'bank:mkt_target' },
  { key: 'mkt_2gis', label: '2ГИС', level: 3, section: 'expenses', source: 'bank:mkt_2gis' },
  { key: 'mkt_yandex', label: 'Яндекс', level: 3, section: 'expenses', source: 'bank:mkt_yandex' },
  { key: 'mkt_google', label: 'Google', level: 3, section: 'expenses', source: 'bank:mkt_google' },
  { key: 'mkt_other', label: 'Маркетинг прочее', level: 3, section: 'expenses', source: 'bank:mkt_other' },

  // Аренда
  { key: 'rent', label: 'Аренда', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'rent_premises', label: 'Аренда помещения', level: 3, section: 'expenses', source: 'bank:rent_premises' },
  { key: 'rent_warehouse', label: 'Аренда склада и кровли', level: 3, section: 'expenses', source: 'bank:rent_warehouse' },
  { key: 'rent_property_tax', label: 'Налог на недвижимость', level: 3, section: 'expenses', source: 'bank:rent_property_tax' },

  // Коммунальные
  { key: 'utilities', label: 'Коммунальные платежи', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'util_electric', label: 'Электричество', level: 3, section: 'expenses', source: 'bank:util_electric' },
  { key: 'util_water', label: 'Водоснабжение', level: 3, section: 'expenses', source: 'bank:util_water' },
  { key: 'util_heating', label: 'Отопление', level: 3, section: 'expenses', source: 'bank:util_heating' },
  { key: 'util_bi', label: 'BI Service', level: 3, section: 'expenses', source: 'bank:util_bi' },
  { key: 'util_internet', label: 'Интернет и связь', level: 3, section: 'expenses', source: 'bank:util_internet' },
  { key: 'util_waste', label: 'Вывоз мусора', level: 3, section: 'expenses', source: 'bank:util_waste' },
  { key: 'util_other', label: 'Ком. услуги прочее', level: 3, section: 'expenses', source: 'bank:util_other' },

  // OpEx прочее
  { key: 'opex_other', label: 'OpEx прочее', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'opex_household', label: 'Хозтовары', level: 3, section: 'expenses', source: 'both:household', dailyField: 'other' },
  { key: 'opex_bank_fee', label: 'Комиссия банка', level: 3, section: 'expenses', source: 'bank:bank_fee' },
  { key: 'opex_security', label: 'Система безопасности', level: 3, section: 'expenses', source: 'bank:opex_security' },
  { key: 'opex_software', label: 'Программное обеспечение', level: 3, section: 'expenses', source: 'bank:opex_software' },
  { key: 'opex_menu', label: 'Меню', level: 3, section: 'expenses', source: 'bank:opex_menu' },
  { key: 'opex_pest', label: 'Дератизация/дезинсекция', level: 3, section: 'expenses', source: 'bank:opex_pest' },
  { key: 'opex_grease', label: 'Чистка жироуловителей', level: 3, section: 'expenses', source: 'bank:opex_grease' },
  { key: 'opex_repair', label: 'Мелкий ремонт', level: 3, section: 'expenses', source: 'bank:opex_repair' },
  { key: 'opex_uniform', label: 'Форма для персонала', level: 3, section: 'expenses', source: 'bank:opex_uniform' },
  { key: 'opex_music', label: 'Авторские права на музыку', level: 3, section: 'expenses', source: 'bank:opex_music' },
  { key: 'opex_royalty', label: 'Роялти', level: 3, section: 'expenses', source: 'bank:opex_royalty' },
  { key: 'opex_misc', label: 'Прочее', level: 3, section: 'expenses', source: 'bank:opex_misc' },

  // Налоги
  { key: 'taxes', label: 'Налоги', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'tax_retail', label: 'Розничный налог', level: 3, section: 'expenses', source: 'bank:tax_retail' },
  { key: 'tax_payroll', label: 'Налоги по зарплате', level: 3, section: 'expenses', source: 'bank:tax_payroll' },
  { key: 'tax_insurance', label: 'Страхование сотрудников', level: 3, section: 'expenses', source: 'bank:tax_insurance' },
  { key: 'tax_alcohol', label: 'Лицензия на алкоголь', level: 3, section: 'expenses', source: 'bank:tax_alcohol' },
  { key: 'tax_hookah', label: 'Лицензия на кальян', level: 3, section: 'expenses', source: 'bank:tax_hookah' },
  { key: 'tax_other', label: 'Налоги прочее', level: 3, section: 'expenses', source: 'bank:tax_other' },

  // === RESULTS ===
  { key: 'op_profit', label: 'Операционная прибыль (Доходы - OpEx)', level: 0, section: 'result', calc: 'revenue_minus_opex' },
  { key: 'net_profit', label: 'Прибыль', level: 0, section: 'result', calc: 'revenue_minus_all' },

  // === RATIOS ===
  { key: 'margin_pct', label: 'Маржа (от опер. прибыли)', level: 0, section: 'ratio', calc: 'ratio' },
  { key: 'fc_pct', label: 'Food cost в %', level: 0, section: 'ratio', calc: 'ratio' },
  { key: 'fc_kitchen_pct', label: 'Кухня', level: 2, section: 'ratio', calc: 'ratio' },
  { key: 'fc_bar_pct', label: 'Бар', level: 2, section: 'ratio', calc: 'ratio' },
  { key: 'fc_hookah_pct', label: 'Кальян', level: 2, section: 'ratio', calc: 'ratio' },
]

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
    monthReports.forEach(r => {
      const depts = (r.data?.departments) || []
      depts.forEach(d => {
        const a = Number(d.amount) || 0
        if (d.name === 'Кухня') revK += a
        else if (d.name === 'Бар') revB += a
        else if (d.name === 'Кальян') revH += a
        else revO += a
      })
    })
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
        if (row.name === 'Аппараты') cashHookahCapex += amt
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
    PNL_STRUCTURE.forEach(line => {
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
    const gIdx = PNL_STRUCTURE.findIndex(l => l.key === gKey)
    if (gIdx < 0) return
    const gLevel = PNL_STRUCTURE[gIdx].level
    let sum = 0
    for (let i = gIdx + 1; i < PNL_STRUCTURE.length; i++) {
      const line = PNL_STRUCTURE[i]
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
    PNL_STRUCTURE.forEach(line => { totals[line.key] = (totals[line.key] || 0) + (mv[line.key] || 0) })
  }
  totals.margin_pct = totals.revenue > 0 ? totals.op_profit / totals.revenue : 0
  totals.fc_pct = totals.revenue > 0 ? totals.foodcost / totals.revenue : 0
  totals.fc_kitchen_pct = totals.rev_kitchen > 0 ? totals.fc_kitchen / totals.rev_kitchen : 0
  totals.fc_bar_pct = totals.rev_bar > 0 ? totals.fc_bar / totals.rev_bar : 0
  totals.fc_hookah_pct = totals.rev_hookah > 0 ? totals.fc_hookah / totals.rev_hookah : 0
  return totals
}
