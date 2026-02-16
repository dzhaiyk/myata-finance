import { useState, useEffect } from 'react'
import { fmt, cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification, formatDailyReportNotification, formatCashDiscrepancyAlert } from '@/lib/telegram'
import { Save, Send, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Plus, Trash2, Calendar, ArrowLeft, FileText, Eye, Clock, Check, Pencil } from 'lucide-react'

const MoneyInput = ({ value, onChange, className = '', disabled = false }) => (
  <input type="text" inputMode="numeric" value={value} disabled={disabled}
    onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
    className={`input text-right font-mono text-sm tabular-nums w-full ${className} ${disabled ? 'opacity-50' : ''}`}
    placeholder="0" />
)

const NameInput = ({ value, onChange, suggestions, placeholder, disabled = false }) => {
  const [showSugg, setShowSugg] = useState(false)
  const filtered = (suggestions || []).filter(s => {
    const name = typeof s === 'string' ? s : s.name || s.full_name
    return name.toLowerCase().includes((value || '').toLowerCase()) && name !== value
  })
  return (
    <div className="relative">
      <input value={value} disabled={disabled}
        onChange={e => { onChange(e.target.value); setShowSugg(true) }}
        onFocus={() => setShowSugg(true)} onBlur={() => setTimeout(() => setShowSugg(false), 200)}
        className={`input text-sm w-full ${disabled ? 'opacity-50' : ''}`} placeholder={placeholder} />
      {showSugg && !disabled && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-h-40 overflow-y-auto">
          {filtered.slice(0, 8).map((s, i) => {
            const name = typeof s === 'string' ? s : s.name || s.full_name
            return <button key={i} onMouseDown={() => { onChange(name); setShowSugg(false) }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700 text-slate-300">{name}</button>
          })}
        </div>
      )}
    </div>
  )
}

const SECTIONS = [
  { key: 'suppliers_kitchen', label: 'Поставщики КУХНЯ', color: 'green', icon: '🍽', supplierCat: 'Кухня' },
  { key: 'suppliers_bar', label: 'Поставщики БАР', color: 'blue', icon: '🍸', supplierCat: 'Бар' },
  { key: 'tobacco', label: 'Табак и расходники кальян', color: 'amber', icon: '💨', fixed: true },
  { key: 'payroll', label: 'ЗП и авансы персоналу', color: 'indigo', icon: '👥', isPayroll: true },
  { key: 'other', label: 'Прочие расходы', color: 'rose', icon: '📦', fixed: true },
]
const FIXED_ROWS = {
  tobacco: ['Табак', 'Угли', 'Расходники кальян', 'Доставка'],
  other: ['Хозтовары', 'Мелкий ремонт', 'Доставка (Яндекс)', 'Канцтовары', 'Прочее'],
}
const PAYMENT_TYPES = ['Наличные', 'Kaspi', 'Halyk', 'Wolt', 'Glovo', 'Yandex Eda', 'Прочее']
const DEPARTMENTS = ['Кухня', 'Бар', 'Кальян', 'Прочее']

export default function DailyReportPage() {
  const { profile, hasPermission } = useAuthStore()
  const canEdit = hasPermission('daily_report.edit')
  const [mode, setMode] = useState('journal')
  const [journal, setJournal] = useState([])
  const [journalLoading, setJournalLoading] = useState(true)

  // Form state
  const [reportId, setReportId] = useState(null)
  const [status, setStatus] = useState('draft') // draft | submitted
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [expanded, setExpanded] = useState({ suppliers_kitchen: true, suppliers_bar: true, tobacco: true, payroll: true, other: true })
  const [savedSuppliers, setSavedSuppliers] = useState({ Кухня: [], Бар: [], Кальян: [], Хозтовары: [], Прочее: [] })
  const [savedStaff, setSavedStaff] = useState([])
  const [cashStart, setCashStart] = useState('')
  const [cashDeposit, setCashDeposit] = useState('')
  const [cashActual, setCashActual] = useState('')
  const [inkassation, setInkassation] = useState('')
  const emptyWithdrawals = () => ({
    suppliers_kitchen: [{ name: '', amount: '', comment: '' }],
    suppliers_bar: [{ name: '', amount: '', comment: '' }],
    tobacco: FIXED_ROWS.tobacco.map(n => ({ name: n, amount: '', comment: '' })),
    payroll: [{ name: '', amount: '', comment: '' }],
    other: FIXED_ROWS.other.map(n => ({ name: n, amount: '', comment: '' })),
  })
  const [withdrawals, setWithdrawals] = useState(emptyWithdrawals())
  const [revenue, setRevenue] = useState(PAYMENT_TYPES.map(t => ({ type: t, amount: '', checks: '' })))
  const [departments, setDepartments] = useState(DEPARTMENTS.map(d => ({ name: d, amount: '' })))

  useEffect(() => { loadJournal(); loadSavedEntities() }, [])

  const loadJournal = async () => {
    setJournalLoading(true)
    const { data } = await supabase.from('daily_reports').select('*').order('report_date', { ascending: false }).limit(20)
    setJournal(data || [])
    setJournalLoading(false)
  }

  const loadSavedEntities = async () => {
    const [supRes, staffRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('staff').select('*').eq('is_active', true).order('full_name'),
    ])
    if (supRes.data) {
      const grouped = { Кухня: [], Бар: [], Кальян: [], Хозтовары: [], Прочее: [] }
      supRes.data.forEach(s => { if (grouped[s.category]) grouped[s.category].push(s) })
      setSavedSuppliers(grouped)
    }
    if (staffRes.data) setSavedStaff(staffRes.data)
  }

  const openReport = (report) => {
    const d = report.data || {}
    setReportId(report.id)
    setStatus(report.status || 'draft')
    setDate(report.report_date)
    setCashStart(String(d.cash_start || ''))
    setCashDeposit(String(d.cash_deposit || ''))
    setCashActual(String(d.cash_actual || ''))
    setInkassation(String(d.inkassation || ''))
    if (d.withdrawals) {
      setWithdrawals({
        suppliers_kitchen: d.withdrawals.suppliers_kitchen?.length ? d.withdrawals.suppliers_kitchen : [{ name: '', amount: '', comment: '' }],
        suppliers_bar: d.withdrawals.suppliers_bar?.length ? d.withdrawals.suppliers_bar : [{ name: '', amount: '', comment: '' }],
        tobacco: d.withdrawals.tobacco?.length ? d.withdrawals.tobacco : FIXED_ROWS.tobacco.map(n => ({ name: n, amount: '', comment: '' })),
        payroll: d.withdrawals.payroll?.length ? d.withdrawals.payroll : [{ name: '', amount: '', comment: '' }],
        other: d.withdrawals.other?.length ? d.withdrawals.other : FIXED_ROWS.other.map(n => ({ name: n, amount: '', comment: '' })),
      })
    }
    if (d.revenue) setRevenue(d.revenue)
    if (d.departments) setDepartments(d.departments)
    setMode('form')
  }

  const newReport = () => {
    setReportId(null); setStatus('draft')
    setDate(new Date().toISOString().split('T')[0])
    setCashStart(''); setCashDeposit(''); setCashActual(''); setInkassation('')
    setWithdrawals(emptyWithdrawals())
    setRevenue(PAYMENT_TYPES.map(t => ({ type: t, amount: '', checks: '' })))
    setDepartments(DEPARTMENTS.map(d => ({ name: d, amount: '' })))
    setLastSaved(null)
    setMode('form')
  }

  // Calculations
  const num = (v) => Number(v) || 0
  const sectionTotal = (key) => withdrawals[key].reduce((s, r) => s + num(r.amount), 0)
  const totalWithdrawals = SECTIONS.reduce((s, sec) => s + sectionTotal(sec.key), 0)
  const totalRevenue = revenue.reduce((s, r) => s + num(r.amount), 0)
  const totalDeptRevenue = departments.reduce((s, d) => s + num(d.amount), 0)
  const cashSales = num(revenue[0]?.amount)
  const cashExpected = num(cashStart) + num(cashDeposit) + cashSales - totalWithdrawals - num(inkassation)
  const discrepancy = num(cashActual) - cashExpected

  const updateWithdrawal = (section, idx, field, value) => {
    setWithdrawals(prev => ({ ...prev, [section]: prev[section].map((r, i) => i === idx ? { ...r, [field]: value } : r) }))
  }
  const addRow = (section) => { setWithdrawals(prev => ({ ...prev, [section]: [...prev[section], { name: '', amount: '', comment: '' }] })) }
  const removeRow = (section, idx) => { setWithdrawals(prev => ({ ...prev, [section]: prev[section].filter((_, i) => i !== idx) })) }

  const buildPayload = (newStatus) => ({
    report_date: date, manager_id: profile?.id, manager_name: profile?.full_name,
    status: newStatus,
    submitted_at: newStatus === 'submitted' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
    data: {
      date, manager: profile?.full_name, cash_start: num(cashStart), cash_deposit: num(cashDeposit),
      cash_actual: num(cashActual), inkassation: num(inkassation), withdrawals, revenue, departments,
      total_revenue: totalRevenue, total_withdrawals: totalWithdrawals, cash_expected: cashExpected, discrepancy,
    },
    total_revenue: totalRevenue, total_withdrawals: totalWithdrawals, cash_discrepancy: discrepancy,
  })

  // Save as draft (silent, no telegram)
  const saveDraft = async () => {
    setSaving(true)
    try {
      const payload = buildPayload('draft')
      const { data, error } = await supabase.from('daily_reports').upsert(payload, { onConflict: 'report_date' }).select().single()
      if (error) throw error
      if (data) setReportId(data.id)
      setStatus('draft')
      setLastSaved(new Date())
      loadJournal()
    } catch (e) { alert('Ошибка: ' + e.message) }
    setSaving(false)
  }

  // Submit final report (with telegram)
  const submitReport = async () => {
    if (!num(cashActual)) {
      if (!confirm('Фактический остаток кассы не указан. Всё равно отправить?')) return
    }
    setSaving(true)
    try {
      const payload = buildPayload('submitted')
      const { data, error } = await supabase.from('daily_reports').upsert(payload, { onConflict: 'report_date' }).select().single()
      if (error) throw error
      if (data) setReportId(data.id)
      setStatus('submitted')

      // Telegram notifications
      try {
        await sendTelegramNotification(formatDailyReportNotification({
          date, manager: profile?.full_name, revenue: totalRevenue, withdrawals: totalWithdrawals,
          cashExpected, cashActual: num(cashActual), discrepancy,
          departments: { kitchen: num(departments[0]?.amount), bar: num(departments[1]?.amount), hookah: num(departments[2]?.amount) }
        }))
        if (Math.abs(discrepancy) > 1000) {
          await sendTelegramNotification(formatCashDiscrepancyAlert(date, profile?.full_name, discrepancy))
        }
      } catch (_) {}

      setLastSaved(new Date())
      loadJournal()
      alert('✅ Отчёт отправлен!')
    } catch (e) { alert('Ошибка: ' + e.message) }
    setSaving(false)
  }

  // Reopen submitted report for editing (admin only)
  const reopenReport = async () => {
    if (!confirm('Вернуть отчёт в черновик для редактирования?')) return
    setStatus('draft')
    await supabase.from('daily_reports').update({ status: 'draft', submitted_at: null }).eq('id', reportId)
    loadJournal()
  }

  const shareWhatsApp = () => {
    let text = `🍃 *Мята — Отчёт за ${date}*\n👤 ${profile?.full_name}\n\n💰 *Выручка: ${fmt(totalRevenue)} ₸*\n`
    departments.forEach(d => { if (num(d.amount)) text += `  ${d.name}: ${fmt(num(d.amount))} ₸\n` })
    text += `\n📤 Изъятия: ${fmt(totalWithdrawals)} ₸\n💵 Ожид.: ${fmt(cashExpected)} ₸\n💵 Факт: ${fmt(num(cashActual))} ₸\n`
    text += discrepancy !== 0 ? `⚠️ *Расхождение: ${fmt(discrepancy)} ₸*` : `✅ Расхождений нет`
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank')
  }

  const isSubmitted = status === 'submitted'
  const isLocked = isSubmitted && !canEdit

  // ============ JOURNAL VIEW ============
  if (mode === 'journal') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Журнал отчётов</h1>
            <p className="text-sm text-slate-500 mt-0.5">Последние {journal.length} отчётов</p>
          </div>
          <button onClick={newReport} className="btn-primary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Новый отчёт
          </button>
        </div>

        <div className="card flex items-center gap-3">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-400">Открыть за дату:</span>
          <input type="date" className="input text-sm" onChange={e => {
            if (!e.target.value) return
            const existing = journal.find(r => r.report_date === e.target.value)
            if (existing) openReport(existing)
            else { setDate(e.target.value); newReport(); setDate(e.target.value) }
          }} />
        </div>

        {journalLoading ? (
          <div className="text-center text-slate-500 py-16">Загрузка...</div>
        ) : journal.length === 0 ? (
          <div className="card text-center py-16">
            <FileText className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <div className="text-lg font-semibold text-slate-400">Нет отчётов</div>
            <div className="text-sm text-slate-600 mt-1">Создайте первый ежедневный отчёт</div>
          </div>
        ) : (
          <div className="space-y-2">
            {journal.map(r => {
              const disc = r.cash_discrepancy || 0
              const hasDisc = Math.abs(disc) > 500
              const isDraft = r.status === 'draft' || !r.status
              return (
                <button key={r.id} onClick={() => openReport(r)}
                  className={cn('card w-full text-left flex items-center justify-between hover:border-brand-500/30 transition-all group',
                    hasDisc && !isDraft && 'border-red-500/20',
                    isDraft && 'border-yellow-500/20')}>
                  <div className="flex items-center gap-4">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold',
                      isDraft ? 'bg-yellow-500/15 text-yellow-400' : hasDisc ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400')}>
                      {new Date(r.report_date + 'T12:00:00').getDate()}
                    </div>
                    <div>
                      <div className="text-sm font-medium flex items-center gap-2">
                        {new Date(r.report_date + 'T12:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                        {isDraft ? (
                          <span className="badge badge-yellow text-[10px] flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Черновик</span>
                        ) : (
                          <span className="badge badge-green text-[10px] flex items-center gap-1"><Check className="w-2.5 h-2.5" /> Отправлен</span>
                        )}
                      </div>
                      <div className="text-xs text-slate-500">{r.manager_name || '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-sm font-mono font-semibold text-green-400">{fmt(r.total_revenue || 0)} ₸</div>
                      <div className="text-[10px] text-slate-500">выручка</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono text-red-400">{fmt(r.total_withdrawals || 0)} ₸</div>
                      <div className="text-[10px] text-slate-500">изъятия</div>
                    </div>
                    {hasDisc && !isDraft && (
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />{fmt(disc)} ₸
                        </div>
                        <div className="text-[10px] text-red-500">расхождение</div>
                      </div>
                    )}
                    <Eye className="w-4 h-4 text-slate-600 group-hover:text-brand-400" />
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  // ============ FORM VIEW ============
  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button onClick={() => setMode('journal')} className="p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Отчёт дня</h1>
            <p className="text-sm text-slate-500 mt-0.5">Менеджер: {profile?.full_name || '—'}</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Status badge */}
          {isSubmitted ? (
            <span className="badge badge-green flex items-center gap-1.5 py-1.5 px-3">
              <Check className="w-3.5 h-3.5" /> Отправлен
            </span>
          ) : (
            <span className="badge badge-yellow flex items-center gap-1.5 py-1.5 px-3">
              <Clock className="w-3.5 h-3.5" /> Черновик
            </span>
          )}
          {lastSaved && (
            <span className="text-[10px] text-slate-500">
              Сохранено {lastSaved.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <input type="date" value={date} onChange={e => { if (!isLocked) setDate(e.target.value) }} disabled={isLocked}
            className="input text-sm font-medium min-w-[160px]" />
        </div>
      </div>

      {/* Submitted banner */}
      {isSubmitted && (
        <div className="card border-green-500/20 bg-green-500/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <span className="text-sm text-green-400 font-medium">Отчёт отправлен. {isLocked ? 'Только просмотр.' : 'Можно редактировать.'}</span>
          </div>
          {canEdit && (
            <button onClick={reopenReport} className="btn-secondary text-xs flex items-center gap-1.5">
              <Pencil className="w-3.5 h-3.5" /> Вернуть в черновик
            </button>
          )}
        </div>
      )}

      {/* КАССА */}
      <div className="card">
        <h2 className="text-base font-display font-bold text-brand-400 mb-4">💵 Касса</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="label">Остаток на начало смены</label><MoneyInput value={cashStart} onChange={setCashStart} disabled={isLocked} /></div>
          <div><label className="label">Внесение вчерашней выручки</label><MoneyInput value={cashDeposit} onChange={setCashDeposit} disabled={isLocked} /></div>
        </div>
      </div>

      {/* Withdrawal Sections */}
      {SECTIONS.map(sec => {
        const isOpen = expanded[sec.key]
        const total = sectionTotal(sec.key)
        const colorMap = { green: 'border-green-500/20 bg-green-500/5', blue: 'border-blue-500/20 bg-blue-500/5', amber: 'border-amber-500/20 bg-amber-500/5', indigo: 'border-indigo-500/20 bg-indigo-500/5', rose: 'border-rose-500/20 bg-rose-500/5' }
        const isFixed = sec.fixed; const isPayroll = sec.isPayroll
        let suggestions = []
        if (sec.supplierCat) suggestions = savedSuppliers[sec.supplierCat] || []
        if (isPayroll) suggestions = savedStaff
        return (
          <div key={sec.key} className={cn('card border overflow-visible', colorMap[sec.color])}>
            <button onClick={() => setExpanded(prev => ({ ...prev, [sec.key]: !prev[sec.key] }))} className="flex items-center justify-between w-full text-left">
              <div className="flex items-center gap-2">
                <span>{sec.icon}</span><h2 className="text-sm font-display font-bold">{sec.label}</h2>
                {total > 0 && <span className="badge-yellow">{fmt(total)} ₸</span>}
              </div>
              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            </button>
            {isOpen && (
              <div className="mt-4 space-y-2">
                <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-500 uppercase px-1">
                  <div className="col-span-5">{isPayroll ? 'Сотрудник' : 'Поставщик'}</div>
                  <div className="col-span-3 text-right">Сумма (₸)</div>
                  <div className="col-span-3">Комментарий</div><div className="col-span-1" />
                </div>
                {withdrawals[sec.key].map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      {isFixed ? <div className="text-sm text-slate-300 px-3 py-2">{row.name}</div>
                        : <NameInput value={row.name} onChange={v => updateWithdrawal(sec.key, idx, 'name', v)} suggestions={suggestions} placeholder={isPayroll ? 'Сотрудник' : 'Поставщик'} disabled={isLocked} />}
                    </div>
                    <div className="col-span-3"><MoneyInput value={row.amount} onChange={v => updateWithdrawal(sec.key, idx, 'amount', v)} disabled={isLocked} /></div>
                    <div className="col-span-3"><input value={row.comment || ''} onChange={e => updateWithdrawal(sec.key, idx, 'comment', e.target.value)} className="input text-sm w-full" placeholder="—" disabled={isLocked} /></div>
                    <div className="col-span-1 flex justify-center">
                      {!isFixed && !isLocked && <button onClick={() => removeRow(sec.key, idx)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
                    </div>
                  </div>
                ))}
                {!isFixed && !isLocked && <button onClick={() => addRow(sec.key)} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-2 px-1"><Plus className="w-3.5 h-3.5" /> Добавить строку</button>}
                <div className="flex justify-end pt-2 border-t border-slate-800"><span className="text-sm font-semibold font-mono">{fmt(total)} ₸</span></div>
              </div>
            )}
          </div>
        )
      })}

      {/* Total withdrawals + cash end */}
      <div className="card bg-red-500/5 border-red-500/20">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-red-400">ИТОГО ИЗЪЯТИЙ</span>
          <span className="text-lg font-mono font-bold text-red-400">{fmt(totalWithdrawals)} ₸</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div><label className="label">Инкассация на счёт</label><MoneyInput value={inkassation} onChange={setInkassation} disabled={isLocked} /></div>
          <div><label className="label">Остаток наличных (ФАКТ) ⭐</label><MoneyInput value={cashActual} onChange={setCashActual} disabled={isLocked} className="!border-yellow-500/50 !bg-yellow-500/10" /></div>
        </div>
      </div>

      {/* REVENUE */}
      <div className="card border-green-500/20 bg-green-500/5">
        <h2 className="text-base font-display font-bold text-green-400 mb-4">💰 Доходы (из iiko)</h2>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-500 uppercase px-1">
            <div className="col-span-4">Тип оплаты</div><div className="col-span-4 text-right">Сумма (₸)</div>
            <div className="col-span-2 text-right">Чеков</div><div className="col-span-2 text-right">Ср. чек</div>
          </div>
          {revenue.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4 text-sm text-slate-300 px-1">{r.type}</div>
              <div className="col-span-4"><MoneyInput value={r.amount} onChange={v => setRevenue(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))} disabled={isLocked} /></div>
              <div className="col-span-2"><MoneyInput value={r.checks} onChange={v => setRevenue(prev => prev.map((x, j) => j === i ? { ...x, checks: v } : x))} disabled={isLocked} /></div>
              <div className="col-span-2 text-right text-sm font-mono text-slate-400">{num(r.checks) > 0 ? fmt(num(r.amount) / num(r.checks)) : '—'}</div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 border-t border-green-500/20">
            <span className="text-sm font-bold text-green-400">ИТОГО ВЫРУЧКА</span>
            <span className="text-lg font-mono font-bold text-green-400">{fmt(totalRevenue)} ₸</span>
          </div>
        </div>
      </div>

      {/* DEPARTMENTS */}
      <div className="card border-amber-500/20 bg-amber-500/5">
        <h2 className="text-base font-display font-bold text-amber-400 mb-4">📊 Выручка по отделам</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {departments.map((d, i) => (
            <div key={i}><label className="label">{d.name}</label><MoneyInput value={d.amount} onChange={v => setDepartments(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))} disabled={isLocked} /></div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-amber-500/20">
          <span className="text-sm font-semibold">Итого</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold">{fmt(totalDeptRevenue)} ₸</span>
            {totalDeptRevenue !== totalRevenue && totalRevenue > 0 && <span className="badge-red text-[10px]">≠ Выручке ({fmt(totalRevenue - totalDeptRevenue)})</span>}
          </div>
        </div>
      </div>

      {/* CASH VERIFICATION */}
      <div className={cn('card border-2', Math.abs(discrepancy) > 500 ? 'border-red-500/50 bg-red-500/10' : 'border-green-500/30 bg-green-500/5')}>
        <h2 className="text-base font-display font-bold mb-4 flex items-center gap-2">
          {Math.abs(discrepancy) > 500 ? <AlertTriangle className="w-5 h-5 text-red-400" /> : <CheckCircle2 className="w-5 h-5 text-green-400" />}
          Сверка кассы
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Остаток на начало</span><span className="font-mono">{fmt(num(cashStart))}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">+ Внесение</span><span className="font-mono">{fmt(num(cashDeposit))}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">+ Наличные продажи</span><span className="font-mono text-green-400">{fmt(cashSales)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">− Изъятия</span><span className="font-mono text-red-400">{fmt(totalWithdrawals)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">− Инкассация</span><span className="font-mono text-red-400">{fmt(num(inkassation))}</span></div>
          <div className="h-px bg-slate-700 my-2" />
          <div className="flex justify-between font-bold"><span>Ожидаемый остаток</span><span className="font-mono text-blue-400">{fmt(cashExpected)} ₸</span></div>
          <div className="flex justify-between font-bold"><span>Фактический остаток</span><span className="font-mono text-green-400">{fmt(num(cashActual))} ₸</span></div>
          <div className="h-px bg-slate-700 my-2" />
          <div className={cn('flex justify-between text-lg font-bold', Math.abs(discrepancy) > 500 ? 'text-red-400' : 'text-green-400')}>
            <span>РАСХОЖДЕНИЕ</span><span className="font-mono">{discrepancy > 0 ? '+' : ''}{fmt(discrepancy)} ₸</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      {!isLocked && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={saveDraft} disabled={saving} className="btn-secondary flex items-center justify-center gap-2 flex-1">
            <Save className="w-4 h-4" />{saving ? 'Сохранение...' : 'Сохранить черновик'}
          </button>
          {!isSubmitted && (
            <button onClick={submitReport} disabled={saving} className="btn-primary flex items-center justify-center gap-2 flex-1">
              <Send className="w-4 h-4" /> Отправить отчёт
            </button>
          )}
          {isSubmitted && (
            <button onClick={submitReport} disabled={saving} className="btn-primary flex items-center justify-center gap-2 flex-1">
              <Send className="w-4 h-4" /> Обновить и отправить
            </button>
          )}
          <button onClick={shareWhatsApp} className="btn-secondary flex items-center justify-center gap-2">
            WhatsApp
          </button>
        </div>
      )}
    </div>
  )
}
