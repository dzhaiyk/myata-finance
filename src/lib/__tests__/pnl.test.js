import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { getTxAmountForMonth, bankTxRangeFilter } from '../pnl.js'

describe('getTxAmountForMonth — period allocation', () => {
  it('без периода: вся сумма в месяц transaction_date', () => {
    const tx = { amount: 90000, transaction_date: '2026-03-15', period_from: null, period_to: null }
    assert.equal(getTxAmountForMonth(tx, 2026, 3), 90000)
    assert.equal(getTxAmountForMonth(tx, 2026, 2), 0)
    assert.equal(getTxAmountForMonth(tx, 2025, 3), 0)
  })

  it('период = один месяц: вся сумма в него, даже если оплата в другом месяце', () => {
    const tx = { amount: 500000, transaction_date: '2026-04-05', period_from: '2026-03-01', period_to: '2026-03-31' }
    assert.equal(getTxAmountForMonth(tx, 2026, 3), 500000)
    assert.equal(getTxAmountForMonth(tx, 2026, 4), 0)
  })

  it('период 3 месяца: равные доли', () => {
    const tx = { amount: 90000, transaction_date: '2026-01-10', period_from: '2026-01-01', period_to: '2026-03-31' }
    assert.equal(getTxAmountForMonth(tx, 2026, 1), 30000)
    assert.equal(getTxAmountForMonth(tx, 2026, 2), 30000)
    assert.equal(getTxAmountForMonth(tx, 2026, 3), 30000)
    assert.equal(getTxAmountForMonth(tx, 2025, 12), 0)
    assert.equal(getTxAmountForMonth(tx, 2026, 4), 0)
  })

  it('период через границу года', () => {
    const tx = { amount: 120000, transaction_date: '2025-12-20', period_from: '2025-11-01', period_to: '2026-02-28' }
    assert.equal(getTxAmountForMonth(tx, 2025, 11), 30000)
    assert.equal(getTxAmountForMonth(tx, 2025, 12), 30000)
    assert.equal(getTxAmountForMonth(tx, 2026, 1), 30000)
    assert.equal(getTxAmountForMonth(tx, 2026, 2), 30000)
  })

  it('округление: сумма долей близка к сумме транзакции (известное ограничение Math.round)', () => {
    const tx = { amount: 100000, transaction_date: '2026-01-01', period_from: '2026-01-01', period_to: '2026-12-31' }
    let sum = 0
    for (let m = 1; m <= 12; m++) sum += getTxAmountForMonth(tx, 2026, m)
    assert.ok(Math.abs(sum - 100000) <= 6, `Σ долей ${sum} слишком далёк от 100000`)
  })

  it('нулевая/битая сумма — нули без исключений', () => {
    assert.equal(getTxAmountForMonth({ amount: null, transaction_date: '2026-01-05' }, 2026, 1), 0)
    assert.equal(getTxAmountForMonth({ amount: 'мусор', transaction_date: '2026-01-05' }, 2026, 1), 0)
  })
})

describe('bankTxRangeFilter', () => {
  it('строит or-фильтр по дате И по пересечению периода', () => {
    const f = bankTxRangeFilter('2026-01-01', '2026-01-31')
    assert.ok(f.includes('transaction_date.gte.2026-01-01'))
    assert.ok(f.includes('transaction_date.lte.2026-01-31'))
    assert.ok(f.includes('period_from.lte.2026-01-31'))
    assert.ok(f.includes('period_to.gte.2026-01-01'))
  })
})
