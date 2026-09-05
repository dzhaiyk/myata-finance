import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { monthlyTrends, expenseAnomalies, ANOMALY_GROUPS } from '../analyticsCompute.js'
import { computeMonthValues } from '../pnlCompute.js'
import { setDepartments } from '../config.js'
import { FIXTURE_DEPARTMENTS } from './fixtures.js'

setDepartments(FIXTURE_DEPARTMENTS)

const report = (date, departments) => ({
  report_date: date, status: 'submitted',
  data: {
    departments,
    withdrawals: {
      suppliers_kitchen: [{ name: 'Мясо', amount: '10000' }],
      suppliers_bar: [{ name: 'Пиво', amount: '5000' }],
      tobacco: [{ name: 'Табак', amount: '3000' }],
      payroll: [{ name: 'Техперсонал', amount: '14000' }],
      other: [],
    },
  },
})
const tx = (date, amount, category, is_debit = true) => ({ transaction_date: date, amount, category, is_debit, period_from: null, period_to: null })
const hist = (year, month, category, amount) => ({ year, month, type: 'historical', category, amount })

const reports = [report('2026-03-05', [{ code: 'kitchen', name: 'Кухня', amount: '100000' }, { code: 'bar', name: 'Бар', amount: '50000' }, { code: 'hookah', name: 'Кальян', amount: '50000' }])]
const bankTx = [tx('2026-03-10', 20000, 'cogs_kitchen'), tx('2026-03-11', 60000, 'payroll_kitchen')]
const adjustments = [
  hist(2025, 1, 'rev_kitchen', 300000), hist(2025, 1, 'rev_bar', 100000), hist(2025, 1, 'fc_kitchen', 90000), hist(2025, 1, 'payroll_kitchen', 120000),
  // исторический месяц без выручки по отделам — только общая строка
  hist(2025, 2, 'rev_other', 400000), hist(2025, 2, 'fc_kitchen', 100000),
]

describe('BR-RPT-023 — аналитика считает той же формулой, что P&L', () => {
  it('food cost и доля ФОТ совпадают с computeMonthValues', () => {
    const [t] = monthlyTrends({ reports, bankTx, adjustments, years: [2026] })
    const v = computeMonthValues(2026, 3, reports, bankTx, adjustments)
    assert.equal(t.month, 3)
    assert.equal(t.fcTotal, v.fc_pct * 100)
    assert.equal(t.fcKitchen, v.fc_kitchen / v.rev_kitchen * 100)  // 30000 / 100000
    assert.equal(t.fcKitchen, 30)
    assert.equal(t.payrollPct, v.payroll / v.revenue * 100)        // техперсонал из кассы + банк
    assert.equal(t.payrollPct, (60000 + 14000) / 200000 * 100)
    assert.equal(t.alert, true)
  })

  it('месяцы без выручки пропускаются, исторические считаются по строкам pnl_data', () => {
    const rows = monthlyTrends({ reports, bankTx, adjustments, years: [2025, 2026] })
    assert.deepEqual(rows.map(r => `${r.year}-${r.month}`), ['2025-1', '2025-2', '2026-3'])
    const jan = rows[0]
    assert.equal(jan.fcKitchen, 30)
    assert.equal(jan.payrollPct, 30)
    assert.equal(jan.anomaly, false)
  })

  // Решение владельца 05.09.2026: доли 50/30/20 убраны, вместо них пропуск
  it('без выручки отдела food cost отдела — пропуск, не выдуманная доля', () => {
    const feb = monthlyTrends({ reports, bankTx, adjustments, years: [2025] })[1]
    assert.equal(feb.month, 2)
    assert.equal(feb.fcKitchen, null)
    assert.equal(feb.fcBar, null)
    assert.equal(feb.fcTotal, 25)   // общий food cost остаётся: 100000 / 400000
  })

  it('аномалии расходов — по группам структуры P&L', () => {
    const adj = []
    for (let m = 1; m <= 12; m++) adj.push(hist(2025, m, 'rent_premises', 500000), hist(2025, m, 'rev_other', 1))
    const bank = [tx('2026-01-05', 2000000, 'rent_premises')]
    const res = expenseAnomalies({ reports: [], bankTx: bank, adjustments: adj, now: new Date(2026, 0, 15) })
    const rent = res.find(a => a.key === 'rent')
    assert.ok(rent)
    assert.equal(rent.mean, 500000)
    assert.equal(rent.current, 2000000)
    assert.equal(rent.isAnomaly, true)
    assert.ok(ANOMALY_GROUPS.includes('rent'))
    // группа без 3 месяцев данных не показывается
    assert.equal(res.find(a => a.key === 'marketing'), undefined)
  })
})
