import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt } from '@/lib/utils'
import { parseBankStatement } from '@/lib/categorize'
import { Upload, Trash2, Settings, Plus, X, Filter, Eye, EyeOff, Save } from 'lucide-react'

const CATEGORIES = {
  income_kaspi: 'Доход Kaspi', income_other: 'Прочий доход',
  cogs_kitchen: 'Закуп Кухня', cogs_bar: 'Закуп Бар', cogs_hookah: 'Закуп Кальян',
  payroll: 'ЗП/Авансы', marketing: 'Маркетинг', rent: 'Аренда',
  utilities: 'Коммуналка', opex: 'Прочие OpEx', tax: 'Налоги',
  capex: 'CapEx', dividends: 'Дивиденды', internal: 'Внутренние', fee: 'Комиссия банка',
  uncategorized: '❓ Не распознано',
}

export default function BankImportPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('bank_import.categorize')
  const [transactions, setTransactions] = useState([])
  const [rules, setRules] = useState([])
  const [showRules, setShowRules] = useState(false)
  const [hideHidden, setHideHidden] = useState(true)
  const [loading, setLoading] = useState(true)
  const [importing, setImporting] = useState(false)
  const [newRule, setNewRule] = useState({ field: 'beneficiary', keyword: '', category: 'cogs_kitchen', action: 'categorize' })

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    const [txRes, rulesRes] = await Promise.all([
      supabase.from('bank_transactions').select('*').order('transaction_date', { ascending: false }).limit(500),
      supabase.from('bank_rules').select('*').eq('is_active', true).order('field, keyword'),
    ])
    setTransactions(txRes.data || [])
    setRules(rulesRes.data || [])
    setLoading(false)
  }

  // Apply rules to a transaction
  const applyRules = (tx, rulesList) => {
    for (const rule of rulesList) {
      const field = rule.field === 'beneficiary' ? (tx.beneficiary || '') : (tx.purpose || '')
      if (field.toLowerCase().includes(rule.keyword.toLowerCase())) {
        return { category: rule.category, action: rule.action, confidence: 'auto' }
      }
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

      // Apply custom rules
      const { data: currentRules } = await supabase.from('bank_rules').select('*').eq('is_active', true)
      const rulesList = currentRules || []

      const toInsert = parsed.map(tx => {
        const ruleMatch = applyRules(tx, rulesList)
        return {
          transaction_date: tx.date,
          amount: Math.abs(tx.amount),
          is_debit: tx.amount < 0 || tx.is_debit,
          beneficiary: tx.beneficiary || '',
          purpose: tx.purpose || '',
          knp: tx.knp || '',
          category: ruleMatch?.category || tx.category || 'uncategorized',
          confidence: ruleMatch?.confidence || tx.confidence || 'low',
          import_file: file.name,
          import_batch_id: batchId,
          _hidden: ruleMatch?.action === 'hide',
        }
      }).filter(tx => !tx._hidden) // Remove hidden ones

      // Clean _hidden field
      const cleaned = toInsert.map(({ _hidden, ...rest }) => rest)

      if (cleaned.length > 0) {
        const { error } = await supabase.from('bank_transactions').insert(cleaned)
        if (error) throw error
      }

      const hidden = parsed.length - cleaned.length
      alert(`✅ Импортировано ${cleaned.length} записей${hidden > 0 ? ` (${hidden} скрыто по правилам)` : ''}`)
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

  const deleteSelected = async (ids) => {
    if (!confirm(`Удалить ${ids.length} записей?`)) return
    for (const id of ids) {
      await supabase.from('bank_transactions').delete().eq('id', id)
    }
    load()
  }

  // Rules CRUD
  const addRule = async () => {
    if (!newRule.keyword.trim()) return alert('Введите ключевое слово')
    const { error } = await supabase.from('bank_rules').insert({
      field: newRule.field, keyword: newRule.keyword.trim(),
      category: newRule.category, action: newRule.action,
    })
    if (error) {
      if (error.code === '23505') return alert('Такое правило уже есть')
      return alert('Ошибка: ' + error.message)
    }
    setNewRule({ field: 'beneficiary', keyword: '', category: 'cogs_kitchen', action: 'categorize' })
    load()
  }

  const deleteRule = async (id) => {
    await supabase.from('bank_rules').delete().eq('id', id)
    load()
  }

  // Sort: uncategorized first, then by date desc
  const sorted = [...transactions].sort((a, b) => {
    if (a.category === 'uncategorized' && b.category !== 'uncategorized') return -1
    if (a.category !== 'uncategorized' && b.category === 'uncategorized') return 1
    return new Date(b.transaction_date) - new Date(a.transaction_date)
  })

  const uncatCount = transactions.filter(t => t.category === 'uncategorized').length
  const [selectedIds, setSelectedIds] = useState(new Set())
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
          <button onClick={() => setShowRules(!showRules)}
            className={cn('btn-secondary text-sm flex items-center gap-2', showRules && 'border-brand-500/50')}>
            <Settings className="w-4 h-4" /> Правила
          </button>
          <label className={cn('btn-primary text-sm flex items-center gap-2 cursor-pointer', importing && 'opacity-50')}>
            <Upload className="w-4 h-4" />{importing ? 'Импорт...' : 'Загрузить Excel'}
            <input type="file" accept=".xlsx,.xls" onChange={handleFile} className="hidden" disabled={importing} />
          </label>
        </div>
      </div>

      {/* Rules Panel */}
      {showRules && canManage && (
        <div className="card border-brand-500/30 space-y-4">
          <div className="text-sm font-semibold text-brand-400">Правила автокатегоризации</div>
          <p className="text-xs text-slate-500">При импорте, записи с совпадающим ключевым словом будут автоматически категоризованы или скрыты.</p>

          {/* Add rule */}
          <div className="flex flex-col sm:flex-row gap-2">
            <select value={newRule.field} onChange={e => setNewRule(r => ({...r, field: e.target.value}))} className="input text-sm">
              <option value="beneficiary">Бенефициар</option>
              <option value="purpose">Назначение</option>
            </select>
            <input value={newRule.keyword} onChange={e => setNewRule(r => ({...r, keyword: e.target.value}))}
              className="input text-sm flex-1" placeholder="Ключевое слово (напр. KASPI, ТОО Арай)" />
            <select value={newRule.action} onChange={e => setNewRule(r => ({...r, action: e.target.value}))} className="input text-sm">
              <option value="categorize">Категоризовать</option>
              <option value="hide">Скрыть (не импортировать)</option>
            </select>
            {newRule.action === 'categorize' && (
              <select value={newRule.category} onChange={e => setNewRule(r => ({...r, category: e.target.value}))} className="input text-sm">
                {Object.entries(CATEGORIES).filter(([k]) => k !== 'uncategorized').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            )}
            <button onClick={addRule} className="btn-primary text-sm"><Plus className="w-4 h-4" /></button>
          </div>

          {/* Existing rules */}
          <div className="space-y-1">
            {rules.map(r => (
              <div key={r.id} className="flex items-center justify-between bg-slate-900 rounded-lg px-3 py-2">
                <div className="flex items-center gap-3 text-sm">
                  <span className="badge-blue text-[10px]">{r.field === 'beneficiary' ? 'Бенефициар' : 'Назначение'}</span>
                  <span className="font-mono text-xs text-slate-300">«{r.keyword}»</span>
                  <span className="text-slate-500">→</span>
                  {r.action === 'hide' ? (
                    <span className="badge-red text-[10px]">Скрыть</span>
                  ) : (
                    <span className="badge-green text-[10px]">{CATEGORIES[r.category] || r.category}</span>
                  )}
                </div>
                <button onClick={() => deleteRule(r.id)} className="p-1 text-slate-600 hover:text-red-400"><X className="w-3.5 h-3.5" /></button>
              </div>
            ))}
            {rules.length === 0 && <div className="text-xs text-slate-600 text-center py-3">Нет правил. Добавьте первое.</div>}
          </div>
        </div>
      )}

      {/* Bulk actions */}
      {selectedIds.size > 0 && (
        <div className="card flex items-center justify-between bg-red-500/5 border-red-500/20">
          <span className="text-sm">Выбрано: {selectedIds.size}</span>
          <button onClick={() => deleteSelected([...selectedIds]).then(() => setSelectedIds(new Set()))}
            className="btn-danger text-sm flex items-center gap-2"><Trash2 className="w-4 h-4" /> Удалить выбранные</button>
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
                    <select value={tx.category} onChange={e => updateCategory(tx.id, e.target.value)}
                      className={cn('input text-[11px] py-1 px-2 w-36', tx.category === 'uncategorized' && '!border-yellow-500/50 !bg-yellow-500/10')}>
                      {Object.entries(CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  ) : (
                    <span className={cn('badge text-[10px]', tx.category === 'uncategorized' ? 'badge-yellow' : 'badge-blue')}>
                      {CATEGORIES[tx.category] || tx.category}
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
