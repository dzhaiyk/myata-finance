import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeMonthCF, CF_STRUCTURE } from '../cashflowCompute.js'
import { computeMonthCF as oldComputeMonthCF } from './_old_cashflow.js'
import { setDepartments } from '../config.js'
import { FIXTURE_DEPARTMENTS } from './fixtures.js'

setDepartments(FIXTURE_DEPARTMENTS)

const report = (date, over = {}) => ({
  report_date: date, status: 'submitted',
  data: {
    revenue: [{ type: 'Наличные', amount: '150 000' }, { type: 'Kaspi', amount: '90000' }],
    withdrawals: {
      suppliers_kitchen: [{ name: 'Мясо', amount: '30000' }],
      suppliers_bar: [{ name: 'Кола', amount: '12000' }],
      tobacco: [{ name: 'Табак', amount: '9000' }, { name: 'Аппараты', amount: '50000' }],
      payroll: [{ name: 'Аванс Иванов', amount: '20000' }, { name: 'Техперсонал', amount: '4000' }],
      other: [{ name: 'Хозтовары', amount: '2500' }],
      cash_withdrawals: [{ name: 'Инкассация', amount: '100000', comment: 'зп' }, { name: 'Инкассация', amount: '40000', comment: '' }],
    },
    ...over,
  },
})
const tx = (date, category, amount, is_debit = true) => ({ transaction_date: date, category, amount, is_debit })
const reports = [report('2026-08-05'), report('2026-08-06')]
const bank = [
  tx('2026-08-10', 'rent_premises', 400000), tx('2026-08-11', 'util_electric', 35000),
  tx('2026-08-12', 'payroll_kitchen', 120000), tx('2026-08-13', 'mkt_target', 15000),
  tx('2026-08-14', 'income_other', 20000, false), tx('2026-08-15', 'capex_repair', 90000),
  tx('2026-08-16', 'tax_retail', 45000), tx('2026-08-17', 'bank_fee', 3000),
  tx('2026-08-18', 'acquiring_settlement', 177300, false), tx('2026-08-19', 'acquiring_settlement', 5000),
  tx('2026-08-20', 'dividends', 300000), tx('2026-08-21', 'cash_withdrawal', 250000),
  tx('2026-08-22', 'internal', 80000), tx('2026-08-23', 'internal', 30000, false),
  tx('2026-08-24', 'uncategorized', 999), tx('2026-09-01', 'rent_premises', 400000),
]
const investors = [
  { transaction_date: '2026-08-15', type: 'dividend', amount: 999999 },
  { transaction_date: '2026-08-16', type: 'investment', amount: 500000 },
  { transaction_date: '2026-07-16', type: 'investment', amount: 700000 },
]

describe('Cash Flow — чистый расчёт (TASK-029)', () => {
  it('совпадает с прежним расчётом со страницы ключ за ключом', () => {
    const now = computeMonthCF(2026, 8, reports, bank, [], investors)
    const before = oldComputeMonthCF(2026, 8, reports, bank, [], investors)
    for (const l of CF_STRUCTURE) assert.equal(now[l.key], before[l.key], `ключ ${l.key}`)
  })

  it('наличная выручка и наличные расходы со знаком минус', () => {
    const v = computeMonthCF(2026, 8, reports, bank, [], investors)
    assert.equal(v.cf_cash_revenue, 300000)
    assert.equal(v.cf_cash_suppliers_kitchen, -60000)
    assert.equal(v.cf_cash_tobacco, -18000)          // аппараты — не закуп
    assert.equal(v.cf_capex_hookah, -100000)         // они здесь
    assert.equal(v.cf_cash_other, -5000)
  })

  it('банк прямым методом: эквайринг нетто, дивиденды из выписки, снятия, переводы', () => {
    const v = computeMonthCF(2026, 8, reports, bank, [], investors)
    assert.equal(v.cf_acquiring, 172300)
    assert.equal(v.cf_bank_income, 20000)
    assert.equal(v.cf_bank_rent, -400000)
    assert.equal(v.cf_bank_utilities, -35000)
    assert.equal(v.cf_bank_other_opex, -3000)
    assert.equal(v.cf_dividends, -300000)             // есть выписка — журнал не считается
    assert.equal(v.cf_investments_in, 0)
    assert.equal(v.cf_cash_withdrawal_bank, -250000)
    assert.equal(v.cf_bank_internal, -50000)
    assert.equal(v.cf_capex_repair, -90000)
  })

  it('без выписки за месяц дивиденды и взносы берутся из журнала', () => {
    const v = computeMonthCF(2026, 7, [], [], [], investors)
    // старый код отдаёт -0 при нулевых дивидендах; для отчёта это ноль
    assert.equal(Math.abs(v.cf_dividends), 0)
    assert.equal(v.cf_investments_in, 700000)
  })

  it('операции другого месяца не попадают', () => {
    const v = computeMonthCF(2026, 8, reports, bank, [], investors)
    assert.equal(v.cf_bank_rent, -400000)            // сентябрьская аренда не вошла
  })

  it('чистое изменение = операционная + инвестиционная + финансовая', () => {
    const v = computeMonthCF(2026, 8, reports, bank, [], investors)
    assert.equal(v.cf_net_change, v.cf_operating + v.cf_investing + v.cf_financing)
    assert.equal(v.cf_operating, v.cf_cash_revenue + v.cf_acquiring + v.cf_bank_income + v.cf_cash_expenses + v.cf_bank_opex)
  })

  it('историческая замена: без живых данных операционка из pnl_data', () => {
    const hist = [
      { year: 2024, month: 3, type: 'historical', category: 'rev_kitchen', amount: 1000000 },
      { year: 2024, month: 3, type: 'historical', category: 'rent', amount: 300000 },
    ]
    const v = computeMonthCF(2024, 3, [], [], hist, [])
    assert.equal(v.cf_bank_income, 1000000)
    assert.equal(v.cf_bank_opex, -300000)
    assert.equal(v.cf_operating, 700000)
  })

  // Поймано при переносе: new Date('YYYY-MM-DD') — UTC-полночь; в поясе
  // западнее UTC первое число уезжало бы в прошлый месяц
  it('первое число месяца остаётся в своём месяце в любом поясе', () => {
    const v = computeMonthCF(2026, 8, [report('2026-08-01')], [tx('2026-08-01', 'rent_premises', 1)], [], [])
    assert.equal(v.cf_cash_revenue, 150000)
    assert.equal(v.cf_bank_rent, -1)
  })
})
