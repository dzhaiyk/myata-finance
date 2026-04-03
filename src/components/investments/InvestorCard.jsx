import { useMemo } from 'react'
import { ArrowRightLeft } from 'lucide-react'
import { fmt, fmtDate, cn } from '@/lib/utils'

export default function InvestorCard({ investor, transactions, allInvestors, canManage, onTransfer }) {
  const stats = useMemo(() => {
    const txs = (transactions || []).filter(t => t.investor_id === investor.id)
    const invested = txs
      .filter(t => t.type === 'investment' || t.type === 'share_purchase')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const withdrawn = txs
      .filter(t => t.type === 'dividend' || t.type === 'share_sale')
      .reduce((s, t) => s + (Number(t.amount) || 0), 0)
    const profit = withdrawn - invested
    const roi = invested > 0 ? withdrawn / invested : 0

    // Avg monthly dividend for current and previous year
    const now = new Date()
    const currentYear = now.getFullYear()
    const calcAvgDiv = (year) => {
      const divs = txs.filter(t => t.type === 'dividend' && new Date(t.transaction_date).getFullYear() === year)
      if (!divs.length) return null
      const sum = divs.reduce((s, t) => s + (Number(t.amount) || 0), 0)
      const months = new Set(divs.map(t => new Date(t.transaction_date).getMonth()))
      return Math.round(sum / months.size)
    }
    const avgDivCurrent = calcAvgDiv(currentYear)
    const avgDivPrev = calcAvgDiv(currentYear - 1)

    return { invested, withdrawn, profit, roi, avgDivCurrent, avgDivPrev, currentYear }
  }, [transactions, investor.id])

  const successor = investor.successor_id
    ? (allInvestors || []).find(i => i.id === investor.successor_id)
    : null

  const isActive = investor.status === 'active'

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-white font-semibold text-base">{investor.full_name}</h3>
            <span className={cn(
              'badge text-xs',
              isActive ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'
            )}>
              {isActive ? 'Активный' : 'Вышел'}
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-0.5">
            Доля: {investor.share_pct != null ? `${investor.share_pct}%` : '—'}
          </p>
        </div>
        {canManage && isActive && (
          <button
            onClick={() => onTransfer?.(investor)}
            className="btn-secondary text-xs flex items-center gap-1"
          >
            <ArrowRightLeft size={14} />
            Передача доли
          </button>
        )}
      </div>

      <div className="text-sm text-slate-400 space-y-0.5">
        <p>Дата входа: {fmtDate(investor.entry_date)}</p>
        {!isActive && (
          <>
            <p>Дата выхода: {fmtDate(investor.exit_date)}</p>
            {investor.exit_type && <p>Тип выхода: {investor.exit_type}</p>}
            {successor && <p>Преемник: {successor.full_name}</p>}
            {investor.purchase_price != null && (
              <p>Цена выкупа: {fmt(investor.purchase_price)} ₸</p>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div>
          <p className="text-xs text-slate-500">Вложено</p>
          <p className="text-white font-medium">{fmt(stats.invested)} ₸</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Выведено</p>
          <p className="text-white font-medium">{fmt(stats.withdrawn)} ₸</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Чистая прибыль</p>
          <p className={cn(
            'font-medium',
            stats.profit >= 0 ? 'text-green-400' : 'text-red-400'
          )}>
            {fmt(stats.profit)} ₸
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">ROI</p>
          <p className="text-white font-medium">
            {stats.roi > 0 ? `${stats.roi.toFixed(1)}x` : '—'}
          </p>
        </div>
      </div>

      {(stats.avgDivCurrent || stats.avgDivPrev) && (
        <div className="flex items-center gap-4 pt-2 border-t border-slate-800">
          <div className="flex-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{stats.currentYear} ср./мес</p>
            <p className="text-sm font-mono text-blue-400">{stats.avgDivCurrent ? `${fmt(stats.avgDivCurrent)} ₸` : '—'}</p>
          </div>
          <div className="flex-1">
            <p className="text-[10px] text-slate-500 uppercase tracking-wider">{stats.currentYear - 1} ср./мес</p>
            <p className="text-sm font-mono text-slate-400">{stats.avgDivPrev ? `${fmt(stats.avgDivPrev)} ₸` : '—'}</p>
          </div>
        </div>
      )}
    </div>
  )
}
