import { isCapexRow, PAYROLL_CATEGORIES } from '../config.js'
import { cashPayrollOf } from '../reconcile.js'
// === CASH FLOW STRUCTURE ===
const CF_STRUCTURE = [
  // Operating Activities
  { key: 'cf_operating', label: 'ОПЕРАЦИОННАЯ ДЕЯТЕЛЬНОСТЬ', level: 0, calc: 'sum_children', section: 'operating' },

  { key: 'cf_cash_revenue', label: 'Наличная выручка', level: 1, section: 'operating' },
  { key: 'cf_acquiring', label: 'Зачисления с терминалов (эквайринг)', level: 1, section: 'operating' },
  { key: 'cf_bank_income', label: 'Прочие поступления (банк)', level: 1, section: 'operating' },

  { key: 'cf_cash_expenses', label: 'Наличные расходы', level: 1, calc: 'sum_children', section: 'operating' },
  { key: 'cf_cash_suppliers_kitchen', label: 'Закуп кухня (нал)', level: 2, section: 'operating' },
  { key: 'cf_cash_suppliers_bar', label: 'Закуп бар (нал)', level: 2, section: 'operating' },
  { key: 'cf_cash_tobacco', label: 'Закуп кальян (нал)', level: 2, section: 'operating' },
  { key: 'cf_cash_payroll', label: 'ЗП, авансы, техперсонал (нал)', level: 2, section: 'operating' },
  { key: 'cf_cash_other', label: 'Хозрасходы (нал)', level: 2, section: 'operating' },
  { key: 'cf_cash_withdrawal', label: 'Инкассация (прочее)', level: 2, section: 'operating' },

  { key: 'cf_bank_opex', label: 'Операционные расходы (банк)', level: 1, calc: 'sum_children', section: 'operating' },
  { key: 'cf_bank_payroll', label: 'ФОТ (безнал)', level: 2, section: 'operating' },
  { key: 'cf_bank_cogs', label: 'Закуп (безнал)', level: 2, section: 'operating' },
  { key: 'cf_bank_rent', label: 'Аренда', level: 2, section: 'operating' },
  { key: 'cf_bank_utilities', label: 'Коммунальные', level: 2, section: 'operating' },
  { key: 'cf_bank_marketing', label: 'Маркетинг', level: 2, section: 'operating' },
  { key: 'cf_bank_taxes', label: 'Налоги', level: 2, section: 'operating' },
  { key: 'cf_bank_other_opex', label: 'Прочие OpEx (безнал)', level: 2, section: 'operating' },

  // Investing Activities
  { key: 'cf_investing', label: 'ИНВЕСТИЦИОННАЯ ДЕЯТЕЛЬНОСТЬ', level: 0, calc: 'sum_children', section: 'investing' },
  { key: 'cf_capex_repair', label: 'Ремонт', level: 1, section: 'investing' },
  { key: 'cf_capex_furniture', label: 'Мебель и техника', level: 1, section: 'investing' },
  { key: 'cf_capex_hookah', label: 'Аппараты (кальян)', level: 1, section: 'investing' },
  { key: 'cf_capex_other', label: 'CapEx прочее', level: 1, section: 'investing' },

  // Financing Activities
  { key: 'cf_financing', label: 'ФИНАНСОВАЯ ДЕЯТЕЛЬНОСТЬ', level: 0, calc: 'sum_children', section: 'financing' },
  { key: 'cf_dividends', label: 'Дивиденды выплаченные', level: 1, section: 'financing' },
  { key: 'cf_investments_in', label: 'Взносы учредителей', level: 1, section: 'financing' },
  { key: 'cf_cash_withdrawal_bank', label: 'Снятие наличных со счёта', level: 1, section: 'financing' },
  { key: 'cf_bank_internal', label: 'Внутренние переводы (нетто)', level: 1, section: 'financing' },

  // Totals
  { key: 'cf_net_change', label: 'ЧИСТОЕ ИЗМЕНЕНИЕ ДС', level: 0, calc: 'net', section: 'total' },
]

// Bank category groupings for CF
const PAYROLL_CATS = PAYROLL_CATEGORIES
const COGS_CATS = ['cogs_kitchen', 'cogs_bar', 'cogs_hookah']
const RENT_CATS = ['rent_premises', 'rent_warehouse', 'rent_property_tax']
const UTIL_CATS = ['util_electric', 'util_water', 'util_heating', 'util_bi', 'util_internet', 'util_waste', 'util_other']
const MKT_CATS = ['mkt_smm', 'mkt_target', 'mkt_2gis', 'mkt_yandex', 'mkt_google', 'mkt_other']
const TAX_CATS = ['tax_retail', 'tax_payroll', 'tax_insurance', 'tax_alcohol', 'tax_hookah', 'tax_other']
const OPEX_OTHER_CATS = ['household', 'bank_fee', 'opex_security', 'opex_software', 'opex_menu', 'opex_pest', 'opex_grease', 'opex_repair', 'opex_uniform', 'opex_music', 'opex_royalty', 'opex_misc']
const CAPEX_CATS = ['capex_repair', 'capex_furniture', 'capex_other']

export function computeMonthCF(targetYear, targetMonth, dailyReports, bankTx, pnlData, investorTx) {
  const v = {}

  // Filter daily reports for this month
  const monthReports = dailyReports.filter(r => {
    const d = new Date(r.report_date)
    return d.getFullYear() === targetYear && d.getMonth() + 1 === targetMonth
  })

  // Check for historical pnl_data
  const historicalData = pnlData.filter(a =>
    a.year === targetYear && a.month === targetMonth && a.type === 'historical'
  )

  // === OPERATING: Cash revenue ===
  // data.revenue — массив [{type: 'Наличные', amount: '12500'}], суммы — строки с запятой
  const parseNum = (val) => Number(String(val ?? '').replace(/\s/g, '').replace(',', '.')) || 0
  let cashRevenue = 0
  monthReports.forEach(r => {
    const cashRow = (r.data?.revenue || []).find(x => x.type === 'Наличные')
    cashRevenue += parseNum(cashRow?.amount)
  })
  v.cf_cash_revenue = cashRevenue

  // === OPERATING: Cash expenses from daily reports ===
  let cashKitchen = 0, cashBar = 0, cashTobacco = 0, cashPayroll = 0, cashOther = 0, cashWithdrawal = 0
  monthReports.forEach(r => {
    const w = r.data?.withdrawals || {}
    const sum = (arr) => (arr || []).reduce((s, row) => s + parseNum(row.amount), 0)
    cashKitchen += sum(w.suppliers_kitchen)
    cashBar += sum(w.suppliers_bar)
    ;(w.tobacco || []).forEach(row => {
      const amt = parseNum(row.amount)
      if (!isCapexRow(row.name)) cashTobacco += amt
    })
    // Выдача ЗП из кассы проводится менеджерами как инкассация с комментарием «зп/аванс/фот»
    const cp = cashPayrollOf(r)
    cashPayroll += cp.advances + cp.techStaff + cp.payout
    cashOther += sum(w.other)
    cashWithdrawal += cp.otherCollected
  })

  v.cf_cash_suppliers_kitchen = -cashKitchen
  v.cf_cash_suppliers_bar = -cashBar
  v.cf_cash_tobacco = -cashTobacco
  v.cf_cash_payroll = -cashPayroll
  v.cf_cash_other = -cashOther
  v.cf_cash_withdrawal = -cashWithdrawal
  v.cf_cash_expenses = -(cashKitchen + cashBar + cashTobacco + cashPayroll + cashOther + cashWithdrawal)

  // === BANK transactions — split debits (expenses) and credits (income) ===
  // Amounts in bank_transactions are always positive; is_debit flag indicates direction
  const bankDebitByCat = {}  // expenses (is_debit = true)
  let bankCreditTotal = 0     // income (is_debit = false, non-internal)

  // Cash Flow — прямой метод: считаем фактическое движение денег.
  // Зачисления эквайринга (acquiring_settlement) — это реальный приход
  // карточной выручки на счёт, показываем отдельной строкой (в P&L они не
  // идут: там выручка берётся из отчётов смен по отделам).
  // Cash Flow — по дате платежа, а не по периоду начисления: деньги уходят со
  // счёта в день операции. Распределение по периодам (period_from/period_to)
  // существует для P&L и здесь применяться не должно.
  const inMonth = (tx) => {
    const d = new Date(tx.transaction_date)
    return d.getFullYear() === targetYear && d.getMonth() + 1 === targetMonth
  }
  let acquiringTotal = 0
  let bankDividendsNet = 0   // дивиденды деньгами: дебет — выплата, кредит — возврат
  let cashWithdrawalNet = 0  // снятие наличных со счёта: деньги уходят из контура
  const monthBankTx = bankTx.filter(inMonth)
  monthBankTx.forEach(tx => {
    if (!tx.category || tx.category === 'uncategorized' || tx.category === 'internal') return
    const txAmount = Number(tx.amount) || 0
    if (txAmount === 0) return

    if (tx.category === 'acquiring_settlement') {
      acquiringTotal += tx.is_debit ? -txAmount : txAmount
      return
    }
    if (tx.category === 'dividends') {
      bankDividendsNet += tx.is_debit ? txAmount : -txAmount
      return
    }
    if (tx.category === 'cash_withdrawal') {
      cashWithdrawalNet += tx.is_debit ? txAmount : -txAmount
      return
    }
    if (tx.is_debit) {
      bankDebitByCat[tx.category] = (bankDebitByCat[tx.category] || 0) + txAmount
    } else {
      bankCreditTotal += txAmount
    }
  })
  v.cf_cash_withdrawal_bank = -cashWithdrawalNet
  v.cf_acquiring = acquiringTotal

  v.cf_bank_income = bankCreditTotal

  // Bank OpEx categories (only debits)
  const sumCats = (cats) => cats.reduce((s, c) => s + (bankDebitByCat[c] || 0), 0)

  v.cf_bank_payroll = -sumCats(PAYROLL_CATS)
  v.cf_bank_cogs = -sumCats(COGS_CATS)
  v.cf_bank_rent = -sumCats(RENT_CATS)
  v.cf_bank_utilities = -sumCats(UTIL_CATS)
  v.cf_bank_marketing = -sumCats(MKT_CATS)
  v.cf_bank_taxes = -sumCats(TAX_CATS)
  v.cf_bank_other_opex = -sumCats(OPEX_OTHER_CATS)
  v.cf_bank_opex = v.cf_bank_payroll + v.cf_bank_cogs + v.cf_bank_rent + v.cf_bank_utilities + v.cf_bank_marketing + v.cf_bank_taxes + v.cf_bank_other_opex

  // Operating CF total
  v.cf_operating = v.cf_cash_revenue + v.cf_acquiring + v.cf_bank_income + v.cf_cash_expenses + v.cf_bank_opex

  // === INVESTING: CapEx (bank debits only) ===
  v.cf_capex_repair = -(bankDebitByCat['capex_repair'] || 0)
  v.cf_capex_furniture = -(bankDebitByCat['capex_furniture'] || 0)
  v.cf_capex_other = -(bankDebitByCat['capex_other'] || 0)

  // Hookah equipment from daily reports (cash capex)
  let cashHookahCapex = 0
  monthReports.forEach(r => {
    ;(r.data?.withdrawals?.tobacco || []).forEach(row => {
      if (isCapexRow(row.name)) cashHookahCapex += parseNum(row.amount)
    })
  })
  v.cf_capex_hookah = -cashHookahCapex

  v.cf_investing = v.cf_capex_repair + v.cf_capex_furniture + v.cf_capex_hookah + v.cf_capex_other

  // === FINANCING: Dividends and investments from investor_transactions ===
  const monthInvTx = (investorTx || []).filter(t => {
    const d = new Date(t.transaction_date)
    return d.getFullYear() === targetYear && d.getMonth() + 1 === targetMonth
  })

  // Дивиденды: пока есть выписка, берём фактические платежи со счёта. Журнал
  // (investor_transactions) содержит и дивиденды, выданные наличными из снятых
  // со счёта денег, — их нельзя считать второй раз рядом со строкой снятия.
  const journalDividends = monthInvTx.filter(t => t.type === 'dividend').reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const journalInvestments = monthInvTx.filter(t => t.type === 'investment').reduce((s, t) => s + (Number(t.amount) || 0), 0)
  const hasBankMonth = monthBankTx.length > 0
  v.cf_dividends = hasBankMonth ? -bankDividendsNet : -journalDividends
  v.cf_investments_in = hasBankMonth ? 0 : journalInvestments

  // Internal transfers (bank category = internal) — net of credits minus debits
  let internalIn = 0, internalOut = 0
  monthBankTx.forEach(tx => {
    if (tx.category === 'internal') {
      const txAmount = Number(tx.amount) || 0
      if (txAmount === 0) return
      if (tx.is_debit) internalOut += txAmount
      else internalIn += txAmount
    }
  })
  v.cf_bank_internal = internalIn - internalOut

  v.cf_financing = v.cf_dividends + v.cf_investments_in + v.cf_cash_withdrawal_bank + v.cf_bank_internal

  // === NET CHANGE ===
  v.cf_net_change = v.cf_operating + v.cf_investing + v.cf_financing

  // If historical data exists and no live data, override from pnl_data
  if (historicalData.length > 0 && monthReports.length === 0) {
    let histRevenue = 0, histExpenses = 0
    historicalData.forEach(h => {
      if (h.category?.startsWith('rev_')) histRevenue += Number(h.amount) || 0
      else if (h.category && !h.category.startsWith('rev_')) histExpenses += Number(h.amount) || 0
    })
    if (histRevenue > 0) {
      v.cf_operating = histRevenue - histExpenses
      v.cf_cash_revenue = 0
      v.cf_acquiring = 0
      v.cf_bank_income = histRevenue
      v.cf_bank_opex = -histExpenses
      v.cf_cash_expenses = 0
      v.cf_net_change = v.cf_operating + v.cf_investing + v.cf_financing
    }
  }

  return v
}

