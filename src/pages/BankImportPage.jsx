import { useState, useEffect, useMemo, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt } from '@/lib/utils'
import { parseBankStatement } from '@/lib/categorize'
import { Upload, Trash2, Settings, Plus, X, Save, Calendar, Pencil, Check } from 'lucide-react'

const MONTHS_SHORT = ['Янв','Фев','Мар','Апр','Май','Июн','Июл','Авг','Сен','Окт','Ноя','Дек']

const FIELDS = [
  { value: 'beneficiary', label: 'Бенефициар' },
  { value: 'purpose', label: 'Назначение' },
  { value: 'knp', label: 'КНП' },
  { value: 'amount', label: 'Сумма' },
  { value: 'is_debit', label: 'Дебет/Кредит' },
]
const OPERATORS = {
  beneficiary: [{ value: 'contains', label: 'содержит' }, { value: 'not_contains', label: 'не содержит' }, { value: 'equals', label: 'равно' }, { value: 'not_equals', label: 'не равно' }, { value: 'starts_with', label: 'начинается с' }],
  purpose: [{ value: 'contains', label: 'содержит' }, { value: 'not_contains', label: 'не содержит' }, { value: 'equals', label: 'равно' }, { value: 'not_equals', label: 'не равно' }, { value: 'starts_with', label: 'начинается с' }],
  knp: [{ value: 'equals', label: 'равно' }, { value: 'not_equals', label: 'не равно' }, { value: 'contains', label: 'содержит' }],
  amount: [{ value: 'gt', label: '>' }, { value: 'gte', label: '≥' }, { value: 'lt', label: '<' }, { value: 'lte', label: '≤' }, { value: 'equals', label: '=' }, { value: 'between', label: 'между' }],
  is_debit: [{ value: 'equals', label: 'равно' }],
}

// Hash for deduplication
function generateTxHash(tx) {
  const str = `${tx.date}|${tx.amount}|${(tx.beneficiary || '').trim().toLowerCase()}|${(tx.purpose || '').slice(0, 100).trim().toLowerCase()}`
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0
  }
  return hash.toString(36)
}
const TYPE_LABELS = { income: 'Доходы', cogs: 'Себестоимость', opex: 'Операционные', below_ebitda: 'Ниже EBITDA', other: 'Прочее' }

// === Period helpers ===
const firstOfMonth = (y, m) => `${y}-${String(m).padStart(2, '0')}-01`
const lastOfMonth = (y, m) => `${y}-${String(m).padStart(2, '0')}-${new Date(y, m, 0).getDate()}`

const formatPeriodBadge = (tx) => {
  const txDate = new Date(tx.transaction_date)
  const txM = txDate.getMonth() // 0-indexed
  const txY = txDate.getFullYear()
  const txLabel = `${MONTHS_SHORT[txM]} ${String(txY).slice(2)}`

  if (!tx.period_from || !tx.period_to) {
    return { label: txLabel, style: 'default' }
  }

  const from = new Date(tx.period_from)
  const to = new Date(tx.period_to)
  const fromM = from.getMonth()
  const fromY = from.getFullYear()
  const toM = to.getMonth()
  const toY = to.getFullYear()
  const totalMonths = (toY * 12 + toM) - (fromY * 12 + fromM) + 1

  if (fromY === toY && fromM === toM) {
    // Single month
    const label = `${MONTHS_SHORT[fromM]} ${String(fromY).slice(2)}`
    const isSameAsTx = fromM === txM && fromY === txY
    return { label, style: isSameAsTx ? 'default' : 'single' }
  }

  // Range
  const fromLabel = `${MONTHS_SHORT[fromM]}`
  const toLabel = `${MONTHS_SHORT[toM]} ${String(toY).slice(2)}`
  return { label: `${fromLabel}-${toLabel} (${totalMonths}м)`, style: 'range' }
}

// === PeriodEditor component ===
const PeriodEditor = ({ tx, onSave, disabled }) => {
  const [open, setOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customFrom, setCustomFrom] = useState({ month: 1, year: 2025 })
  const [customTo, setCustomTo] = useState({ month: 1, year: 2025 })
  const btnRef = useRef(null)
  const popRef = useRef(null)

  const txDate = new Date(tx.transaction_date)
  const txM = txDate.getMonth() + 1 // 1-indexed
  const txY = txDate.getFullYear()

  // Close popover on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (popRef.current && !popRef.current.contains(e.target) && btnRef.current && !btnRef.current.contains(e.target)) {
        setOpen(false); setShowCustom(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const badge = formatPeriodBadge(tx)
  const badgeClass = {
    default: 'bg-slate-800 text-slate-400 border-slate-700',
    single: 'bg-green-500/15 text-green-400 border-green-500/30',
    range: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  }[badge.style]

  const save = async (from, to) => {
    await onSave(tx.id, from, to)
    setOpen(false); setShowCustom(false)
  }

  const handlePreset = (preset) => {
    if (preset === 'current') {
      save(null, null)
    } else if (preset === 'prev_month') {
      const pm = txM === 1 ? 12 : txM - 1
      const py = txM === 1 ? txY - 1 : txY
      save(firstOfMonth(py, pm), lastOfMonth(py, pm))
    } else if (preset === 'prev_quarter') {
      // 3 months before tx month
      let fm = txM - 3, fy = txY
      if (fm <= 0) { fm += 12; fy-- }
      let tm = txM - 1, ty = txY
      if (tm <= 0) { tm += 12; ty-- }
      save(firstOfMonth(fy, fm), lastOfMonth(ty, tm))
    } else if (preset === 'fwd3') {
      const toM3 = txM + 2
      const toY3 = txY + Math.floor((toM3 - 1) / 12)
      const toM3adj = ((toM3 - 1) % 12) + 1
      save(firstOfMonth(txY, txM), lastOfMonth(toY3, toM3adj))
    } else if (preset === 'fwd6') {
      const toM6 = txM + 5
      const toY6 = txY + Math.floor((toM6 - 1) / 12)
      const toM6adj = ((toM6 - 1) % 12) + 1
      save(firstOfMonth(txY, txM), lastOfMonth(toY6, toM6adj))
    }
  }

  const handleCustomSave = () => {
    save(firstOfMonth(customFrom.year, customFrom.month), lastOfMonth(customTo.year, customTo.month))
  }

  const openCustom = () => {
    // Initialize custom selects from existing period or tx date
    if (tx.period_from) {
      const f = new Date(tx.period_from)
      const t = new Date(tx.period_to)
      setCustomFrom({ month: f.getMonth() + 1, year: f.getFullYear() })
      setCustomTo({ month: t.getMonth() + 1, year: t.getFullYear() })
    } else {
      setCustomFrom({ month: txM, year: txY })
      setCustomTo({ month: txM, year: txY })
    }
    setShowCustom(true)
  }

  const years = [2023, 2024, 2025, 2026]

  return (
    <div className="relative inline-block">
      <button ref={btnRef} onClick={() => { if (!disabled) setOpen(!open) }}
        disabled={disabled}
        className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-medium transition-colors whitespace-nowrap',
          badgeClass, !disabled && 'cursor-pointer hover:brightness-125')}>
        <Calendar className="w-3 h-3" />{badge.label}
      </button>

      {open && (
        <div ref={popRef}
          className="absolute z-[60] top-full right-0 mt-1 bg-slate-850 border border-slate-700 rounded-xl shadow-2xl p-2 min-w-[180px]"
          style={{ zIndex: 60 }}>
          {!showCustom ? (
            <div className="space-y-0.5">
              <button onClick={() => handlePreset('current')} className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-slate-800 text-slate-300">Текущий</button>
              <button onClick={() => handlePreset('prev_month')} className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-slate-800 text-slate-300">Пред. месяц</button>
              <button onClick={() => handlePreset('prev_quarter')} className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-slate-800 text-slate-300">Пред. квартал (3м)</button>
              <button onClick={() => handlePreset('fwd3')} className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-slate-800 text-slate-300">Вперёд 3 мес</button>
              <button onClick={() => handlePreset('fwd6')} className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-slate-800 text-slate-300">Вперёд 6 мес</button>
              <div className="h-px bg-slate-700 my-1" />
              <button onClick={openCustom} className="w-full text-left px-3 py-1.5 text-xs rounded-lg hover:bg-slate-800 text-brand-400 font-medium">Свой…</button>
            </div>
          ) : (
            <div className="space-y-2 min-w-[220px]">
              <div className="text-[10px] font-semibold text-slate-500 uppercase px-1">С</div>
              <div className="flex gap-1.5">
                <select value={customFrom.month} onChange={e => setCustomFrom(p => ({ ...p, month: Number(e.target.value) }))} className="input text-xs py-1 px-1.5 flex-1">
                  {MONTHS_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={customFrom.year} onChange={e => setCustomFrom(p => ({ ...p, year: Number(e.target.value) }))} className="input text-xs py-1 px-1.5 w-20">
                  {years.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div className="text-[10px] font-semibold text-slate-500 uppercase px-1">По</div>
              <div className="flex gap-1.5">
                <select value={customTo.month} onChange={e => setCustomTo(p => ({ ...p, month: Number(e.target.value) }))} className="input text-xs py-1 px-1.5 flex-1">
                  {MONTHS_SHORT.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
                <select value={customTo.year} onChange={e => setCustomTo(p => ({ ...p, year: Number(e.target.value) }))} className="input text-xs py-1 px-1.5 w-20">
                  {years.map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
              <div className="flex gap-1.5 pt-1">
                <button onClick={handleCustomSave} className="btn-primary text-[11px] py-1 px-3 flex-1">OK</button>
                <button onClick={() => setShowCustom(false)} className="btn-secondary text-[11px] py-1 px-3">Назад</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BankImportPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('bank_import.categorize')
  const [transactions, setTransactions] = useState([])
  const [categories, setCategories] = useState([])
  const [rules, setRules] = useState([])
  const [ruleConditions, setRuleConditions] = useState([])
  const [showRules, setShowRules] = useState(false)
  const [showAddRule, setShowAddRule] = useState(false)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [selectedIds, setSelectedIds] = useState(new Set())
  const [stagedRows, setStagedRows] = useState(null) // parsed rows awaiting confirmation
  const [stagedMeta, setStagedMeta] = useState({ hidden: 0, duplicates: 0, fileName: '' })
  const [savingStaged, setSavingStaged] = useState(false)
  const [newRule, setNewRule] = useState({
    name: '', logic: 'and', category_code: '', action: 'categorize',
    conditions: [{ field: 'beneficiary', operator: 'contains', value: '' }],
  })
  const [editingRule, setEditingRule] = useState(null) // { id, name, logic, category_code, action, conditions: [...] }

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [txRes, catRes, rulesRes, condRes] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }).limit(500),
      supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
      supabase.from('bank_rules').select('*').eq('is_active', true).order('created_at'),
      supabase.from('bank_rule_conditions').select('*').order('sort_order'),
    ])
    setTransactions(txRes.data || [])
    setCategories(catRes.data || [])
    setRules(rulesRes.data || [])
    setRuleConditions(condRes.data || [])
    setLoading(false)
  }

  const catMap = useMemo(() => { const m = {}; categories.forEach(c => { m[c.code] = c }); return m }, [categories])
  const catName = (code) => catMap[code]?.name || code

  const catGroups = useMemo(() => {
    const groups = {}
    categories.forEach(c => { if (!groups[c.type]) groups[c.type] = []; groups[c.type].push(c) })
    return groups
  }, [categories])

  const fullRules = useMemo(() => {
    return rules.map(r => ({ ...r, conditions: ruleConditions.filter(c => c.rule_id === r.id) }))
  }, [rules, ruleConditions])

  const matchCondition = (tx, cond) => {
    if (cond.field === 'is_debit') {
      // Support both parsed (isDebit) and DB (is_debit) field names
      const val = tx.is_debit !== undefined ? tx.is_debit : tx.isDebit
      return String(val) === cond.value
    }
    const fieldVal = (() => {
      if (cond.field === 'beneficiary') return tx.beneficiary || ''
      if (cond.field === 'purpose') return tx.purpose || ''
      if (cond.field === 'knp') return tx.knp || ''
      if (cond.field === 'amount') return String(Math.abs(tx.amount || 0))
      return ''
    })()
    switch (cond.operator) {
      case 'contains': return fieldVal.toLowerCase().includes(cond.value.toLowerCase())
      case 'not_contains': return !fieldVal.toLowerCase().includes(cond.value.toLowerCase())
      case 'equals': return fieldVal.toLowerCase() === cond.value.toLowerCase()
      case 'not_equals': return fieldVal.toLowerCase() !== cond.value.toLowerCase()
      case 'starts_with': return fieldVal.toLowerCase().startsWith(cond.value.toLowerCase())
      case 'gt': return Number(fieldVal) > Number(cond.value)
      case 'gte': return Number(fieldVal) >= Number(cond.value)
      case 'lt': return Number(fieldVal) < Number(cond.value)
      case 'lte': return Number(fieldVal) <= Number(cond.value)
      case 'between': {
        const [min, max] = cond.value.split('-').map(Number)
        const num = Number(fieldVal)
        return num >= min && num <= max
      }
      default: return false
    }
  }

  // Step 1: Parse file → stage rows for preview (no DB write)
  const handleFile = async (e) => {
    const file = e.target.files[0]; if (!file) return
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data); const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1 })
      const batchId = crypto.randomUUID()

      // parseBankStatement now handles date parsing and column mapping internally
      const parsed = parseBankStatement(rows)
      const [rRes, cRes] = await Promise.all([
        supabase.from('bank_rules').select('*').eq('is_active', true),
        supabase.from('bank_rule_conditions').select('*'),
      ])
      const freshRules = (rRes.data || []).map(r => ({ ...r, conditions: (cRes.data || []).filter(c => c.rule_id === r.id) }))
      let hidden = 0; const toInsert = []
      for (const tx of parsed) {
        let ruleMatch = null
        for (const rule of freshRules) {
          if (rule.conditions.length === 0) continue
          const matches = rule.conditions.map(c => matchCondition(tx, c))
          const pass = rule.logic === 'and' ? matches.every(Boolean) : matches.some(Boolean)
          if (pass) { ruleMatch = { category: rule.category_code, action: rule.action }; break }
        }
        if (ruleMatch?.action === 'hide') { hidden++; continue }
        // Default period = month of the transaction date (date is already YYYY-MM-DD from parseBankStatement)
        const txDate = new Date(tx.date)
        const txY = !isNaN(txDate) ? txDate.getFullYear() : new Date().getFullYear()
        const txM = !isNaN(txDate) ? txDate.getMonth() + 1 : (new Date().getMonth() + 1)
        toInsert.push({
          transaction_date: tx.date, amount: Math.abs(tx.amount), is_debit: tx.isDebit,
          beneficiary: tx.beneficiary || '', purpose: tx.purpose || '', knp: tx.knp || '',
          category: ruleMatch?.category || tx.category || 'uncategorized',
          confidence: ruleMatch ? 'auto' : tx.confidence || 'low', import_file: file.name, import_batch_id: batchId,
          tx_hash: generateTxHash(tx),
          period_from: firstOfMonth(txY, txM), period_to: lastOfMonth(txY, txM),
        })
      }
      // Check for duplicates but don't insert yet
      let duplicates = 0
      let newRows = toInsert
      if (toInsert.length > 0) {
        const hashes = toInsert.map(t => t.tx_hash).filter(Boolean)
        const { data: existing } = await supabase.from('bank_transactions')
          .select('tx_hash').in('tx_hash', hashes)
        const existingSet = new Set((existing || []).map(e => e.tx_hash))
        newRows = toInsert.filter(t => !t.tx_hash || !existingSet.has(t.tx_hash))
        duplicates = toInsert.length - newRows.length
      }
      // Stage for preview
      setStagedRows(newRows)
      setStagedMeta({ hidden, duplicates, fileName: file.name })
    } catch (err) { alert('Ошибка: ' + err.message) }
    setImporting(false); e.target.value = ''
  }

  // Step 2: User confirms → write staged rows to DB
  const commitStaged = async () => {
    if (!stagedRows || stagedRows.length === 0) return
    setSavingStaged(true)
    try {
      const { error } = await supabase.from('bank_transactions').insert(stagedRows)
      if (error) throw error
      alert(`✅ Сохранено ${stagedRows.length} записей`)
      setStagedRows(null)
      load()
    } catch (err) { alert('Ошибка: ' + err.message) }
    setSavingStaged(false)
  }

  const cancelStaged = () => { setStagedRows(null); setStagedSelected(new Set()); setStagedSort({ col: 'category', dir: 'asc' }) }
  const [stagedSelected, setStagedSelected] = useState(new Set())
  const [stagedSort, setStagedSort] = useState({ col: 'category', dir: 'asc' }) // default: categorized first
  const updateStagedCategory = (idx, category) => {
    setStagedRows(prev => prev.map((r, i) => i === idx ? { ...r, category, confidence: 'manual' } : r))
  }
  const updateStagedPeriod = (idx, periodFrom, periodTo) => {
    setStagedRows(prev => prev.map((r, i) => i === idx ? { ...r, period_from: periodFrom, period_to: periodTo } : r))
  }
  const toggleStagedSelect = (idx) => setStagedSelected(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s })
  const deleteStagedSelected = () => {
    setStagedRows(prev => prev.filter((_, i) => !stagedSelected.has(i)))
    setStagedSelected(new Set())
  }
  const toggleStagedSort = (col) => {
    setStagedSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' })
  }
  const sortedStaged = useMemo(() => {
    if (!stagedRows) return []
    const { col, dir } = stagedSort
    const mult = dir === 'asc' ? 1 : -1
    return stagedRows.map((r, i) => ({ ...r, _idx: i })).sort((a, b) => {
      let cmp = 0
      if (col === 'transaction_date') cmp = (a.transaction_date || '').localeCompare(b.transaction_date || '')
      else if (col === 'beneficiary') cmp = (a.beneficiary || '').localeCompare(b.beneficiary || '')
      else if (col === 'purpose') cmp = (a.purpose || '').localeCompare(b.purpose || '')
      else if (col === 'amount') cmp = (a.amount || 0) - (b.amount || 0)
      else if (col === 'period') cmp = (a.period_from || '').localeCompare(b.period_from || '')
      else if (col === 'category') {
        // Categorized first (asc), uncategorized first (desc)
        if (a.category !== 'uncategorized' && b.category === 'uncategorized') cmp = -1
        else if (a.category === 'uncategorized' && b.category !== 'uncategorized') cmp = 1
        else cmp = (a.category || '').localeCompare(b.category || '')
      }
      return cmp * mult
    })
  }, [stagedRows, stagedSort])

  const updateCategory = async (id, category) => {
    await supabase.from('bank_transactions').update({ category, confidence: 'manual' }).eq('id', id)
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, category, confidence: 'manual' } : t))
  }

  const updatePeriod = async (id, periodFrom, periodTo) => {
    await supabase.from('bank_transactions').update({ period_from: periodFrom, period_to: periodTo }).eq('id', id)
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, period_from: periodFrom, period_to: periodTo } : t))
  }

  const deleteTransaction = async (id) => {
    const { error } = await supabase.from('bank_transactions').delete().eq('id', id)
    if (error) return alert('Ошибка удаления: ' + error.message)
    setTransactions(prev => prev.filter(t => t.id !== id))
  }
  const deleteSelected = async () => {
    const ids = [...selectedIds]; if (!confirm(`Удалить ${ids.length} записей?`)) return
    const { error } = await supabase.from('bank_transactions').delete().in('id', ids)
    if (error) return alert('Ошибка удаления: ' + error.message)
    setSelectedIds(new Set()); load()
  }

  const addCondition = () => setNewRule(r => ({ ...r, conditions: [...r.conditions, { field: 'beneficiary', operator: 'contains', value: '' }] }))
  const removeCondition = (idx) => setNewRule(r => ({ ...r, conditions: r.conditions.filter((_, i) => i !== idx) }))
  const updateCondition = (idx, key, val) => {
    setNewRule(r => ({ ...r, conditions: r.conditions.map((c, i) => {
      if (i !== idx) return c
      const u = { ...c, [key]: val }
      if (key === 'field') {
        u.operator = OPERATORS[val]?.[0]?.value || 'contains'
        if (val === 'is_debit') u.value = 'true'
      }
      return u
    })}))
  }
  const saveRule = async () => {
    if (!newRule.name.trim()) return alert('Введите название')
    if (newRule.action === 'categorize' && !newRule.category_code) return alert('Выберите категорию')
    if (newRule.conditions.some(c => !c.value.trim())) return alert('Заполните все условия')
    const { data: rule, error } = await supabase.from('bank_rules').insert({
      name: newRule.name, logic: newRule.logic,
      category_code: newRule.action === 'hide' ? 'uncategorized' : newRule.category_code, action: newRule.action,
    }).select().single()
    if (error) return alert('Ошибка: ' + error.message)
    await supabase.from('bank_rule_conditions').insert(newRule.conditions.map((c, i) => ({ rule_id: rule.id, field: c.field, operator: c.operator, value: c.value, sort_order: i })))
    setNewRule({ name: '', logic: 'and', category_code: '', action: 'categorize', conditions: [{ field: 'beneficiary', operator: 'contains', value: '' }] })
    setShowAddRule(false); load()
  }
  const deleteRule = async (id) => { if (!confirm('Удалить правило?')) return; await supabase.from('bank_rules').delete().eq('id', id); load() }

  // === Edit rule functions ===
  const startEdit = (rule) => {
    setEditingRule({
      id: rule.id,
      name: rule.name,
      logic: rule.logic,
      category_code: rule.category_code,
      action: rule.action,
      conditions: rule.conditions.map(c => ({ field: c.field, operator: c.operator, value: c.value })),
    })
  }
  const cancelEdit = () => setEditingRule(null)
  const addEditCondition = () => setEditingRule(r => ({ ...r, conditions: [...r.conditions, { field: 'beneficiary', operator: 'contains', value: '' }] }))
  const removeEditCondition = (idx) => setEditingRule(r => ({ ...r, conditions: r.conditions.filter((_, i) => i !== idx) }))
  const updateEditCondition = (idx, key, val) => {
    setEditingRule(r => ({ ...r, conditions: r.conditions.map((c, i) => {
      if (i !== idx) return c
      const u = { ...c, [key]: val }
      if (key === 'field') {
        u.operator = OPERATORS[val]?.[0]?.value || 'contains'
        if (val === 'is_debit') u.value = 'true'
      }
      return u
    })}))
  }
  const updateRule = async () => {
    if (!editingRule.name.trim()) return alert('Введите название')
    if (editingRule.action === 'categorize' && !editingRule.category_code) return alert('Выберите категорию')
    if (editingRule.conditions.some(c => !c.value.trim())) return alert('Заполните все условия')
    const { error } = await supabase.from('bank_rules').update({
      name: editingRule.name, logic: editingRule.logic,
      category_code: editingRule.action === 'hide' ? 'uncategorized' : editingRule.category_code, action: editingRule.action,
    }).eq('id', editingRule.id)
    if (error) return alert('Ошибка: ' + error.message)
    // Replace conditions: delete old, insert new
    await supabase.from('bank_rule_conditions').delete().eq('rule_id', editingRule.id)
    await supabase.from('bank_rule_conditions').insert(
      editingRule.conditions.map((c, i) => ({ rule_id: editingRule.id, field: c.field, operator: c.operator, value: c.value, sort_order: i }))
    )
    setEditingRule(null); load()
  }

  const sorted = [...transactions].sort((a, b) => {
    if (a.category === 'uncategorized' && b.category !== 'uncategorized') return -1
    if (a.category !== 'uncategorized' && b.category === 'uncategorized') return 1
    return new Date(b.transaction_date) - new Date(a.transaction_date)
  })
  const uncatCount = transactions.filter(t => t.category === 'uncategorized').length
  const toggleSelect = (id) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Импорт выписки</h1>
          <p className="text-sm text-slate-500 mt-0.5">{transactions.length} записей{uncatCount > 0 ? ` · ${uncatCount} не распознано` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <button onClick={() => setShowRules(!showRules)}
              className={cn('btn-secondary text-sm flex items-center gap-2', showRules && 'border-brand-500/50')}>
              <Settings className="w-4 h-4" /> Правила ({fullRules.length})
            </button>
          )}
          <label className={cn('btn-primary text-sm flex items-center gap-2 cursor-pointer', importing && 'opacity-50')}>
            <Upload className="w-4 h-4" />{importing ? 'Импорт...' : 'Загрузить Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" disabled={importing} />
          </label>
        </div>
      </div>

      {/* RULES PANEL */}
      {showRules && canManage && (
        <div className="card border-brand-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-brand-400">Правила автокатегоризации</div>
            <button onClick={() => setShowAddRule(!showAddRule)} className="btn-primary text-xs flex items-center gap-1.5"><Plus className="w-3.5 h-3.5" /> Новое правило</button>
          </div>

          {showAddRule && (
            <div className="bg-slate-900 rounded-xl p-4 space-y-4 border border-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="label">Название *</label>
                  <input value={newRule.name} onChange={e => setNewRule(r => ({...r, name: e.target.value}))} className="input text-sm w-full" placeholder="Аренда от ТОО Алатау" /></div>
                <div><label className="label">Действие</label>
                  <select value={newRule.action} onChange={e => setNewRule(r => ({...r, action: e.target.value}))} className="input text-sm w-full">
                    <option value="categorize">Категоризовать</option><option value="hide">Скрыть</option>
                  </select></div>
                {newRule.action === 'categorize' && (
                  <div><label className="label">Категория *</label>
                    <select value={newRule.category_code} onChange={e => setNewRule(r => ({...r, category_code: e.target.value}))} className="input text-sm w-full">
                      <option value="">— Выберите —</option>
                      {Object.entries(catGroups).map(([type, cats]) => (
                        <optgroup key={type} label={TYPE_LABELS[type] || type}>
                          {cats.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                )}
              </div>
              {/* Conditions */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <label className="label mb-0">Условия</label>
                  {newRule.conditions.length > 1 && (
                    <div className="flex bg-slate-800 rounded-lg p-0.5">
                      <button onClick={() => setNewRule(r => ({...r, logic: 'and'}))} className={cn('px-3 py-1 rounded-md text-xs font-medium', newRule.logic === 'and' ? 'bg-brand-500 text-white' : 'text-slate-500')}>И (AND)</button>
                      <button onClick={() => setNewRule(r => ({...r, logic: 'or'}))} className={cn('px-3 py-1 rounded-md text-xs font-medium', newRule.logic === 'or' ? 'bg-brand-500 text-white' : 'text-slate-500')}>ИЛИ (OR)</button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {newRule.conditions.map((cond, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {idx > 0 && <span className="text-[10px] font-bold text-brand-400 w-8 text-center">{newRule.logic === 'and' ? 'И' : 'ИЛИ'}</span>}
                      {idx === 0 && newRule.conditions.length > 1 && <span className="w-8" />}
                      <select value={cond.field} onChange={e => updateCondition(idx, 'field', e.target.value)} className="input text-xs w-32">
                        {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <select value={cond.operator} onChange={e => updateCondition(idx, 'operator', e.target.value)} className="input text-xs w-32">
                        {(OPERATORS[cond.field] || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {cond.operator === 'between' ? (
                        <div className="flex items-center gap-1 flex-1">
                          <input value={cond.value.split('-')[0] || ''} onChange={e => updateCondition(idx, 'value', `${e.target.value}-${cond.value.split('-')[1] || ''}`)} className="input text-xs w-20 font-mono" placeholder="от" />
                          <span className="text-slate-500 text-xs">—</span>
                          <input value={cond.value.split('-')[1] || ''} onChange={e => updateCondition(idx, 'value', `${cond.value.split('-')[0] || ''}-${e.target.value}`)} className="input text-xs w-20 font-mono" placeholder="до" />
                        </div>
                      ) : cond.field === 'is_debit' ? (
                        <select value={cond.value} onChange={e => updateCondition(idx, 'value', e.target.value)} className="input text-xs flex-1">
                          <option value="true">Дебет (расход)</option>
                          <option value="false">Кредит (приход)</option>
                        </select>
                      ) : (
                        <input value={cond.value} onChange={e => updateCondition(idx, 'value', e.target.value)} className="input text-xs flex-1 font-mono" placeholder={cond.field === 'amount' ? '100000' : 'Ключевое слово'} />
                      )}
                      {newRule.conditions.length > 1 && <button onClick={() => removeCondition(idx)} className="p-1 text-slate-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>}
                    </div>
                  ))}
                </div>
                <button onClick={addCondition} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-2"><Plus className="w-3.5 h-3.5" /> Добавить условие</button>
              </div>
              <div className="flex gap-2 pt-2 border-t border-slate-700">
                <button onClick={saveRule} className="btn-primary text-sm">Сохранить</button>
                <button onClick={() => setShowAddRule(false)} className="btn-secondary text-sm">Отмена</button>
              </div>
            </div>
          )}

          {/* Existing rules list */}
          <div className="space-y-2">
            {fullRules.map(rule => editingRule?.id === rule.id ? (
              /* ── EDIT MODE ── */
              <div key={rule.id} className="bg-slate-900 rounded-xl p-4 space-y-4 border border-brand-500/40">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div><label className="label">Название *</label>
                    <input value={editingRule.name} onChange={e => setEditingRule(r => ({...r, name: e.target.value}))} className="input text-sm w-full" /></div>
                  <div><label className="label">Действие</label>
                    <select value={editingRule.action} onChange={e => setEditingRule(r => ({...r, action: e.target.value}))} className="input text-sm w-full">
                      <option value="categorize">Категоризовать</option><option value="hide">Скрыть</option>
                    </select></div>
                  {editingRule.action === 'categorize' && (
                    <div><label className="label">Категория *</label>
                      <select value={editingRule.category_code} onChange={e => setEditingRule(r => ({...r, category_code: e.target.value}))} className="input text-sm w-full">
                        <option value="">— Выберите —</option>
                        {Object.entries(catGroups).map(([type, cats]) => (
                          <optgroup key={type} label={TYPE_LABELS[type] || type}>
                            {cats.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-3 mb-3">
                    <label className="label mb-0">Условия</label>
                    {editingRule.conditions.length > 1 && (
                      <div className="flex bg-slate-800 rounded-lg p-0.5">
                        <button onClick={() => setEditingRule(r => ({...r, logic: 'and'}))} className={cn('px-3 py-1 rounded-md text-xs font-medium', editingRule.logic === 'and' ? 'bg-brand-500 text-white' : 'text-slate-500')}>И (AND)</button>
                        <button onClick={() => setEditingRule(r => ({...r, logic: 'or'}))} className={cn('px-3 py-1 rounded-md text-xs font-medium', editingRule.logic === 'or' ? 'bg-brand-500 text-white' : 'text-slate-500')}>ИЛИ (OR)</button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    {editingRule.conditions.map((cond, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        {idx > 0 && <span className="text-[10px] font-bold text-brand-400 w-8 text-center">{editingRule.logic === 'and' ? 'И' : 'ИЛИ'}</span>}
                        {idx === 0 && editingRule.conditions.length > 1 && <span className="w-8" />}
                        <select value={cond.field} onChange={e => updateEditCondition(idx, 'field', e.target.value)} className="input text-xs w-32">
                          {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                        <select value={cond.operator} onChange={e => updateEditCondition(idx, 'operator', e.target.value)} className="input text-xs w-32">
                          {(OPERATORS[cond.field] || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                        </select>
                        {cond.operator === 'between' ? (
                          <div className="flex items-center gap-1 flex-1">
                            <input value={cond.value.split('-')[0] || ''} onChange={e => updateEditCondition(idx, 'value', `${e.target.value}-${cond.value.split('-')[1] || ''}`)} className="input text-xs w-20 font-mono" placeholder="от" />
                            <span className="text-slate-500 text-xs">—</span>
                            <input value={cond.value.split('-')[1] || ''} onChange={e => updateEditCondition(idx, 'value', `${cond.value.split('-')[0] || ''}-${e.target.value}`)} className="input text-xs w-20 font-mono" placeholder="до" />
                          </div>
                        ) : cond.field === 'is_debit' ? (
                          <select value={cond.value} onChange={e => updateEditCondition(idx, 'value', e.target.value)} className="input text-xs flex-1">
                            <option value="true">Дебет (расход)</option>
                            <option value="false">Кредит (приход)</option>
                          </select>
                        ) : (
                          <input value={cond.value} onChange={e => updateEditCondition(idx, 'value', e.target.value)} className="input text-xs flex-1 font-mono" placeholder={cond.field === 'amount' ? '100000' : 'Ключевое слово'} />
                        )}
                        {editingRule.conditions.length > 1 && <button onClick={() => removeEditCondition(idx)} className="p-1 text-slate-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>}
                      </div>
                    ))}
                  </div>
                  <button onClick={addEditCondition} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-2"><Plus className="w-3.5 h-3.5" /> Добавить условие</button>
                </div>
                <div className="flex gap-2 pt-2 border-t border-slate-700">
                  <button onClick={updateRule} className="btn-primary text-sm flex items-center gap-1.5"><Save className="w-3.5 h-3.5" /> Сохранить</button>
                  <button onClick={cancelEdit} className="btn-secondary text-sm">Отмена</button>
                </div>
              </div>
            ) : (
              /* ── READ MODE ── */
              <div key={rule.id} className="bg-slate-900 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{rule.name}</span>
                    <span className="text-slate-500">→</span>
                    {rule.action === 'hide' ? <span className="badge badge-red text-[10px]">Скрыть</span> : <span className="badge badge-green text-[10px]">{catName(rule.category_code)}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => startEdit(rule)} className="p-1 text-slate-600 hover:text-brand-400"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => deleteRule(rule.id)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {rule.conditions.map((c, i) => (
                    <span key={c.id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-[10px] font-bold text-brand-400">{rule.logic === 'and' ? 'И' : 'ИЛИ'}</span>}
                      <span className="text-[11px] bg-slate-800 rounded-lg px-2 py-1 font-mono">
                        <span className="text-blue-400">{FIELDS.find(f => f.value === c.field)?.label}</span>
                        <span className="text-slate-500 mx-1">{OPERATORS[c.field]?.find(o => o.value === c.operator)?.label}</span>
                        <span className="text-amber-400">«{c.field === 'is_debit' ? (c.value === 'true' ? 'Дебет' : 'Кредит') : c.value}»</span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {fullRules.length === 0 && <div className="text-xs text-slate-600 text-center py-4">Нет правил</div>}
          </div>
        </div>
      )}

      {/* STAGED IMPORT PREVIEW */}
      {stagedRows && (
        <div className="card border-green-500/30 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="text-sm font-semibold text-green-400">Предпросмотр импорта: {stagedMeta.fileName}</div>
              <p className="text-xs text-slate-500 mt-0.5">
                {stagedRows.length} новых записей
                {stagedMeta.duplicates > 0 && ` · ${stagedMeta.duplicates} дублей пропущено`}
                {stagedMeta.hidden > 0 && ` · ${stagedMeta.hidden} скрыто правилами`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {stagedSelected.size > 0 && (
                <button onClick={deleteStagedSelected} className="btn-danger text-sm flex items-center gap-1.5">
                  <Trash2 className="w-3.5 h-3.5" /> Убрать ({stagedSelected.size})
                </button>
              )}
              <button onClick={commitStaged} disabled={savingStaged || stagedRows.length === 0}
                className={cn('btn-primary text-sm flex items-center gap-1.5', savingStaged && 'opacity-50')}>
                <Check className="w-4 h-4" />{savingStaged ? 'Сохранение...' : `Сохранить (${stagedRows.length})`}
              </button>
              <button onClick={cancelStaged} className="btn-secondary text-sm">Отмена</button>
            </div>
          </div>
          {stagedRows.length > 0 && (
            <div className="overflow-x-auto max-h-[400px] overflow-y-auto">
              <table className="w-full text-sm min-w-[1000px]">
                <thead><tr>
                  <th className="table-header w-8"><input type="checkbox" onChange={e => {
                    if (e.target.checked) setStagedSelected(new Set(stagedRows.map((_, i) => i)))
                    else setStagedSelected(new Set())
                  }} checked={stagedSelected.size === stagedRows.length && stagedRows.length > 0} /></th>
                  {[
                    { key: 'transaction_date', label: 'Дата', align: 'text-left' },
                    { key: 'beneficiary', label: 'Бенефициар', align: 'text-left' },
                    { key: 'purpose', label: 'Назначение', align: 'text-left' },
                    { key: 'amount', label: 'Сумма', align: 'text-right' },
                    { key: 'period', label: 'Период', align: 'text-center' },
                    { key: 'category', label: 'Категория', align: 'text-center' },
                  ].map(h => (
                    <th key={h.key} onClick={() => toggleStagedSort(h.key)}
                      className={cn('table-header cursor-pointer select-none hover:text-brand-400', h.align)}>
                      {h.label} {stagedSort.col === h.key && (stagedSort.dir === 'asc' ? '↑' : '↓')}
                    </th>
                  ))}
                </tr></thead>
                <tbody>
                  {sortedStaged.map(tx => (
                    <tr key={tx._idx} className={cn('hover:bg-slate-800/30', tx.category === 'uncategorized' && 'bg-yellow-500/5')}>
                      <td className="table-cell"><input type="checkbox" checked={stagedSelected.has(tx._idx)} onChange={() => toggleStagedSelect(tx._idx)} /></td>
                      <td className="table-cell text-xs text-slate-400 whitespace-nowrap">{tx.transaction_date}</td>
                      <td className="table-cell text-xs max-w-[200px] truncate" title={tx.beneficiary}>{tx.beneficiary || '—'}</td>
                      <td className="table-cell text-xs max-w-[200px] truncate text-slate-500" title={tx.purpose}>{tx.purpose || '—'}</td>
                      <td className={cn('table-cell text-right font-mono text-xs font-semibold', tx.is_debit ? 'text-red-400' : 'text-green-400')}>
                        {tx.is_debit ? '-' : '+'}{fmt(tx.amount)} ₸
                      </td>
                      <td className="table-cell text-center">
                        <PeriodEditor tx={{ ...tx, transaction_date: tx.transaction_date }} onSave={(_, from, to) => updateStagedPeriod(tx._idx, from, to)} disabled={false} />
                      </td>
                      <td className="table-cell text-center">
                        <select value={tx.category || 'uncategorized'} onChange={e => updateStagedCategory(tx._idx, e.target.value)}
                          className={cn('input text-[11px] py-1 px-2 w-44', tx.category === 'uncategorized' && '!border-yellow-500/50 !bg-yellow-500/10')}>
                          <option value="uncategorized">— Не распознано —</option>
                          {Object.entries(catGroups).map(([type, cats]) => (
                            <optgroup key={type} label={TYPE_LABELS[type] || type}>
                              {cats.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {stagedRows.length === 0 && (
            <div className="text-xs text-slate-500 text-center py-4">Все записи являются дублями — нечего импортировать</div>
          )}
        </div>
      )}

      {selectedIds.size > 0 && (
        <div className="card flex items-center justify-between bg-red-500/5 border-red-500/20">
          <span className="text-sm">Выбрано: {selectedIds.size}</span>
          <button onClick={deleteSelected} className="btn-danger text-sm flex items-center gap-2"><Trash2 className="w-4 h-4" /> Удалить</button>
        </div>
      )}

      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm min-w-[900px]">
          <thead><tr>
            <th className="table-header w-8"><input type="checkbox" onChange={e => { if (e.target.checked) setSelectedIds(new Set(sorted.map(t => t.id))); else setSelectedIds(new Set()) }} /></th>
            <th className="table-header text-left">Дата</th><th className="table-header text-left">Бенефициар</th>
            <th className="table-header text-left">Назначение</th><th className="table-header text-right">Сумма</th>
            <th className="table-header text-center">Период</th>
            <th className="table-header text-center">Категория</th><th className="table-header w-16"></th>
          </tr></thead>
          <tbody>
            {sorted.map(tx => (
              <tr key={tx.id} className={cn('hover:bg-slate-800/30', tx.category === 'uncategorized' && 'bg-yellow-500/5')}>
                <td className="table-cell"><input type="checkbox" checked={selectedIds.has(tx.id)} onChange={() => toggleSelect(tx.id)} /></td>
                <td className="table-cell text-xs text-slate-400 whitespace-nowrap">{tx.transaction_date}</td>
                <td className="table-cell text-xs max-w-[200px] truncate" title={tx.beneficiary}>{tx.beneficiary || '—'}</td>
                <td className="table-cell text-xs max-w-[200px] truncate text-slate-500" title={tx.purpose}>{tx.purpose || '—'}</td>
                <td className={cn('table-cell text-right font-mono text-xs font-semibold', tx.is_debit ? 'text-red-400' : 'text-green-400')}>
                  {tx.is_debit ? '-' : '+'}{fmt(tx.amount)} ₸
                </td>
                <td className="table-cell text-center">
                  <PeriodEditor tx={tx} onSave={updatePeriod} disabled={!canManage} />
                </td>
                <td className="table-cell text-center">
                  {canManage ? (
                    <select value={tx.category || ''} onChange={e => updateCategory(tx.id, e.target.value)}
                      className={cn('input text-[11px] py-1 px-2 w-44', tx.category === 'uncategorized' && '!border-yellow-500/50 !bg-yellow-500/10')}>
                      <option value="uncategorized">— Не распознано —</option>
                      {Object.entries(catGroups).map(([type, cats]) => (
                        <optgroup key={type} label={TYPE_LABELS[type] || type}>
                          {cats.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  ) : (
                    <span className={cn('badge text-[10px]', tx.category === 'uncategorized' ? 'badge-yellow' : 'badge-blue')}>{catName(tx.category)}</span>
                  )}
                </td>
                <td className="table-cell text-center">
                  <button onClick={() => deleteTransaction(tx.id)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan="8" className="table-cell text-center text-slate-500 py-8">Нет транзакций</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
