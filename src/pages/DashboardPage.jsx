import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { fmt, fmtK, fmtPct, MONTHS_RU } from '@/lib/utils'
import { TrendingUp, TrendingDown, DollarSign, ShoppingCart, Users, AlertTriangle, ArrowUpRight, ArrowDownRight } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts'

const DEMO_MONTHLY = MONTHS_RU.slice(0, 10).map((m, i) => ({
  month: m.slice(0, 3),
  revenue: 24000000 + Math.random() * 10000000,
  opex: 17000000 + Math.random() * 6000000,
  profit: 4000000 + Math.random() * 6000000,
}))

const DEMO_DEPT = [
  { name: 'Кухня', value: 7500000, color: '#22c55e' },
  { name: 'Бар', value: 10600000, color: '#3b82f6' },
  { name: 'Кальян', value: 9500000, color: '#f59e0b' },
]

export default function DashboardPage() {
  const [period, setPeriod] = useState('2025')

  const kpis = [
    { label: 'Выручка (YTD)', value: fmtK(278_404_808), change: '+4.2%', up: true, icon: DollarSign, color: 'brand' },
    { label: 'EBITDA', value: fmtK(28_590_946), change: '10.3%', up: false, icon: TrendingUp, color: 'mint' },
    { label: 'Food Cost', value: '37.7%', change: '+3.8%', up: false, icon: ShoppingCart, color: 'yellow' },
    { label: 'ФОТ %', value: '26.0%', change: '0%', up: true, icon: Users, color: 'blue' },
  ]

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-500 mt-1">Мята Platinum 4YOU — Финансовый обзор</p>
        </div>
        <select value={period} onChange={e => setPeriod(e.target.value)} className="input text-sm">
          <option value="2025">2025</option>
          <option value="2024">2024</option>
          <option value="2023">2023</option>
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
            blue: 'from-blue-500/20 to-blue-600/5 border-blue-500/20',
          }
          return (
            <div key={i} className={`card-hover bg-gradient-to-br ${colors[kpi.color]}`} style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-start justify-between mb-3">
                <div className="stat-label">{kpi.label}</div>
                <Icon className="w-4 h-4 text-slate-500" />
              </div>
              <div className="stat-value">{kpi.value} ₸</div>
              <div className={`flex items-center gap-1 mt-2 text-xs font-semibold ${kpi.up ? 'text-green-400' : 'text-red-400'}`}>
                {kpi.up ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
                {kpi.change} vs пр. год
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Revenue vs Expenses */}
        <div className="card lg:col-span-2">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Выручка vs Расходы (помесячно)</h3>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={DEMO_MONTHLY} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => fmtK(v)} />
              <Tooltip
                contentStyle={{ background: '#172033', border: '1px solid #293548', borderRadius: 12, fontSize: 12 }}
                formatter={(v) => [fmt(v) + ' ₸']}
                labelStyle={{ color: '#94a3b8' }}
              />
              <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="Выручка" />
              <Bar dataKey="opex" fill="#ef4444" radius={[4, 4, 0, 0]} opacity={0.7} name="Расходы" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Department Split */}
        <div className="card">
          <h3 className="text-sm font-semibold text-slate-300 mb-4">Выручка по отделам</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={DEMO_DEPT} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={4} dataKey="value">
                {DEMO_DEPT.map((d, i) => <Cell key={i} fill={d.color} />)}
              </Pie>
              <Tooltip formatter={(v) => [fmt(v) + ' ₸']} contentStyle={{ background: '#172033', border: '1px solid #293548', borderRadius: 12, fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-2 mt-2">
            {DEMO_DEPT.map(d => (
              <div key={d.name} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: d.color }} />
                  <span className="text-slate-400">{d.name}</span>
                </div>
                <span className="font-mono text-xs">{fmtK(d.value)} ₸</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Alerts */}
      <div className="card border-yellow-500/20 bg-yellow-500/5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 flex-shrink-0" />
          <div>
            <div className="text-sm font-semibold text-yellow-300">Внимание: Food Cost 37.7%</div>
            <div className="text-xs text-slate-400 mt-1">Food Cost превышает бенчмарк 35%. Проверьте закупочные цены и порционные карты.</div>
          </div>
        </div>
      </div>
    </div>
  )
}
