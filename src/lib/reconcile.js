// Сверки замкнутого контура: каждое денежное звено подтверждается двумя
// независимыми источниками. Функции чистые (данные приходят параметрами) —
// покрыты юнит-тестами в __tests__/reconcile.test.js
import { getBusinessDate } from './dates.js'

export const num = (v) => Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0

const sumRows = (arr) => (arr || []).reduce((s, r) => s + num(r.amount), 0)

// Сумма по типу оплаты из отчёта смены
export const paymentOf = (report, type) =>
  num((report.data?.revenue || []).find(r => r.type === type)?.amount)

export const reportTotals = (report) => {
  const d = report.data || {}
  const w = d.withdrawals || {}
  return {
    date: report.report_date,
    manager: report.manager_name,
    status: report.status,
    byDepartment: (d.departments || []).reduce((s, x) => s + num(x.amount), 0),
    byPayment: (d.revenue || []).reduce((s, x) => s + num(x.amount), 0),
    cash: paymentOf(report, 'Наличные'),
    terminals: Object.values(d.terminals || {}).reduce((s, v) => s + num(v), 0),
    withdrawals: ['suppliers_kitchen', 'suppliers_bar', 'tobacco', 'payroll', 'other', 'cash_withdrawals']
      .reduce((s, k) => s + sumRows(w[k]), 0),
    collected: sumRows(w.cash_withdrawals),
    discrepancy: num(report.cash_discrepancy),
  }
}

/**
 * Сверка №1 — выручка отчёта: отделы ↔ типы оплат.
 * Расходятся → менеджер ошибся или занизил одну из сторон.
 */
export function checkRevenueConsistency(reports, tolerance = 1) {
  return reports.map(reportTotals)
    .filter(t => Math.abs(t.byDepartment - t.byPayment) > tolerance)
    .map(t => ({ date: t.date, manager: t.manager, delta: t.byDepartment - t.byPayment,
      byDepartment: t.byDepartment, byPayment: t.byPayment }))
}

/**
 * Сверка №2 — касса: расхождения при пересчёте наличных.
 */
export function checkCashDiscrepancies(reports, threshold = 500) {
  return reports.map(reportTotals)
    .filter(t => Math.abs(t.discrepancy) > threshold)
    .sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy))
    .map(t => ({ date: t.date, manager: t.manager, discrepancy: t.discrepancy }))
}

/**
 * Сверка №3 — эквайринг: суммы терминалов из отчётов ↔ зачисления банка.
 * Банк зачисляет с задержкой (D+1..D+3) и за вычетом комиссии, поэтому
 * сверяем НАКОПИТЕЛЬНО за период с допуском по проценту комиссии.
 */
export function checkAcquiring(reports, bankTx, { feePct = 1.5, tolerancePct = 1 } = {}) {
  const terminalsTotal = reports.reduce((s, r) => s + reportTotals(r).terminals, 0)
  const settled = bankTx
    .filter(t => t.category === 'acquiring_settlement')
    .reduce((s, t) => s + (t.is_debit ? -num(t.amount) : num(t.amount)), 0)

  const expected = terminalsTotal * (1 - feePct / 100)
  const delta = settled - expected
  const deltaPct = terminalsTotal > 0 ? (delta / terminalsTotal) * 100 : 0
  return {
    terminalsTotal, settled, expected: Math.round(expected), delta: Math.round(delta),
    deltaPct: Number(deltaPct.toFixed(2)),
    ok: terminalsTotal === 0 || Math.abs(deltaPct) <= tolerancePct,
    hasData: terminalsTotal > 0 || settled > 0,
  }
}

/**
 * Сверка №5 — полнота выписки: расчётный остаток счёта ↔ фактическая сверка.
 */
export function checkAccountBalance(expected, actual, tolerance = 100) {
  if (actual == null) return { ok: null, delta: null }
  const delta = num(actual) - num(expected)
  return { ok: Math.abs(delta) <= tolerance, delta }
}

/**
 * Сверка №7 — ФОТ: начислено (расчёт зарплат) ↔ выплачено (нал авансы + безнал).
 */
export function checkPayroll(payrollDetails, cashAdvances, bankPayroll, tolerance = 1000) {
  const accrued = (payrollDetails || []).reduce((s, d) => s + num(d.total_earned), 0)
  const paid = num(cashAdvances) + num(bankPayroll)
  const delta = paid - accrued
  return { accrued, paid, delta, ok: accrued === 0 || Math.abs(delta) <= tolerance }
}

/**
 * Пропущенные смены: дни без отчёта между первой и последней датой периода.
 * Сегодняшний операционный день не считается пропуском (смена ещё идёт).
 */
export function findMissingShifts(reports, fromDate, toDate, now = new Date()) {
  const have = new Set(reports.map(r => r.report_date))
  const today = getBusinessDate(now)
  const missing = []
  const d = new Date(fromDate + 'T12:00:00')
  const end = new Date(toDate + 'T12:00:00')
  while (d <= end) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!have.has(iso) && iso < today) missing.push(iso)
    d.setDate(d.getDate() + 1)
  }
  return missing
}

/**
 * Свежесть выписки: сколько дней прошло с последней банковской транзакции.
 * Бухгалтер должен загружать ежедневно — 3+ дня без данных это разрыв контура.
 */
export function checkStatementFreshness(bankTx, now = new Date(), warnDays = 3) {
  if (!bankTx.length) return { lastDate: null, daysAgo: null, ok: false, never: true }
  const lastDate = bankTx.reduce((m, t) => (t.transaction_date > m ? t.transaction_date : m), '')
  const daysAgo = Math.floor((new Date(getBusinessDate(now) + 'T12:00:00') - new Date(lastDate + 'T12:00:00')) / 86400000)
  return { lastDate, daysAgo, ok: daysAgo <= warnDays, never: false }
}

/** Черновики и нераспознанные транзакции — незакрытые «хвосты» периода. */
export function countOpenIssues(reports, bankTx) {
  return {
    drafts: reports.filter(r => (r.status || 'draft') === 'draft').length,
    uncategorized: bankTx.filter(t => t.category === 'uncategorized' || !t.category).length,
  }
}

// ---------------------------------------------------------------------------
// Наличные ЗП и «транзит» учредителей (решения аудита 03.09.2026)
// ---------------------------------------------------------------------------
// Менеджеры проводят выдачу ЗП из кассы как инкассацию с комментарием «зп/аванс/фот»,
// техперсонал получает ежедневно из кассы (строка «Техперсонал» в авансах) и в ведомости
// не участвует. Остаток ведомости выдаётся из наличных учредителей: они снимают деньги
// со счетов (cash_withdrawal) и возвращают излишки в оборот («Взнос наличных», «Фин помощь»).
export const PAYROLL_COMMENT_RE = /зп|зарплат|аванс|з\/п|фот/i
export const TECH_STAFF_RE = /тех\s*перс/i
export const isPayrollComment = (c) => PAYROLL_COMMENT_RE.test(String(c || ''))
export const isTechStaff = (name) => TECH_STAFF_RE.test(String(name || ''))

/** Наличная ЗП одного отчёта смены. */
export function cashPayrollOf(report) {
  const w = report.data?.withdrawals || {}
  const r = { advances: 0, techStaff: 0, payout: 0, otherCollected: 0 }
  ;(w.payroll || []).forEach(row => {
    if (isTechStaff(row.name)) r.techStaff += num(row.amount)
    else r.advances += num(row.amount)
  })
  ;(w.cash_withdrawals || []).forEach(row => {
    if (isPayrollComment(row.comment)) r.payout += num(row.amount)
    else r.otherCollected += num(row.amount)
  })
  return r
}

export function sumCashPayroll(reports) {
  return (reports || []).reduce((acc, rep) => {
    const c = cashPayrollOf(rep)
    return { advances: acc.advances + c.advances, techStaff: acc.techStaff + c.techStaff,
      payout: acc.payout + c.payout, otherCollected: acc.otherCollected + c.otherCollected }
  }, { advances: 0, techStaff: 0, payout: 0, otherCollected: 0 })
}

// Переводы на депозит и обратно — не наличные, их из транзита исключаем
const DEPOSIT_LEG_RE = /депозит|kaspi\s?pay|со счета .* на .* счет/i
export const isCashOut = (t) => !!t.is_debit && t.category === 'cash_withdrawal'
export const isCashReturn = (t) => !t.is_debit && t.category === 'internal' && !DEPOSIT_LEG_RE.test(String(t.purpose || ''))

/** Наличные, снятые учредителями со счетов, минус возвращённые в оборот. */
export function cashTransit(bankTx) {
  let withdrawn = 0, returned = 0
  ;(bankTx || []).forEach(t => {
    if (isCashOut(t)) withdrawn += num(t.amount)
    else if (isCashReturn(t)) returned += num(t.amount)
  })
  return { withdrawn, returned, net: withdrawn - returned }
}

/**
 * Сверка №7 (новая) — ФОТ по ведомости ↔ выплаты из отслеживаемых источников.
 * accrued — начислено по ведомости (pnl_data payroll_*, без техперсонала),
 * cash — sumCashPayroll(отчёты), bankPayroll — безнал ЗП по выписке.
 * fromOwners — то, что должно было выдаться из наличных учредителей.
 */
export function checkPayrollLoop({ accrued, cash, bankPayroll = 0, tolerance = 1000 }) {
  const trackedPaid = num(cash?.advances) + num(cash?.payout) + num(bankPayroll)
  const fromOwners = num(accrued) - trackedPaid
  return { accrued: num(accrued), trackedPaid, fromOwners, ok: num(accrued) === 0 || fromOwners <= tolerance }
}

/**
 * Необъяснённые наличные у учредителей: снято со счетов − возвращено − ушло на ЗП.
 * Положительный остаток выше допуска = деньги вне контура.
 */
export function unexplainedOwnerCash(transitNet, fromOwnersTotal, tolerance = 500000) {
  const unexplained = num(transitNet) - Math.max(0, num(fromOwnersTotal))
  return { unexplained, ok: unexplained <= tolerance }
}
