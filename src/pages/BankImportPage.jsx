import { useState, useRef } from 'react'
import { fmt, fmtDate, cn } from '@/lib/utils'
import { CATEGORIES, parseBankStatement } from '@/lib/categorize'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification, formatBankImportNotification } from '@/lib/telegram'
import { Upload, Save, Filter } from 'lucide-react'
import * as XLSX from 'xlsx'

export default function BankImportPage() {
  const [transactions, setTransactions] = useState([])
  const [fileName, setFileName] = useState('')
  const [filter, setFilter] = useState('all')
  const [saving, setSaving] = useState(false)
  const fileRef = useRef()

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setFileName(file.name)
    const data = await file.arrayBuffer()
    const wb = XLSX.read(data)
    const ws = wb.Sheets[wb.SheetNames[0]]
    const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })
    let headerIdx = json.findIndex(row => row.some(cell => String(cell).includes('Дебет')))
    if (headerIdx === -1) headerIdx = 10
    const dataRows = json.slice(headerIdx + 1).filter(row => {
      const d = row[2]; const c = row[3]
      return (typeof d === 'number' && d > 0) || (typeof c === 'number' && c > 0)
    })
    setTransactions(parseBankStatement(dataRows))
  }

  const updateCategory = (idx, newCat) => {
    setTransactions(prev => prev.map((tx, i) =>
      i === idx ? { ...tx, category: newCat, confidence: 'manual', matchedRule: 'Manual' } : tx
    ))
  }

  const stats = {
    total: transactions.length,
    categorized: transactions.filter(t => t.category !== 'uncategorized').length,
    uncategorized: transactions.filter(t => t.category === 'uncategorized').length,
    totalDebit: transactions.filter(t => t.isDebit).reduce((s, t) => s + t.amount, 0),
    totalCredit: transactions.filter(t => !t.isDebit).reduce((s, t) => s + t.amount, 0),
  }

  const filtered = transactions.filter(tx => {
    if (filter === 'uncategorized') return tx.category === 'uncategorized'
    if (filter === 'categorized') return tx.category !== 'uncategorized'
    return true
  })

  const handleSave = async () => {
    setSaving(true)
    try {
      const rows = transactions.map(tx => ({
        transaction_date: tx.date, amount: tx.amount, is_debit: tx.isDebit,
        beneficiary: tx.beneficiary, purpose: tx.purpose, knp: tx.knp,
        category: tx.category, confidence: tx.confidence, import_file: fileName,
      }))
      const { error } = await supabase.from('bank_transactions').insert(rows)
      if (error) throw error
      await sendTelegramNotification(formatBankImportNotification(fileName, stats.total, stats.categorized, stats.uncategorized))
      alert('✅ Сохранено!')
    } catch (e) { alert('Ошибка: ' + e.message) }
    setSaving(false)
  }

  const categoryOptions = Object.entries(CATEGORIES).map(([k, v]) => ({ value: k, label: v.label, group: v.group }))
  const groupLabels = { revenue:'Доходы', cogs:'Себестоимость', payroll:'ФОТ', marketing:'Маркетинг', rent:'Аренда', utilities:'Коммуналка', opex_other:'Прочие OpEx', taxes:'Налоги', capex:'CapEx', dividends:'Дивиденды', internal:'Внутренние', uncategorized:'Прочее' }

  const confBadge = (c) => {
    if (c === 'high') return <span className="badge-green text-[10px]">Авто</span>
    if (c === 'medium') return <span className="badge-blue text-[10px]">Частичн.</span>
    if (c === 'manual') return <span className="badge-yellow text-[10px]">Вручную</span>
    return <span className="badge-red text-[10px]">❓</span>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Импорт банковской выписки</h1>
        <p className="text-sm text-slate-500 mt-0.5">Загрузите Excel-файл выписки для автокатегоризации</p>
      </div>

      {transactions.length === 0 ? (
        <div onClick={() => fileRef.current?.click()}
          className="card border-2 border-dashed border-slate-700 hover:border-brand-500/50 transition-colors cursor-pointer flex flex-col items-center justify-center py-16">
          <Upload className="w-12 h-12 text-slate-600 mb-4" />
          <div className="text-lg font-semibold text-slate-400">Загрузите выписку</div>
          <div className="text-sm text-slate-600 mt-1">Формат: Excel (.xlsx) из Kaspi Business</div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls" onChange={handleFileUpload} className="hidden" />
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {[
              { label:'Транзакций', val: stats.total, cls:'' },
              { label:'Распознано', val: stats.categorized, cls:'text-green-400' },
              { label:'Не распознано', val: stats.uncategorized, cls:'text-red-400' },
              { label:'Дебет', val: fmt(stats.totalDebit)+' ₸', cls:'text-red-400' },
              { label:'Кредит', val: fmt(stats.totalCredit)+' ₸', cls:'text-green-400' },
            ].map((s,i) => (
              <div key={i} className="card-hover text-center">
                <div className="stat-label">{s.label}</div>
                <div className={cn('stat-value text-xl', s.cls)}>{s.val}</div>
              </div>
            ))}
          </div>

          {/* Filter + Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-slate-500" />
              {[{ key:'all', label:'Все' }, { key:'uncategorized', label:`Не распозн. (${stats.uncategorized})` }, { key:'categorized', label:'Распозн.' }].map(f => (
                <button key={f.key} onClick={() => setFilter(f.key)}
                  className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filter === f.key ? 'bg-brand-600/20 text-brand-400' : 'text-slate-500 hover:text-slate-300')}>
                  {f.label}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => { setTransactions([]); setFileName('') }} className="btn-secondary text-sm">Другой файл</button>
              <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
                <Save className="w-4 h-4" />{saving ? 'Сохранение...' : 'Сохранить'}
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="card overflow-x-auto p-0">
            <table className="w-full min-w-[1000px] text-sm">
              <thead>
                <tr>
                  <th className="table-header text-left w-24">Дата</th>
                  <th className="table-header text-right w-28">Сумма</th>
                  <th className="table-header text-left">Бенефициар</th>
                  <th className="table-header text-left">Назначение</th>
                  <th className="table-header text-left w-56">Категория</th>
                  <th className="table-header text-center w-20">Статус</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((tx, i) => (
                  <tr key={i} className={cn('hover:bg-slate-800/30', tx.category === 'uncategorized' && 'bg-red-500/5')}>
                    <td className="table-cell text-xs font-mono text-slate-400">{tx.date ? String(tx.date).slice(0,10) : '—'}</td>
                    <td className={cn('table-cell text-right font-mono text-xs font-semibold', tx.isDebit ? 'text-red-400' : 'text-green-400')}>
                      {tx.isDebit ? '-' : '+'}{fmt(tx.amount)}
                    </td>
                    <td className="table-cell text-xs text-slate-300 max-w-[200px] truncate">{tx.beneficiary?.split('\n')[0]}</td>
                    <td className="table-cell text-xs text-slate-500 max-w-[250px] truncate">{tx.purpose}</td>
                    <td className="table-cell">
                      <select value={tx.category} onChange={e => updateCategory(i, e.target.value)}
                        className={cn('input text-xs py-1 px-2 w-full', tx.category === 'uncategorized' && '!border-red-500/50 !bg-red-500/10')}>
                        {Object.entries(groupLabels).map(([group, gLabel]) => {
                          const opts = categoryOptions.filter(o => o.group === group)
                          if (!opts.length) return null
                          return <optgroup key={group} label={gLabel}>{opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
                        })}
                      </select>
                    </td>
                    <td className="table-cell text-center">{confBadge(tx.confidence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="card border-blue-500/20 bg-blue-500/5">
        <div className="text-sm font-semibold text-blue-300 mb-2">💡 Совет для бухгалтера</div>
        <div className="text-xs text-slate-400 space-y-1">
          <p>В поле «Назначение платежа» добавляйте ключевые слова для автоматической категоризации:</p>
          <p><span className="text-green-400 font-semibold">Кухня</span> — закуп кухни, <span className="text-blue-400 font-semibold">Бар</span> — закуп бара, <span className="text-amber-400 font-semibold">Кальян</span> — табак</p>
          <p><span className="text-purple-400 font-semibold">Хоз товары</span>, <span className="text-red-400 font-semibold">Дивиденды</span>, <span className="text-teal-400 font-semibold">Аренда</span>, <span className="text-orange-400 font-semibold">Маркетинг</span></p>
        </div>
      </div>
    </div>
  )
}
