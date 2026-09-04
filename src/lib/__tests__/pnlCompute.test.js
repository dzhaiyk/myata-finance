import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { PNL_STRUCTURE, computeMonthValues, sumMonths } from '../pnlCompute.js'
import { setDepartments } from '../config.js'
import { FIXTURE_DEPARTMENTS } from './fixtures.js'

// Справочник отделов приходит из базы — подставляем набор заведения
setDepartments(FIXTURE_DEPARTMENTS)


const report = (date, over = {}) => ({
  report_date: date,
  status: 'submitted',
  data: {
    departments: over.departments || [
      { name: 'Кухня', amount: '100000' }, { name: 'Бар', amount: '80000' },
      { name: 'Кальян', amount: '70000' }, { name: 'Прочее', amount: '' },
    ],
    revenue: [{ type: 'Наличные', amount: '120000' }, { type: 'Kaspi', amount: '130000' }],
    withdrawals: over.withdrawals || {
      suppliers_kitchen: [{ name: 'Мясо', amount: '10000' }],
      suppliers_bar: [{ name: 'Пиво', amount: '5000' }],
      tobacco: [{ name: 'Табак', amount: '3000' }, { name: 'Аппараты', amount: '25000' }],
      payroll: [{ name: 'Техперсонал', amount: '14000' }, { name: 'Асхат', amount: '30000' }],
      other: [{ name: 'Хозтовары', amount: '2000' }],
    },
  },
})

const tx = (date, amount, category, over = {}) => ({
  transaction_date: date, amount, category, is_debit: over.is_debit ?? true,
  period_from: over.period_from ?? null, period_to: over.period_to ?? null,
})

describe('P&L — живой месяц (отчёты смен + банк)', () => {
  const reports = [report('2026-05-10'), report('2026-05-11')]
  const bank = [
    tx('2026-05-05', 2200000, 'rent_premises'),
    tx('2026-05-06', 500000, 'cogs_bar'),
    tx('2026-05-07', 300000, 'util_electric'),
    tx('2026-05-08', 100000, 'capex_repair'),
    tx('2026-05-09', 50000, 'income_other', { is_debit: false }),
    tx('2026-05-09', 900000, 'cash_withdrawal'),        // не расход — движение денег
    tx('2026-05-09', 1000000, 'acquiring_settlement', { is_debit: false }), // выручка уже в отчётах
  ]

  it('выручка берётся из отделов, прочий доход — из банка', () => {
    const v = computeMonthValues(2026, 5, reports, bank, [])
    assert.equal(v.rev_kitchen, 200000)
    assert.equal(v.rev_bar, 160000)
    assert.equal(v.rev_hookah, 140000)
    assert.equal(v.rev_other, 50000)          // кредит по банку = доход
    assert.equal(v.revenue, 550000)
  })

  it('закуп складывается из кассы и банка, аппараты идут в CapEx', () => {
    const v = computeMonthValues(2026, 5, reports, bank, [])
    assert.equal(v.fc_kitchen, 20000)
    assert.equal(v.fc_bar, 10000 + 500000)
    assert.equal(v.fc_hookah, 6000)
    assert.equal(v.foodcost, 536000)
    assert.equal(v.capex_other, 50000)        // «Аппараты» из кассы
    assert.equal(v.capex, 150000)
  })

  it('техперсонал из кассы попадает в ФОТ, обычные авансы — нет', () => {
    const v = computeMonthValues(2026, 5, reports, bank, [])
    assert.equal(v.payroll_other, 28000)      // только техперсонал, без Асхата
  })

  it('снятие наличных и эквайринг в расходы не попадают', () => {
    const v = computeMonthValues(2026, 5, reports, bank, [])
    assert.equal(v.rent, 2200000)
    assert.equal(v.utilities, 300000)
    assert.equal(v.opex_household, 4000)
    assert.equal(v.expenses, v.capex + v.opex)
    assert.equal(v.opex, v.payroll + v.foodcost + v.marketing + v.rent + v.utilities + v.opex_other + v.taxes)
    assert.equal(v.net_profit, v.revenue - v.expenses)
  })
})

describe('P&L — исторический месяц (данные из Excel)', () => {
  const hist = [
    { year: 2025, month: 4, category: 'rev_kitchen', amount: 7646976, type: 'historical' },
    { year: 2025, month: 4, category: 'rev_bar', amount: 9905697, type: 'historical' },
    { year: 2025, month: 4, category: 'rev_hookah', amount: 8748050, type: 'historical' },
    { year: 2025, month: 4, category: 'payroll_other', amount: 6838188, type: 'historical' },
    { year: 2025, month: 4, category: 'fc_kitchen', amount: 2617512, type: 'historical' },
    { year: 2025, month: 4, category: 'rent_premises', amount: 2000000, type: 'historical' },
    { year: 2025, month: 4, category: 'capex_repair', amount: 500000, type: 'historical' },
  ]

  it('строки Excel раскладываются по группам без отчётов смен', () => {
    const v = computeMonthValues(2025, 4, [], [], hist)
    assert.equal(v.revenue, 26300723)
    assert.equal(v.payroll, 6838188)
    assert.equal(v.foodcost, 2617512)
    assert.equal(v.rent, 2000000)
    assert.equal(v.capex, 500000)
    assert.equal(v.opex, 6838188 + 2617512 + 2000000)
    assert.equal(v.expenses, v.opex + 500000)
  })

  it('банковские строки того же месяца в исторический расчёт не лезут', () => {
    const withBank = computeMonthValues(2025, 4, [], [tx('2025-04-10', 999999, 'cogs_bar')], hist)
    assert.ok(!withBank.fc_bar, 'банковский закуп бара не должен появиться в историческом месяце')
    assert.equal(withBank.expenses, computeMonthValues(2025, 4, [], [], hist).expenses)
  })
})

describe('P&L — ручные корректировки', () => {
  it('корректировка прибавляется к строке, а не заменяет её', () => {
    const adj = [{ year: 2026, month: 4, category: 'rent_premises', amount: -1100000, type: 'expense' }]
    const bank = [tx('2026-04-07', 3300000, 'rent_premises')]
    const v = computeMonthValues(2026, 4, [report('2026-04-10')], bank, adj)
    assert.equal(v.rent_premises, 2200000)
    assert.equal(v.rent, 2200000)
  })
})

describe('P&L — распределение по периодам и суммирование месяцев', () => {
  it('платёж за два месяца делится поровну', () => {
    const bank = [tx('2026-05-21', 43250, 'opex_music', { period_from: '2026-04-01', period_to: '2026-05-31' })]
    assert.equal(computeMonthValues(2026, 4, [report('2026-04-01')], bank, []).opex_music, 21625)
    assert.equal(computeMonthValues(2026, 5, [report('2026-05-01')], bank, []).opex_music, 21625)
  })

  it('sumMonths складывает месяцы и пересчитывает проценты от итогов', () => {
    const reports = [report('2026-01-10'), report('2026-02-10')]
    const bank = [tx('2026-01-05', 1000000, 'rent_premises'), tx('2026-02-05', 1000000, 'rent_premises')]
    const total = sumMonths(2026, [1, 2], reports, bank, [])
    assert.equal(total.revenue, 500000)
    assert.equal(total.rent, 2000000)
    assert.equal(total.fc_pct, total.foodcost / total.revenue)
    assert.ok(PNL_STRUCTURE.some(l => l.key === 'rent_premises'))
  })

  it('месяц без данных даёт нули, а не мусор', () => {
    const v = computeMonthValues(2026, 12, [], [], [])
    assert.equal(v.revenue, 0)
    assert.equal(v.expenses, 0)
    assert.equal(v.net_profit, 0)
  })
})

describe('P&L — сопоставление отделов и строк через config (ADR-0010, TASK-015)', () => {
  it('нераспознанный отдел попадает в «Прочее» и виден в unknown_departments', () => {
    const r = report('2026-05-10', {
      departments: [{ name: 'Кухня', amount: '100000' }, { name: 'Пекарня', amount: '40000' }],
    })
    const v = computeMonthValues(2026, 5, [r], [], [])
    assert.equal(v.rev_kitchen, 100000)
    assert.equal(v.rev_other, 40000)
    assert.deepEqual(v.unknown_departments, ['Пекарня'])
  })

  it('переименование отдела не тонет молча: сумма уходит в «Прочее», но название названо', () => {
    const r = report('2026-05-10', {
      departments: [{ name: 'Кухня Мята', amount: '100000' }],
    })
    const v = computeMonthValues(2026, 5, [r], [], [])
    assert.equal(v.rev_kitchen, 0)
    assert.equal(v.rev_other, 100000)
    assert.deepEqual(v.unknown_departments, ['Кухня Мята'])
  })

  it('известные отделы не помечаются нераспознанными, пустые суммы не шумят', () => {
    const v = computeMonthValues(2026, 5, [report('2026-05-10')], [], [])
    assert.deepEqual(v.unknown_departments, [])
  })

  it('строка CapEx узнаётся без учёта регистра и не попадает в закуп кальяна', () => {
    const r = report('2026-05-10', {
      withdrawals: { tobacco: [{ name: 'Табак', amount: '3000' }, { name: 'аппараты', amount: '25000' }] },
    })
    const v = computeMonthValues(2026, 5, [r], [], [])
    assert.equal(v.fc_hookah, 3000)
    assert.equal(v.capex_other, 25000)   // аппараты идут в «CapEx прочее» (pnlCompute.js:207)
  })
})
