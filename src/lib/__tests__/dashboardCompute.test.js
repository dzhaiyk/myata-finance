import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { closedMonths, dashboardSummary, EXPENSE_GROUPS } from '../dashboardCompute.js'
import { sumMonths } from '../pnlCompute.js'
import { setDepartments } from '../config.js'
import { FIXTURE_DEPARTMENTS } from './fixtures.js'

setDepartments(FIXTURE_DEPARTMENTS)

const tx = (date, amount, category) => ({ transaction_date: date, amount, category, is_debit: true, period_from: null, period_to: null })
const hist = (year, month, category, amount) => ({ year, month, type: 'historical', category, amount })
const report = (date, amount) => ({ report_date: date, status: 'submitted', data: { departments: [{ code: 'kitchen', name: 'Кухня', amount: String(amount) }], withdrawals: {} } })

describe('BR-RPT-015 / BR-RPT-023 — дашборд: закрытые месяцы и одна формула', () => {
  it('закрыт прошедший месяц с выпиской или историей; текущий и соседний год — нет', () => {
    const now = new Date(2026, 3, 15) // апрель 2026
    const months = closedMonths({
      year: 2026,
      bankTx: [tx('2026-01-10', 1, 'rent_premises'), tx('2026-04-02', 1, 'rent_premises'), tx('2025-12-30', 1, 'rent_premises')],
      adjustments: [hist(2026, 2, 'rev_other', 5), hist(2025, 3, 'rev_other', 5)],
      now,
    })
    assert.deepEqual(months, [0, 1])
  })

  it('прошлый год закрыт целиком по данным, будущий — пуст', () => {
    const now = new Date(2026, 3, 15)
    assert.deepEqual(closedMonths({ year: 2025, bankTx: [], adjustments: [hist(2025, 12, 'rev_other', 1)], now }), [11])
    assert.deepEqual(closedMonths({ year: 2027, bankTx: [tx('2027-01-05', 1, 'x')], adjustments: [], now }), [])
  })

  it('итоги совпадают с sumMonths по тем же месяцам, группы — из структуры P&L', () => {
    const now = new Date(2026, 3, 15)
    const reports = [report('2026-01-05', 100000), report('2026-02-05', 50000)]
    const bankTx = [tx('2026-01-10', 30000, 'rent_premises'), tx('2026-02-10', 20000, 'payroll_kitchen')]
    const s = dashboardSummary({ year: 2026, reports, bankTx, adjustments: [], now })
    assert.deepEqual(s.months, [0, 1])
    assert.deepEqual(s.totals, sumMonths(2026, [1, 2], reports, bankTx, []))
    assert.equal(s.totals.revenue, 150000)
    assert.equal(s.monthly[0].revenue, 100000)
    assert.equal(s.monthly[2].revenue, 0)
    assert.deepEqual(s.expenseGroups.map(g => g.key), ['payroll', 'rent'])
    assert.ok(s.expenseGroups.every(g => typeof g.label === 'string' && g.label.length > 0))
    assert.ok(EXPENSE_GROUPS.includes('capex'))
  })
})
