import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt, MONTHS_RU } from '@/lib/utils'
import { ChevronDown, ChevronRight, Plus, Trash2, Info, FileText, Upload, ChevronsUpDown } from 'lucide-react'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

// P&L structure matching the restaurant's actual format
// Each line: { key, label, level (0=header,1=group,2=sub), source, calc }
// source: 'daily:field' | 'bank:category_code' | 'calc' | 'manual'
const PNL_STRUCTURE = [
  // === REVENUE ===
  { key: 'revenue', label: 'ДОХОДЫ', level: 0, section: 'revenue', calc: 'sum_children' },
  { key: 'rev_kitchen', label: 'Кухня', level: 2, section: 'revenue', source: 'daily:dept_kitchen' },
  { key: 'rev_bar', label: 'Бар', level: 2, section: 'revenue', source: 'daily:dept_bar' },
  { key: 'rev_hookah', label: 'Кальян', level: 2, section: 'revenue', source: 'daily:dept_hookah' },
  { key: 'rev_other', label: 'Прочее', level: 2, section: 'revenue', source: 'daily:dept_other' },

  // === EXPENSES ===
  { key: 'expenses', label: 'РАСХОДЫ', level: 0, section: 'expenses', calc: 'sum_children' },

  // CapEx
  { key: 'capex', label: 'CapEx (инвестиции)', level: 1, section: 'expenses', calc: 'sum_children' },
  { key: 'capex_repair', label: 'Ремонт', level: 2, section: 'expenses', source: 'bank:capex_repair' },
  { key: 'capex_furniture', label: 'Мебель и техника', level: 2, section: 'expenses', source: 'bank:capex_furniture' },
  { key: 'capex_other', label: 'CapEx прочее', level: 2, section: 'expenses', source: 'bank:capex_other' },

  // OpEx
  { key: 'opex', label: 'OpEx (ежемесячные расходы)', level: 1, section: 'expenses', calc: 'sum_children' },

  // ФОТ
  { key: 'payroll', label: 'ФОТ', level: 1, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'payroll_mgmt', label: 'ФОТ Менеджмент', level: 2, section: 'expenses', source: 'bank:payroll_mgmt' },
  { key: 'payroll_kitchen', label: 'ФОТ Кухня', level: 2, section: 'expenses', source: 'bank:payroll_kitchen' },
  { key: 'payroll_bar', label: 'ФОТ Бар', level: 2, section: 'expenses', source: 'bank:payroll_bar' },
  { key: 'payroll_hookah', label: 'ФОТ Дымный коктейль', level: 2, section: 'expenses', source: 'bank:payroll_hookah' },
  { key: 'payroll_hall', label: 'ФОТ Зал', level: 2, section: 'expenses', source: 'bank:payroll_hall' },
  { key: 'payroll_transport', label: 'Развозка', level: 2, section: 'expenses', source: 'bank:payroll_transport' },
  { key: 'payroll_cash', label: 'ФОТ из кассы (авансы)', level: 2, section: 'expenses', source: 'daily:payroll' },
  { key: 'payroll_other', label: 'ФОТ Прочее', level: 2, section: 'expenses', source: 'bank:payroll_other' },

  // Food Cost
  { key: 'foodcost', label: 'Food cost', level: 1, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'fc_kitchen', label: 'Закуп кухня', level: 2, section: 'expenses', source: 'both:cogs_kitchen', dailyField: 'suppliers_kitchen' },
  { key: 'fc_bar', label: 'Закуп бар', level: 2, section: 'expenses', source: 'both:cogs_bar', dailyField: 'suppliers_bar' },
  { key: 'fc_hookah', label: 'Закуп кальян', level: 2, section: 'expenses', source: 'both:cogs_hookah', dailyField: 'tobacco' },

  // Маркетинг
  { key: 'marketing', label: 'Маркетинг', level: 1, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'mkt_smm', label: 'СММ', level: 2, section: 'expenses', source: 'bank:mkt_smm' },
  { key: 'mkt_target', label: 'Таргет', level: 2, section: 'expenses', source: 'bank:mkt_target' },
  { key: 'mkt_2gis', label: '2ГИС', level: 2, section: 'expenses', source: 'bank:mkt_2gis' },
  { key: 'mkt_yandex', label: 'Яндекс', level: 2, section: 'expenses', source: 'bank:mkt_yandex' },
  { key: 'mkt_google', label: 'Google', level: 2, section: 'expenses', source: 'bank:mkt_google' },
  { key: 'mkt_other', label: 'Маркетинг прочее', level: 2, section: 'expenses', source: 'bank:mkt_other' },

  // Аренда
  { key: 'rent', label: 'Аренда', level: 1, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'rent_premises', label: 'Аренда помещения', level: 2, section: 'expenses', source: 'bank:rent_premises' },
  { key: 'rent_warehouse', label: 'Аренда склада и кровли', level: 2, section: 'expenses', source: 'bank:rent_warehouse' },
  { key: 'rent_property_tax', label: 'Налог на недвижимость', level: 2, section: 'expenses', source: 'bank:rent_property_tax' },

  // Коммунальные
  { key: 'utilities', label: 'Коммунальные платежи', level: 1, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'util_electric', label: 'Электричество', level: 2, section: 'expenses', source: 'bank:util_electric' },
  { key: 'util_water', label: 'Водоснабжение', level: 2, section: 'expenses', source: 'bank:util_water' },
  { key: 'util_heating', label: 'Отопление', level: 2, section: 'expenses', source: 'bank:util_heating' },
  { key: 'util_bi', label: 'BI Service', level: 2, section: 'expenses', source: 'bank:util_bi' },
  { key: 'util_internet', label: 'Интернет и связь', level: 2, section: 'expenses', source: 'bank:util_internet' },
  { key: 'util_waste', label: 'Вывоз мусора', level: 2, section: 'expenses', source: 'bank:util_waste' },
  { key: 'util_other', label: 'Ком. услуги прочее', level: 2, section: 'expenses', source: 'bank:util_other' },

  // OpEx прочее
  { key: 'opex_other', label: 'OpEx прочее', level: 1, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'opex_household', label: 'Хозтовары', level: 2, section: 'expenses', source: 'both:household', dailyField: 'other' },
  { key: 'opex_bank_fee', label: 'Комиссия банка', level: 2, section: 'expenses', source: 'bank:bank_fee' },
  { key: 'opex_security', label: 'Система безопасности', level: 2, section: 'expenses', source: 'bank:opex_security' },
  { key: 'opex_software', label: 'Программное обеспечение', level: 2, section: 'expenses', source: 'bank:opex_software' },
  { key: 'opex_menu', label: 'Меню', level: 2, section: 'expenses', source: 'bank:opex_menu' },
  { key: 'opex_pest', label: 'Дератизация/дезинсекция', level: 2, section: 'expenses', source: 'bank:opex_pest' },
  { key: 'opex_grease', label: 'Чистка жироуловителей', level: 2, section: 'expenses', source: 'bank:opex_grease' },
  { key: 'opex_repair', label: 'Мелкий ремонт', level: 2, section: 'expenses', source: 'bank:opex_repair' },
  { key: 'opex_uniform', label: 'Форма для персонала', level: 2, section: 'expenses', source: 'bank:opex_uniform' },
  { key: 'opex_music', label: 'Авторские права на музыку', level: 2, section: 'expenses', source: 'bank:opex_music' },
  { key: 'opex_royalty', label: 'Роялти', level: 2, section: 'expenses', source: 'bank:opex_royalty' },
  { key: 'opex_misc', label: 'Прочее', level: 2, section: 'expenses', source: 'bank:opex_misc' },

  // Налоги
  { key: 'taxes', label: 'Налоги', level: 1, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'tax_retail', label: 'Розничный налог', level: 2, section: 'expenses', source: 'bank:tax_retail' },
  { key: 'tax_payroll', label: 'Налоги по зарплате', level: 2, section: 'expenses', source: 'bank:tax_payroll' },
  { key: 'tax_insurance', label: 'Страхование сотрудников', level: 2, section: 'expenses', source: 'bank:tax_insurance' },
  { key: 'tax_alcohol', label: 'Лицензия на алкоголь', level: 2, section: 'expenses', source: 'bank:tax_alcohol' },
  { key: 'tax_hookah', label: 'Лицензия на дымный коктейль', level: 2, section: 'expenses', source: 'bank:tax_hookah' },
  { key: 'tax_other', label: 'Налоги прочее', level: 2, section: 'expenses', source: 'bank:tax_other' },

  // === RESULTS ===
  { key: 'op_profit', label: 'Операционная прибыль (Доходы - OpEx)', level: 0, section: 'result', calc: 'revenue_minus_opex' },
  { key: 'net_profit', label: 'Чистая прибыль', level: 0, section: 'result', calc: 'revenue_minus_all' },

  // === RATIOS ===
  { key: 'margin_pct', label: 'Маржа (от опер. прибыли)', level: 0, section: 'ratio', calc: 'ratio' },
  { key: 'fc_pct', label: 'Food cost в %', level: 0, section: 'ratio', calc: 'ratio' },
  { key: 'fc_kitchen_pct', label: 'Кухня', level: 2, section: 'ratio', calc: 'ratio' },
  { key: 'fc_bar_pct', label: 'Бар', level: 2, section: 'ratio', calc: 'ratio' },
  { key: 'fc_hookah_pct', label: 'Кальян', level: 2, section: 'ratio', calc: 'ratio' },
]

export default function PnLPage() {
  const { hasPermission } = useAuthStore()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [viewMode, setViewMode] = useState('month')
  const [dailyReports, setDailyReports] = useState([])
  const [bankTx, setBankTx] = useState([])
  const [adjustments, setAdjustments] = useState([])
  const [loading, setLoading] = useState(true)
  const [allExpanded, setAllExpanded] = useState(true)
  const [collapsed, setCollapsed] = useState({})
  const [showAddAdj, setShowAddAdj] = useState(false)
  const [adjForm, setAdjForm] = useState({ type: 'income', amount: '', description: '' })

  useEffect(() => { loadData() }, [year, month, viewMode])

  const loadData = async () => {
    setLoading(true)
    const startDate = viewMode === 'ytd' ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`
    const endMonth = viewMode === 'ytd' ? 12 : month
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${new Date(year, endMonth, 0).getDate()}`
    const [drRes, btRes, adjRes] = await Promise.all([
      supabase.from('daily_reports').select('*').gte('report_date', startDate).lte('report_date', endDate).eq('status', 'submitted'),
      supabase.from('bank_transactions').select('*').gte('transaction_date', startDate).lte('transaction_date', endDate),
      supabase.from('pnl_data').select('*').eq('year', year).gte('month', viewMode === 'ytd' ? 1 : month).lte('month', endMonth),
    ])
    setDailyReports(drRes.data || [])
    setBankTx(btRes.data || [])
    setAdjustments(adjRes.data || [])
    setLoading(false)
  }

  // ===== COMPUTE ALL P&L VALUES =====
  const values = useMemo(() => {
    const v = {}

    // Revenue from daily reports
    let revK = 0, revB = 0, revH = 0, revO = 0
    dailyReports.forEach(r => {
      const depts = (r.data?.departments) || []
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

    // Cash expenses from daily reports
    let cashPayroll = 0, cashKitchen = 0, cashBar = 0, cashHookah = 0, cashOther = 0
    dailyReports.forEach(r => {
      const w = r.data?.withdrawals || {}
      ;(w.payroll || []).forEach(row => cashPayroll += Number(row.amount) || 0)
      ;(w.suppliers_kitchen || []).forEach(row => cashKitchen += Number(row.amount) || 0)
      ;(w.suppliers_bar || []).forEach(row => cashBar += Number(row.amount) || 0)
      ;(w.tobacco || []).forEach(row => cashHookah += Number(row.amount) || 0)
      ;(w.other || []).forEach(row => cashOther += Number(row.amount) || 0)
    })
    v.payroll_cash = cashPayroll

    // Bank expenses by category
    const bankByCat = {}
    bankTx.forEach(tx => {
      if (!tx.category || tx.category === 'uncategorized' || tx.category === 'internal') return
      bankByCat[tx.category] = (bankByCat[tx.category] || 0) + (Number(tx.amount) || 0)
    })
    const bk = (cat) => bankByCat[cat] || 0

    // Assign bank values to PNL keys
    PNL_STRUCTURE.forEach(line => {
      if (!line.source) return
      if (line.source.startsWith('bank:')) {
        const cat = line.source.replace('bank:', '')
        v[line.key] = bk(cat)
      } else if (line.source.startsWith('both:')) {
        const cat = line.source.replace('both:', '')
        if (line.key === 'fc_kitchen') v[line.key] = cashKitchen + bk(cat)
        else if (line.key === 'fc_bar') v[line.key] = cashBar + bk(cat)
        else if (line.key === 'fc_hookah') v[line.key] = cashHookah + bk(cat)
        else if (line.key === 'opex_household') v[line.key] = cashOther + bk(cat)
        else v[line.key] = bk(cat)
      }
    })

    // Calculate group sums (level 1 = sum of its level 2 children)
    const groups = ['capex', 'payroll', 'foodcost', 'marketing', 'rent', 'utilities', 'opex_other', 'taxes']
    groups.forEach(gKey => {
      const gIdx = PNL_STRUCTURE.findIndex(l => l.key === gKey)
      if (gIdx < 0) return
      let sum = 0
      for (let i = gIdx + 1; i < PNL_STRUCTURE.length; i++) {
        const line = PNL_STRUCTURE[i]
        if (line.level <= 1 && i !== gIdx + 1) break
        if (line.level === 2) sum += v[line.key] || 0
      }
      v[gKey] = sum
    })

    v.opex = v.payroll + v.foodcost + v.marketing + v.rent + v.utilities + v.opex_other + v.taxes
    v.expenses = v.capex + v.opex
    v.op_profit = v.revenue - v.opex
    v.net_profit = v.revenue - v.expenses

    // Adjustments
    const adjIn = adjustments.filter(a => a.type === 'income').reduce((s, a) => s + Number(a.amount), 0)
    const adjOut = adjustments.filter(a => a.type === 'expense').reduce((s, a) => s + Number(a.amount), 0)
    v.net_profit += adjIn - adjOut

    // Ratios
    v.margin_pct = v.revenue > 0 ? v.op_profit / v.revenue : 0
    v.fc_pct = v.revenue > 0 ? v.foodcost / v.revenue : 0
    v.fc_kitchen_pct = revK > 0 ? (v.fc_kitchen / revK) : 0
    v.fc_bar_pct = revB > 0 ? (v.fc_bar / revB) : 0
    v.fc_hookah_pct = revH > 0 ? (v.fc_hookah / revH) : 0

    return v
  }, [dailyReports, bankTx, adjustments])

  const toggleAll = () => {
    const newState = !allExpanded
    setAllExpanded(newState)
    const c = {}
    PNL_STRUCTURE.filter(l => l.level <= 1 && l.calc === 'sum_children').forEach(l => { c[l.key] = !newState })
    setCollapsed(c)
  }
  const toggleSection = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }))

  const saveAdj = async () => {
    if (!adjForm.amount || !adjForm.description) return alert('Заполните сумму и описание')
    await supabase.from('pnl_data').insert({ year, month, type: adjForm.type, amount: Number(adjForm.amount), description: adjForm.description })
    setShowAddAdj(false); setAdjForm({ type: 'income', amount: '', description: '' }); loadData()
  }
  const deleteAdj = async (id) => { await supabase.from('pnl_data').delete().eq('id', id); loadData() }

  const pct = (val) => values.revenue > 0 ? ((val / values.revenue) * 100).toFixed(1) + '%' : '—'
  const fmtPct = (val) => (val * 100).toFixed(1) + '%'

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  const periodLabel = viewMode === 'ytd' ? `${year} YTD` : `${MONTHS_RU[month - 1]} ${year}`

  // Determine which lines are visible (hidden if parent collapsed)
  const isVisible = (line, idx) => {
    if (line.level === 0) return true
    // Find parent group
    for (let i = idx - 1; i >= 0; i--) {
      const parent = PNL_STRUCTURE[i]
      if (parent.level < line.level && parent.calc === 'sum_children') {
        if (collapsed[parent.key]) return false
        // Check grandparent
        if (parent.level === 1) {
          for (let j = i - 1; j >= 0; j--) {
            const gp = PNL_STRUCTURE[j]
            if (gp.level < parent.level && gp.calc === 'sum_children') {
              if (collapsed[gp.key]) return false
              break
            }
          }
        }
        return true
      }
    }
    return true
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">P&L</h1>
          <p className="text-sm text-slate-500 mt-0.5">{periodLabel} · {dailyReports.length} отчётов · {bankTx.length} банк. записей</p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input text-sm">
            {MONTHS_RU.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input text-sm">
            {[2023, 2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
          </select>
          <div className="flex bg-slate-900 rounded-lg p-0.5">
            <button onClick={() => setViewMode('month')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium', viewMode === 'month' ? 'bg-slate-700 text-white' : 'text-slate-500')}>Месяц</button>
            <button onClick={() => setViewMode('ytd')} className={cn('px-3 py-1.5 rounded-md text-xs font-medium', viewMode === 'ytd' ? 'bg-slate-700 text-white' : 'text-slate-500')}>YTD</button>
          </div>
          <button onClick={toggleAll} className="btn-secondary text-xs flex items-center gap-1.5" title={allExpanded ? 'Свернуть всё' : 'Развернуть всё'}>
            <ChevronsUpDown className="w-4 h-4" />{allExpanded ? 'Свернуть' : 'Развернуть'}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card-hover text-center"><div className="stat-label">Выручка</div><div className="stat-value text-lg text-green-400">{fmt(values.revenue)} ₸</div></div>
        <div className="card-hover text-center"><div className="stat-label">Food Cost</div>
          <div className={cn('stat-value text-lg', values.fc_pct > 0.32 ? 'text-red-400' : 'text-yellow-400')}>{fmtPct(values.fc_pct)}</div></div>
        <div className="card-hover text-center"><div className="stat-label">ФОТ</div><div className="stat-value text-lg text-blue-400">{pct(values.payroll)}</div></div>
        <div className="card-hover text-center"><div className="stat-label">EBITDA</div>
          <div className={cn('stat-value text-lg', values.op_profit >= 0 ? 'text-brand-400' : 'text-red-400')}>{fmt(values.op_profit)} ₸</div></div>
        <div className="card-hover text-center"><div className="stat-label">Чистая прибыль</div>
          <div className={cn('stat-value text-lg', values.net_profit >= 0 ? 'text-brand-400' : 'text-red-400')}>{fmt(values.net_profit)} ₸</div></div>
      </div>

      {/* P&L Table */}
      <div className="card p-0 divide-y divide-slate-800">
        {PNL_STRUCTURE.map((line, idx) => {
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
                <span className="text-sm font-display font-bold">{line.label}</span>
                <div className="flex items-center gap-4">
                  <span className={cn('font-mono text-base font-bold', val >= 0 ? 'text-green-400' : 'text-red-400')}>{fmt(val)} ₸</span>
                  <span className="text-[10px] text-slate-500 w-12 text-right">{pct(val)}</span>
                </div>
              </div>
            )
          }

          if (isRatio) {
            return (
              <div key={line.key} className={cn('flex items-center justify-between px-4 py-2', line.level === 2 && 'pl-10')}>
                <span className={cn('text-sm', line.level === 0 ? 'font-bold' : 'text-slate-400')}>{line.label}</span>
                <span className={cn('font-mono text-sm', val > 0.32 && line.key.includes('fc') ? 'text-red-400' : 'text-slate-300')}>{fmtPct(val)}</span>
              </div>
            )
          }

          // Header (level 0) or Group (level 1) — clickable
          if (isGroup) {
            return (
              <button key={line.key} onClick={() => toggleSection(line.key)}
                className={cn('flex items-center justify-between w-full text-left px-4 py-3 hover:bg-slate-900/50 transition-colors',
                  line.level === 0 && 'bg-slate-900/50',
                  line.level === 1 && 'pl-6')}>
                <div className="flex items-center gap-2">
                  {isCollapsed ? <ChevronRight className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                  <span className={cn('text-sm font-bold', color)}>{line.label}</span>
                </div>
                <div className="flex items-center gap-4">
                  <span className={cn('font-mono text-sm font-bold', color)}>{fmt(val)} ₸</span>
                  <span className="text-[10px] text-slate-500 w-12 text-right">{pct(val)}</span>
                </div>
              </button>
            )
          }

          // Leaf line (level 2)
          return (
            <div key={line.key} className="flex items-center justify-between px-4 py-2 pl-10">
              <span className="text-sm text-slate-400">{line.label}</span>
              <div className="flex items-center gap-4">
                <span className="font-mono text-sm text-slate-300">{fmt(val)} ₸</span>
                <span className="text-[10px] text-slate-500 w-12 text-right">{val > 0 ? pct(val) : '—'}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Manual Adjustments */}
      <div className="card">
        <div className="flex items-center justify-between mb-4">
          <div className="text-sm font-semibold">Ручные корректировки</div>
          <button onClick={() => setShowAddAdj(true)} className="btn-secondary text-xs flex items-center gap-1"><Plus className="w-3.5 h-3.5" /> Добавить</button>
        </div>
        {showAddAdj && (
          <div className="bg-slate-900 rounded-xl p-4 mb-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <select value={adjForm.type} onChange={e => setAdjForm(f => ({...f, type: e.target.value}))} className="input text-sm">
                <option value="income">Доход</option><option value="expense">Расход</option>
              </select>
              <input type="text" inputMode="numeric" value={adjForm.amount} onChange={e => setAdjForm(f => ({...f, amount: e.target.value.replace(/[^0-9]/g, '')}))} className="input text-sm font-mono" placeholder="Сумма" />
              <input value={adjForm.description} onChange={e => setAdjForm(f => ({...f, description: e.target.value}))} className="input text-sm" placeholder="Бонус от поставщика" />
              <div className="flex gap-2">
                <button onClick={saveAdj} className="btn-primary text-sm flex-1">Сохранить</button>
                <button onClick={() => setShowAddAdj(false)} className="btn-secondary text-sm">✕</button>
              </div>
            </div>
          </div>
        )}
        {adjustments.length > 0 ? (
          <div className="space-y-1">{adjustments.map(a => (
            <div key={a.id} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2">
              <div className="flex items-center gap-3 text-sm">
                <span className={cn('badge text-[10px]', a.type === 'income' ? 'badge-green' : 'badge-red')}>{a.type === 'income' ? 'Доход' : 'Расход'}</span>
                <span>{a.description}</span>
              </div>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm">{fmt(a.amount)} ₸</span>
                <button onClick={() => deleteAdj(a.id)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>
          ))}</div>
        ) : <div className="text-xs text-slate-600 text-center py-2">Нет корректировок</div>}
      </div>

      {/* Data Sources */}
      <div className="card border-blue-500/20 bg-blue-500/5">
        <div className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2"><Info className="w-4 h-4" /> Источники данных</div>
        <div className="text-xs text-slate-400 space-y-1">
          <p><FileText className="w-3 h-3 inline mr-1" /> <b className="text-slate-300">Ежедневные отчёты ({dailyReports.length}):</b> Выручка, закуп нал, ЗП авансы нал</p>
          <p><Upload className="w-3 h-3 inline mr-1" /> <b className="text-slate-300">Банковская выписка ({bankTx.length}):</b> Аренда, коммуналка, ФОТ безнал, маркетинг, налоги, комиссии</p>
          <p>P&L собирается <b className="text-slate-300">автоматически</b>. Ручные корректировки — для редких случаев.</p>
        </div>
      </div>
    </div>
  )
}
