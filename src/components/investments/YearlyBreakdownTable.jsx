import { useMemo, Fragment } from 'react'
import { fmt, cn } from '@/lib/utils'

export default function YearlyBreakdownTable({ investors, transactions }) {
  const relevantInvestors = useMemo(
    () => (investors || []).filter(i => i.status === 'active' || i.status === 'exited'),
    [investors]
  )

  const { years, data } = useMemo(() => {
    const txs = transactions || []
    const yearSet = new Set()
    const map = {} // { year: { investorId: { in: N, out: N } } }

    txs.forEach(tx => {
      const year = tx.transaction_date ? new Date(tx.transaction_date).getFullYear() : null
      if (!year) return
      yearSet.add(year)

      if (!map[year]) map[year] = {}
      if (!map[year][tx.investor_id]) map[year][tx.investor_id] = { in: 0, out: 0 }

      const amt = Number(tx.amount) || 0
      if (tx.type === 'investment' || tx.type === 'share_purchase') {
        map[year][tx.investor_id].in += amt
      } else if (tx.type === 'dividend' || tx.type === 'share_sale') {
        map[year][tx.investor_id].out += amt
      }
    })

    const sortedYears = Array.from(yearSet).sort((a, b) => a - b)
    return { years: sortedYears, data: map }
  }, [transactions])

  if (years.length === 0) {
    return <p className="text-sm text-slate-500">Нет данных для отображения</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[700px]">
        <thead>
          <tr>
            <th className="table-header">Год</th>
            {relevantInvestors.map(inv => (
              <th key={inv.id} className="table-header text-center" colSpan={2}>
                {inv.full_name}
              </th>
            ))}
            <th className="table-header text-right">Итого нетто</th>
          </tr>
          <tr>
            <th className="table-header" />
            {relevantInvestors.map(inv => (
              <Fragment key={inv.id}>
                <th className="table-header text-right text-xs font-normal">Внёс</th>
                <th className="table-header text-right text-xs font-normal">Вывел</th>
              </Fragment>
            ))}
            <th className="table-header" />
          </tr>
        </thead>
        <tbody>
          {years.map(year => {
            let yearNet = 0
            return (
              <tr key={year} className="border-b border-slate-700/50">
                <td className="table-cell font-medium text-white">{year}</td>
                {relevantInvestors.map(inv => {
                  const cell = data[year]?.[inv.id] || { in: 0, out: 0 }
                  yearNet += cell.out - cell.in
                  return (
                    <Fragment key={inv.id}>
                      <td className="table-cell text-right">
                        {cell.in ? fmt(cell.in) : '—'}
                      </td>
                      <td className="table-cell text-right">
                        {cell.out ? fmt(cell.out) : '—'}
                      </td>
                    </Fragment>
                  )
                })}
                <td className={cn(
                  'table-cell text-right font-medium',
                  yearNet >= 0 ? 'text-green-400' : 'text-red-400'
                )}>
                  {fmt(yearNet)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

