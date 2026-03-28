import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { fmt, fmtK, fmtPct, MONTHS_RU } from '@/lib/utils'
import { TrendingUp, DollarSign, ShoppingCart, AlertTriangle, FileText, Trophy, CalendarDays } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'

export default function DashboardPage() {
  const [year, setYear] = useState(2026)
  const [reports, setReports] = useState([])
  const [allReports, setAllReports] = useState([])
  const [pnl, setPnl] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadData()
  }, [year])

  const loadData = async () => {
    setLoading(true)
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`

    const [reportsRes, pnlRes, allReportsRes] = await Promise.all([
      supabase.from('daily_reports').select('*').gte('report_date', startDate).lte('report_date', endDate).order('report_date'),
      supabase.from('pnl_data').select('*').eq('year', year),
      supabase.from('daily_reports').select('id, report_date, total_revenue, status').eq('status', 'submitted').order('report_date'),
    ])

    setReports(reportsRes.data || [])
    setAllReports(allReportsRes.data || [])
    setPnl(pnlRes.data || [])
    setLoading(false)
  }

  // Calculate KPIs from daily reports
  const totalRevenue = reports.reduce((s, r) => s + (r.total_revenue || 0), 0)
  const totalWithdrawals = reports.reduce((s, r) => s + (r.total_withdrawals || 0), 0)
  const reportCount = reports.length
  const discrepancies = reports.filter(r => Math.abs(r.cash_discrepancy || 0) > 500)

  // Monthly breakdown from reports
  const monthlyData = MONTHS_RU.map((name, i) => {
    const monthReports = reports.filter(r => {
      const m = new Date(r.report_date).getMonth()
      return m === i
    })
    const rev = monthReports.reduce((s, r) => s + (r.total_revenue || 0), 0)
    const exp = monthReports.reduce((s, r) => s + (r.total_withdrawals || 0), 0)
    return { month: name.slice(0, 3), revenue: rev, expenses: exp }
  }).filter(m => m.revenue > 0 || m.expenses > 0)

  // Department breakdown from report data
  const deptTotals = { kitchen: 0, bar: 0, hookah: 0, other: 0 }
  reports.forEach(r => {
    const deps = r.data?.departments || []
    if (Array.isArray(deps)) {
      deps.forEach((d, i) => {
        if (i === 0) deptTotals.kitchen += (Number(d.amount) || 0)
        if (i === 1) deptTotals.bar += (Number(d.amount) || 0)
        if (i === 2) deptTotals.hookah += (Number(d.amount) || 0)
        if (i === 3) deptTotals.other += (Number(d.amount) || 0)
      })
    }
  })

  const deptData = [
    { name: 'Кухня', value: deptTotals.kitchen, color: '#22c55e' },
    { name: 'Бар', value: deptTotals.bar, color: '#3b82f6' },
    { name: 'Кальян', value: deptTotals.hookah, color: '#f59e0b' },
  ].filter(d => d.value > 0)

  // PnL based KPIs
  const pnlByKey = {}
  pnl.forEach(p => {
    if (!pnlByKey[p.category]) pnlByKey[p.category] = 0
    pnlByKey[p.category] += Number(p.amount) || 0
  })

  const pnlRevenue = pnlByKey.total_revenue || totalRevenue
  const pnlCogs = pnlByKey.total_cogs || 0
  const pnlPayroll = pnlByKey.total_payroll || 0
  const fcPct = pnlRevenue > 0 ? pnlCogs / pnlRevenue : 0
  const fotPct = pnlRevenue > 0 ? pnlPayroll / pnlRevenue : 0

  const kpis = [
    { label: 'Выручка (YTD)', value: fmtK(totalRevenue || pnlRevenue), icon: DollarSign, color: 'brand', sub: `${reportCount} отчётов` },
    { label: 'Изъятия (YTD)', value: fmtK(totalWithdrawals), icon: TrendingUp, color: 'mint', sub: 'из кассы' },
    { label: 'Food Cost', value: fcPct > 0 ? fmtPct(fcPct) : '—', icon: ShoppingCart, color: 'yellow', sub: pnlCogs > 0 ? fmtK(pnlCogs) + ' ₸' : 'Нет данных P&L' },
    { label: 'Расхождения', value: discrepancies.length, icon: AlertTriangle, color: discrepancies.length > 0 ? 'red' : 'green', sub: discrepancies.length > 0 ? '⚠️ Проверьте!' : '✅ Всё чисто' },
  ]

  // === RECORDS (all time) ===
  const WEEKDAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
  const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

  // Best single day
  const bestDay = allReports.reduce((best, r) => (!best || (r.total_revenue || 0) > best.total_revenue) ? r : best, null)

  // Best week (Mon-Sun, sliding window by ISO week)
  const weekMap = {}
  allReports.forEach(r => {
    const d = new Date(r.report_date + 'T12:00:00')
    const jan4 = new Date(d.getFullYear(), 0, 4)
    const week = Math.ceil(((d - jan4) / 86400000 + jan4.getDay() + 1) / 7)
    const key = `${d.getFullYear()}-W${String(week).padStart(2, '0')}`
    if (!weekMap[key]) weekMap[key] = { sum: 0, count: 0, dates: [] }
    weekMap[key].sum += r.total_revenue || 0
    weekMap[key].count++
    weekMap[key].dates.push(r.report_date)
  })
  const bestWeek = Object.entries(weekMap).reduce((best, [key, w]) => {
    const avg = w.count > 0 ? w.sum / w.count : 0
    return (!best || avg > best.avg) ? { key, avg, sum: w.sum, count: w.count, from: w.dates[0], to: w.dates[w.dates.length - 1] } : best
  }, null)

  // Best month
  const monthMap = {}
  allReports.forEach(r => {
    const key = r.report_date.slice(0, 7) // YYYY-MM
    if (!monthMap[key]) monthMap[key] = { sum: 0, count: 0 }
    monthMap[key].sum += r.total_revenue || 0
    monthMap[key].count++
  })
  const bestMonth = Object.entries(monthMap).reduce((best, [key, m]) => {
    const avg = m.count > 0 ? m.sum / m.count : 0
    return (!best || avg > best.avg) ? { key, avg, sum: m.sum, count: m.count } : best
  }, null)

  const fmtMonthLabel = (key) => {
    const [y, m] = key.split('-')
    return `${MONTHS_RU[parseInt(m) - 1]} ${y}`
  }

  // Weekday averages (all time)
  const weekdayStats = [1, 2, 3, 4, 5, 6, 0].map(dow => { // Mon-Sun
    const matching = allReports.filter(r => new Date(r.report_date + 'T12:00:00').getDay() === dow)
    const sum = matching.reduce((s, r) => s + (r.total_revenue || 0), 0)
    return { day: WEEKDAYS_RU[dow], short: WEEKDAYS_SHORT[dow], avg: matching.length > 0 ? Math.round(sum / matching.length) : 0, count: matching.length }
  })
  const maxWeekdayAvg = Math.max(...weekdayStats.map(w => w.avg), 1)

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка данных...</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Мята Platinum 4YOU — Финансовый обзор</p>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input text-sm">
          <option value={2026}>2026</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon
          const colors = {
            brand: 'from-brand-500/20 to-brand-600/5 border-brand-500/20',
            mint: 'from-mint-500/20 to-mint-600/5 border-mint-500/20',
            yellow: 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/20',
            green: 'from-green-500/20 to-green-600/5 border-green-500/20',
            red: 'from-red-500/20 to-red-600/5 border-red-500/20',
          }
          return (
            <div key={i} className={`card-hover bg-gradient-to-br ${colors[kpi.color]}`}>
              <div className="flex items-start justify-between mb-3">
                <div className="stat-label">{kpi.label}</div>
                <Icon className="w-4 h-4 text-slate-500" />
              </div>
              <div className="stat-value">{typeof kpi.value === 'number' ? kpi.value : kpi.value}</div>
              <div className="text-xs text-slate-500 mt-2">{kpi.sub}</div>
            </div>
          )
        })}
      </div>

      {/* Charts */}
      {monthlyData.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="card lg:col-span-2">
            <h3 className="text-sm font-semibold text-slate-300 mb-4">Выручка vs Изъятия (помесячно)</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyData} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => fmtK(v)} />
                <Tooltip contentStyle={{ background: '#172033', border: '1px solid #293548', borderRadius: 12, fontSize: 12 }}
                  formatter={(v) => [fmt(v) + ' ₸']} labelStyle={{ color: '#94a3b8' }} />
                <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="Выручка" />
                <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.7} name="Изъятия" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {deptData.length > 0 && (() => {
            const deptTotal = deptData.reduce((s, d) => s + d.value, 0)
            return (
              <div className="card">
                <h3 className="text-sm font-semibold text-slate-300 mb-4">Выручка по отделам</h3>
                <div className="flex items-center gap-4">
                  <div className="shrink-0" style={{ width: 170, height: 170 }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={deptData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={4} dataKey="value">
                          {deptData.map((d, i) => <Cell key={i} fill={d.color} />)}
                        </Pie>
                        <Tooltip formatter={(v) => [fmt(v) + ' ₸']} contentStyle={{ background: '#172033', border: '1px solid #293548', borderRadius: 12, fontSize: 12 }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="space-y-3 flex-1">
                    {deptData.map(d => {
                      const pct = deptTotal > 0 ? (d.value / deptTotal * 100).toFixed(1) : 0
                      return (
                        <div key={d.name}>
                          <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                              <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                              <span className="text-sm text-slate-400">{d.name}</span>
                            </div>
                            <span className="text-sm font-mono font-bold" style={{ color: d.color }}>{pct}%</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color }} />
                            </div>
                            <span className="font-mono text-[10px] text-slate-500 w-16 text-right">{fmtK(d.value)} ₸</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {/* Records */}
      {allReports.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-4 h-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-slate-300">Рекорды</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {bestDay && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Лучшая смена</div>
                <div className="text-lg font-mono font-bold text-yellow-400">{fmt(bestDay.total_revenue)} ₸</div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(bestDay.report_date + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', weekday: 'short' })}
                </div>
              </div>
            )}
            {bestWeek && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Лучшая средняя за неделю</div>
                <div className="text-lg font-mono font-bold text-green-400">{fmt(Math.round(bestWeek.avg))} ₸/день</div>
                <div className="text-xs text-slate-500 mt-1">
                  {new Date(bestWeek.from + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} – {new Date(bestWeek.to + 'T12:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  <span className="text-slate-600 ml-1">({bestWeek.count} смен)</span>
                </div>
              </div>
            )}
            {bestMonth && (
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
                <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Лучшая средняя за месяц</div>
                <div className="text-lg font-mono font-bold text-blue-400">{fmt(Math.round(bestMonth.avg))} ₸/день</div>
                <div className="text-xs text-slate-500 mt-1">
                  {fmtMonthLabel(bestMonth.key)}
                  <span className="text-slate-600 ml-1">({bestMonth.count} смен, итого {fmtK(bestMonth.sum)} ₸)</span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Weekday averages */}
      {allReports.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-4 h-4 text-brand-400" />
            <h3 className="text-sm font-semibold text-slate-300">Средняя выручка по дням недели</h3>
            <span className="text-[10px] text-slate-600 ml-auto">за всё время ({allReports.length} смен)</span>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekdayStats.map(w => (
              <div key={w.day} className="text-center">
                <div className="text-[10px] text-slate-500 mb-2">{w.short}</div>
                <div className="relative h-24 flex items-end justify-center mb-2">
                  <div
                    className="w-full max-w-[40px] rounded-t-lg bg-brand-500/30 border border-brand-500/20 transition-all"
                    style={{ height: `${Math.max((w.avg / maxWeekdayAvg) * 100, 4)}%` }}
                  />
                </div>
                <div className="text-xs font-mono font-semibold text-slate-300">{fmtK(w.avg)}</div>
                <div className="text-[9px] text-slate-600">{w.count} смен</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {reports.length === 0 && (
        <div className="card text-center py-16">
          <FileText className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <div className="text-lg font-semibold text-slate-400">Нет данных за {year}</div>
          <div className="text-sm text-slate-600 mt-1">Начните вводить ежедневные отчёты или импортируйте банковскую выписку</div>
        </div>
      )}

      {/* Cash discrepancy alerts */}
      {discrepancies.length > 0 && (
        <div className="card border-red-500/20 bg-red-500/5">
          <div className="text-sm font-semibold text-red-400 mb-3">⚠️ Расхождения кассы</div>
          <div className="space-y-2">
            {discrepancies.slice(0, 5).map(r => (
              <div key={r.id} className="flex items-center justify-between text-sm">
                <span className="text-slate-400">{r.report_date} — {r.manager_name}</span>
                <span className="font-mono text-red-400 font-semibold">{fmt(r.cash_discrepancy)} ₸</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
