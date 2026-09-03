import { cashPayrollOf, sumCashPayroll, cashTransit, checkPayrollLoop, unexplainedOwnerCash, isPayrollComment } from '../reconcile.js'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  reportTotals, checkRevenueConsistency, checkCashDiscrepancies, checkAcquiring,
  checkAccountBalance, checkPayroll, findMissingShifts, checkStatementFreshness,
  countOpenIssues,
} from '../reconcile.js'

const mkReport = (date, over = {}) => ({
  report_date: date,
  manager_name: over.manager || 'Менеджер',
  status: over.status || 'submitted',
  cash_discrepancy: over.discrepancy ?? 0,
  data: {
    departments: over.departments || [
      { name: 'Кухня', amount: '100000' }, { name: 'Бар', amount: '80000' },
      { name: 'Кальян', amount: '70000' }, { name: 'Прочее', amount: '0' },
    ],
    revenue: over.revenue || [
      { type: 'Наличные', amount: '100000' }, { type: 'Kaspi', amount: '150000' },
    ],
    terminals: over.terminals || { 5: '150000' },
    withdrawals: over.withdrawals || {
      suppliers_kitchen: [{ name: 'Мясо', amount: '20000' }],
      cash_withdrawals: [{ amount: '50000', comment: 'Инкассация' }],
    },
  },
})

describe('reportTotals — суммы с запятой и пробелами', () => {
  it('парсит суммы, считает итоги', () => {
    const t = reportTotals(mkReport('2026-08-20'))
    assert.equal(t.byDepartment, 250000)
    assert.equal(t.byPayment, 250000)
    assert.equal(t.cash, 100000)
    assert.equal(t.terminals, 150000)
    assert.equal(t.withdrawals, 70000)
    assert.equal(t.collected, 50000)
  })

  it('терпит суммы вида "12 500,50"', () => {
    const t = reportTotals(mkReport('2026-08-20', {
      departments: [{ name: 'Кухня', amount: '12 500,50' }],
      revenue: [{ type: 'Наличные', amount: '12 500,50' }],
    }))
    assert.equal(t.byDepartment, 12500.5)
    assert.equal(t.cash, 12500.5)
  })

  it('пустой отчёт не роняет расчёт', () => {
    const t = reportTotals({ report_date: '2026-08-20', data: null })
    assert.equal(t.byDepartment, 0)
    assert.equal(t.withdrawals, 0)
  })
})

describe('Сверка №1 — выручка: отделы ↔ типы оплат', () => {
  it('сходится → пусто', () => {
    assert.equal(checkRevenueConsistency([mkReport('2026-08-20')]).length, 0)
  })

  it('ловит занижение по типам оплат', () => {
    const bad = mkReport('2026-08-21', {
      revenue: [{ type: 'Наличные', amount: '50000' }, { type: 'Kaspi', amount: '150000' }],
    })
    const res = checkRevenueConsistency([bad])
    assert.equal(res.length, 1)
    assert.equal(res[0].delta, 50000)  // отделы 250к − оплаты 200к
    assert.equal(res[0].date, '2026-08-21')
  })
})

describe('Сверка №2 — расхождения кассы', () => {
  it('фильтрует по порогу и сортирует по величине', () => {
    const res = checkCashDiscrepancies([
      mkReport('2026-08-20', { discrepancy: -200 }),   // ниже порога
      mkReport('2026-08-21', { discrepancy: -1500 }),
      mkReport('2026-08-22', { discrepancy: 3000 }),
    ])
    assert.equal(res.length, 2)
    assert.equal(res[0].discrepancy, 3000)  // худшее первым
    assert.equal(res[1].discrepancy, -1500)
  })
})

describe('Сверка №3 — эквайринг: терминалы ↔ зачисления', () => {
  const reports = [mkReport('2026-08-20'), mkReport('2026-08-21')] // терминалы 300000

  it('зачисление за вычетом комиссии 1.5% → ok', () => {
    const r = checkAcquiring(reports, [
      { category: 'acquiring_settlement', is_debit: false, amount: 295500 },
    ])
    assert.equal(r.terminalsTotal, 300000)
    assert.equal(r.settled, 295500)
    assert.equal(r.ok, true)
  })

  it('недозачисление 30к → расхождение', () => {
    const r = checkAcquiring(reports, [
      { category: 'acquiring_settlement', is_debit: false, amount: 265500 },
    ])
    assert.equal(r.ok, false)
    assert.equal(r.delta, -30000)
    assert.ok(r.deltaPct < -9)
  })

  it('другие категории игнорируются', () => {
    const r = checkAcquiring(reports, [
      { category: 'acquiring_settlement', is_debit: false, amount: 295500 },
      { category: 'cogs_kitchen', is_debit: true, amount: 999999 },
    ])
    assert.equal(r.settled, 295500)
    assert.equal(r.ok, true)
  })

  it('нет данных → hasData false, не паникуем', () => {
    const r = checkAcquiring([], [])
    assert.equal(r.hasData, false)
    assert.equal(r.ok, true)
  })
})

describe('Сверка №5 — остаток счёта', () => {
  it('сходится в пределах допуска', () => {
    assert.equal(checkAccountBalance(1000000, 1000050).ok, true)
    assert.equal(checkAccountBalance(1000000, 1005000).ok, false)
    assert.equal(checkAccountBalance(1000000, 1005000).delta, 5000)
  })

  it('без факта — ok null (сверка не проведена)', () => {
    assert.equal(checkAccountBalance(1000000, null).ok, null)
  })
})

describe('Сверка №7 — ФОТ начислено ↔ выплачено', () => {
  const details = [{ total_earned: 300000 }, { total_earned: 200000 }]

  it('нал + безнал покрывают начисление', () => {
    const r = checkPayroll(details, 150000, 350000)
    assert.equal(r.accrued, 500000)
    assert.equal(r.paid, 500000)
    assert.equal(r.ok, true)
  })

  it('переплата ловится', () => {
    const r = checkPayroll(details, 150000, 450000)
    assert.equal(r.delta, 100000)
    assert.equal(r.ok, false)
  })
})

describe('Пропущенные смены', () => {
  it('находит дыры, сегодняшнюю смену не считает пропуском', () => {
    const now = new Date(2026, 7, 25, 14, 0) // операционный день 2026-08-25
    const missing = findMissingShifts(
      [mkReport('2026-08-20'), mkReport('2026-08-22')],
      '2026-08-20', '2026-08-25', now
    )
    assert.deepEqual(missing, ['2026-08-21', '2026-08-23', '2026-08-24'])
  })

  it('ночь до границы: вчерашняя смена ещё не пропуск', () => {
    const now = new Date(2026, 7, 25, 3, 0) // операционный день ещё 2026-08-24
    const missing = findMissingShifts([mkReport('2026-08-23')], '2026-08-23', '2026-08-25', now)
    assert.deepEqual(missing, [])
  })
})

describe('Свежесть выписки', () => {
  const now = new Date(2026, 7, 25, 14, 0)

  it('вчерашняя выписка — ok', () => {
    const r = checkStatementFreshness([{ transaction_date: '2026-08-24' }], now)
    assert.equal(r.daysAgo, 1)
    assert.equal(r.ok, true)
  })

  it('неделя без загрузки — разрыв контура', () => {
    const r = checkStatementFreshness([{ transaction_date: '2026-08-18' }], now)
    assert.equal(r.daysAgo, 7)
    assert.equal(r.ok, false)
  })

  it('пустая база', () => {
    assert.equal(checkStatementFreshness([], now).never, true)
  })
})

describe('Незакрытые хвосты', () => {
  it('считает черновики и нераспознанные', () => {
    const r = countOpenIssues(
      [mkReport('2026-08-20'), mkReport('2026-08-21', { status: 'draft' })],
      [{ category: 'uncategorized' }, { category: null }, { category: 'cogs_bar' }]
    )
    assert.equal(r.drafts, 1)
    assert.equal(r.uncategorized, 2)
  })
})

describe('Наличная ЗП и транзит учредителей (03.09.2026)', () => {
  const rep = {
    report_date: '2026-05-16', status: 'submitted',
    data: { withdrawals: {
      payroll: [{ name: 'Асхат', amount: '10 000' }, { name: 'Техперсонал', amount: '14000' }, { name: 'Тех персанал', amount: '7000' }],
      cash_withdrawals: [{ amount: '2 000 000', comment: 'на ЗП' }, { amount: '300000', comment: 'Маржан аванс' }, { amount: '50000', comment: 'на таргет' }],
    } },
  }
  it('делит авансы, техперсонал, выдачу ЗП (инкассация «зп/аванс») и прочую инкассацию', () => {
    assert.deepEqual(cashPayrollOf(rep), { advances: 10000, techStaff: 21000, payout: 2300000, otherCollected: 50000 })
    assert.equal(isPayrollComment('на фот'), true)
    assert.equal(isPayrollComment('bi service'), false)
    assert.deepEqual(sumCashPayroll([rep, rep]).payout, 4600000)
  })
  it('транзит: снятия со счёта минус возвраты без депозитных ног', () => {
    const tx = [
      { is_debit: true, category: 'cash_withdrawal', amount: '1500000', purpose: 'Снятия наличных в Kaspi Банкомат' },
      { is_debit: true, category: 'cash_withdrawal', amount: '1000000', purpose: 'Перевод собственных средств на карту Kaspi Gold *0291' },
      { is_debit: false, category: 'internal', amount: '700000', purpose: 'Взнос наличных в Kaspi Банкомате' },
      { is_debit: false, category: 'internal', amount: '3000000', purpose: 'Фин помощь. Пополнение' },
      { is_debit: false, category: 'internal', amount: '2000000', purpose: 'Перевод со счета U36207975-001 от 19/08/2024 на счет KaspiPay через интернет отделение' },
      { is_debit: false, category: 'internal', amount: '2700000', purpose: 'Перевод с Депозита U34948588-002 от 31/05/2026 на счет Kaspi Pay' },
      { is_debit: true, category: 'internal', amount: '500000', purpose: 'Перевод со счета KaspiPay на Депозит' },
    ]
    assert.deepEqual(cashTransit(tx), { withdrawn: 2500000, returned: 3700000, net: -1200000 })
  })
  it('ФОТ-контур: остаток ведомости, не выданный из кассы/банка, = деньги учредителей', () => {
    const r = checkPayrollLoop({ accrued: 6421289, cash: { advances: 1660540, payout: 3739536, techStaff: 434000 }, bankPayroll: 0 })
    assert.equal(r.trackedPaid, 5400076)
    assert.equal(r.fromOwners, 1021213)
    assert.equal(r.ok, false)
    assert.equal(checkPayrollLoop({ accrued: 0, cash: { advances: 0, payout: 0 } }).ok, true)
  })
  it('необъяснённый остаток у учредителей', () => {
    assert.deepEqual(unexplainedOwnerCash(5000000, 4800000), { unexplained: 200000, ok: true })
    assert.equal(unexplainedOwnerCash(5000000, 1000000).ok, false)
    assert.equal(unexplainedOwnerCash(-1200000, 0).unexplained, -1200000)
  })
})
