// Сверки замкнутого контура: каждое денежное звено подтверждается двумя
// независимыми источниками. Функции чистые (данные приходят параметрами) —
// покрыты юнит-тестами в __tests__/reconcile.test.js
import { getBusinessDate } from './dates.js'
import { THRESHOLDS } from './config.js'

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
export function checkCashDiscrepancies(reports, threshold = THRESHOLDS.cashDiscrepancy) {
  return reports.map(reportTotals)
    .filter(t => Math.abs(t.discrepancy) > threshold)
    .sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy))
    .map(t => ({ date: t.date, manager: t.manager, discrepancy: t.discrepancy }))
}

/** Фактическая комиссия за период, % от оборота по терминалу. */
export function acquiringFeePct(base, settled) {
  if (!(base > 0)) return null
  return Number((((base - settled) / base) * 100).toFixed(2))
}

const median = (values) => {
  const a = [...values].sort((x, y) => x - y)
  if (!a.length) return null
  const n = a.length
  return n % 2 ? a[(n - 1) / 2] : (a[n / 2 - 1] + a[n / 2]) / 2
}

/**
 * Фактическая комиссия по месяцам — основа для истории банка.
 * @returns {{month: string, banks: Array, base: number, settled: number, feePct: number|null}[]}
 */
export function acquiringByMonth(reports, bankTx, accounts = null) {
  const monthOf = (d) => String(d ?? '').slice(0, 7)
  const months = new Set()
  ;(reports || []).forEach(r => months.add(monthOf(r.report_date)))
  ;(bankTx || []).forEach(t => months.add(monthOf(t.transaction_date)))
  return [...months].filter(Boolean).sort().map(month => {
    const rs = (reports || []).filter(r => monthOf(r.report_date) === month)
    const tx = (bankTx || []).filter(t => monthOf(t.transaction_date) === month)
    const res = checkAcquiring(rs, tx, { accounts, baselines: null })
    return { month, banks: res.banks || [], base: res.terminalsTotal, settled: res.settled, feePct: res.feePct }
  })
}

/**
 * История комиссии по банкам: медиана помесячных значений.
 * Пока не используется для вердикта — помесячные значения на нынешних данных
 * слишком шумные (задержка зачислений, незаполненные терминалы). Оставлено как
 * готовая основа, когда терминалы будут заполнены (TASK-004).
 */
export const ACQUIRING_MIN_MONTHS = 3

export function acquiringBaselines(monthly) {
  const byBank = {}
  ;(monthly || []).forEach(m => (m.banks || []).forEach(b => {
    if (b.base > 0 && b.settled > 0 && b.feePct != null) (byBank[b.bank] = byBank[b.bank] || []).push(b.feePct)
  }))
  const out = {}
  for (const [bank, values] of Object.entries(byBank)) {
    if (values.length >= ACQUIRING_MIN_MONTHS) out[bank] = Number(median(values).toFixed(2))
  }
  return out
}

/**
 * Сверка №3 — эквайринг: суммы терминалов из отчётов ↔ зачисления банка.
 * Банк зачисляет с задержкой (D+1..D+3) и за вычетом комиссии, поэтому
 * сверяем НАКОПИТЕЛЬНО за период.
 *
 * Ставка комиссии не задаётся (BR-CTL-018): она считается из данных. Раньше в
 * коде было 1,5 % для всех, тогда как по POS-выписке Halyk выходит около 0,8 %.
 *
 * Вердикт «сошлось / не сошлось» не выносится, и это осознанно. Проверка на
 * данных за 2026 показала: в нормальных месяцах фактическая комиссия Kaspi
 * скачет от −0,8 % до +0,5 % и регулярно отрицательна. Отрицательная — не
 * ошибка банка, а следствие задержки D+1..D+3: в месяц попадают зачисления за
 * хвост предыдущего. Плюс терминалы заполнены не везде (январь–февраль пустые,
 * Halyk — только с сентября, TASK-004). Пока это не исправлено, любой порог
 * давал бы ложные тревоги, поэтому показывается факт: оборот, зачисление и
 * фактический процент.
 */
export function checkAcquiring(reports, bankTx, { accounts = null } = {}) {
  const signed = (t) => (t.is_debit ? -num(t.amount) : num(t.amount))
  const settledRows = bankTx.filter(t => t.category === 'acquiring_settlement')
  // Вердикта нет намеренно: проверка показывает факт, а не судит.
  // Ставку задавать нельзя (BR-CTL-018), а сравнивать с собственной историей
  // на нынешних данных бессмысленно — см. комментарий к функции.
  const judge = (base, settled) => ({ feePct: acquiringFeePct(base, settled), ok: true })

  if (!accounts) {
    const terminalsTotal = reports.reduce((s, r) => s + reportTotals(r).terminals, 0)
    const settled = settledRows.reduce((s, t) => s + signed(t), 0)
    return { terminalsTotal, settled, ...judge(terminalsTotal, settled), hasData: terminalsTotal > 0 || settled > 0 }
  }

  // По банкам (Kaspi, Halyk …): терминалы отчёта относятся к банку родительского счёта,
  // зачисления — к банку счёта выписки. Если в отчёте нет терминала этого банка
  // (например, Halyk до появления терминала в приложении), берём сумму типа оплаты.
  const byId = new Map(accounts.map(a => [Number(a.id), a]))
  const bankOfAccount = (id) => {
    const a = byId.get(Number(id))
    const parent = a?.parent_account_id ? byId.get(Number(a.parent_account_id)) : null
    return (parent?.bank_name || a?.bank_name || 'other')
  }
  const bankOfPayment = (type) => accounts.find(a => a.bank_name && !a.parent_account_id
    && String(type || '').toLowerCase().includes(a.bank_name.toLowerCase()))?.bank_name || null
  const banks = {}
  const bucket = (b) => (banks[b] = banks[b] || { bank: b, terminals: 0, fallback: 0, settled: 0 })

  reports.forEach(r => {
    const terminals = r.data?.terminals || {}
    const covered = new Set()
    Object.entries(terminals).forEach(([tid, v]) => {
      const b = bankOfAccount(tid)
      bucket(b).terminals += num(v)
      if (num(v) > 0) covered.add(b)
    })
    ;(r.data?.revenue || []).forEach(p => {
      const b = bankOfPayment(p.type)
      if (b && !covered.has(b)) bucket(b).fallback += num(p.amount)
    })
  })
  settledRows.forEach(t => { bucket(bankOfAccount(t.account_id)).settled += signed(t) })

  const list = Object.values(banks).map(b => {
    const base = b.terminals + b.fallback
    return { ...b, base, ...judge(base, b.settled) }
  }).sort((a, b) => a.bank.localeCompare(b.bank))
  const terminalsTotal = list.reduce((s, b) => s + b.base, 0)
  const settled = list.reduce((s, b) => s + b.settled, 0)
  return {
    terminalsTotal, settled, ...judge(terminalsTotal, settled),
    ok: list.every(b => b.ok),
    hasData: terminalsTotal > 0 || settled > 0,
    banks: list,
  }
}

/**
 * Сверка №5 — полнота выписки: расчётный остаток счёта ↔ фактическая сверка.
 */
export function checkAccountBalance(expected, actual, tolerance = THRESHOLDS.accountBalanceTolerance) {
  if (actual == null) return { ok: null, delta: null }
  const delta = num(actual) - num(expected)
  return { ok: Math.abs(delta) <= tolerance, delta }
}

/**
 * Сверка №7 — ФОТ: начислено (расчёт зарплат) ↔ выплачено (нал авансы + безнал).
 */
export function checkPayroll(payrollDetails, cashAdvances, bankPayroll, tolerance = THRESHOLDS.payrollTolerance) {
  const accrued = (payrollDetails || []).reduce((s, d) => s + num(d.total_earned), 0)
  const paid = num(cashAdvances) + num(bankPayroll)
  const delta = paid - accrued
  return { accrued, paid, delta, ok: accrued === 0 || Math.abs(delta) <= tolerance }
}

/**
 * Пропущенные смены: дни без отчёта между первой и последней датой периода.
 * Сегодняшний операционный день не считается пропуском (смена ещё идёт).
 */
/** Дни, когда заведение не работало (settings.closures: [{from, to, reason}]). */
export const isClosedDay = (iso, closures = []) => closures.some(c => c.from <= iso && iso <= (c.to || c.from))

export function findMissingShifts(reports, fromDate, toDate, now = new Date(), closures = []) {
  const have = new Set(reports.map(r => r.report_date))
  const today = getBusinessDate(now)
  const missing = []
  const d = new Date(fromDate + 'T12:00:00')
  const end = new Date(toDate + 'T12:00:00')
  while (d <= end) {
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (!have.has(iso) && iso < today && !isClosedDay(iso, closures)) missing.push(iso)
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
export function checkPayrollLoop({ accrued, cash, bankPayroll = 0, tolerance = THRESHOLDS.payrollTolerance }) {
  const trackedPaid = num(cash?.advances) + num(cash?.payout) + num(bankPayroll)
  const fromOwners = num(accrued) - trackedPaid
  return { accrued: num(accrued), trackedPaid, fromOwners, ok: num(accrued) === 0 || fromOwners <= tolerance }
}

/**
 * Дивиденды, выплаченные наличными: журнал инвестиций минус то, что ушло по банку.
 * Отрицательным быть не может — если по банку ушло больше, чем в журнале, наличных не было.
 */
export function cashDividends(journalDividends, bankDividends) {
  return Math.max(0, num(journalDividends) - num(bankDividends))
}

/**
 * Необъяснённые наличные у учредителей: снято со счетов − возвращено − ушло на ЗП − дивиденды наличными.
 * Положительный остаток выше допуска = деньги вне контура.
 */
export function unexplainedOwnerCash(transitNet, fromOwnersTotal, cashDividendsTotal = 0, tolerance = THRESHOLDS.ownerCashTolerance, opening = 0) {
  // opening — наличные у учредителей на 1 января (снятые в конце прошлого года, settings.owner_cash_opening)
  const unexplained = num(opening) + num(transitNet) - Math.max(0, num(fromOwnersTotal)) - Math.max(0, num(cashDividendsTotal))
  return { unexplained, ok: Math.abs(unexplained) <= tolerance }
}
