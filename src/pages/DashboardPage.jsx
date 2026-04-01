import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { fmt, fmtK, fmtPct, MONTHS_RU } from '@/lib/utils'
import { DollarSign, TrendingDown, ShoppingCart, CirclePercent, AlertTriangle, FileText, Trophy, CalendarDays } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LabelList } from 'recharts'

const fmtM = (v) => {
  if (!v || v === 0) return ''
  if (Math.abs(v) >= 1e6) return (v / 1e6).toFixed(1) + 'М'
  if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + 'К'
  return String(Math.round(v))
}

const PieWithLegend = ({ title, data, total }) => (
  <div className="card">
    <h3 className="text-sm font-semibold text-slate-300 mb-3">{title}</h3>
    <div className="flex justify-center">
      <div style={{ width: 180, height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
              {data.map((d, i) => <Cell key={i} fill={d.color} />)}
            </Pie>
            <Tooltip formatter={(v) => [fmt(v) + ' ₸']} contentStyle={{ background: '#172033', border: '1px solid #293548', borderRadius: 12, fontSize: 12 }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
    <div className="space-y-2 mt-3">
      {data.map(d => {
        const pct = total > 0 ? (d.value / total * 100).toFixed(1) : 0
        return (
          <div key={d.name}>
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-1.5 min-w-0">
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
                <span className="text-xs text-slate-400 truncate">{d.name}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-1">
                <span className="font-mono text-[10px] text-slate-500">{fmtK(d.value)}</span>
                <span className="text-xs font-mono font-bold w-10 text-right" style={{ color: d.color }}>{pct}%</span>
              </div>
            </div>
            <div className="h-1 bg-slate-800 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: d.color }} />
            </div>
          </div>
        )
      })}
    </div>
  </div>
)

// Compute PnL values for a set of daily reports + bank transactions + adjustments
// Same logic as PnLPage.jsx values computation
function computePnL(dailyReports, bankTxs, adjustments) {
  const v = {}

  // Revenue
  let revK = 0, revB = 0, revH = 0, revO = 0
  dailyReports.forEach(r => {
    const depts = r.data?.departments || []
    depts.forEach(d => {
      const a = Number(d.amount) || 0
      if (d.name === 'Кухня') revK += a
      else if (d.name === 'Бар') revB += a
      else if (d.name === 'Кальян') revH += a
      else revO += a
    })
  })
  v.rev_kitchen = revK; v.rev_bar = revB; v.rev_hookah = revH; v.rev_other = revO
  v.revenue = revK + revB + revH + revO

  // Cash expenses
  let cashKitchen = 0, cashBar = 0, cashHookah = 0, cashOther = 0, cashHookahCapex = 0
  dailyReports.forEach(r => {
    const w = r.data?.withdrawals || {}
    const sum = (arr) => (arr || []).reduce((s, row) => s + (Number(row.amount) || 0), 0)
    cashKitchen += sum(w.suppliers_kitchen)
    cashBar += sum(w.suppliers_bar)
    ;(w.tobacco || []).forEach(row => {
      const amt = Number(row.amount) || 0
      if (row.name === 'Аппараты') cashHookahCapex += amt
      else cashHookah += amt
    })
    cashOther += sum(w.other)
  })

  // Bank expenses by category
  const bankByCat = {}
  bankTxs.forEach(tx => {
    if (!tx.category || tx.category === 'uncategorized' || tx.category === 'internal') return
    if (!tx.is_debit) return
    bankByCat[tx.category] = (bankByCat[tx.category] || 0) + Math.abs(Number(tx.amount) || 0)
  })
  const bk = (cat) => bankByCat[cat] || 0

  // Food cost (cash + bank)
  v.fc_kitchen = cashKitchen + bk('cogs_kitchen')
  v.fc_bar = cashBar + bk('cogs_bar')
  v.fc_hookah = cashHookah + bk('cogs_hookah')
  v.foodcost = v.fc_kitchen + v.fc_bar + v.fc_hookah

  // CapEx
  v.capex_repair = bk('capex_repair')
  v.capex_furniture = bk('capex_furniture')
  v.capex_other = bk('capex_other') + cashHookahCapex
  v.capex = v.capex_repair + v.capex_furniture + v.capex_other

  // OpEx subcategories (bank only, except household)
  v.payroll = ['payroll_mgmt', 'payroll_kitchen', 'payroll_bar', 'payroll_hookah', 'payroll_hall', 'payroll_transport', 'payroll_other'].reduce((s, k) => s + bk(k), 0)
  v.marketing = ['mkt_smm', 'mkt_target', 'mkt_2gis', 'mkt_yandex', 'mkt_google', 'mkt_other'].reduce((s, k) => s + bk(k), 0)
  v.rent = ['rent_premises', 'rent_warehouse', 'rent_property_tax'].reduce((s, k) => s + bk(k), 0)
  v.utilities = ['util_electric', 'util_water', 'util_heating', 'util_bi', 'util_internet', 'util_waste', 'util_other'].reduce((s, k) => s + bk(k), 0)
  v.opex_other_val = cashOther + ['bank_fee', 'opex_security', 'opex_software', 'opex_menu', 'opex_pest', 'opex_grease', 'opex_repair', 'opex_uniform', 'opex_music', 'opex_royalty', 'opex_misc'].reduce((s, k) => s + bk(k), 0)
  v.taxes = ['tax_retail', 'tax_payroll', 'tax_insurance', 'tax_alcohol', 'tax_hookah', 'tax_other'].reduce((s, k) => s + bk(k), 0)

  v.opex = v.payroll + v.foodcost + v.marketing + v.rent + v.utilities + v.opex_other_val + v.taxes
  v.expenses = v.capex + v.opex

  // Apply manual adjustments
  adjustments.forEach(a => {
    const amt = Number(a.amount) || 0
    const key = a.category
    if (key && v[key] !== undefined) v[key] += amt
  })

  // Recalc after adjustments
  v.foodcost = v.fc_kitchen + v.fc_bar + v.fc_hookah
  v.opex = v.payroll + v.foodcost + v.marketing + v.rent + v.utilities + v.opex_other_val + v.taxes
  v.capex = v.capex_repair + v.capex_furniture + v.capex_other
  v.expenses = v.capex + v.opex
  v.revenue = v.rev_kitchen + v.rev_bar + v.rev_hookah + v.rev_other
  v.op_profit = v.revenue - v.opex
  v.net_profit = v.revenue - v.expenses

  return v
}

export default function DashboardPage() {
  const [year, setYear] = useState(2026)
  const [reports, setReports] = useState([])
  const [allReports, setAllReports] = useState([])
  const [bankTx, setBankTx] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [year])

  const loadData = async () => {
    setLoading(true)
    const startDate = `${year}-01-01`
    const endDate = `${year}-12-31`

    const [reportsRes, allReportsRes, bankRes, adjRes] = await Promise.all([
      supabase.from('daily_reports').select('*').gte('report_date', startDate).lte('report_date', endDate).eq('status', 'submitted').order('report_date'),
      supabase.from('daily_reports').select('id, report_date, total_revenue, status').eq('status', 'submitted').order('report_date'),
      supabase.from('bank_transactions').select('transaction_date, amount, is_debit, category').gte('transaction_date', startDate).lte('transaction_date', endDate),
      supabase.from('pnl_data').select('*').eq('year', year),
    ])

    setReports(reportsRes.data || [])
    setAllReports(allReportsRes.data || [])
    setBankTx(bankRes.data || [])
    setAdjustments(adjRes.data || [])
    setLoading(false)
  }

  // Completed months: past month + has bank import data
  const now = new Date()
  const currentMonth = now.getFullYear() === year ? now.getMonth() : 12
  const monthsWithBank = new Set()
  bankTx.forEach(tx => {
    const m = new Date(tx.transaction_date).getMonth()
    if (m < currentMonth) monthsWithBank.add(m)
  })

  const completedReports = reports.filter(r => monthsWithBank.has(new Date(r.report_date).getMonth()))
  const completedBankTx = bankTx.filter(tx => monthsWithBank.has(new Date(tx.transaction_date).getMonth()))
  const completedAdj = adjustments.filter(a => monthsWithBank.has(a.month - 1))

  // Compute PnL using same logic as PnLPage
  const pnl = computePnL(completedReports, completedBankTx, completedAdj)

  // Monthly breakdown
  const monthlyData = MONTHS_RU.map((name, i) => {
    if (!monthsWithBank.has(i)) return { month: name.slice(0, 3), revenue: 0, expenses: 0 }
    const mReports = completedReports.filter(r => new Date(r.report_date).getMonth() === i)
    const mBank = completedBankTx.filter(tx => new Date(tx.transaction_date).getMonth() === i)
    const mAdj = adjustments.filter(a => a.month === i + 1)
    const mPnl = computePnL(mReports, mBank, mAdj)
    return { month: name.slice(0, 3), revenue: mPnl.revenue, expenses: mPnl.expenses }
  })

  // Department revenue
  const deptData = [
    { name: 'Кухня', value: pnl.rev_kitchen, color: '#22c55e' },
    { name: 'Бар', value: pnl.rev_bar, color: '#3b82f6' },
    { name: 'Кальян', value: pnl.rev_hookah, color: '#f59e0b' },
  ].filter(d => d.value > 0)
  const deptTotal = deptData.reduce((s, d) => s + d.value, 0)

  // Food cost by department
  const fcData = [
    { name: 'Кухня', value: pnl.fc_kitchen, color: '#22c55e' },
    { name: 'Бар', value: pnl.fc_bar, color: '#3b82f6' },
    { name: 'Кальян', value: pnl.fc_hookah, color: '#f59e0b' },
  ].filter(d => d.value > 0)
  const fcTotal = fcData.reduce((s, d) => s + d.value, 0)
  const fcPct = pnl.revenue > 0 ? fcTotal / pnl.revenue : 0
  const fcColor = fcPct < 0.35 ? 'green' : fcPct < 0.45 ? 'yellow' : 'red'

  // Expense categories
  const expData = [
    { name: 'ФОТ', value: pnl.payroll, color: '#818cf8' },
    { name: 'Food Cost', value: pnl.foodcost, color: '#f59e0b' },
    { name: 'Маркетинг', value: pnl.marketing, color: '#ec4899' },
    { name: 'Аренда', value: pnl.rent, color: '#8b5cf6' },
    { name: 'Коммунальные', value: pnl.utilities, color: '#06b6d4' },
    { name: 'OpEx прочее', value: pnl.opex_other_val, color: '#f472b6' },
    { name: 'Налоги', value: pnl.taxes, color: '#ef4444' },
    { name: 'CapEx', value: pnl.capex, color: '#fb923c' },
  ].filter(d => d.value > 0)

  // Margin
  const opMargin = pnl.revenue > 0 ? pnl.op_profit / pnl.revenue : 0
  const marginColor = opMargin >= 0.30 ? 'green' : opMargin >= 0.15 ? 'yellow' : 'red'

  const completedMonthNames = [...monthsWithBank].sort((a, b) => a - b).map(m => MONTHS_RU[m].slice(0, 3))
  const discrepancies = reports.filter(r => Math.abs(r.cash_discrepancy || 0) > 500)

  // === RECORDS (all time) ===
  const WEEKDAYS_RU = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота']
  const WEEKDAYS_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']

  const bestDay = allReports.reduce((best, r) => (!best || (r.total_revenue || 0) > best.total_revenue) ? r : best, null)

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

  const monthMap = {}
  allReports.forEach(r => {
    const key = r.report_date.slice(0, 7)
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

  // Weekday averages
  const weekdayStats = [1, 2, 3, 4, 5, 6, 0].map(dow => {
    const matching = allReports.filter(r => new Date(r.report_date + 'T12:00:00').getDay() === dow)
    const sum = matching.reduce((s, r) => s + (r.total_revenue || 0), 0)
    return { day: WEEKDAYS_RU[dow], short: WEEKDAYS_SHORT[dow], avg: matching.length > 0 ? Math.round(sum / matching.length) : 0, count: matching.length }
  })
  const maxWeekdayAvg = Math.max(...weekdayStats.map(w => w.avg), 1)

  // Median
  const dailyRevenues = completedReports.map(r => r.total_revenue || 0).filter(v => v > 0).sort((a, b) => a - b)
  const median = dailyRevenues.length > 0
    ? dailyRevenues.length % 2 === 1
      ? dailyRevenues[Math.floor(dailyRevenues.length / 2)]
      : Math.round((dailyRevenues[Math.floor(dailyRevenues.length / 2) - 1] + dailyRevenues[Math.floor(dailyRevenues.length / 2)]) / 2)
    : 0

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка данных...</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">
            Мята Platinum 4YOU — {completedMonthNames.length > 0 ? `Данные: ${completedMonthNames.join(', ')}` : 'Нет закрытых месяцев'}
          </p>
        </div>
        <select value={year} onChange={e => setYear(Number(e.target.value))} className="input text-sm">
          <option value={2026}>2026</option>
        </select>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="card-hover bg-gradient-to-br from-green-500/20 to-green-600/5 border-green-500/20">
          <div className="flex items-start justify-between mb-3">
            <div className="stat-label">Доходы</div>
            <DollarSign className="w-4 h-4 text-green-500" />
          </div>
          <div className="stat-value text-green-400">{(pnl.revenue / 1e6).toFixed(1)}М ₸</div>
          <div className="text-xs text-slate-500 mt-2">{completedReports.length} отчётов</div>
        </div>

        <div className="card-hover bg-gradient-to-br from-red-500/20 to-red-600/5 border-red-500/20">
          <div className="flex items-start justify-between mb-3">
            <div className="stat-label">Расходы</div>
            <TrendingDown className="w-4 h-4 text-red-500" />
          </div>
          <div className="stat-value text-red-400">{(pnl.expenses / 1e6).toFixed(1)}М ₸</div>
          <div className="text-xs text-slate-500 mt-2">OpEx + CapEx</div>
        </div>

        <div className={`card-hover bg-gradient-to-br ${fcColor === 'green' ? 'from-green-500/20 to-green-600/5 border-green-500/20' : fcColor === 'yellow' ? 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/20' : 'from-red-500/20 to-red-600/5 border-red-500/20'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="stat-label">Food Cost</div>
            <ShoppingCart className="w-4 h-4 text-slate-500" />
          </div>
          <div className={`stat-value ${fcColor === 'green' ? 'text-green-400' : fcColor === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>
            {fcPct > 0 ? fmtPct(fcPct) : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-2">{fcTotal > 0 ? fmtK(fcTotal) + ' ₸' : 'Нет данных'}</div>
        </div>

        <div className={`card-hover bg-gradient-to-br ${marginColor === 'green' ? 'from-green-500/20 to-green-600/5 border-green-500/20' : marginColor === 'yellow' ? 'from-yellow-500/20 to-yellow-600/5 border-yellow-500/20' : 'from-red-500/20 to-red-600/5 border-red-500/20'}`}>
          <div className="flex items-start justify-between mb-3">
            <div className="stat-label">Маржа</div>
            <CirclePercent className="w-4 h-4 text-slate-500" />
          </div>
          <div className={`stat-value ${marginColor === 'green' ? 'text-green-400' : marginColor === 'yellow' ? 'text-yellow-400' : 'text-red-400'}`}>
            {pnl.revenue > 0 ? fmtPct(opMargin) : '—'}
          </div>
          <div className="text-xs text-slate-500 mt-2">{pnl.revenue > 0 ? fmtK(pnl.op_profit) + ' ₸ прибыль' : 'Нет данных'}</div>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div className="card">
        <h3 className="text-sm font-semibold text-slate-300 mb-4">Доходы vs Расходы (помесячно)</h3>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={monthlyData} barGap={2} margin={{ top: 25, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => fmtM(v)} />
            <Tooltip contentStyle={{ background: '#172033', border: '1px solid #293548', borderRadius: 12, fontSize: 12 }}
              formatter={(v) => [fmt(v) + ' ₸']} labelStyle={{ color: '#94a3b8' }} />
            <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="Доходы">
              <LabelList dataKey="revenue" position="top" formatter={fmtM} style={{ fill: '#86efac', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
            </Bar>
            <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.7} name="Расходы">
              <LabelList dataKey="expenses" position="top" formatter={fmtM} style={{ fill: '#fca5a5', fontSize: 10, fontFamily: 'JetBrains Mono' }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Three pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {deptData.length > 0 && <PieWithLegend title="Выручка по отделам" data={deptData} total={deptTotal} />}
        {fcData.length > 0 && <PieWithLegend title="Food Cost по отделам" data={fcData} total={fcTotal} />}
        {expData.length > 0 && <PieWithLegend title="Расходы по категориям" data={expData} total={pnl.expenses} />}
      </div>

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
            <span className="text-[10px] text-slate-600 ml-auto">за всё время ({allReports.length} смен) · медиана {fmt(median)} ₸</span>
          </div>
          <div className="grid grid-cols-7 gap-2">
            {weekdayStats.map(w => {
              const aboveMedian = w.avg >= median
              const barColor = aboveMedian ? 'bg-green-400/30 border-green-400/30' : 'bg-rose-400/30 border-rose-400/30'
              const textColor = aboveMedian ? 'text-green-400' : 'text-rose-400'
              const medianPct = maxWeekdayAvg > 0 ? (median / maxWeekdayAvg) * 100 : 0
              return (
                <div key={w.day} className="text-center">
                  <div className="text-[10px] text-slate-500 mb-2">{w.short}</div>
                  <div className="relative h-24 flex items-end justify-center mb-2">
                    <div className={`w-full max-w-[40px] rounded-t-lg border transition-all ${barColor}`}
                      style={{ height: `${Math.max((w.avg / maxWeekdayAvg) * 100, 4)}%` }} />
                    <div className="absolute left-0 right-0 border-t border-dashed border-yellow-500/60 pointer-events-none"
                      style={{ bottom: `${medianPct}%` }} />
                  </div>
                  <div className={`text-xs font-mono font-semibold ${textColor}`}>{fmtK(w.avg)}</div>
                  <div className="text-[9px] text-slate-600">{w.count} смен</div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Empty state */}
      {completedMonthNames.length === 0 && (
        <div className="card text-center py-16">
          <FileText className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <div className="text-lg font-semibold text-slate-400">Нет закрытых месяцев за {year}</div>
          <div className="text-sm text-slate-600 mt-1">Импортируйте банковскую выписку чтобы закрыть месяц</div>
        </div>
      )}

      {/* Cash discrepancy alerts */}
      {discrepancies.length > 0 && (
        <div className="card border-red-500/20 bg-red-500/5">
          <div className="text-sm font-semibold text-red-400 mb-3">⚠️ Расхождения кассы ({discrepancies.length})</div>
          <div className="space-y-2">
            {discrepancies.map(r => (
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
