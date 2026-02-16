import { useState } from 'react'
import { fmt, MONTHS_RU, cn } from '@/lib/utils'
import { Download, ChevronsUpDown, ChevronDown, ChevronRight } from 'lucide-react'

const CF_STRUCTURE = [
  { key: 'opening', label: 'ОСТАТКИ НА НАЧАЛО', type: 'header', color: 'bg-blue-600/20 text-blue-400', collapsible: true },
  { key: 'open_bank', label: 'Расчётный счёт (банк)', parent: 'opening' },
  { key: 'open_cash', label: 'Касса (наличные)', parent: 'opening' },
  { key: 'total_opening', label: 'ИТОГО НА НАЧАЛО', type: 'total', color: 'bg-blue-700/20 text-blue-300' },

  { key: 'income', label: 'ДОХОДЫ', type: 'total', color: 'bg-green-700/30 text-green-300 font-bold' },

  { key: 'expenses_h', label: 'РАСХОДЫ', type: 'header', color: 'bg-red-600/20 text-red-400', collapsible: true },
  { key: 'opex', label: 'OpEx (операционные)', parent: 'expenses_h' },
  { key: 'taxes', label: 'Налоги', parent: 'expenses_h' },
  { key: 'capex', label: 'CapEx (инвестиции)', parent: 'expenses_h' },
  { key: 'total_expenses', label: 'ИТОГО РАСХОДЫ', type: 'total', color: 'bg-red-700/20 text-red-300' },

  { key: 'net_flow', label: 'ЧИСТЫЙ ДЕНЕЖНЫЙ ПОТОК', type: 'total', color: 'bg-blue-700/40 text-blue-200 font-bold' },

  { key: 'dividends_h', label: 'ДИВИДЕНДЫ', type: 'header', color: 'bg-purple-600/20 text-purple-400', collapsible: true },
  { key: 'div_zhaiyk', label: 'Жайык', parent: 'dividends_h' },
  { key: 'div_abu', label: 'Абу', parent: 'dividends_h' },
  { key: 'div_adilet', label: 'Әділет', parent: 'dividends_h' },
  { key: 'total_dividends', label: 'ИТОГО ДИВИДЕНДЫ', type: 'total', color: 'bg-purple-700/20 text-purple-300' },

  { key: 'closing', label: 'ОСТАТКИ НА КОНЕЦ', type: 'header', color: 'bg-blue-600/20 text-blue-400', collapsible: true },
  { key: 'close_bank', label: 'Расчётный счёт (банк)', parent: 'closing' },
  { key: 'close_cash', label: 'Касса (наличные)', parent: 'closing' },
  { key: 'total_closing', label: 'ИТОГО НА КОНЕЦ', type: 'total', color: 'bg-blue-700/20 text-blue-300' },

  { key: 'verification', label: 'СВЕРКА (должно = 0)', type: 'total', color: 'bg-yellow-700/30 text-yellow-300' },
]

export default function CashFlowPage() {
  const [year, setYear] = useState('2025')
  const [allExpanded, setAllExpanded] = useState(true)
  const [collapsed, setCollapsed] = useState({})
  const visibleMonths = MONTHS_RU.slice(0, 10)

  const toggleAll = () => {
    const newState = !allExpanded
    setAllExpanded(newState)
    const c = {}
    CF_STRUCTURE.filter(l => l.collapsible).forEach(l => { c[l.key] = !newState })
    setCollapsed(c)
  }
  const toggleSection = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }))

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Cash Flow</h1>
          <p className="text-sm text-slate-500 mt-0.5">Движение денежных средств</p>
        </div>
        <div className="flex items-center gap-3">
          <select value={year} onChange={e => setYear(e.target.value)} className="input text-sm">
            <option>2025</option><option>2024</option><option>2023</option>
          </select>
          <button onClick={toggleAll} className="btn-secondary text-xs flex items-center gap-1.5">
            <ChevronsUpDown className="w-4 h-4" />{allExpanded ? 'Свернуть' : 'Развернуть'}
          </button>
          <button className="btn-secondary text-sm flex items-center gap-2"><Download className="w-4 h-4" /> Excel</button>
        </div>
      </div>

      <div className="card overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr>
              <th className="table-header text-left w-64 sticky left-0 bg-slate-900 z-10">Статья</th>
              {visibleMonths.map(m => <th key={m} className="table-header text-right">{m.slice(0, 3)}</th>)}
              <th className="table-header text-right font-bold">Итого</th>
              <th className="table-header text-right">Среднее</th>
            </tr>
          </thead>
          <tbody>
            {CF_STRUCTURE.map(row => {
              const isHeader = row.type === 'header'
              const isTotal = row.type === 'total'
              const isSub = !!row.parent
              const isCollapsible = row.collapsible

              // Hide children if parent collapsed
              if (isSub && collapsed[row.parent]) return null

              return (
                <tr key={row.key} className={cn('transition-colors', isTotal && (row.color || ''), !isTotal && 'hover:bg-slate-800/30')}>
                  <td className={cn('px-4 py-2 border-t border-slate-800/50 sticky left-0 z-10', isHeader ? 'bg-slate-900' : isTotal ? '' : 'bg-slate-850', isSub && 'pl-8')}>
                    {isCollapsible ? (
                      <button onClick={() => toggleSection(row.key)} className="flex items-center gap-1.5 w-full text-left">
                        {collapsed[row.key] ? <ChevronRight className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                        <span className="font-semibold text-xs uppercase tracking-wider">{row.label}</span>
                      </button>
                    ) : (
                      <span className={cn(isTotal && 'font-bold', isHeader && 'font-semibold text-xs uppercase tracking-wider', isSub && 'text-slate-400')}>
                        {row.label}
                      </span>
                    )}
                  </td>
                  {visibleMonths.map((_, mi) => (
                    <td key={mi} className="px-3 py-2 text-right font-mono text-xs border-t border-slate-800/50 tabular-nums">—</td>
                  ))}
                  <td className="px-3 py-2 text-right font-mono text-xs font-bold border-t border-slate-800/50">—</td>
                  <td className="px-3 py-2 text-right font-mono text-xs border-t border-slate-800/50 text-slate-500">—</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
