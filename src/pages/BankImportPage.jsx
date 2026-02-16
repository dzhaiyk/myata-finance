import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt } from '@/lib/utils'
import { parseBankStatement } from '@/lib/categorize'
import { Upload, Trash2, Settings, Plus, X, Save, ChevronDown, ChevronRight } from 'lucide-react'

const FIELDS = [
  { value: 'beneficiary', label: 'Бенефициар' },
  { value: 'purpose', label: 'Назначение' },
  { value: 'knp', label: 'КНП' },
  { value: 'amount', label: 'Сумма' },
]
const OPERATORS = {
  beneficiary: [{ value: 'contains', label: 'содержит' }, { value: 'equals', label: 'равно' }, { value: 'starts_with', label: 'начинается с' }],
  purpose: [{ value: 'contains', label: 'содержит' }, { value: 'equals', label: 'равно' }, { value: 'starts_with', label: 'начинается с' }],
  knp: [{ value: 'equals', label: 'равно' }, { value: 'contains', label: 'содержит' }],
  amount: [{ value: 'gt', label: '>' }, { value: 'lt', label: '<' }, { value: 'equals', label: '=' }],
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

  // New rule form
  const [newRule, setNewRule] = useState({
    name: '', logic: 'and', category_code: '', action: 'categorize',
    conditions: [{ field: 'beneficiary', operator: 'contains', value: '' }],
  })

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

  // Category lookup
  const catMap = useMemo(() => {
    const m = {}
    categories.forEach(c => { m[c.code] = c })
    return m
  }, [categories])

  const catName = (code) => catMap[code]?.name || code

  // Group categories by type for select
  const catGroups = useMemo(() => {
    const groups = {}
    categories.forEach(c => {
      if (!groups[c.type]) groups[c.type] = []
      groups[c.type].push(c)
    })
    return groups
  }, [categories])

  const TYPE_LABELS = { income: 'Доходы', cogs: 'Себестоимость', opex: 'Операционные', below_ebitda: 'Ниже EBITDA', other: 'Прочее' }

  // Build full rules with conditions
  const fullRules = useMemo(() => {
    return rules.map(r => ({
      ...r,
      conditions: ruleConditions.filter(c => c.rule_id === r.id),
    }))
  }, [rules, ruleConditions])

  // Apply rules to a transaction
  const matchCondition = (tx, cond) => {
    const fieldVal = (() => {
      if (cond.field === 'beneficiary') return tx.beneficiary || ''
      if (cond.field === 'purpose') return tx.purpose || ''
      if (cond.field === 'knp') return tx.knp || ''
      if (cond.field === 'amount') return String(Math.abs(tx.amount || 0))
      return ''
    })()

    switch (cond.operator) {
      case 'contains': return fieldVal.toLowerCase().includes(cond.value.toLowerCase())
      case 'equals': return fieldVal.toLowerCase() === cond.value.toLowerCase()
      case 'starts_with': return fieldVal.toLowerCase().startsWith(cond.value.toLowerCase())
      case 'gt': return Number(fieldVal) > Number(cond.value)
      case 'lt': return Number(fieldVal) < Number(cond.value)
      default: return false
    }
  }

  const applyRules = (tx) => {
    for (const rule of fullRules) {
      if (rule.conditions.length === 0) continue
      const matches = rule.conditions.map(c => matchCondition(tx, c))
      const pass = rule.logic === 'and' ? matches.every(Boolean) : matches.some(Boolean)
      if (pass) return { category: rule.category_code, action: rule.action }
    }
    return null
  }

  // File import
  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImporting(true)
    try {
      const XLSX = await import('xlsx')
      const data = await file.arrayBuffer()
      const wb = XLSX.read(data)
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json(ws)

      const batchId = crypto.randomUUID()
      const parsed = parseBankStatement(rows)

      // Re-fetch rules for freshness
      const [rRes, cRes] = await Promise.all([
        supabase.from('bank_rules').select('*').eq('is_active', true),
        supabase.from('bank_rule_conditions').select('*'),
      ])
      const freshRules = (rRes.data || []).map(r => ({
        ...r,
        conditions: (cRes.data || []).filter(c => c.rule_id === r.id),
      }))

      let hidden = 0
      const toInsert = []
      for (const tx of parsed) {
        // Apply fresh rules
        let ruleMatch = null
        for (const rule of freshRules) {
          if (rule.conditions.length === 0) continue
          const matches = rule.conditions.map(c => matchCondition(tx, c))
          const pass = rule.logic === 'and' ? matches.every(Boolean) : matches.some(Boolean)
          if (pass) { ruleMatch = { category: rule.category_code, action: rule.action }; break }
        }

        if (ruleMatch?.action === 'hide') { hidden++; continue }

        toInsert.push({
          transaction_date: tx.date,
          amount: Math.abs(tx.amount),
          is_debit: tx.amount < 0 || tx.is_debit,
          beneficiary: tx.beneficiary || '',
          purpose: tx.purpose || '',
          knp: tx.knp || '',
          category: ruleMatch?.category || tx.category || 'uncategorized',
          confidence: ruleMatch ? 'auto' : tx.confidence || 'low',
          import_file: file.name,
          import_batch_id: batchId,
        })
      }

      if (toInsert.length > 0) {
        const { error } = await supabase.from('bank_transactions').insert(toInsert)
        if (error) throw error
      }
      alert(`✅ Импортировано ${toInsert.length} записей${hidden > 0 ? ` (${hidden} скрыто по правилам)` : ''}`)
      load()
    } catch (err) { alert('Ошибка импорта: ' + err.message) }
    setImporting(false)
    e.target.value = ''
  }

  const updateCategory = async (id, category) => {
    await supabase.from('bank_transactions').update({ category, confidence: 'manual' }).eq('id', id)
    setTransactions(prev => prev.map(t => t.id === id ? { ...t, category, confidence: 'manual' } : t))
  }

  const deleteTransaction = async (id) => {
    await supabase.from('bank_transactions').delete().eq('id', id)
    setTransactions(prev => prev.filter(t => t.id !== id))
  }

  const deleteSelected = async () => {
    const ids = [...selectedIds]
    if (!confirm(`Удалить ${ids.length} записей?`)) return
    for (const id of ids) {
      await supabase.from('bank_transactions').delete().eq('id', id)
    }
    setSelectedIds(new Set())
    load()
  }

  // ===== RULES CRUD =====
  const addCondition = () => {
    setNewRule(r => ({ ...r, conditions: [...r.conditions, { field: 'beneficiary', operator: 'contains', value: '' }] }))
  }
  const removeCondition = (idx) => {
    setNewRule(r => ({ ...r, conditions: r.conditions.filter((_, i) => i !== idx) }))
  }
  const updateCondition = (idx, key, val) => {
    setNewRule(r => ({
      ...r,
      conditions: r.conditions.map((c, i) => {
        if (i !== idx) return c
        const updated = { ...c, [key]: val }
        // Reset operator when field changes
        if (key === 'field') updated.operator = OPERATORS[val]?.[0]?.value || 'contains'
        return updated
      }),
    }))
  }

  const saveRule = async () => {
    if (!newRule.name.trim()) return alert('Введите название правила')
    if (newRule.action === 'categorize' && !newRule.category_code) return alert('Выберите категорию')
    if (newRule.conditions.some(c => !c.value.trim())) return alert('Заполните все условия')

    const { data: rule, error } = await supabase.from('bank_rules').insert({
      name: newRule.name, logic: newRule.logic,
      category_code: newRule.action === 'hide' ? 'uncategorized' : newRule.category_code,
      action: newRule.action,
    }).select().single()
    if (error) return alert('Ошибка: ' + error.message)

    // Insert conditions
    const condPayload = newRule.conditions.map((c, i) => ({
      rule_id: rule.id, field: c.field, operator: c.operator, value: c.value, sort_order: i,
    }))
    await supabase.from('bank_rule_conditions').insert(condPayload)

    setNewRule({ name: '', logic: 'and', category_code: '', action: 'categorize', conditions: [{ field: 'beneficiary', operator: 'contains', value: '' }] })
    setShowAddRule(false)
    load()
  }

  const deleteRule = async (id) => {
    if (!confirm('Удалить правило?')) return
    await supabase.from('bank_rules').delete().eq('id', id)
    load()
  }

  // Sort: uncategorized first
  const sorted = [...transactions].sort((a, b) => {
    if (a.category === 'uncategorized' && b.category !== 'uncategorized') return -1
    if (a.category !== 'uncategorized' && b.category === 'uncategorized') return 1
    return new Date(b.transaction_date) - new Date(a.transaction_date)
  })

  const uncatCount = transactions.filter(t => t.category === 'uncategorized').length
  const toggleSelect = (id) => setSelectedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  // Category select with optgroups
  const CategorySelect = ({ value, onChange, className = '' }) => (
    <select value={value} onChange={e => onChange(e.target.value)} className={`input text-sm ${className}`}>
      <option value="">— Выберите —</option>
      {Object.entries(catGroups).map(([type, cats]) => (
        <optgroup key={type} label={TYPE_LABELS[type] || type}>
          {cats.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
        </optgroup>
      ))}
    </select>
  )

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

      {/* ===== RULES PANEL ===== */}
      {showRules && canManage && (
        <div className="card border-brand-500/30 space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm font-semibold text-brand-400">Правила автокатегоризации</div>
            <button onClick={() => setShowAddRule(!showAddRule)}
              className="btn-primary text-xs flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5" /> Новое правило
            </button>
          </div>

          {/* Add Rule Form */}
          {showAddRule && (
            <div className="bg-slate-900 rounded-xl p-4 space-y-4 border border-slate-700">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="label">Название правила *</label>
                  <input value={newRule.name} onChange={e => setNewRule(r => ({...r, name: e.target.value}))}
                    className="input text-sm w-full" placeholder="Напр: Аренда от ТОО Алатау" /></div>
                <div><label className="label">Действие</label>
                  <select value={newRule.action} onChange={e => setNewRule(r => ({...r, action: e.target.value}))} className="input text-sm w-full">
                    <option value="categorize">Категоризовать</option>
                    <option value="hide">Скрыть (не импортировать)</option>
                  </select></div>
                {newRule.action === 'categorize' && (
                  <div><label className="label">Категория *</label>
                    <CategorySelect value={newRule.category_code} onChange={v => setNewRule(r => ({...r, category_code: v}))} className="w-full" /></div>
                )}
              </div>

              {/* Conditions */}
              <div>
                <div className="flex items-center gap-3 mb-3">
                  <label className="label mb-0">Условия</label>
                  {newRule.conditions.length > 1 && (
                    <div className="flex bg-slate-800 rounded-lg p-0.5">
                      <button onClick={() => setNewRule(r => ({...r, logic: 'and'}))}
                        className={cn('px-3 py-1 rounded-md text-xs font-medium', newRule.logic === 'and' ? 'bg-brand-500 text-white' : 'text-slate-500')}>
                        И (AND)
                      </button>
                      <button onClick={() => setNewRule(r => ({...r, logic: 'or'}))}
                        className={cn('px-3 py-1 rounded-md text-xs font-medium', newRule.logic === 'or' ? 'bg-brand-500 text-white' : 'text-slate-500')}>
                        ИЛИ (OR)
                      </button>
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {newRule.conditions.map((cond, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      {idx > 0 && (
                        <span className="text-[10px] font-bold text-brand-400 w-8 text-center">
                          {newRule.logic === 'and' ? 'И' : 'ИЛИ'}
                        </span>
                      )}
                      {idx === 0 && newRule.conditions.length > 1 && <span className="w-8" />}
                      <select value={cond.field} onChange={e => updateCondition(idx, 'field', e.target.value)} className="input text-xs w-32">
                        {FIELDS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                      <select value={cond.operator} onChange={e => updateCondition(idx, 'operator', e.target.value)} className="input text-xs w-32">
                        {(OPERATORS[cond.field] || []).map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <input value={cond.value} onChange={e => updateCondition(idx, 'value', e.target.value)}
                        className="input text-xs flex-1 font-mono" placeholder={cond.field === 'amount' ? '100000' : 'Ключевое слово'} />
                      {newRule.conditions.length > 1 && (
                        <button onClick={() => removeCondition(idx)} className="p-1 text-slate-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  ))}
                </div>

                <button onClick={addCondition} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-2">
                  <Plus className="w-3.5 h-3.5" /> Добавить условие
                </button>
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-700">
                <button onClick={saveRule} className="btn-primary text-sm">Сохранить правило</button>
                <button onClick={() => setShowAddRule(false)} className="btn-secondary text-sm">Отмена</button>
              </div>
            </div>
          )}

          {/* Existing Rules */}
          <div className="space-y-2">
            {fullRules.map(rule => (
              <div key={rule.id} className="bg-slate-900 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">{rule.name}</span>
                    <span className="text-slate-500">→</span>
                    {rule.action === 'hide' ? (
                      <span className="badge badge-red text-[10px]">Скрыть</span>
                    ) : (
                      <span className="badge badge-green text-[10px]">{catName(rule.category_code)}</span>
                    )}
                  </div>
                  <button onClick={() => deleteRule(rule.id)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {rule.conditions.map((c, i) => (
                    <span key={c.id} className="flex items-center gap-1.5">
                      {i > 0 && <span className="text-[10px] font-bold text-brand-400">{rule.logic === 'and' ? 'И' : 'ИЛИ'}</span>}
                      <span className="text-[11px] bg-slate-800 rounded-lg px-2 py-1 font-mono">
                        <span className="text-blue-400">{FIELDS.find(f => f.value === c.field)?.label}</span>
                        <span className="text-slate-500 mx-1">{OPERATORS[c.field]?.find(o => o.value === c.operator)?.label}</span>
                        <span className="text-amber-400">«{c.value}»</span>
                      </span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
            {fullRules.length === 0 && <div className="text-xs text-slate-600 text-center py-4">Нет правил. Создайте первое.</div>}
          </div>
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="card flex items-center justify-between bg-red-500/5 border-red-500/20">
          <span className="text-sm">Выбрано: {selectedIds.size}</span>
          <button onClick={deleteSelected} className="btn-danger text-sm flex items-center gap-2"><Trash2 className="w-4 h-4" /> Удалить выбранные</button>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm min-w-[800px]">
          <thead><tr>
            <th className="table-header w-8"><input type="checkbox" onChange={e => {
              if (e.target.checked) setSelectedIds(new Set(sorted.map(t => t.id)))
              else setSelectedIds(new Set())
            }} /></th>
            <th className="table-header text-left">Дата</th>
            <th className="table-header text-left">Бенефициар</th>
            <th className="table-header text-left">Назначение</th>
            <th className="table-header text-right">Сумма</th>
            <th className="table-header text-center">Категория</th>
            <th className="table-header text-center w-16"></th>
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
                  {canManage ? (
                    <CategorySelect value={tx.category} onChange={v => updateCategory(tx.id, v)}
                      className={cn('text-[11px] py-1 px-2 w-40', tx.category === 'uncategorized' && '!border-yellow-500/50 !bg-yellow-500/10')} />
                  ) : (
                    <span className={cn('badge text-[10px]', tx.category === 'uncategorized' ? 'badge-yellow' : 'badge-blue')}>
                      {catName(tx.category)}
                    </span>
                  )}
                </td>
                <td className="table-cell text-center">
                  <button onClick={() => deleteTransaction(tx.id)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && <tr><td colSpan="7" className="table-cell text-center text-slate-500 py-8">Нет транзакций. Загрузите банковскую выписку.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
