import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { fetchAll } from '@/lib/fetchAll'
import { useAuthStore } from '@/lib/store'
import { cn, fmtK, MONTHS_RU, linearRegression, money } from '@/lib/utils'
import { yearsRange } from '@/lib/dates'
import { BarChart2, TrendingUp, TrendingDown, ArrowRight, AlertTriangle, Calendar } from 'lucide-react'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine, Legend, ComposedChart, Area
} from 'recharts'
import { FOOD_COST_BANDS, THRESHOLDS, departmentLabel, currencySymbol, locale } from '@/lib/config'
import { monthlyTrends, expenseAnomalies } from '@/lib/analyticsCompute'

// Доля в подпись графика: 0.35 → «35%»
const pctLabel = (v) => `${Math.round(v * 100)}%`

const WEEKDAYS_RU = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const WEEKDAYS_ORDER = [1, 2, 3, 4, 5, 6, 0] // Mon–Sun

const chartTooltipStyle = {
  background: '#172033', border: '1px solid #293548', borderRadius: 12, fontSize: 12
}

export default function AnalyticsPage() {
  const { hasPermission } = useAuthStore()
  const [allReports, setAllReports] = useState([])
  const [pnlData, setPnlData] = useState([])
  const [bankTx, setBankTx] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [drRes, pnlRes, btRes] = await Promise.all([
        fetchAll(() => supabase.from('daily_reports').select('*').eq('status', 'submitted').order('id')),
        fetchAll(() => supabase.from('pnl_data').select('*').order('id')),
        fetchAll(() => supabase.from('bank_transactions').select('*').order('id')),
      ])
      setAllReports(drRes)
      setPnlData(pnlRes)
      setBankTx(btRes)
      setLoading(false)
    }
    load()
  }, [])

  // ====== 3.1 Revenue Trends (last 90 days) ======
  const revenueTrends = useMemo(() => {
    if (!allReports.length) return { data: [], trend: 'stable', slope: 0 }

    const now = new Date()
    const d90 = new Date(now); d90.setDate(d90.getDate() - 90)
    const recent = allReports.filter(r => new Date(r.report_date) >= d90)
      .map(r => ({
        date: r.report_date,
        revenue: r.total_revenue || 0,
        dow: new Date(r.report_date + 'T12:00:00').getDay()
      }))

    // Rolling 7-day average
    const data = recent.map((r, i) => {
      const window = recent.slice(Math.max(0, i - 6), i + 1)
      const avg7 = Math.round(window.reduce((s, x) => s + x.revenue, 0) / window.length)
      const isWeekend = r.dow === 5 || r.dow === 6
      return { ...r, avg7, isWeekend, label: r.date.slice(5) }
    })

    // Trend: last 30 vs previous 30
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30)
    const d60 = new Date(now); d60.setDate(d60.getDate() - 60)
    const last30 = allReports.filter(r => new Date(r.report_date) >= d30)
    const prev30 = allReports.filter(r => {
      const d = new Date(r.report_date)
      return d >= d60 && d < d30
    })

    const avgLast = last30.length > 0 ? last30.reduce((s, r) => s + (r.total_revenue || 0), 0) / last30.length : 0
    const avgPrev = prev30.length > 0 ? prev30.reduce((s, r) => s + (r.total_revenue || 0), 0) / prev30.length : 0
    const changePct = avgPrev > 0 ? ((avgLast - avgPrev) / avgPrev) * 100 : 0

    const points = last30.map((r, i) => ({ x: i, y: r.total_revenue || 0 }))
    const reg = linearRegression(points)

    let trend = 'stable'
    if (changePct > 5) trend = 'up'
    else if (changePct < -5) trend = 'down'

    return { data, trend, changePct, avgLast: Math.round(avgLast), avgPrev: Math.round(avgPrev), slope: reg.slope }
  }, [allReports])

  // ====== 3.2 Weekday Performance ======
  const weekdayPerf = useMemo(() => {
    if (!allReports.length) return []
    const now = new Date()
    const d30 = new Date(now); d30.setDate(d30.getDate() - 30)
    const d90 = new Date(now); d90.setDate(d90.getDate() - 90)

    return WEEKDAYS_ORDER.map(dow => {
      const all = allReports.filter(r => new Date(r.report_date + 'T12:00:00').getDay() === dow)
      const last30 = all.filter(r => new Date(r.report_date) >= d30)
      const last90 = all.filter(r => new Date(r.report_date) >= d90)
      const avg = (arr) => arr.length ? Math.round(arr.reduce((s, r) => s + (r.total_revenue || 0), 0) / arr.length) : 0
      return {
        day: WEEKDAYS_RU[dow],
        allTime: avg(all),
        d30: avg(last30),
        d90: avg(last90),
        count: all.length
      }
    })
  }, [allReports])

  const friAvg = weekdayPerf.find(w => w.day === 'Пт')?.allTime || 1
  const bestDay = weekdayPerf.reduce((best, w) => w.allTime > (best?.allTime || 0) ? w : best, null)
  const weakDay = weekdayPerf.reduce((weak, w) => (w.allTime < (weak?.allTime || Infinity) && w.allTime > 0) ? w : weak, null)

  // ====== 3.3–3.5 Food cost, ФОТ, аномалии — той же формулой, что P&L (BR-RPT-023) ======
  const monthLabel = (t) => `${MONTHS_RU[t.month - 1].slice(0, 3)} ${String(t.year).slice(2)}`
  const trends = useMemo(() => (
    monthlyTrends({ reports: allReports, bankTx, adjustments: pnlData, years: yearsRange() })
      .map(t => ({ ...t, label: monthLabel(t) }))
  ), [allReports, pnlData, bankTx])
  const fcTrend = trends
  const payrollTrend = trends
  const anomalies = useMemo(() => expenseAnomalies({ reports: allReports, bankTx, adjustments: pnlData }), [allReports, bankTx, pnlData])

  // ====== 3.6 Cash Discrepancy Tracker ======
  const discrepancyData = useMemo(() => {
    const monthlyDisc = {}
    const worstDays = []

    allReports.forEach(r => {
      const disc = Math.abs(r.cash_discrepancy || 0)
      if (disc > 0) {
        const key = r.report_date.slice(0, 7)
        monthlyDisc[key] = (monthlyDisc[key] || 0) + disc
        worstDays.push({ date: r.report_date, discrepancy: r.cash_discrepancy || 0, manager: r.manager_name })
      }
    })

    const monthly = Object.entries(monthlyDisc)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, val]) => {
        const [y, m] = key.split('-')
        return { label: `${MONTHS_RU[parseInt(m) - 1].slice(0, 3)} ${y.slice(2)}`, value: val }
      })

    const top10 = worstDays
      .sort((a, b) => Math.abs(b.discrepancy) - Math.abs(a.discrepancy))
      .slice(0, 10)

    // Trend
    const recent6 = monthly.slice(-6)
    const first3 = recent6.slice(0, 3)
    const last3 = recent6.slice(-3)
    const avgFirst = first3.length ? first3.reduce((s, d) => s + d.value, 0) / first3.length : 0
    const avgLast = last3.length ? last3.reduce((s, d) => s + d.value, 0) / last3.length : 0
    const trend = avgLast < avgFirst ? 'improving' : avgLast > avgFirst ? 'worsening' : 'stable'

    return { monthly, top10, trend }
  }, [allReports])

  // ====== 3.7 Revenue Seasonality Heatmap ======
  const seasonality = useMemo(() => {
    const grid = {} // { 'YYYY': { 0..11: revenue } }
    const years = yearsRange()

    years.forEach(y => { grid[y] = {} })

    allReports.forEach(r => {
      const d = new Date(r.report_date)
      const y = d.getFullYear()
      const m = d.getMonth()
      if (grid[y]) {
        grid[y][m] = (grid[y][m] || 0) + (r.total_revenue || 0)
      }
    })

    // Also check pnl_data for historical
    pnlData.filter(a => a.type === 'historical' && a.category?.startsWith('rev_')).forEach(h => {
      if (grid[h.year] && !grid[h.year][h.month - 1]) {
        grid[h.year][h.month - 1] = (grid[h.year][h.month - 1] || 0) + (Number(h.amount) || 0)
      }
    })

    // Find global min/max for color scaling
    let allValues = []
    years.forEach(y => {
      Object.values(grid[y]).forEach(v => { if (v > 0) allValues.push(v) })
    })
    const minVal = allValues.length ? Math.min(...allValues) : 0
    const maxVal = allValues.length ? Math.max(...allValues) : 1

    return { grid, years, minVal, maxVal }
  }, [allReports, pnlData])

  const getHeatColor = (val, min, max) => {
    if (!val || val === 0) return 'bg-slate-800/30 text-slate-600'
    const ratio = max > min ? (val - min) / (max - min) : 0.5
    if (ratio >= 0.75) return 'bg-green-500/30 text-green-300'
    if (ratio >= 0.5) return 'bg-green-500/15 text-green-400'
    if (ratio >= 0.25) return 'bg-yellow-500/15 text-yellow-400'
    return 'bg-red-500/15 text-red-400'
  }

  // Проверка прав ПОСЛЕ всех хуков (Rules of Hooks)
  if (!hasPermission('dashboard.view')) {
    return <div className="text-center text-slate-500 py-20">Нет доступа</div>
  }

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка аналитики...</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Аналитика</h1>
        <p className="text-sm text-slate-500 mt-1">Тренды, аномалии и паттерны · {allReports.length} отчётов</p>
      </div>

      {/* 3.1 Revenue Trends */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300">Тренды выручки (последние 90 дней)</h2>
          <div className="flex items-center gap-2">
            {revenueTrends.trend === 'up' && <span className="badge bg-green-500/10 text-green-400 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Рост {revenueTrends.changePct > 0 ? `+${revenueTrends.changePct.toFixed(1)}%` : ''}</span>}
            {revenueTrends.trend === 'down' && <span className="badge bg-red-500/10 text-red-400 flex items-center gap-1"><TrendingDown className="w-3 h-3" /> Спад {revenueTrends.changePct.toFixed(1)}%</span>}
            {revenueTrends.trend === 'stable' && <span className="badge bg-slate-500/10 text-slate-400 flex items-center gap-1"><ArrowRight className="w-3 h-3" /> Стабильно</span>}
          </div>
        </div>
        <div className="flex gap-4 mb-4 text-xs text-slate-500">
          <span>Средняя (30 дней): <b className="text-slate-300">{fmtK(revenueTrends.avgLast)} {currencySymbol()}/день</b></span>
          <span>Предыдущие 30: <b className="text-slate-400">{fmtK(revenueTrends.avgPrev)} {currencySymbol()}/день</b></span>
        </div>
        {revenueTrends.data.length > 0 && (
          <ResponsiveContainer width="100%" height={280}>
            <ComposedChart data={revenueTrends.data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} interval={6} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => fmtK(v)} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [money(v)]} labelStyle={{ color: '#94a3b8' }} />
              <Bar dataKey="revenue" fill="#22c55e" opacity={0.4} radius={[2, 2, 0, 0]} name="Выручка" />
              <Line type="monotone" dataKey="avg7" stroke="#3b82f6" strokeWidth={2} dot={false} name="7-дн. среднее" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* 3.2 Weekday Performance */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300">Выручка по дням недели</h2>
          <div className="text-xs text-slate-500 flex items-center gap-3">
            {bestDay && <span>Лучший: <b className="text-green-400">{bestDay.day}</b></span>}
            {weakDay && <span>Слабый: <b className="text-red-400">{weakDay.day}</b></span>}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={weekdayPerf} margin={{ top: 15, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => fmtK(v)} />
            <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [money(v)]} labelStyle={{ color: '#94a3b8' }} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="allTime" fill="#22c55e" opacity={0.3} radius={[3, 3, 0, 0]} name="Всё время" />
            <Bar dataKey="d90" fill="#3b82f6" opacity={0.5} radius={[3, 3, 0, 0]} name="90 дней" />
            <Bar dataKey="d30" fill="#f59e0b" radius={[3, 3, 0, 0]} name="30 дней" />
          </BarChart>
        </ResponsiveContainer>
        {friAvg > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            {weekdayPerf.map(w => (
              <span key={w.day} className={cn('px-2 py-1 rounded-lg', w.allTime >= friAvg * 0.9 ? 'bg-green-500/10 text-green-400' : 'bg-slate-800 text-slate-500')}>
                {w.day}: {friAvg > 0 ? Math.round(w.allTime / friAvg * 100) : 0}% от Пт
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 3.3 Food Cost % Trend */}
      {fcTrend.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Food Cost % (помесячно)</h2>
            {fcTrend.some(m => m.anomaly) && (
              <span className="badge bg-red-500/10 text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> Аномалия (&gt;{pctLabel(FOOD_COST_BANDS.critical)})
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={fcTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} interval={2} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={[0, 60]} tickFormatter={v => v + '%'} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [v.toFixed(1) + '%']} labelStyle={{ color: '#94a3b8' }} />
              <ReferenceLine y={FOOD_COST_BANDS.target * 100} stroke="#22c55e" strokeDasharray="5 5" label={{ value: pctLabel(FOOD_COST_BANDS.target), fill: '#22c55e', fontSize: 10 }} />
              <ReferenceLine y={FOOD_COST_BANDS.warn * 100} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: pctLabel(FOOD_COST_BANDS.warn), fill: '#f59e0b', fontSize: 10 }} />
              <ReferenceLine y={FOOD_COST_BANDS.critical * 100} stroke="#ef4444" strokeDasharray="5 5" label={{ value: pctLabel(FOOD_COST_BANDS.critical), fill: '#ef4444', fontSize: 10 }} />
              <Line type="monotone" dataKey="fcTotal" stroke="#f59e0b" strokeWidth={2} dot={false} name="Итого FC%" />
              <Line type="monotone" dataKey="fcKitchen" stroke="#22c55e" strokeWidth={1.5} dot={false} name={departmentLabel('kitchen')} />
              <Line type="monotone" dataKey="fcBar" stroke="#3b82f6" strokeWidth={1.5} dot={false} name={departmentLabel('bar')} />
              <Line type="monotone" dataKey="fcHookah" stroke="#a855f7" strokeWidth={1.5} dot={false} name={departmentLabel('hookah')} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 3.4 Payroll % Trend */}
      {payrollTrend.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">ФОТ % от выручки (помесячно)</h2>
            {payrollTrend.some(m => m.alert) && (
              <span className="badge bg-red-500/10 text-red-400 flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" /> &gt;{pctLabel(THRESHOLDS.payrollShareAlert)}
              </span>
            )}
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={payrollTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} interval={2} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} domain={[0, 50]} tickFormatter={v => v + '%'} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [v.toFixed(1) + '%']} labelStyle={{ color: '#94a3b8' }} />
              <ReferenceLine y={THRESHOLDS.payrollShareTarget * 100} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: pctLabel(THRESHOLDS.payrollShareTarget), fill: '#f59e0b', fontSize: 10 }} />
              <ReferenceLine y={THRESHOLDS.payrollShareAlert * 100} stroke="#ef4444" strokeDasharray="5 5" label={{ value: pctLabel(THRESHOLDS.payrollShareAlert), fill: '#ef4444', fontSize: 10 }} />
              <Line type="monotone" dataKey="payrollPct" stroke="#818cf8" strokeWidth={2} dot={false} name="ФОТ %" />
              <Legend wrapperStyle={{ fontSize: 11 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* 3.5 Expense Anomaly Detection */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300">Детекция аномалий расходов</h2>
          <span className="text-xs text-slate-500">Текущий месяц vs 12-мес среднее</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr>
                <th className="table-header">Категория</th>
                <th className="table-header text-right">12-мес среднее</th>
                <th className="table-header text-right">Текущий месяц</th>
                <th className="table-header text-right">Отклонение (σ)</th>
                <th className="table-header text-center">Статус</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map(a => (
                <tr key={a.label} className={cn('hover:bg-slate-800/30', a.isAnomaly && 'bg-red-500/5')}>
                  <td className="table-cell text-slate-100 font-medium">{a.label}</td>
                  <td className="table-cell text-right font-mono text-slate-400">{money(a.mean)}</td>
                  <td className="table-cell text-right font-mono text-slate-300">{money(a.current)}</td>
                  <td className={cn('table-cell text-right font-mono', Number(a.deviation) > 1.5 ? 'text-red-400' : 'text-slate-400')}>
                    {a.deviation > 0 ? '+' : ''}{a.deviation}σ
                  </td>
                  <td className="table-cell text-center">
                    {a.isAnomaly
                      ? <span className="badge bg-red-500/10 text-red-400">Аномалия</span>
                      : <span className="badge bg-green-500/10 text-green-400">Норма</span>
                    }
                  </td>
                </tr>
              ))}
              {anomalies.length === 0 && (
                <tr><td colSpan={5} className="table-cell text-center text-slate-500 py-6">Недостаточно данных</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3.6 Cash Discrepancy Tracker */}
      {discrepancyData.monthly.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-300">Расхождения кассы</h2>
            <span className={cn('badge flex items-center gap-1',
              discrepancyData.trend === 'improving' ? 'bg-green-500/10 text-green-400' :
              discrepancyData.trend === 'worsening' ? 'bg-red-500/10 text-red-400' :
              'bg-slate-500/10 text-slate-400')}>
              {discrepancyData.trend === 'improving' ? 'Улучшается' : discrepancyData.trend === 'worsening' ? 'Ухудшается' : 'Стабильно'}
            </span>
          </div>

          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={discrepancyData.monthly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="label" tick={{ fill: '#64748b', fontSize: 9 }} interval={2} />
              <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => fmtK(v)} />
              <Tooltip contentStyle={chartTooltipStyle} formatter={(v) => [money(v)]} labelStyle={{ color: '#94a3b8' }} />
              <Bar dataKey="value" fill="#ef4444" opacity={0.6} radius={[3, 3, 0, 0]} name="|Расхождение|" />
            </BarChart>
          </ResponsiveContainer>

          {discrepancyData.top10.length > 0 && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold text-slate-400 mb-2">Топ-10 худших дней</h3>
              <div className="space-y-1">
                {discrepancyData.top10.map((d, i) => (
                  <div key={i} className="flex items-center justify-between text-xs bg-slate-900/50 rounded-lg px-3 py-1.5">
                    <span className="text-slate-400">{new Date(d.date + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short', year: 'numeric' })} — {d.manager || '—'}</span>
                    <span className="font-mono text-red-400 font-semibold">{money(d.discrepancy)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3.7 Revenue Seasonality Heatmap */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-slate-300">Сезонность выручки</h2>
          <div className="flex items-center gap-2 text-2xs text-slate-500">
            <span className="inline-block w-3 h-3 rounded bg-red-500/15" /> Низкая
            <span className="inline-block w-3 h-3 rounded bg-yellow-500/15" /> Средняя
            <span className="inline-block w-3 h-3 rounded bg-green-500/15" /> Высокая
            <span className="inline-block w-3 h-3 rounded bg-green-500/30" /> Пик
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="table-header text-left">Месяц</th>
                {seasonality.years.map(y => (
                  <th key={y} className="table-header text-right">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {MONTHS_RU.map((monthName, mi) => (
                <tr key={mi} className="hover:bg-slate-800/20">
                  <td className="table-cell text-slate-400 text-xs">{monthName}</td>
                  {seasonality.years.map(y => {
                    const val = seasonality.grid[y]?.[mi] || 0
                    return (
                      <td key={y} className={cn('table-cell text-right font-mono text-xs', getHeatColor(val, seasonality.minVal, seasonality.maxVal))}
                        title={val ? money(val) : ''}>
                        {val > 0 ? fmtK(val) : '—'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
