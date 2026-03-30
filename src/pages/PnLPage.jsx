import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt, MONTHS_RU } from '@/lib/utils'
import { ChevronDown, ChevronRight, Plus, Trash2, Info, FileText, Upload, ChevronsUpDown, Pencil, Save } from 'lucide-react'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

// Period allocation: how much of a transaction's amount belongs to a specific month
function getTxAmountForMonth(tx, targetYear, targetMonth) {
  const amount = Number(tx.amount) || 0

  // No period set → standard behavior by transaction_date
  if (!tx.period_from || !tx.period_to) {
    const d = new Date(tx.transaction_date)
    return (d.getFullYear() === targetYear && d.getMonth() + 1 === targetMonth) ? amount : 0
  }

  const from = new Date(tx.period_from)
  const to = new Date(tx.period_to)
  const fromYM = from.getFullYear() * 12 + from.getMonth()
  const toYM = to.getFullYear() * 12 + to.getMonth()
  const targetYM = targetYear * 12 + (targetMonth - 1)

  // Target month not in range
  if (targetYM < fromYM || targetYM > toYM) return 0

  // Split evenly across all months in the period
  const totalMonths = toYM - fromYM + 1
  return Math.round(amount / totalMonths)
}

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
  { key: 'payroll', label: 'ФОТ', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'payroll_mgmt', label: 'ФОТ Менеджмент', level: 3, section: 'expenses', source: 'bank:payroll_mgmt' },
  { key: 'payroll_kitchen', label: 'ФОТ Кухня', level: 3, section: 'expenses', source: 'bank:payroll_kitchen' },
  { key: 'payroll_bar', label: 'ФОТ Бар', level: 3, section: 'expenses', source: 'bank:payroll_bar' },
  { key: 'payroll_hookah', label: 'ФОТ Дымный коктейль', level: 3, section: 'expenses', source: 'bank:payroll_hookah' },
  { key: 'payroll_hall', label: 'ФОТ Зал', level: 3, section: 'expenses', source: 'bank:payroll_hall' },
  { key: 'payroll_transport', label: 'Развозка', level: 3, section: 'expenses', source: 'bank:payroll_transport' },
  { key: 'payroll_cash', label: 'ФОТ из кассы (авансы)', level: 3, section: 'expenses', source: 'daily:payroll' },
  { key: 'payroll_other', label: 'ФОТ Прочее', level: 3, section: 'expenses', source: 'bank:payroll_other' },

  // Food Cost
  { key: 'foodcost', label: 'Food cost', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'fc_kitchen', label: 'Закуп кухня', level: 3, section: 'expenses', source: 'both:cogs_kitchen', dailyField: 'suppliers_kitchen' },
  { key: 'fc_bar', label: 'Закуп бар', level: 3, section: 'expenses', source: 'both:cogs_bar', dailyField: 'suppliers_bar' },
  { key: 'fc_hookah', label: 'Закуп кальян', level: 3, section: 'expenses', source: 'both:cogs_hookah', dailyField: 'tobacco' },

  // Маркетинг
  { key: 'marketing', label: 'Маркетинг', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'mkt_smm', label: 'СММ', level: 3, section: 'expenses', source: 'bank:mkt_smm' },
  { key: 'mkt_target', label: 'Таргет', level: 3, section: 'expenses', source: 'bank:mkt_target' },
  { key: 'mkt_2gis', label: '2ГИС', level: 3, section: 'expenses', source: 'bank:mkt_2gis' },
  { key: 'mkt_yandex', label: 'Яндекс', level: 3, section: 'expenses', source: 'bank:mkt_yandex' },
  { key: 'mkt_google', label: 'Google', level: 3, section: 'expenses', source: 'bank:mkt_google' },
  { key: 'mkt_other', label: 'Маркетинг прочее', level: 3, section: 'expenses', source: 'bank:mkt_other' },

  // Аренда
  { key: 'rent', label: 'Аренда', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'rent_premises', label: 'Аренда помещения', level: 3, section: 'expenses', source: 'bank:rent_premises' },
  { key: 'rent_warehouse', label: 'Аренда склада и кровли', level: 3, section: 'expenses', source: 'bank:rent_warehouse' },
  { key: 'rent_property_tax', label: 'Налог на недвижимость', level: 3, section: 'expenses', source: 'bank:rent_property_tax' },

  // Коммунальные
  { key: 'utilities', label: 'Коммунальные платежи', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'util_electric', label: 'Электричество', level: 3, section: 'expenses', source: 'bank:util_electric' },
  { key: 'util_water', label: 'Водоснабжение', level: 3, section: 'expenses', source: 'bank:util_water' },
  { key: 'util_heating', label: 'Отопление', level: 3, section: 'expenses', source: 'bank:util_heating' },
  { key: 'util_bi', label: 'BI Service', level: 3, section: 'expenses', source: 'bank:util_bi' },
  { key: 'util_internet', label: 'Интернет и связь', level: 3, section: 'expenses', source: 'bank:util_internet' },
  { key: 'util_waste', label: 'Вывоз мусора', level: 3, section: 'expenses', source: 'bank:util_waste' },
  { key: 'util_other', label: 'Ком. услуги прочее', level: 3, section: 'expenses', source: 'bank:util_other' },

  // OpEx прочее
  { key: 'opex_other', label: 'OpEx прочее', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'opex_household', label: 'Хозтовары', level: 3, section: 'expenses', source: 'both:household', dailyField: 'other' },
  { key: 'opex_bank_fee', label: 'Комиссия банка', level: 3, section: 'expenses', source: 'bank:bank_fee' },
  { key: 'opex_security', label: 'Система безопасности', level: 3, section: 'expenses', source: 'bank:opex_security' },
  { key: 'opex_software', label: 'Программное обеспечение', level: 3, section: 'expenses', source: 'bank:opex_software' },
  { key: 'opex_menu', label: 'Меню', level: 3, section: 'expenses', source: 'bank:opex_menu' },
  { key: 'opex_pest', label: 'Дератизация/дезинсекция', level: 3, section: 'expenses', source: 'bank:opex_pest' },
  { key: 'opex_grease', label: 'Чистка жироуловителей', level: 3, section: 'expenses', source: 'bank:opex_grease' },
  { key: 'opex_repair', label: 'Мелкий ремонт', level: 3, section: 'expenses', source: 'bank:opex_repair' },
  { key: 'opex_uniform', label: 'Форма для персонала', level: 3, section: 'expenses', source: 'bank:opex_uniform' },
  { key: 'opex_music', label: 'Авторские права на музыку', level: 3, section: 'expenses', source: 'bank:opex_music' },
  { key: 'opex_royalty', label: 'Роялти', level: 3, section: 'expenses', source: 'bank:opex_royalty' },
  { key: 'opex_misc', label: 'Прочее', level: 3, section: 'expenses', source: 'bank:opex_misc' },

  // Налоги
  { key: 'taxes', label: 'Налоги', level: 2, section: 'expenses', calc: 'sum_children', parent: 'opex' },
  { key: 'tax_retail', label: 'Розничный налог', level: 3, section: 'expenses', source: 'bank:tax_retail' },
  { key: 'tax_payroll', label: 'Налоги по зарплате', level: 3, section: 'expenses', source: 'bank:tax_payroll' },
  { key: 'tax_insurance', label: 'Страхование сотрудников', level: 3, section: 'expenses', source: 'bank:tax_insurance' },
  { key: 'tax_alcohol', label: 'Лицензия на алкоголь', level: 3, section: 'expenses', source: 'bank:tax_alcohol' },
  { key: 'tax_hookah', label: 'Лицензия на дымный коктейль', level: 3, section: 'expenses', source: 'bank:tax_hookah' },
  { key: 'tax_other', label: 'Налоги прочее', level: 3, section: 'expenses', source: 'bank:tax_other' },

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
    PNL_STRUCTURE.filter(l => l.level === 2 && l.calc === 'sum_children').forEach(l => { c[l.key] = true })
    return c
  })
  const [editMode, setEditMode] = useState(false)
  const [adjEdits, setAdjEdits] = useState({}) // { [pnl_key]: string amount }

  useEffect(() => { loadData() }, [year, month, viewMode])

  const loadData = async () => {
    setLoading(true)
    const startDate = viewMode === 'ytd' ? `${year}-01-01` : `${year}-${String(month).padStart(2, '0')}-01`
    const endMonth = viewMode === 'ytd' ? 12 : month
    const endDate = `${year}-${String(endMonth).padStart(2, '0')}-${new Date(year, endMonth, 0).getDate()}`

    const [drRes, btRes, adjRes] = await Promise.all([
      supabase.from('daily_reports').select('*').gte('report_date', startDate).lte('report_date', endDate).eq('status', 'submitted'),
      // Fetch bank tx where: transaction_date in range OR period overlaps with range
      supabase.from('bank_transactions').select('*').or(
        `and(transaction_date.gte.${startDate},transaction_date.lte.${endDate}),and(period_from.lte.${endDate},period_to.gte.${startDate})`
      ),
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

    // Determine which months we're computing for
    const startMonth = viewMode === 'ytd' ? 1 : month
    const endMonth = viewMode === 'ytd' ? 12 : month

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

    // Bank expenses by category — period-aware aggregation
    const bankByCat = {}
    bankTx.forEach(tx => {
      if (!tx.category || tx.category === 'uncategorized' || tx.category === 'internal') return
      // Sum the period-allocated amount across all target months
      let txTotal = 0
      for (let m = startMonth; m <= endMonth; m++) {
        txTotal += getTxAmountForMonth(tx, year, m)
      }
      if (txTotal !== 0) {
        bankByCat[tx.category] = (bankByCat[tx.category] || 0) + txTotal
      }
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

    // Calculate group sums (each group = sum of its direct children)
    const groups = ['capex', 'payroll', 'foodcost', 'marketing', 'rent', 'utilities', 'opex_other', 'taxes']
    groups.forEach(gKey => {
      const gIdx = PNL_STRUCTURE.findIndex(l => l.key === gKey)
      if (gIdx < 0) return
      const gLevel = PNL_STRUCTURE[gIdx].level
      let sum = 0
      for (let i = gIdx + 1; i < PNL_STRUCTURE.length; i++) {
        const line = PNL_STRUCTURE[i]
        if (line.level <= gLevel) break
        if (line.level === gLevel + 1 && !line.calc) sum += v[line.key] || 0
      }
      v[gKey] = sum
    })

    v.opex = v.payroll + v.foodcost + v.marketing + v.rent + v.utilities + v.opex_other + v.taxes
    v.expenses = v.capex + v.opex
    v.op_profit = v.revenue - v.opex
    v.net_profit = v.revenue - v.expenses

    // Adjustments — add to specific category or fallback to net_profit
    adjustments.forEach(a => {
      const amt = Number(a.amount) || 0
      if (a.category && v[a.category] !== undefined) {
        v[a.category] += amt
      } else {
        // Legacy adjustments without category
        if (a.type === 'income') v.net_profit += amt
        else v.net_profit -= amt
      }
    })
    // Recalculate revenue and groups after adjustments
    v.revenue = v.rev_kitchen + v.rev_bar + v.rev_hookah + v.rev_other
    groups.forEach(gKey => {
      const gIdx = PNL_STRUCTURE.findIndex(l => l.key === gKey)
      if (gIdx < 0) return
      const gLevel = PNL_STRUCTURE[gIdx].level
      let sum = 0
      for (let i = gIdx + 1; i < PNL_STRUCTURE.length; i++) {
        const line = PNL_STRUCTURE[i]
        if (line.level <= gLevel) break
        if (line.level === gLevel + 1 && !line.calc) sum += v[line.key] || 0
      }
      v[gKey] = sum
    })
    v.opex = v.payroll + v.foodcost + v.marketing + v.rent + v.utilities + v.opex_other + v.taxes
    v.expenses = v.capex + v.opex
    v.op_profit = v.revenue - v.opex
    v.net_profit = v.revenue - v.expenses

    // Ratios
    v.margin_pct = v.revenue > 0 ? v.op_profit / v.revenue : 0
    v.fc_pct = v.revenue > 0 ? v.foodcost / v.revenue : 0
    v.fc_kitchen_pct = revK > 0 ? (v.fc_kitchen / revK) : 0
    v.fc_bar_pct = revB > 0 ? (v.fc_bar / revB) : 0
    v.fc_hookah_pct = revH > 0 ? (v.fc_hookah / revH) : 0

    return v
  }, [dailyReports, bankTx, adjustments, year, month, viewMode])

  const toggleAll = () => {
    const newState = !allExpanded
    setAllExpanded(newState)
    const c = {}
    PNL_STRUCTURE.filter(l => l.calc === 'sum_children').forEach(l => { c[l.key] = !newState })
    setCollapsed(c)
  }
  const toggleSection = (key) => setCollapsed(p => ({ ...p, [key]: !p[key] }))

  const startEdit = () => {
    // Pre-fill adjEdits from existing adjustments
    const edits = {}
    adjustments.forEach(a => {
      if (a.category) edits[a.category] = String(Number(a.amount) || 0)
    })
    setAdjEdits(edits)
    setEditMode(true)
  }

  const saveEdits = async () => {
    const userName = profile?.full_name || 'Unknown'
    // Compute diff: what changed vs existing adjustments
    const existingByKey = {}
    adjustments.forEach(a => {
      if (a.category) existingByKey[a.category] = (existingByKey[a.category] || 0) + Number(a.amount)
    })
    // Insert only the differences as new records (append-only audit log)
    const inserts = Object.entries(adjEdits)
      .map(([key, v]) => {
        const newTotal = Number(v) || 0
        const existing = existingByKey[key] || 0
        const diff = newTotal - existing
        if (diff === 0) return null
        const line = PNL_STRUCTURE.find(l => l.key === key)
        return { year, month, category: key, type: line?.section === 'revenue' ? 'income' : 'expense', amount: diff, description: 'Ручная корректировка', created_by: userName }
      })
      .filter(Boolean)
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

  const periodLabel = viewMode === 'ytd' ? `${year} YTD` : `${MONTHS_RU[month - 1]} ${year}`

  // Count period-allocated bank transactions for info display
  const periodAllocatedCount = bankTx.filter(tx => tx.period_from && tx.period_to).length

  // Determine which lines are visible (hidden if any ancestor is collapsed)
  const isVisible = (line, idx) => {
    if (line.level === 0) return true
    // Walk backwards to find all ancestors and check if any are collapsed
    let targetLevel = line.level
    for (let i = idx - 1; i >= 0; i--) {
      const ancestor = PNL_STRUCTURE[i]
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
          {!editMode ? (
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
          )}
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

          // Header or Group — clickable
          if (isGroup) {
            const padLeft = line.level === 0 ? 'pl-4' : line.level === 1 ? 'pl-6' : 'pl-10'
            return (
              <button key={line.key} onClick={() => toggleSection(line.key)}
                className={cn('flex items-center justify-between w-full text-left px-4 py-3 hover:bg-slate-900/50 transition-colors',
                  line.level === 0 && 'bg-slate-900/50', padLeft)}>
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

          // Leaf line
          const leafPad = line.level <= 2 ? 'pl-10' : 'pl-14'
          const adjVal = adjEdits[line.key] || ''
          const hasAdj = adjVal !== '' && Number(adjVal) !== 0
          return (
            <div key={line.key} className={cn('flex items-center justify-between px-4 py-2', leafPad)}>
              <span className="text-sm text-slate-400">{line.label}</span>
              <div className="flex items-center gap-3">
                <span className="font-mono text-sm text-slate-300">{fmt(val)} ₸</span>
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

      {/* Adjustment audit log */}
      {!editMode && adjustments.length > 0 && (
        <div className="card border-purple-500/20 bg-purple-500/5">
          <div className="text-xs font-semibold text-purple-400 mb-3">Лог корректировок ({adjustments.length})</div>
          <div className="space-y-1.5">
            {[...adjustments].sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)).map(a => {
              const catLine = PNL_STRUCTURE.find(l => l.key === a.category)
              const dt = a.created_at ? new Date(a.created_at) : null
              return (
                <div key={a.id} className="flex items-center justify-between text-xs bg-slate-900/50 rounded-lg px-3 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={cn('font-mono font-bold shrink-0', Number(a.amount) >= 0 ? 'text-green-400' : 'text-red-400')}>
                      {Number(a.amount) > 0 ? '+' : ''}{fmt(a.amount)}
                    </span>
                    <span className="text-slate-400 truncate">{catLine?.label || a.category}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0 text-slate-600">
                    {a.created_by && <span>{a.created_by}</span>}
                    {dt && <span>{dt.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' })} {dt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>}
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
