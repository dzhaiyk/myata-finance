import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/fetchAll'
import { useAuthStore } from '@/lib/store'
import { cn, fmt, fmtK, MONTHS_RU, money } from '@/lib/utils'
import { isPnlCategory } from '@/lib/categories'
import { yearsRange } from '@/lib/dates'
import { computeMonthValues, sumMonths, pnlLabel } from '@/lib/pnlCompute'
import { getPnlStructure } from '@/lib/pnlStructure'
import { foodCostLevel, marginLevel, currencySymbol, locale } from '@/lib/config'
import { ChevronDown, ChevronRight, Plus, Trash2, Info, FileText, Upload, ChevronsUpDown, Pencil, Save, AlertCircle } from 'lucide-react'

// Цвет показателя по уровню из config: зелёный / жёлтый / красный (BR-RPT-018)
const LEVEL_CLASS = { green: 'text-green-400', yellow: 'text-yellow-400', red: 'text-red-400' }

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

// P&L structure matching the restaurant's actual format
// Each line: { key, label, level (0=header,1=group,2=sub), source, calc }
// source: 'daily:field' | 'bank:category_code' | 'calc' | 'manual'

export default function PnLPage() {
  // структура из базы; скрытые строки остаются в расчёте, но не рисуются
  const STRUCTURE = getPnlStructure().filter(l => !l.hidden)
  // Просмотр закрыт маршрутом (pnl.view), ручные корректировки — правом pnl.edit (BR-ACS-004)
  const { hasPermission, profile } = useAuthStore()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [viewMode, setViewMode] = useState('month')
  const [dailyReports, setDailyReports] = useState([])
  const [bankTx, setBankTx] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(true)
  const [allExpanded, setAllExpanded] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    const c = {}
    // Level 0 (ДОХОДЫ, РАСХОДЫ) — развёрнуты
    // Level 1 (CapEx, OpEx) — развёрнуты
    // Level 2 (ФОТ, Food cost, Маркетинг...) — свёрнуты
    STRUCTURE.filter(l => l.level === 2 && l.calc === 'sum_children').forEach(l => { c[l.key] = true })
    return c
  })
  const [editMode, setEditMode] = useState(false)
  const [adjEdits, setAdjEdits] = useState({}) // { [pnl_key]: string amount }

  useEffect(() => { loadData() }, [year, month, viewMode])

  const loadData = async () => {
    setLoading(true)
    if (viewMode === 'year') {
      const startDate = `${year}-01-01`
      const endDate = `${year}-12-31`
      const [drRes, btRes, adjRes] = await Promise.all([
        fetchAll(() => supabase.from('daily_reports').select('*').gte('report_date', startDate).lte('report_date', endDate).eq('status', 'submitted').order('id')),
        fetchAll(() => supabase.from('bank_transactions').select('*').or(`and(transaction_date.gte.${startDate},transaction_date.lte.${endDate}),and(period_from.lte.${endDate},period_to.gte.${startDate})`).order('id')),
        fetchAll(() => supabase.from('pnl_data').select('*').eq('year', year).order('id')),
      ])
      setDailyReports(drRes)
      setBankTx(btRes)
      setAdjustments(adjRes)
    } else if (viewMode === 'overall') {
      const [drRes, btRes, adjRes] = await Promise.all([
        fetchAll(() => supabase.from('daily_reports').select('*').eq('status', 'submitted').order('id')),
        fetchAll(() => supabase.from('bank_transactions').select('*').order('id')),
        fetchAll(() => supabase.from('pnl_data').select('*').order('id')),
      ])
      setDailyReports(drRes)
      setBankTx(btRes)
      setAdjustments(adjRes)
    } else {
      const startDate = viewMode === 'ytd' ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`
      const endMonth = month // YTD — до выбранного месяца включительно, не до декабря
      const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${new Date(year, endMonth, 0).getDate()}`
      const [drRes, btRes, adjRes] = await Promise.all([
        fetchAll(() => supabase.from('daily_reports').select('*').gte('report_date', startDate).lte('report_date', endDate).eq('status', 'submitted').order('id')),
        fetchAll(() => supabase.from('bank_transactions').select('*').or(
          `and(transaction_date.gte.${startDate},transaction_date.lte.${endDate}),and(period_from.lte.${endDate},period_to.gte.${startDate})`
        ).order('id')),
        fetchAll(() => supabase.from('pnl_data').select('*').eq('year', year).gte('month', viewMode === 'ytd' ? 1 : month).lte('month', endMonth).order('id')),
      ])
      setDailyReports(drRes)
      setBankTx(btRes)
      setAdjustments(adjRes)
    }
    setLoading(false)
  }

  // ===== COMPUTE ALL P&L VALUES (month / ytd) =====
  // Считаем помесячно той же функцией computeMonthValues, что и режимы «Год»/«Обзор»:
  // единая логика historical/live (без двойного счёта), YTD = январь..выбранный месяц
  // (согласовано с Cash Flow; раньше YTD захватывал будущие месяцы до декабря)
  const values = useMemo(() => {
    if (viewMode === 'year' || viewMode === 'overall') return {}
    const startMonth = viewMode === 'ytd' ? 1 : month
    const totals = {}
    for (let m = startMonth; m <= month; m++) {
      const mv = computeMonthValues(year, m, dailyReports, bankTx, adjustments)
      STRUCTURE.forEach(line => { totals[line.key] = (totals[line.key] || 0) + (mv[line.key] || 0) })
    }
    // Ratios пересчитываются от суммарных значений (а не суммой процентов)
    totals.margin_pct = totals.revenue > 0 ? totals.op_profit / totals.revenue : 0
    totals.fc_pct = totals.revenue > 0 ? totals.foodcost / totals.revenue : 0
    totals.fc_kitchen_pct = totals.rev_kitchen > 0 ? totals.fc_kitchen / totals.rev_kitchen : 0
    totals.fc_bar_pct = totals.rev_bar > 0 ? totals.fc_bar / totals.rev_bar : 0
    totals.fc_hookah_pct = totals.rev_hookah > 0 ? totals.fc_hookah / totals.rev_hookah : 0
    return totals
  }, [dailyReports, bankTx, adjustments, year, month, viewMode])

  // Compute PnL values for a single month — единая логика для ВСЕХ режимов
  // (function declaration — hoisted, вызывается из values-memo выше по файлу)
  // Multi-period data for year/overall modes
  const multiPeriodData = useMemo(() => {
    if (viewMode !== 'year' && viewMode !== 'overall') return null

    if (viewMode === 'year') {
      const columns = Array.from({ length: 12 }, (_, i) => ({
        label: MONTHS_RU[i].slice(0, 3),
        values: computeMonthValues(year, i + 1, dailyReports, bankTx, adjustments)
      }))
      // Add totals column
      const totals = {}
      STRUCTURE.forEach(line => {
        totals[line.key] = columns.reduce((s, col) => s + (col.values[line.key] || 0), 0)
      })
      totals.margin_pct = totals.revenue > 0 ? totals.op_profit / totals.revenue : 0
      totals.fc_pct = totals.revenue > 0 ? totals.foodcost / totals.revenue : 0
      totals.fc_kitchen_pct = totals.rev_kitchen > 0 ? totals.fc_kitchen / totals.rev_kitchen : 0
      totals.fc_bar_pct = totals.rev_bar > 0 ? totals.fc_bar / totals.rev_bar : 0
      totals.fc_hookah_pct = totals.rev_hookah > 0 ? totals.fc_hookah / totals.rev_hookah : 0
      columns.push({ label: 'Итого', values: totals, isTotal: true })
      columns.push({ label: '%', values: totals, isPct: true })
      return columns
    }

    if (viewMode === 'overall') {
      const years = yearsRange()
      const columns = years.map(y => {
        const yearValues = {}
        for (let m = 1; m <= 12; m++) {
          const mv = computeMonthValues(y, m, dailyReports, bankTx, adjustments)
          STRUCTURE.forEach(line => {
            yearValues[line.key] = (yearValues[line.key] || 0) + (mv[line.key] || 0)
          })
        }
        // Recalculate ratios for the year
        yearValues.margin_pct = yearValues.revenue > 0 ? yearValues.op_profit / yearValues.revenue : 0
        yearValues.fc_pct = yearValues.revenue > 0 ? yearValues.foodcost / yearValues.revenue : 0
        yearValues.fc_kitchen_pct = yearValues.rev_kitchen > 0 ? yearValues.fc_kitchen / yearValues.rev_kitchen : 0
        yearValues.fc_bar_pct = yearValues.rev_bar > 0 ? yearValues.fc_bar / yearValues.rev_bar : 0
        yearValues.fc_hookah_pct = yearValues.rev_hookah > 0 ? yearValues.fc_hookah / yearValues.rev_hookah : 0
        return { label: String(y), values: yearValues }
      })
      // Totals
      const totals = {}
      STRUCTURE.forEach(line => {
        totals[line.key] = columns.reduce((s, col) => s + (col.values[line.key] || 0), 0)
      })
      totals.margin_pct = totals.revenue > 0 ? totals.op_profit / totals.revenue : 0
      totals.fc_pct = totals.revenue > 0 ? totals.foodcost / totals.revenue : 0
      totals.fc_kitchen_pct = totals.rev_kitchen > 0 ? totals.fc_kitchen / totals.rev_kitchen : 0
      totals.fc_bar_pct = totals.rev_bar > 0 ? totals.fc_bar / totals.rev_bar : 0
      totals.fc_hookah_pct = totals.rev_hookah > 0 ? totals.fc_hookah / totals.rev_hookah : 0
      columns.push({ label: 'Итого', values: totals, isTotal: true })
      columns.push({ label: '%', values: totals, isPct: true })
      return columns
    }
  }, [viewMode, year, dailyReports, bankTx, adjustments])

  const toggleAll = () => {
    const newState = !allExpanded
    setAllExpanded(newState)
    const c = {}
    STRUCTURE.filter(l => l.calc === 'sum_children').forEach(l => { c[l.key] = !newState })
    setCollapsed(c)
  }
  const toggleSection = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }))

  const startEdit = () => {
    // Pre-fill adjEdits from existing MANUAL adjustments (historical — не корректировки,
    // они входят в базовые значения и не должны дублироваться при сохранении)
    const edits = {}
    adjustments.forEach(a => {
      if (a.type !== 'historical' && a.category) edits[a.category] = String(Number(a.amount) || 0)
    })
    setAdjEdits(edits)
    setEditMode(true)
  }

  const saveEdits = async () => {
    const userName = profile?.full_name || 'Unknown'
    // Delete existing MANUAL adjustments for this month, then insert fresh values.
    // Historical-строки (импорт 2022–2025) не трогаем — раньше они удалялись безвозвратно.
    await supabase.from('pnl_data').delete().eq('year', year).eq('month', month)
      .or('type.is.null,type.neq.historical')
    const inserts = Object.entries(adjEdits)
      .filter(([_, v]) => v !== '' && Number(v) !== 0)
      .map(([key, v]) => {
        const line = STRUCTURE.find(l => l.key === key)
        return { year, month, category: key, type: line?.section === 'revenue' ? 'income' : 'expense', amount: Number(v), description: 'Ручная корректировка', created_by: userName }
      })
    if (inserts.length > 0) {
      await supabase.from('pnl_data').insert(inserts)
    }
    setEditMode(false)
    setAdjEdits({})
    loadData()
  }
  const cancelEdit = () => { setEditMode(false); setAdjEdits({}) }

  const pct = (val, key) => {
    // Food cost subcategories: % from corresponding department revenue
    const fcDeptMap = { fc_kitchen: 'rev_kitchen', fc_bar: 'rev_bar', fc_hookah: 'rev_hookah' }
    const deptKey = fcDeptMap[key]
    if (deptKey) {
      const deptRev = values[deptKey] || 0
      return deptRev > 0 ? ((val / deptRev) * 100).toFixed(1) + '%' : '—'
    }
    return values.revenue > 0 ? ((val / values.revenue) * 100).toFixed(1) + '%' : '—'
  }
  const fmtPct = (val) => (val * 100).toFixed(1) + '%'

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  const periodLabel = viewMode === 'overall' ? 'Все годы' : viewMode === 'year' ? `${year} год` : viewMode === 'ytd' ? `${year} YTD` : `${MONTHS_RU[month - 1]} ${year}`

  // Count period-allocated bank transactions for info display
  const periodAllocatedCount = bankTx.filter(tx => tx.period_from && tx.period_to).length

  // Determine which lines are visible (hidden if any ancestor is collapsed)
  const isVisible = (line, idx) => {
    if (line.level === 0) return true
    // Walk backwards to find all ancestors and check if any are collapsed
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">P&L</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {periodLabel} · {dailyReports.length} отчётов · {bankTx.length} банк. записей
            {periodAllocatedCount > 0 && <span className="text-purple-400"> · {periodAllocatedCount} распредел.</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {viewMode !== 'overall' && (
            <>
              {(viewMode === 'month' || viewMode === 'ytd') && (
                <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input text-sm">
                  {MONTHS_RU.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              )}
              <select value={year} onChange={e => setYear(Number(e.target.value))} className="input text-sm">
                {yearsRange().map(y => <option key={y}>{y}</option>)}
              </select>
            </>
          )}
          <div className="flex bg-slate-900 rounded-lg p-0.5">
            {['month', 'ytd', 'year', 'overall'].map(mode => (
              <button key={mode} onClick={() => setViewMode(mode)}
                className={cn('px-3 py-1.5 rounded-md text-xs font-medium', viewMode === mode ? 'bg-slate-700 text-white' : 'text-slate-500')}>
                {{ month: 'Месяц', ytd: 'YTD', year: 'Год', overall: 'Обзор' }[mode]}
              </button>
            ))}
          </div>
          <button onClick={toggleAll} className="btn-secondary text-xs flex items-center gap-1.5" title={allExpanded ? 'Свернуть всё' : 'Развернуть всё'}>
            <ChevronsUpDown className="w-4 h-4" />{allExpanded ? 'Свернуть' : 'Развернуть'}
          </button>
          {viewMode === 'month' && hasPermission('pnl.edit') && (
            !editMode ? (
              <button onClick={startEdit} className="btn-secondary text-xs flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Редактировать
              </button>
            ) : (
              <div className="flex gap-1.5">
                <button onClick={saveEdits} className="btn-primary text-xs flex items-center gap-1.5">
                  <Save className="w-3.5 h-3.5" /> Сохранить
                </button>
                <button onClick={cancelEdit} className="btn-secondary text-xs">Отмена</button>
              </div>
            )
          )}
        </div>
      </div>

      {/* Месяц без выписки: расходы по банку будут пустыми — предупреждаем прямо,
          иначе пустой P&L выглядит как ошибка приложения */}
      {viewMode === 'month' && !loading && (() => {
        const inMonth = bankTx.filter(tx => {
          const d = new Date(tx.transaction_date)
          return d.getFullYear() === year && d.getMonth() + 1 === month && isPnlCategory(tx.category)
        })
        if (inMonth.length > 0) return null
        return (
          <div className="card border-amber-500/30 bg-amber-500/5 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="text-sm">
              <div className="font-semibold text-amber-300">Выписки за {periodLabel} не загружены</div>
              <div className="text-slate-400 mt-1">
                Аренда, налоги, коммуналка, хозтовары и безналичный закуп приходят из банковской выписки.
                Пока её нет, эти строки пустые. Загрузите выписку на странице «Импорт выписок».
              </div>
            </div>
          </div>
        )
      })()}

      {/* KPI Cards */}
      {(() => {
        const kpiValues = (viewMode === 'year' || viewMode === 'overall')
          ? (multiPeriodData?.find(c => c.isTotal)?.values || {})
          : values
        const fmtM = (v) => (v / 1e6).toFixed(1) + 'М ' + currencySymbol()
        const marginPct = kpiValues.revenue > 0 ? (kpiValues.op_profit / kpiValues.revenue * 100).toFixed(1) : 0
        const marginColor = LEVEL_CLASS[marginLevel(marginPct / 100)]
        return (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="card-hover text-center"><div className="stat-label">Выручка</div><div className="stat-value text-lg text-green-400">{fmtM(kpiValues.revenue || 0)}</div></div>
            <div className="card-hover text-center"><div className="stat-label">Food Cost</div>
              <div className={cn('stat-value text-lg', LEVEL_CLASS[foodCostLevel(kpiValues.fc_pct || 0)])}>{fmtPct(kpiValues.fc_pct || 0)}</div></div>
            <div className="card-hover text-center"><div className="stat-label">ФОТ</div><div className="stat-value text-lg text-blue-400">{kpiValues.revenue > 0 ? (((kpiValues.payroll || 0) / kpiValues.revenue) * 100).toFixed(1) + '%' : '—'}</div></div>
            <div className="card-hover text-center"><div className="stat-label">Маржа</div>
              <div className={cn('stat-value text-lg', marginColor)}>{marginPct}%</div></div>
            <div className="card-hover text-center"><div className="stat-label">Прибыль</div>
              <div className={cn('stat-value text-lg', (kpiValues.net_profit || 0) >= 0 ? 'text-brand-400' : 'text-red-400')}>{fmtM(kpiValues.net_profit || 0)}</div></div>
          </div>
        )
      })()}

      {/* P&L Vertical Table (month/ytd) */}
      {(viewMode === 'month' || viewMode === 'ytd') && (
      <div className="card p-0 divide-y divide-slate-800">
        {STRUCTURE.map((line, idx) => {
          if (!isVisible(line, idx)) return null
          const val = values[line.key] || 0
          const isRatio = line.section === 'ratio'
          const isResult = line.section === 'result'
          const isGroup = line.calc === 'sum_children'
          const isCollapsed = collapsed[line.key]

          // Colors
          let color = ''
          if (line.key === 'revenue' || line.key === 'op_profit' || line.key === 'net_profit') color = val >= 0 ? 'text-green-400' : 'text-red-400'
          else if (line.key === 'expenses' || line.key === 'opex') color = 'text-red-400'
          else if (line.key === 'capex') color = 'text-orange-400'

          if (isResult) {
            return (
              <div key={line.key} className={cn('flex items-center justify-between px-4 py-3', val >= 0 ? 'bg-green-500/5' : 'bg-red-500/5')}>
                <span className="text-sm font-display font-bold">{pnlLabel(line)}</span>
                <div className="flex items-center gap-4">
                  <span className={cn('font-mono text-base font-bold', val >= 0 ? 'text-green-400' : 'text-red-400')}>{money(val)}</span>
                  <span className="text-[10px] text-slate-500 w-12 text-right">{pct(val)}</span>
                </div>
              </div>
            )
          }

          if (isRatio) {
            return (
              <div key={line.key} className={cn('flex items-center justify-between px-4 py-2', line.level === 2 && 'pl-10')}>
                <span className={cn('text-sm', line.level === 0 ? 'font-bold' : 'text-slate-400')}>{pnlLabel(line)}</span>
                <span className={cn('font-mono text-sm', line.key.includes('fc') ? LEVEL_CLASS[foodCostLevel(val)] : 'text-slate-300')}>{fmtPct(val)}</span>
              </div>
            )
          }

          // Header or Group — clickable
          if (isGroup) {
            const padLeft = line.level === 0 ? 'pl-4' : line.level === 1 ? 'pl-6' : 'pl-10'
            return (
              <button key={line.key} onClick={() => toggleSection(line.key)}
                className={cn('flex items-center justify-between w-full text-left px-4 py-3 hover:bg-slate-900/50 transition-colors',
                  line.level === 0 && 'bg-slate-900/50', padLeft)}>
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <span className={cn('text-sm font-bold', color)}>{pnlLabel(line)}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={cn('font-mono text-sm font-bold', color)}>{money(val)}</span>
                  <span className="text-[10px] text-slate-500 w-12 text-right">{pct(val)}</span>
                </div>
              </button>
            )
          }

          // Leaf line
          const leafPad = line.level <= 2 ? 'pl-10' : 'pl-14'
          const adjVal = adjEdits[line.key] || ''
          const hasAdj = adjVal !== '' && Number(adjVal) !== 0
          return (
            <div key={line.key} className={cn('flex items-center justify-between px-4 py-2', leafPad)}>
              <span className="text-sm text-slate-400">{pnlLabel(line)}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-slate-300">{money(val)}</span>
                {editMode && (
                  <input type="text" inputMode="numeric" value={adjVal}
                    onChange={e => setAdjEdits(prev => ({ ...prev, [line.key]: e.target.value.replace(/[^0-9-]/g, '') }))}
                    className="input text-xs font-mono w-24 text-right py-1 px-2"
                    placeholder="±0" />
                )}
                {!editMode && hasAdj && (
                  <span className={cn('font-mono text-xs', Number(adjVal) > 0 ? 'text-green-400' : 'text-red-400')}>
                    {Number(adjVal) > 0 ? '+' : ''}{fmt(Number(adjVal))}
                  </span>
                )}
                <span className="text-[10px] text-slate-500 w-12 text-right">{val > 0 ? pct(val, line.key) : '—'}</span>
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* P&L Horizontal Table (year/overall) */}
      {(viewMode === 'year' || viewMode === 'overall') && multiPeriodData && (
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm" style={{ minWidth: viewMode === 'year' ? 1400 : 900 }}>
            <thead>
              <tr>
                <th className="table-header text-left sticky left-0 bg-slate-900 z-10 min-w-[200px]">Статья</th>
                {multiPeriodData.map(col => (
                  <th key={col.label} className={cn('table-header text-right', col.isPct ? 'min-w-[55px]' : 'min-w-[90px]', (col.isTotal || col.isPct) && 'bg-slate-800/50 font-bold')}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STRUCTURE.map((line, idx) => {
                if (!isVisible(line, idx)) return null
                const isGroup = line.calc === 'sum_children'
                const isResult = line.section === 'result'
                const isRatio = line.section === 'ratio'
                const isCollapsedRow = collapsed[line.key]

                const padClass = line.level === 0 ? '' : line.level === 1 ? 'pl-4' : line.level === 2 ? 'pl-8' : 'pl-12'

                let rowClass = ''
                if (line.level === 0) rowClass = 'bg-slate-900/50 font-bold'
                if (isResult) rowClass = (multiPeriodData[0]?.values[line.key] || 0) >= 0 ? 'bg-green-500/5' : 'bg-red-500/5'

                return (
                  <tr key={line.key} className={cn('hover:bg-slate-800/30', rowClass)}>
                    <td className={cn('table-cell sticky left-0 bg-slate-900 z-10', padClass)}>
                      {isGroup ? (
                        <button onClick={() => toggleSection(line.key)} className="flex items-center gap-1 w-full">
                          {isCollapsedRow ? <ChevronRight className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                          <span className={cn('text-sm', isGroup && 'font-bold')}>{pnlLabel(line)}</span>
                        </button>
                      ) : (
                        <span className={cn('text-sm', isResult ? 'font-bold' : 'text-slate-400')}>{pnlLabel(line)}</span>
                      )}
                    </td>
                    {multiPeriodData.map(col => {
                      const val = col.values[line.key] || 0
                      let display = ''
                      if (col.isPct) {
                        // Show % of revenue
                        const rev = col.values.revenue || 0
                        if (isRatio) display = val ? (val * 100).toFixed(1) + '%' : '\u2014'
                        else if (line.key === 'revenue') display = '100%'
                        else if (rev > 0 && val) display = (val / rev * 100).toFixed(1) + '%'
                        else display = '\u2014'
                      } else if (isRatio) {
                        display = val ? (val * 100).toFixed(1) + '%' : '\u2014'
                      } else {
                        display = val ? fmtK(val) : '\u2014'
                      }

                      let color = 'text-slate-300'
                      if (line.key === 'revenue' || line.key === 'op_profit' || line.key === 'net_profit') color = val >= 0 ? 'text-green-400' : 'text-red-400'
                      else if (line.section === 'expenses' && line.level === 0) color = 'text-red-400'

                      return (
                        <td key={col.label} className={cn('table-cell text-right font-mono text-xs', color, (col.isTotal || col.isPct) && 'bg-slate-800/50 font-bold')}
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

      {/* Adjustment audit log — только ручные корректировки, без historical-импорта */}
      {!editMode && (viewMode === 'month' || viewMode === 'ytd') && adjustments.some(a => a.type !== 'historical') && (
        <div className="card border-purple-500/20 bg-purple-500/5">
          <div className="text-xs font-semibold text-purple-400 mb-3">Лог корректировок ({adjustments.filter(a => a.type !== 'historical').length})</div>
          <div className="space-y-1.5">
            {adjustments.filter(a => a.type !== 'historical').sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).map(a => {
              const catLine = STRUCTURE.find(l => l.key === a.category)
              const dt = a.created_at ? new Date(a.created_at) : null
              return (
                <div key={a.id} className="flex items-center justify-between text-xs bg-slate-900/50 rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('font-mono font-bold shrink-0', Number(a.amount) >= 0 ? 'text-green-400' : 'text-red-400')}>
                      {Number(a.amount) > 0 ? '+' : ''}{fmt(a.amount)}
                    </span>
                    <span className="text-slate-400 truncate">{catLine ? pnlLabel(catLine) : a.category}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-slate-600">
                    {a.created_by && <span>{a.created_by}</span>}
                    {dt && <span>{dt.toLocaleDateString(locale(), { day: '2-digit', month: '2-digit' })} {dt.toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Data Sources */}
      <div className="card border-blue-500/20 bg-blue-500/5">
        <div className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2"><Info className="w-4 h-4" /> Источники данных</div>
        <div className="text-xs text-slate-400 space-y-1">
          <p><FileText className="w-3 h-3 inline mr-1" /> <b className="text-slate-300">Ежедневные отчёты ({dailyReports.length}):</b> Выручка, закуп нал, ЗП авансы нал</p>
          <p><Upload className="w-3 h-3 inline mr-1" /> <b className="text-slate-300">Банковская выписка ({bankTx.length}):</b> Аренда, коммуналка, ФОТ безнал, маркетинг, налоги, комиссии</p>
          {periodAllocatedCount > 0 && (
            <p>📅 <b className="text-purple-300">{periodAllocatedCount} транзакций</b> распределены по периодам (суммы пропорционально разнесены по месяцам)</p>
          )}
          <p>P&L собирается <b className="text-slate-300">автоматически</b>. Ручные корректировки — для редких случаев.</p>
        </div>
      </div>
    </div>
  )
}
