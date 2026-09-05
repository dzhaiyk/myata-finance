import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/fetchAll'
import { useAuthStore } from '@/lib/store'
import { cn, fmt, fmtK, MONTHS_RU, money } from '@/lib/utils'
import { yearsRange } from '@/lib/dates'
import { ChevronDown, ChevronRight, ChevronsUpDown, Info, FileText, Upload, Wallet } from 'lucide-react'
import { currencySymbol } from '@/lib/config'
import { computeMonthCF } from '@/lib/cashflowCompute'
import { getCfStructure } from '@/lib/cashflowStructure'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

export default function CashFlowPage() {
  // структура из базы; скрытые строки остаются в расчёте, но не рисуются
  const STRUCTURE = getCfStructure().filter(l => !l.hidden)
  const { hasPermission } = useAuthStore()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [viewMode, setViewMode] = useState('year') // default to year
  const [dailyReports, setDailyReports] = useState([])
  const [bankTx, setBankTx] = useState([])
  const [pnlData, setPnlData] = useState([])
  const [investorTx, setInvestorTx] = useState([])
  const [loading, setLoading] = useState(true)
  const [allExpanded, setAllExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    const c = {}
    STRUCTURE.filter(l => l.calc === 'sum_children' && l.level > 0).forEach(l => { c[l.key] = true })
    return c
  })

  useEffect(() => { loadData() }, [year, month, viewMode])

  const loadData = async () => {
    setLoading(true)

    if (viewMode === 'overall') {
      // Load everything
      const [drRes, btRes, pnlRes, invRes] = await Promise.all([
        fetchAll(() => supabase.from('daily_reports').select('*').eq('status', 'submitted').order('id')),
        fetchAll(() => supabase.from('bank_transactions').select('*').order('id')),
        fetchAll(() => supabase.from('pnl_data').select('*').order('id')),
        fetchAll(() => supabase.from('investor_transactions').select('*').order('id')),
      ])
      setDailyReports(drRes)
      setBankTx(btRes)
      setPnlData(pnlRes)
      setInvestorTx(invRes)
    } else {
      const isYearMode = viewMode === 'year'
      const startDate = isYearMode || viewMode === 'ytd' ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`
      const endMonth = isYearMode || viewMode === 'ytd' ? 12 : month
      const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${new Date(year, endMonth, 0).getDate()}`

      const [drRes, btRes, pnlRes, invRes] = await Promise.all([
        fetchAll(() => supabase.from('daily_reports').select('*').gte('report_date', startDate).lte('report_date', endDate).eq('status', 'submitted').order('id')),
        fetchAll(() => supabase.from('bank_transactions').select('*').or(
          `and(transaction_date.gte.${startDate},transaction_date.lte.${endDate}),and(period_from.lte.${endDate},period_to.gte.${startDate})`
        ).order('id')),
        fetchAll(() => supabase.from('pnl_data').select('*').eq('year', year).order('id')),
        fetchAll(() => supabase.from('investor_transactions').select('*').gte('transaction_date', startDate).lte('transaction_date', endDate).order('id')),
      ])
      setDailyReports(drRes)
      setBankTx(btRes)
      setPnlData(pnlRes)
      setInvestorTx(invRes)
    }
    setLoading(false)
  }

  // Single-period values (month / ytd)
  const values = useMemo(() => {
    if (viewMode === 'year' || viewMode === 'overall') return {}
    if (viewMode === 'ytd') {
      const totals = {}
      for (let m = 1; m <= month; m++) {
        const mv = computeMonthCF(year, m, dailyReports, bankTx, pnlData, investorTx)
        STRUCTURE.forEach(line => {
          totals[line.key] = (totals[line.key] || 0) + (mv[line.key] || 0)
        })
      }
      return totals
    }
    return computeMonthCF(year, month, dailyReports, bankTx, pnlData, investorTx)
  }, [dailyReports, bankTx, pnlData, investorTx, year, month, viewMode])

  // Multi-period for year / overall modes
  const multiPeriodData = useMemo(() => {
    if (viewMode !== 'year' && viewMode !== 'overall') return null

    if (viewMode === 'year') {
      const columns = Array.from({ length: 12 }, (_, i) => ({
        label: MONTHS_RU[i].slice(0, 3),
        values: computeMonthCF(year, i + 1, dailyReports, bankTx, pnlData, investorTx)
      }))
      const totals = {}
      STRUCTURE.forEach(line => {
        totals[line.key] = columns.reduce((s, col) => s + (col.values[line.key] || 0), 0)
      })
      columns.push({ label: 'Итого', values: totals, isTotal: true })
      const monthsWithData = columns.filter(c => !c.isTotal && (c.values.cf_cash_revenue || c.values.cf_bank_income)).length || 1
      const avg = {}
      STRUCTURE.forEach(line => { avg[line.key] = Math.round(totals[line.key] / monthsWithData) })
      columns.push({ label: 'Среднее', values: avg, isAvg: true })
      return columns
    }

    // Overall: columns = years
    const years = yearsRange()
    const columns = years.map(y => {
      const yearValues = {}
      for (let m = 1; m <= 12; m++) {
        const mv = computeMonthCF(y, m, dailyReports, bankTx, pnlData, investorTx)
        STRUCTURE.forEach(line => {
          yearValues[line.key] = (yearValues[line.key] || 0) + (mv[line.key] || 0)
        })
      }
      return { label: String(y), values: yearValues }
    })
    const totals = {}
    STRUCTURE.forEach(line => {
      totals[line.key] = columns.reduce((s, col) => s + (col.values[line.key] || 0), 0)
    })
    columns.push({ label: 'Итого', values: totals, isTotal: true })
    return columns
  }, [viewMode, year, dailyReports, bankTx, pnlData, investorTx])

  const toggleAll = () => {
    const newState = !allExpanded
    setAllExpanded(newState)
    const c = {}
    STRUCTURE.filter(l => l.calc === 'sum_children').forEach(l => { c[l.key] = !newState })
    setCollapsed(c)
  }
  const toggleSection = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }))

  const isVisible = (line, idx) => {
    if (line.level === 0) return true
    let targetLevel = line.level
    for (let i = idx - 1; i >= 0; i--) {
      const ancestor = STRUCTURE[i]
      if (ancestor.level < targetLevel && ancestor.calc === 'sum_children') {
        if (collapsed[ancestor.key]) return false
        targetLevel = ancestor.level
        if (targetLevel === 0) break
      }
    }
    return true
  }

  const periodLabel = viewMode === 'overall' ? 'Все годы'
    : viewMode === 'year' ? `${year} год`
    : viewMode === 'ytd' ? `${year} YTD (до ${MONTHS_RU[month - 1]})`
    : `${MONTHS_RU[month - 1]} ${year}`

  // Проверка прав ПОСЛЕ всех хуков (Rules of Hooks)
  if (!hasPermission('cashflow.view')) {
    return (
      <div className="text-center text-slate-500 py-20">
        <Wallet className="w-12 h-12 mx-auto mb-3 text-slate-700" />
        <p>Нет доступа к Cash Flow</p>
      </div>
    )
  }

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  // KPI values
  const kpiValues = (viewMode === 'year' || viewMode === 'overall')
    ? (multiPeriodData?.find(c => c.isTotal)?.values || {})
    : values

  const fmtM = (v) => {
    if (!v) return `0 ${currencySymbol()}`
    const abs = Math.abs(v)
    const sign = v < 0 ? '-' : '+'
    if (abs >= 1e6) return `${sign}${(abs / 1e6).toFixed(1)}М ${currencySymbol()}`
    if (abs >= 1e3) return `${sign}${(abs / 1e3).toFixed(0)}К ${currencySymbol()}`
    return `${sign}${money(abs)}`
  }

  const fmtCF = (v) => {
    if (!v || v === 0) return '—'
    return fmt(v)
  }

  const colorCF = (v) => {
    if (!v || v === 0) return 'text-slate-500'
    return v > 0 ? 'text-green-400' : 'text-red-400'
  }

  const isMultiPeriod = viewMode === 'year' || viewMode === 'overall'

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Cash Flow</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {periodLabel} · {dailyReports.length} отчётов · {bankTx.length} банк. записей
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode !== 'year' && viewMode !== 'overall' && (
            <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input text-sm">
              {MONTHS_RU.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
            </select>
          )}
          {viewMode !== 'overall' && (
            <select value={year} onChange={e => setYear(Number(e.target.value))} className="input text-sm">
              {yearsRange().map(y => <option key={y}>{y}</option>)}
            </select>
          )}
          <div className="flex bg-slate-900 rounded-lg p-0.5">
            {['month', 'ytd', 'year', 'overall'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={cn('px-3 py-1.5 rounded-md text-xs font-medium', viewMode === mode ? 'bg-slate-700 text-slate-100' : 'text-slate-500')}>
                {{ month: 'Месяц', ytd: 'YTD', year: 'Год', overall: 'Обзор' }[mode]}
              </button>
            ))}
          </div>
          <button onClick={toggleAll} className="btn-secondary text-xs flex items-center gap-1.5">
            <ChevronsUpDown className="w-4 h-4" />{allExpanded ? 'Свернуть' : 'Развернуть'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className={cn('card-hover text-center', (kpiValues.cf_operating || 0) >= 0 ? 'bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20' : 'bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20')}>
          <div className="stat-label">Операционный CF</div>
          <div className={cn('stat-value text-lg', colorCF(kpiValues.cf_operating))}>{fmtM(kpiValues.cf_operating)}</div>
        </div>
        <div className={cn('card-hover text-center', (kpiValues.cf_investing || 0) >= 0 ? 'bg-gradient-to-br from-green-500/10 to-transparent border-green-500/20' : 'bg-gradient-to-br from-orange-500/10 to-transparent border-orange-500/20')}>
          <div className="stat-label">Инвестиционный CF</div>
          <div className={cn('stat-value text-lg', (kpiValues.cf_investing || 0) >= 0 ? 'text-green-400' : 'text-orange-400')}>{fmtM(kpiValues.cf_investing)}</div>
        </div>
        <div className={cn('card-hover text-center', (kpiValues.cf_financing || 0) >= 0 ? 'bg-gradient-to-br from-blue-500/10 to-transparent border-blue-500/20' : 'bg-gradient-to-br from-purple-500/10 to-transparent border-purple-500/20')}>
          <div className="stat-label">Финансовый CF</div>
          <div className={cn('stat-value text-lg', (kpiValues.cf_financing || 0) >= 0 ? 'text-blue-400' : 'text-purple-400')}>{fmtM(kpiValues.cf_financing)}</div>
        </div>
        <div className={cn('card-hover text-center', (kpiValues.cf_net_change || 0) >= 0 ? 'bg-gradient-to-br from-brand-500/10 to-transparent border-brand-500/20' : 'bg-gradient-to-br from-red-500/10 to-transparent border-red-500/20')}>
          <div className="stat-label">Чистое изменение</div>
          <div className={cn('stat-value text-lg', colorCF(kpiValues.cf_net_change))}>{fmtM(kpiValues.cf_net_change)}</div>
        </div>
      </div>

      {/* Vertical table (month / ytd) */}
      {!isMultiPeriod && (
        <div className="card p-0 divide-y divide-slate-800">
          {STRUCTURE.map((line, idx) => {
            if (!isVisible(line, idx)) return null
            const val = values[line.key] || 0
            const isGroup = line.calc === 'sum_children'
            const isNet = line.calc === 'net'
            const isL0 = line.level === 0

            if (isNet) {
              return (
                <div key={line.key} className={cn('flex items-center justify-between px-4 py-3', val >= 0 ? 'bg-green-500/5' : 'bg-red-500/5')}>
                  <span className="text-sm font-display font-bold">{line.label}</span>
                  <span className={cn('font-mono text-base font-bold', colorCF(val))}>{fmtCF(val)}</span>
                </div>
              )
            }

            if (isL0 && isGroup) {
              const sectionColor = line.section === 'operating' ? (val >= 0 ? 'text-green-400' : 'text-red-400')
                : line.section === 'investing' ? 'text-orange-400'
                : 'text-purple-400'
              return (
                <button key={line.key} onClick={() => toggleSection(line.key)}
                  className="flex items-center justify-between w-full text-left px-4 py-3 bg-slate-900/50 hover:bg-slate-900/70 transition-colors">
                  <div className="flex items-center gap-2">
                    {collapsed[line.key] ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                    <span className={cn('text-sm font-bold', sectionColor)}>{line.label}</span>
                  </div>
                  <span className={cn('font-mono text-sm font-bold', sectionColor)}>{fmtCF(val)}</span>
                </button>
              )
            }

            if (isGroup && !isL0) {
              return (
                <button key={line.key} onClick={() => toggleSection(line.key)}
                  className="flex items-center justify-between w-full text-left px-4 py-2.5 pl-6 hover:bg-slate-800/30 transition-colors">
                  <div className="flex items-center gap-2">
                    {collapsed[line.key] ? <ChevronRight className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                    <span className="text-sm font-semibold text-slate-300">{line.label}</span>
                  </div>
                  <span className={cn('font-mono text-sm font-semibold', colorCF(val))}>{fmtCF(val)}</span>
                </button>
              )
            }

            // Leaf
            const padClass = line.level === 1 ? 'pl-8' : 'pl-12'
            return (
              <div key={line.key} className={cn('flex items-center justify-between px-4 py-2', padClass)}>
                <span className="text-sm text-slate-400">{line.label}</span>
                <span className={cn('font-mono text-sm', colorCF(val))}>{fmtCF(val)}</span>
              </div>
            )
          })}
        </div>
      )}

      {/* Horizontal table (year / overall mode) */}
      {isMultiPeriod && multiPeriodData && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: viewMode === 'year' ? 1400 : 900 }}>
            <thead>
              <tr>
                <th className="table-header text-left sticky left-0 bg-slate-900 z-10 min-w-[220px]">Статья</th>
                {multiPeriodData.map(col => (
                  <th key={col.label} className={cn('table-header text-right min-w-[85px]', (col.isTotal || col.isAvg) && 'bg-slate-800/50 font-bold')}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STRUCTURE.map((line, idx) => {
                if (!isVisible(line, idx)) return null
                const isGroup = line.calc === 'sum_children'
                const isNet = line.calc === 'net'
                const isL0 = line.level === 0

                const padClass = line.level === 0 ? '' : line.level === 1 ? 'pl-4' : 'pl-8'
                let rowClass = ''
                if (isL0) rowClass = 'bg-slate-900/50 font-bold'
                if (isNet) rowClass = 'bg-blue-500/5 font-bold'

                return (
                  <tr key={line.key} className={cn('hover:bg-slate-800/30', rowClass)}>
                    <td className={cn('table-cell sticky left-0 bg-slate-900 z-10', padClass)}>
                      {isGroup ? (
                        <button onClick={() => toggleSection(line.key)} className="flex items-center gap-1 w-full">
                          {collapsed[line.key] ? <ChevronRight className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                          <span className={cn('text-sm', isL0 ? 'font-bold' : 'font-semibold')}>{line.label}</span>
                        </button>
                      ) : (
                        <span className={cn('text-sm', isNet ? 'font-bold' : 'text-slate-400')}>{line.label}</span>
                      )}
                    </td>
                    {multiPeriodData.map(col => {
                      const val = col.values[line.key] || 0
                      const display = val ? fmtK(val) : '—'
                      return (
                        <td key={col.label}
                          className={cn('table-cell text-right font-mono text-xs', colorCF(val), (col.isTotal || col.isAvg) && 'bg-slate-800/50 font-bold')}
                          title={val ? fmt(val) : ''}>
                          {display}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Data Sources */}
      <div className="card border-blue-500/20 bg-blue-500/5">
        <div className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2"><Info className="w-4 h-4" /> Источники данных</div>
        <div className="text-xs text-slate-400 space-y-1">
          <p><FileText className="w-3 h-3 inline mr-1" /> <b className="text-slate-300">Ежедневные отчёты ({dailyReports.length}):</b> Наличная выручка, кассовые расходы, инкассация</p>
          <p><Upload className="w-3 h-3 inline mr-1" /> <b className="text-slate-300">Банковская выписка ({bankTx.length}):</b> Безналичные поступления и расходы по категориям</p>
          <p><Wallet className="w-3 h-3 inline mr-1" /> <b className="text-slate-300">Инвестиции ({investorTx.length}):</b> Дивиденды, взносы учредителей</p>
          <p>Cash Flow рассчитывается <b className="text-slate-300">прямым методом</b> на основе фактического движения денежных средств.</p>
        </div>
      </div>
    </div>
  )
}
