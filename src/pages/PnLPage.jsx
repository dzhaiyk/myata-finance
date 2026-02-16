import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt, MONTHS_RU } from '@/lib/utils'
import { TrendingUp, TrendingDown, Plus, Trash2, ChevronDown, ChevronRight, FileText, Upload, Info } from 'lucide-react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

export default function PnLPage() {
  const { hasPermission } = useAuthStore()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [viewMode, setViewMode] = useState('month') // month | ytd
  const [dailyReports, setDailyReports] = useState([])
  const [bankTx, setBankTx] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [categories, setCategories] = useState([])
  const [showAddAdj, setShowAddAdj] = useState(false)
  const [adjForm, setAdjForm] = useState({ type: 'income', category: 'other_income', amount: '', description: '' })
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState({ revenue: true, cogs: true, opex: true, below: true })

  useEffect(() => { loadData() }, [year, month, viewMode])

  const loadData = async () => {
    setLoading(true)
    const startDate = viewMode === 'ytd' ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`
    const endMonth = viewMode === 'ytd' ? 12 : month
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${new Date(year, endMonth, 0).getDate()}`

    const [drRes, btRes, adjRes, catRes] = await Promise.all([
      supabase.from('daily_reports').select('*')
        .gte('report_date', startDate).lte('report_date', endDate).order('report_date'),
      supabase.from('bank_transactions').select('*')
        .gte('transaction_date', startDate).lte('transaction_date', endDate)
        .eq('is_debit', true), // Only expenses from bank
      supabase.from('pnl_data').select('*')
        .eq('year', year).gte('month', viewMode === 'ytd' ? 1 : month).lte('month', endMonth),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    ])
    setDailyReports(drRes.data || [])
    setBankTx(btRes.data || [])
    setAdjustments(adjRes.data || [])
    setCategories(catRes.data || [])
    setLoading(false)
  }

  // ===== AGGREGATE P&L =====
  const pnl = useMemo(() => {
    // --- REVENUE from daily reports ---
    let totalRevenue = 0
    let revKitchen = 0, revBar = 0, revHookah = 0, revOther = 0

    dailyReports.forEach(r => {
      const d = r.data || {}
      totalRevenue += r.total_revenue || 0
      const depts = d.departments || []
      depts.forEach(dept => {
        const amt = Number(dept.amount) || 0
        if (dept.name === 'Кухня') revKitchen += amt
        else if (dept.name === 'Бар') revBar += amt
        else if (dept.name === 'Кальян') revHookah += amt
        else revOther += amt
      })
    })

    // --- COGS from daily reports (cash purchases) ---
    let cogsCashKitchen = 0, cogsCashBar = 0, cogsCashHookah = 0
    dailyReports.forEach(r => {
      const d = r.data || {}
      const w = d.withdrawals || {}
      ;(w.suppliers_kitchen || []).forEach(row => { cogsCashKitchen += Number(row.amount) || 0 })
      ;(w.suppliers_bar || []).forEach(row => { cogsCashBar += Number(row.amount) || 0 })
      ;(w.tobacco || []).forEach(row => { cogsCashHookah += Number(row.amount) || 0 })
    })

    // --- Build category map and aggregate bank transactions by pnl_group ---
    const catMap = {}
    categories.forEach(c => { catMap[c.code] = c })
    const bankByGroup = {}
    bankTx.forEach(tx => {
      const cat = catMap[tx.category]
      if (!cat) return
      const group = cat.pnl_group || 'uncategorized'
      bankByGroup[group] = (bankByGroup[group] || 0) + (Number(tx.amount) || 0)
    })

    // --- COGS from bank (non-cash purchases, using pnl_group='cogs') ---
    let cogsBankKitchen = 0, cogsBankBar = 0, cogsBankHookah = 0, cogsBankOther = 0
    bankTx.forEach(tx => {
      const cat = catMap[tx.category]
      if (cat?.pnl_group === 'cogs') {
        if (tx.category === 'cogs_kitchen') cogsBankKitchen += Number(tx.amount) || 0
        else if (tx.category === 'cogs_bar') cogsBankBar += Number(tx.amount) || 0
        else if (tx.category === 'cogs_hookah') cogsBankHookah += Number(tx.amount) || 0
        else cogsBankOther += Number(tx.amount) || 0
      }
    })

    const cogsKitchen = cogsCashKitchen + cogsBankKitchen
    const cogsBar = cogsCashBar + cogsBankBar
    const cogsHookah = cogsCashHookah + cogsBankHookah
    const totalCOGS = cogsKitchen + cogsBar + cogsHookah + cogsBankOther

    const grossProfit = totalRevenue - totalCOGS

    // --- PAYROLL from daily reports + bank (pnl_group='payroll') ---
    let payrollCash = 0
    dailyReports.forEach(r => {
      const w = (r.data || {}).withdrawals || {}
      ;(w.payroll || []).forEach(row => { payrollCash += Number(row.amount) || 0 })
    })
    const payrollBank = bankByGroup['payroll'] || 0
    const totalPayroll = payrollCash + payrollBank

    // --- Other OpEx from daily reports ---
    let otherCashExpenses = 0
    dailyReports.forEach(r => {
      const w = (r.data || {}).withdrawals || {}
      ;(w.other || []).forEach(row => { otherCashExpenses += Number(row.amount) || 0 })
    })

    // --- OpEx from bank (dynamic from categories pnl_group) ---
    const rent = bankByGroup['rent'] || 0
    const utilities = bankByGroup['utilities'] || 0
    const marketing = bankByGroup['marketing'] || 0
    const bankFees = bankByGroup['bank_fees'] || 0
    const otherOpexBank = bankByGroup['opex_other'] || 0

    const totalOpEx = totalPayroll + rent + utilities + marketing + bankFees + otherCashExpenses + otherOpexBank

    const ebitda = grossProfit - totalOpEx

    // --- Below EBITDA (dynamic) ---
    const tax = bankByGroup['tax'] || 0
    const capex = bankByGroup['capex'] || 0
    const dividends = bankByGroup['dividends'] || 0
    const loan = bankByGroup['loan'] || 0

    // --- Manual adjustments ---
    const adjIncome = adjustments.filter(a => a.type === 'income').reduce((s, a) => s + Number(a.amount), 0)
    const adjExpense = adjustments.filter(a => a.type === 'expense').reduce((s, a) => s + Number(a.amount), 0)

    const netProfit = ebitda - tax - capex - loan + adjIncome - adjExpense

    return {
      totalRevenue, revKitchen, revBar, revHookah, revOther,
      cogsKitchen, cogsBar, cogsHookah, cogsBankOther, totalCOGS,
      cogsCashKitchen, cogsCashBar, cogsCashHookah,
      cogsBankKitchen, cogsBankBar, cogsBankHookah,
      grossProfit,
      totalPayroll, payrollCash, payrollBank,
      rent, utilities, marketing, bankFees,
      otherCashExpenses, otherOpexBank, totalOpEx,
      ebitda, tax, capex, dividends, loan,
      adjIncome, adjExpense, netProfit,
      reportCount: dailyReports.length,
      bankTxCount: bankTx.length,
    }
  }, [dailyReports, bankTx, adjustments, categories])

  const pct = (v) => pnl.totalRevenue > 0 ? ((v / pnl.totalRevenue) * 100).toFixed(1) + '%' : '—'

  // Save manual adjustment
  const saveAdjustment = async () => {
    if (!adjForm.amount || !adjForm.description) return alert('Заполните сумму и описание')
    await supabase.from('pnl_data').insert({
      year, month, type: adjForm.type, category: adjForm.category,
      amount: Number(adjForm.amount), description: adjForm.description,
    })
    setShowAddAdj(false)
    setAdjForm({ type: 'income', category: 'other_income', amount: '', description: '' })
    loadData()
  }

  const deleteAdj = async (id) => {
    await supabase.from('pnl_data').delete().eq('id', id)
    loadData()
  }

  // P&L Line component
  const Line = ({ label, value, pctVal, indent = 0, bold = false, color = '', sub = '' }) => (
    <div className={cn('flex items-center justify-between py-2 px-4', indent && 'pl-8', bold && 'font-bold border-t border-slate-700 bg-slate-900/30')}>
      <div className="flex items-center gap-2">
        <span className={cn('text-sm', color, bold ? 'font-semibold' : indent ? 'text-slate-400' : 'text-slate-300')}>{label}</span>
        {sub && <span className="text-[10px] text-slate-600">{sub}</span>}
      </div>
      <div className="flex items-center gap-4">
        <span className={cn('font-mono text-sm', color, bold && 'text-base')}>{fmt(value)} ₸</span>
        {pctVal !== undefined && <span className="text-[10px] text-slate-500 w-12 text-right">{pctVal}</span>}
      </div>
    </div>
  )

  const SectionHeader = ({ label, icon, isOpen, toggle, total, pctVal, color }) => (
    <button onClick={toggle} className="flex items-center justify-between w-full px-4 py-3 bg-slate-900/50 hover:bg-slate-900/80 transition-colors">
      <div className="flex items-center gap-2">
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
        <span className="text-sm font-bold">{icon} {label}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className={cn('font-mono text-sm font-bold', color)}>{fmt(total)} ₸</span>
        <span className="text-[10px] text-slate-500 w-12 text-right">{pctVal}</span>
      </div>
    </button>
  )

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  const periodLabel = viewMode === 'ytd' ? `${year} YTD` : `${MONTHS_RU[month - 1]} ${year}`

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">P&L</h1>
          <p className="text-sm text-slate-500 mt-0.5">{periodLabel} · {pnl.reportCount} отчётов · {pnl.bankTxCount} банк. записей</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input text-sm">
            {MONTHS_RU.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input text-sm">
            {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
          <div className="flex bg-slate-900 rounded-lg p-0.5">
            <button onClick={() => setViewMode('month')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium', viewMode === 'month' ? 'bg-slate-700 text-white' : 'text-slate-500')}>Месяц</button>
            <button onClick={() => setViewMode('ytd')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium', viewMode === 'ytd' ? 'bg-slate-700 text-white' : 'text-slate-500')}>YTD</button>
          </div>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card-hover text-center">
          <div className="stat-label">Выручка</div>
          <div className="stat-value text-lg text-green-400">{fmt(pnl.totalRevenue)} ₸</div>
        </div>
        <div className="card-hover text-center">
          <div className="stat-label">Food Cost</div>
          <div className={cn('stat-value text-lg', pnl.totalRevenue > 0 && (pnl.totalCOGS / pnl.totalRevenue) > 0.32 ? 'text-red-400' : 'text-yellow-400')}>
            {pct(pnl.totalCOGS)}
          </div>
        </div>
        <div className="card-hover text-center">
          <div className="stat-label">ФОТ</div>
          <div className="stat-value text-lg text-blue-400">{pct(pnl.totalPayroll)}</div>
        </div>
        <div className="card-hover text-center">
          <div className="stat-label">EBITDA</div>
          <div className={cn('stat-value text-lg', pnl.ebitda >= 0 ? 'text-brand-400' : 'text-red-400')}>{fmt(pnl.ebitda)} ₸</div>
        </div>
        <div className="card-hover text-center">
          <div className="stat-label">Чистая прибыль</div>
          <div className={cn('stat-value text-lg', pnl.netProfit >= 0 ? 'text-brand-400' : 'text-red-400')}>{fmt(pnl.netProfit)} ₸</div>
        </div>
      </div>

      {/* P&L Statement */}
      <div className="card p-0 divide-y divide-slate-800">

        {/* REVENUE */}
        <SectionHeader label="ВЫРУЧКА" icon="💰" isOpen={expanded.revenue}
          toggle={() => setExpanded(p => ({...p, revenue: !p.revenue}))}
          total={pnl.totalRevenue} pctVal="100%" color="text-green-400" />
        {expanded.revenue && (
          <div>
            <Line label="Кухня" value={pnl.revKitchen} pctVal={pct(pnl.revKitchen)} indent />
            <Line label="Бар" value={pnl.revBar} pctVal={pct(pnl.revBar)} indent />
            <Line label="Кальян" value={pnl.revHookah} pctVal={pct(pnl.revHookah)} indent />
            {pnl.revOther > 0 && <Line label="Прочее" value={pnl.revOther} pctVal={pct(pnl.revOther)} indent />}
          </div>
        )}

        {/* COGS */}
        <SectionHeader label="СЕБЕСТОИМОСТЬ (COGS)" icon="🛒" isOpen={expanded.cogs}
          toggle={() => setExpanded(p => ({...p, cogs: !p.cogs}))}
          total={pnl.totalCOGS} pctVal={pct(pnl.totalCOGS)} color="text-red-400" />
        {expanded.cogs && (
          <div>
            <Line label="Закуп Кухня" value={pnl.cogsKitchen} pctVal={pct(pnl.cogsKitchen)} indent
              sub={`нал ${fmt(pnl.cogsCashKitchen)} + безнал ${fmt(pnl.cogsBankKitchen)}`} />
            <Line label="Закуп Бар" value={pnl.cogsBar} pctVal={pct(pnl.cogsBar)} indent
              sub={`нал ${fmt(pnl.cogsCashBar)} + безнал ${fmt(pnl.cogsBankBar)}`} />
            <Line label="Табак / Кальян" value={pnl.cogsHookah} pctVal={pct(pnl.cogsHookah)} indent
              sub={`нал ${fmt(pnl.cogsCashHookah)} + безнал ${fmt(pnl.cogsBankHookah)}`} />
            {pnl.cogsBankOther > 0 && <Line label="Закуп Прочее (безнал)" value={pnl.cogsBankOther} pctVal={pct(pnl.cogsBankOther)} indent />}
          </div>
        )}

        {/* GROSS PROFIT */}
        <Line label="ВАЛОВАЯ ПРИБЫЛЬ" value={pnl.grossProfit} pctVal={pct(pnl.grossProfit)} bold
          color={pnl.grossProfit >= 0 ? 'text-green-400' : 'text-red-400'} />

        {/* OPEX */}
        <SectionHeader label="ОПЕРАЦИОННЫЕ РАСХОДЫ (OpEx)" icon="⚙️" isOpen={expanded.opex}
          toggle={() => setExpanded(p => ({...p, opex: !p.opex}))}
          total={pnl.totalOpEx} pctVal={pct(pnl.totalOpEx)} color="text-orange-400" />
        {expanded.opex && (
          <div>
            <Line label="ФОТ (Зарплата)" value={pnl.totalPayroll} pctVal={pct(pnl.totalPayroll)} indent
              sub={`нал ${fmt(pnl.payrollCash)} + безнал ${fmt(pnl.payrollBank)}`} />
            <Line label="Аренда" value={pnl.rent} pctVal={pct(pnl.rent)} indent />
            <Line label="Коммунальные услуги" value={pnl.utilities} pctVal={pct(pnl.utilities)} indent />
            <Line label="Маркетинг" value={pnl.marketing} pctVal={pct(pnl.marketing)} indent />
            <Line label="Комиссия банка" value={pnl.bankFees} pctVal={pct(pnl.bankFees)} indent />
            <Line label="Прочие (наличные)" value={pnl.otherCashExpenses} pctVal={pct(pnl.otherCashExpenses)} indent sub="из отчётов" />
            {pnl.otherOpexBank > 0 && <Line label="Прочие (безнал)" value={pnl.otherOpexBank} pctVal={pct(pnl.otherOpexBank)} indent sub="из выписки" />}
          </div>
        )}

        {/* EBITDA */}
        <Line label="EBITDA" value={pnl.ebitda} pctVal={pct(pnl.ebitda)} bold
          color={pnl.ebitda >= 0 ? 'text-brand-400' : 'text-red-400'} />

        {/* Below EBITDA */}
        <SectionHeader label="НИЖЕ EBITDA" icon="📉" isOpen={expanded.below}
          toggle={() => setExpanded(p => ({...p, below: !p.below}))}
          total={pnl.tax + pnl.capex + pnl.loan} pctVal={pct(pnl.tax + pnl.capex + pnl.loan)} color="text-slate-400" />
        {expanded.below && (
          <div>
            <Line label="Налоги" value={pnl.tax} pctVal={pct(pnl.tax)} indent />
            <Line label="CapEx" value={pnl.capex} pctVal={pct(pnl.capex)} indent />
            {pnl.loan > 0 && <Line label="Погашение кредита" value={pnl.loan} pctVal={pct(pnl.loan)} indent />}
            {pnl.dividends > 0 && <Line label="Дивиденды" value={pnl.dividends} pctVal={pct(pnl.dividends)} indent />}
            {pnl.adjIncome > 0 && <Line label="Прочие доходы (ручн.)" value={pnl.adjIncome} indent color="text-green-400" />}
            {pnl.adjExpense > 0 && <Line label="Прочие расходы (ручн.)" value={pnl.adjExpense} indent color="text-red-400" />}
          </div>
        )}

        {/* NET PROFIT */}
        <div className={cn('px-4 py-4 flex items-center justify-between', pnl.netProfit >= 0 ? 'bg-green-500/5' : 'bg-red-500/5')}>
          <span className="text-base font-display font-bold">ЧИСТАЯ ПРИБЫЛЬ</span>
          <div className="flex items-center gap-4">
            <span className={cn('font-mono text-lg font-bold', pnl.netProfit >= 0 ? 'text-green-400' : 'text-red-400')}>
              {fmt(pnl.netProfit)} ₸
            </span>
            <span className="text-xs text-slate-500 w-12 text-right">{pct(pnl.netProfit)}</span>
          </div>
        </div>
      </div>

      {/* Manual Adjustments */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Ручные корректировки</div>
          <button onClick={() => setShowAddAdj(true)} className="btn-secondary text-xs flex items-center gap-1">
            <Plus className="w-3.5 h-3.5" /> Добавить
          </button>
        </div>

        {showAddAdj && (
          <div className="bg-slate-900 rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select value={adjForm.type} onChange={e => setAdjForm(f => ({...f, type: e.target.value}))} className="input text-sm">
                <option value="income">Доход</option><option value="expense">Расход</option>
              </select>
              <input type="text" inputMode="numeric" value={adjForm.amount} onChange={e => setAdjForm(f => ({...f, amount: e.target.value.replace(/[^0-9]/g, '')}))}
                className="input text-sm font-mono" placeholder="Сумма" />
              <input value={adjForm.description} onChange={e => setAdjForm(f => ({...f, description: e.target.value}))} className="input text-sm" placeholder="Бонус от поставщика" />
              <div className="flex gap-2">
                <button onClick={saveAdjustment} className="btn-primary text-sm flex-1">Сохранить</button>
                <button onClick={() => setShowAddAdj(false)} className="btn-secondary text-sm">✕</button>
              </div>
            </div>
          </div>
        )}

        {adjustments.length > 0 ? (
          <div className="space-y-1">
            {adjustments.map(a => (
              <div key={a.id} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className={cn('badge text-[10px]', a.type === 'income' ? 'badge-green' : 'badge-red')}>
                    {a.type === 'income' ? 'Доход' : 'Расход'}
                  </span>
                  <span>{a.description}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm">{fmt(a.amount)} ₸</span>
                  <button onClick={() => deleteAdj(a.id)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-xs text-slate-600 text-center py-2">Нет корректировок</div>
        )}
      </div>

      {/* Data Sources Info */}
      <div className="card border-blue-500/20 bg-blue-500/5">
        <div className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2"><Info className="w-4 h-4" /> Источники данных</div>
        <div className="text-xs text-slate-400 space-y-1">
          <p><FileText className="w-3 h-3 inline mr-1" /> <b className="text-slate-300">Ежедневные отчёты ({pnl.reportCount}):</b> Выручка по отделам, закуп наличными, ЗП наличными, прочие расходы из кассы</p>
          <p><Upload className="w-3 h-3 inline mr-1" /> <b className="text-slate-300">Банковская выписка ({pnl.bankTxCount}):</b> Аренда, коммуналка, маркетинг, налоги, ЗП безнал, комиссии, закуп безнал</p>
          <p>P&L собирается <b className="text-slate-300">автоматически</b>. Ручные корректировки — для редких случаев (бонусы от поставщиков и т.д.)</p>
        </div>
      </div>
    </div>
  )
}
