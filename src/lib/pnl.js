// Period allocation: сколько от суммы транзакции относится к конкретному месяцу.
// period_from/period_to NULL → вся сумма в месяц transaction_date.
// Диапазон месяцев → сумма делится поровну между месяцами периода.
// ЕДИНАЯ реализация для PnL / CashFlow / Dashboard / Analytics — не копировать.
export function getTxAmountForMonth(tx, targetYear, targetMonth) {
  const amount = Number(tx.amount) || 0

  if (!tx.period_from || !tx.period_to) {
    const d = new Date(tx.transaction_date)
    return (d.getFullYear() === targetYear && d.getMonth() + 1 === targetMonth) ? amount : 0
  }

  const from = new Date(tx.period_from)
  const to = new Date(tx.period_to)
  const fromYM = from.getFullYear() * 12 + from.getMonth()
  const toYM = to.getFullYear() * 12 + to.getMonth()
  const targetYM = targetYear * 12 + (targetMonth - 1)

  if (targetYM < fromYM || targetYM > toYM) return 0

  const totalMonths = toYM - fromYM + 1
  return Math.round(amount / totalMonths)
}

// Фильтр Supabase: транзакции, попадающие в диапазон дат по transaction_date
// ИЛИ пересекающиеся с ним периодом распределения
export function bankTxRangeFilter(startDate, endDate) {
  return `and(transaction_date.gte.${startDate},transaction_date.lte.${endDate}),and(period_from.lte.${endDate},period_to.gte.${startDate})`
}
