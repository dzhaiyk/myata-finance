import { useState, useEffect } from 'react'
import { fmt, cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification, formatDailyReportNotification, formatCashDiscrepancyAlert } from '@/lib/telegram'
import { Save, Send, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Plus, Trash2, Calendar, ArrowLeft, FileText, Eye, Clock, Check, Pencil, Download } from 'lucide-react'
import jsPDF from 'jspdf'

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
  { key: 'cash_withdrawals', label: 'Изъятия из кассы', color: 'red', icon: '💸' },
]
const FIXED_ROWS = {
  tobacco: ['Табак', 'Угли', 'Расходники кальян', 'Доставка'],
  other: ['Хозтовары', 'Мелкий ремонт', 'Доставка (Яндекс)', 'Канцтовары', 'Прочее'],
}
const PAYMENT_TYPES = ['Наличные', 'Kaspi', 'Halyk', 'Wolt', 'Glovo', 'Yandex Eda', 'Прочее']
const DEPARTMENTS = ['Кухня', 'Бар', 'Кальян', 'Прочее']

// Load Roboto font into jsPDF for Cyrillic support
async function loadPdfFonts(doc) {
  const load = async (url, vfsName, fontName, style) => {
    const res = await fetch(url)
    const buffer = await res.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    doc.addFileToVFS(vfsName, btoa(binary))
    doc.addFont(vfsName, fontName, style)
  }
  await load('/fonts/Roboto-Regular.ttf', 'Roboto-Regular.ttf', 'Roboto', 'normal')
  await load('/fonts/Roboto-Bold.ttf', 'Roboto-Bold.ttf', 'Roboto', 'bold')
  doc.setFont('Roboto', 'normal')
}

export default function DailyReportPage() {
  const { profile, hasPermission } = useAuthStore()
  const canEdit = hasPermission('daily_report.edit')
  const [mode, setMode] = useState('journal')
  const [journal, setJournal] = useState([])
  const [journalLoading, setJournalLoading] = useState(true)

  // Form state
  const [reportId, setReportId] = useState(null)
  const [status, setStatus] = useState('draft')
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [expanded, setExpanded] = useState({ suppliers_kitchen: true, suppliers_bar: true, tobacco: true, payroll: true, other: true, cash_withdrawals: true })
  const [savedSuppliers, setSavedSuppliers] = useState({ Кухня: [], Бар: [], Кальян: [], Хозтовары: [], Прочее: [] })
  const [savedStaff, setSavedStaff] = useState([])
  const [cashStart, setCashStart] = useState('')
  const [cashActual, setCashActual] = useState('')
  const [inkassation, setInkassation] = useState('')
  const emptyWithdrawals = () => ({
    suppliers_kitchen: [{ name: '', amount: '', comment: '' }],
    suppliers_bar: [{ name: '', amount: '', comment: '' }],
    tobacco: FIXED_ROWS.tobacco.map(n => ({ name: n, amount: '', comment: '' })),
    payroll: [{ name: '', amount: '', comment: '' }],
    other: FIXED_ROWS.other.map(n => ({ name: n, amount: '', comment: '' })),
    cash_withdrawals: [{ amount: '', comment: '' }],
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

  // Fetch cash account balance from accounts + transactions
  const getCashBalance = async () => {
    const { data: cashAccount } = await supabase
      .from('accounts').select('*').eq('type', 'cash').limit(1).single()
    if (!cashAccount) return 0
    const { data: txs } = await supabase
      .from('account_transactions').select('type, amount')
      .eq('account_id', cashAccount.id)
    const initial = Number(cashAccount.initial_balance) || 0
    const txTotal = (txs || []).reduce((sum, t) => {
      if (t.type === 'income' || t.type === 'transfer_in') return sum + Number(t.amount)
      if (t.type === 'expense' || t.type === 'transfer_out') return sum - Number(t.amount)
      return sum
    }, 0)
    return initial + txTotal
  }

  const openReport = (report) => {
    const d = report.data || {}
    setReportId(report.id)
    setStatus(report.status || 'draft')
    setDate(report.report_date)
    setCashStart(String(d.cash_start || ''))
    setCashActual(String(d.cash_actual || ''))
    setInkassation(String(d.inkassation || ''))
    if (d.withdrawals) {
      setWithdrawals({
        suppliers_kitchen: d.withdrawals.suppliers_kitchen?.length ? d.withdrawals.suppliers_kitchen : [{ name: '', amount: '', comment: '' }],
        suppliers_bar: d.withdrawals.suppliers_bar?.length ? d.withdrawals.suppliers_bar : [{ name: '', amount: '', comment: '' }],
        tobacco: d.withdrawals.tobacco?.length ? d.withdrawals.tobacco : FIXED_ROWS.tobacco.map(n => ({ name: n, amount: '', comment: '' })),
        payroll: d.withdrawals.payroll?.length ? d.withdrawals.payroll : [{ name: '', amount: '', comment: '' }],
        other: d.withdrawals.other?.length ? d.withdrawals.other : FIXED_ROWS.other.map(n => ({ name: n, amount: '', comment: '' })),
        cash_withdrawals: d.withdrawals.cash_withdrawals?.length ? d.withdrawals.cash_withdrawals : [{ amount: '', comment: '' }],
      })
    }
    if (d.revenue) setRevenue(d.revenue)
    if (d.departments) setDepartments(d.departments)
    setMode('form')
  }

  const newReport = async () => {
    setReportId(null); setStatus('draft')
    setDate(new Date().toISOString().split('T')[0])
    setCashStart(''); setCashActual(''); setInkassation('')
    setWithdrawals(emptyWithdrawals())
    setRevenue(PAYMENT_TYPES.map(t => ({ type: t, amount: '', checks: '' })))
    setDepartments(DEPARTMENTS.map(d => ({ name: d, amount: '' })))
    setLastSaved(null)
    setMode('form')
    const bal = await getCashBalance()
    setCashStart(String(bal || 0))
  }

  // Calculations
  const num = (v) => Number(v) || 0
  const sectionTotal = (key) => (withdrawals[key] || []).reduce((s, r) => s + num(r.amount), 0)
  const totalWithdrawals = SECTIONS.reduce((s, sec) => s + sectionTotal(sec.key), 0)
  const totalRevenue = revenue.reduce((s, r) => s + num(r.amount), 0)
  const totalDeptRevenue = departments.reduce((s, d) => s + num(d.amount), 0)
  const cashSales = num(revenue[0]?.amount)
  const cashExpected = num(cashStart) + cashSales - totalWithdrawals - num(inkassation)
  const discrepancy = num(cashActual) - cashExpected

  const updateWithdrawal = (section, idx, field, value) => {
    setWithdrawals(prev => ({ ...prev, [section]: prev[section].map((r, i) => i === idx ? { ...r, [field]: value } : r) }))
  }
  const addRow = (section) => {
    const newRow = section === 'cash_withdrawals' ? { amount: '', comment: '' } : { name: '', amount: '', comment: '' }
    setWithdrawals(prev => ({ ...prev, [section]: [...prev[section], newRow] }))
  }
  const removeRow = (section, idx) => { setWithdrawals(prev => ({ ...prev, [section]: prev[section].filter((_, i) => i !== idx) })) }

  const buildPayload = (newStatus) => ({
    report_date: date, manager_id: profile?.id, manager_name: profile?.full_name,
    status: newStatus,
    submitted_at: newStatus === 'submitted' ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
    data: {
      date, manager: profile?.full_name, cash_start: num(cashStart),
      cash_actual: num(cashActual), inkassation: num(inkassation), withdrawals, revenue, departments,
      total_revenue: totalRevenue, total_withdrawals: totalWithdrawals, cash_expected: cashExpected, discrepancy,
    },
    total_revenue: totalRevenue, total_withdrawals: totalWithdrawals, cash_discrepancy: discrepancy,
  })

  // Save as draft
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

  // Submit final report
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

      // Sync cash account balance with cashActual
      if (num(cashActual)) {
        try {
          const { data: cashAccount } = await supabase
            .from('accounts').select('*').eq('type', 'cash').limit(1).single()
          if (cashAccount) {
            const { data: txs } = await supabase
              .from('account_transactions').select('type, amount')
              .eq('account_id', cashAccount.id)
            const initial = Number(cashAccount.initial_balance) || 0
            const txTotal = (txs || []).reduce((sum, t) => {
              if (t.type === 'income' || t.type === 'transfer_in') return sum + Number(t.amount)
              if (t.type === 'expense' || t.type === 'transfer_out') return sum - Number(t.amount)
              return sum
            }, 0)
            const currentBalance = initial + txTotal
            const diff = num(cashActual) - currentBalance
            if (Math.abs(diff) > 0) {
              await supabase.from('account_transactions').insert({
                account_id: cashAccount.id,
                transaction_date: date,
                type: diff > 0 ? 'income' : 'expense',
                amount: Math.abs(diff),
                description: `Корректировка по отчёту за ${date}`,
                reference_type: 'daily_report',
              })
            }
          }
        } catch (_) {}
      }

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

      // Generate PDF (auto-download)
      await generatePDF()

      // Open WhatsApp with text summary
      const waText = buildWhatsAppText()
      window.open(`https://wa.me/?text=${encodeURIComponent(waText)}`, '_blank')

      setLastSaved(new Date())
      loadJournal()
      setMode('journal')
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

  // Delete report (admin only)
  const deleteReport = async (id, reportDate) => {
    if (!confirm(`Удалить отчёт за ${reportDate}? Это действие необратимо.`)) return
    await supabase.from('daily_reports').delete().eq('id', id)
    if (mode === 'form') setMode('journal')
    loadJournal()
  }

  // Generate PDF using direct jsPDF API with Roboto font
  const revenueDiscrepancy = totalDeptRevenue - totalRevenue

  const generatePDF = async () => {
    const doc = new jsPDF('p', 'mm', 'a4')
    await loadPdfFonts(doc)

    const L = 14, R = 196, W = R - L
    let y = 20

    const checkPage = (needed = 40) => {
      if (y > 257 - needed) { doc.addPage(); y = 20 }
    }
    const setNormal = (size = 10) => { doc.setFont('Roboto', 'normal'); doc.setFontSize(size); doc.setTextColor(30) }
    const setBold = (size = 10) => { doc.setFont('Roboto', 'bold'); doc.setFontSize(size); doc.setTextColor(30) }

    // Thin divider: gap above → line → gap below (no text overlap)
    const divider = () => {
      y += 2
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3)
      doc.line(L, y, R, y)
      y += 4
    }
    // Bold divider for totals
    const boldDivider = () => {
      y += 2
      doc.setDrawColor(100, 100, 100); doc.setLineWidth(0.5)
      doc.line(L, y, R, y)
      y += 4
    }

    const row = (label, value, opts = {}) => {
      checkPage(8)
      if (opts.bold) setBold(opts.size || 10); else setNormal(opts.size || 10)
      if (opts.color) doc.setTextColor(...opts.color)
      doc.text(label, L + 4, y)
      doc.text(value, R - 2, y, { align: 'right' })
      doc.setTextColor(30)
      y += 6
    }
    const sectionHeader = (title, rgb) => {
      checkPage(16)
      doc.setFillColor(...rgb)
      doc.rect(L, y, W, 8, 'F')
      doc.setFont('Roboto', 'bold'); doc.setFontSize(11); doc.setTextColor(255, 255, 255)
      doc.text(title, L + 3, y + 5.5)
      doc.setTextColor(30)
      y += 12
    }
    const subHeader = (title) => {
      checkPage(12)
      setBold(10); doc.setTextColor(80)
      doc.text(title, L + 4, y)
      doc.setTextColor(30)
      y += 7
    }

    // ── HEADER ──
    setBold(18)
    doc.text(`Myata 4YOU — Отчёт за ${date}`, L, y); y += 8
    setNormal(10); doc.setTextColor(120)
    doc.text(`Менеджер: ${profile?.full_name || '—'}`, L, y); y += 2
    doc.setTextColor(30)
    boldDivider()

    // ══════════ BLOCK 1: ДОХОДЫ ══════════
    sectionHeader('ДОХОДЫ', [34, 139, 34])

    subHeader('Доходы по типам оплат')
    revenue.forEach(r => {
      if (num(r.amount) > 0) row(r.type, `${fmt(num(r.amount))} ₸`)
    })
    divider()
    row('Итого выручка', `${fmt(totalRevenue)} ₸`, { bold: true })
    y += 3

    subHeader('Выручка по отделам')
    departments.forEach(d => {
      if (num(d.amount) > 0) row(d.name, `${fmt(num(d.amount))} ₸`)
    })
    divider()
    row('Итого по отделам', `${fmt(totalDeptRevenue)} ₸`, { bold: true })
    setNormal(9); doc.setTextColor(120)
    doc.text('Итого по типам оплат', L + 4, y)
    doc.text(`${fmt(totalRevenue)} ₸`, R - 2, y, { align: 'right' })
    y += 5
    if (revenueDiscrepancy !== 0) {
      doc.setFont('Roboto', 'bold'); doc.setFontSize(9); doc.setTextColor(220, 53, 69)
      doc.text(`Расхождение: ${fmt(revenueDiscrepancy)} ₸`, L + 4, y)
      y += 5
    }
    doc.setTextColor(30)
    y += 4

    // ══════════ BLOCK 2: РАСХОДЫ И ИЗЪЯТИЯ ══════════
    sectionHeader('РАСХОДЫ И ИЗЪЯТИЯ', [220, 53, 69])

    SECTIONS.forEach(sec => {
      const rows = (withdrawals[sec.key] || []).filter(r => num(r.amount) > 0)
      if (rows.length === 0) return
      const secTotal = sectionTotal(sec.key)
      const neededHeight = rows.length * 6 + 22
      checkPage(neededHeight)

      subHeader(sec.label)
      rows.forEach(r => {
        const label = r.name || r.comment || '—'
        const comment = r.comment && r.name ? `  (${r.comment})` : ''
        row(`${label}${comment}`, `${fmt(num(r.amount))} ₸`)
      })
      divider()
      row(`Итого ${sec.label}`, `${fmt(secTotal)} ₸`, { bold: true })
      y += 2
    })

    boldDivider()
    setBold(11)
    doc.text('ИТОГО РАСХОДЫ', L + 4, y)
    doc.setTextColor(220, 53, 69)
    doc.text(`${fmt(totalWithdrawals)} ₸`, R - 2, y, { align: 'right' })
    doc.setTextColor(30)
    y += 8

    // ══════════ BLOCK 3: СВЕРКА КАССЫ ══════════
    checkPage(80)
    sectionHeader('СВЕРКА КАССЫ', [59, 130, 246])

    row('Остаток на начало', `${fmt(num(cashStart))} ₸`)
    row('+ Наличные продажи', `${fmt(cashSales)} ₸`, { color: [34, 139, 34] })
    row('− Изъятия', `${fmt(totalWithdrawals)} ₸`, { color: [220, 53, 69] })
    if (num(inkassation)) row('− Инкассация', `${fmt(num(inkassation))} ₸`, { color: [220, 53, 69] })
    divider()
    row('Ожидаемый остаток', `${fmt(cashExpected)} ₸`, { bold: true, color: [59, 130, 246] })
    row('Фактический остаток', `${fmt(num(cashActual))} ₸`, { bold: true, color: [34, 139, 34] })
    boldDivider()

    if (discrepancy !== 0) {
      setBold(12); doc.setTextColor(220, 53, 69)
      doc.text('РАСХОЖДЕНИЕ', L + 4, y)
      doc.text(`${discrepancy > 0 ? '+' : ''}${fmt(discrepancy)} ₸`, R - 2, y, { align: 'right' })
    } else {
      setBold(12); doc.setTextColor(34, 139, 34)
      doc.text('Расхождений нет', L + 4, y)
    }
    doc.setTextColor(30)
    y += 8

    // ── FOOTER on every page ──
    const totalPages = doc.getNumberOfPages()
    const generated = `Сформирован: ${new Date().toLocaleString('ru-RU')}`
    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i)
      doc.setFont('Roboto', 'normal'); doc.setFontSize(8); doc.setTextColor(150)
      doc.text(generated, L, 287)
      if (totalPages > 1) doc.text(`${i} / ${totalPages}`, R, 287, { align: 'right' })
    }

    doc.save(`Myata_Report_${date}.pdf`)
  }

  const buildWhatsAppText = () => {
    let text = `📊 Myata 4YOU — Отчёт за ${date}\n👤 ${profile?.full_name}\n\n`
    text += `💰 Выручка: ${fmt(totalRevenue)} ₸\n`
    departments.forEach(d => { if (num(d.amount)) text += `  ${d.name}: ${fmt(num(d.amount))} ₸\n` })
    text += `\n📤 Расходы: ${fmt(totalWithdrawals)} ₸\n`
    text += `💵 Касса ожид: ${fmt(cashExpected)} ₸\n`
    text += `💵 Касса факт: ${fmt(num(cashActual))} ₸\n`
    text += discrepancy !== 0 ? `⚠️ Расхождение: ${fmt(discrepancy)} ₸` : `✅ Расхождений нет`
    text += `\n\n📎 PDF отчёт скачан — прикрепите файл к сообщению`
    return text
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
                <div key={r.id} className={cn('card w-full text-left flex items-center justify-between hover:border-brand-500/30 transition-all group',
                  hasDisc && !isDraft && 'border-red-500/20',
                  isDraft && 'border-yellow-500/20')}>
                  <button onClick={() => openReport(r)} className="flex items-center gap-4 flex-1 min-w-0">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0',
                      isDraft ? 'bg-yellow-500/15 text-yellow-400' : hasDisc ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400')}>
                      {new Date(r.report_date + 'T12:00:00').getDate()}
                    </div>
                    <div className="min-w-0">
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
                  </button>
                  <div className="flex items-center gap-6 shrink-0">
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
                    {canEdit && (
                      <button onClick={(e) => { e.stopPropagation(); deleteReport(r.id, r.report_date) }}
                        className="p-2 text-slate-600 hover:text-red-400 transition-colors" title="Удалить отчёт">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                    <button onClick={() => openReport(r)} className="p-1">
                      <Eye className="w-4 h-4 text-slate-600 group-hover:text-brand-400" />
                    </button>
                  </div>
                </div>
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

      {/* КАССА — cashStart auto-fetched, read-only */}
      <div className="card">
        <h2 className="text-base font-display font-bold text-brand-400 mb-4">💵 Касса</h2>
        <div>
          <label className="label">Остаток на начало смены (из счёта «Касса»)</label>
          <MoneyInput value={cashStart} onChange={() => {}} disabled={true} className="opacity-50 cursor-not-allowed" />
        </div>
      </div>

      {/* Withdrawal Sections */}
      {SECTIONS.map(sec => {
        const isOpen = expanded[sec.key]
        const total = sectionTotal(sec.key)
        const colorMap = { green: 'border-green-500/20 bg-green-500/5', blue: 'border-blue-500/20 bg-blue-500/5', amber: 'border-amber-500/20 bg-amber-500/5', indigo: 'border-indigo-500/20 bg-indigo-500/5', rose: 'border-rose-500/20 bg-rose-500/5', red: 'border-red-500/20 bg-red-500/5' }
        const isFixed = sec.fixed; const isPayroll = sec.isPayroll
        const isCashW = sec.key === 'cash_withdrawals'
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
                {isCashW ? (
                  /* Cash withdrawals: amount + comment only */
                  <>
                    <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-500 uppercase px-1">
                      <div className="col-span-4 text-right">Сумма (₸)</div>
                      <div className="col-span-7">Комментарий</div>
                      <div className="col-span-1" />
                    </div>
                    {(withdrawals[sec.key] || []).map((row, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                        <div className="col-span-4"><MoneyInput value={row.amount} onChange={v => updateWithdrawal(sec.key, idx, 'amount', v)} disabled={isLocked} /></div>
                        <div className="col-span-7"><input value={row.comment || ''} onChange={e => updateWithdrawal(sec.key, idx, 'comment', e.target.value)} className="input text-sm w-full" placeholder="Причина изъятия" disabled={isLocked} /></div>
                        <div className="col-span-1 flex justify-center">
                          {!isLocked && <button onClick={() => removeRow(sec.key, idx)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
                        </div>
                      </div>
                    ))}
                    {!isLocked && <button onClick={() => addRow(sec.key)} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-2 px-1"><Plus className="w-3.5 h-3.5" /> Добавить изъятие</button>}
                  </>
                ) : (
                  /* Standard sections: name + amount + comment */
                  <>
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
                  </>
                )}
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
          <div><label className="label">Остаток наличных (ФАКТ)</label><MoneyInput value={cashActual} onChange={setCashActual} disabled={isLocked} className="!border-yellow-500/50 !bg-yellow-500/10" /></div>
        </div>
      </div>

      {/* REVENUE */}
      <div className="card border-green-500/20 bg-green-500/5">
        <h2 className="text-base font-display font-bold text-green-400 mb-4">💰 Доходы по типам оплат</h2>
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
        <div className="pt-3 mt-3 border-t border-amber-500/20 space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold">Итого по отделам</span>
            <span className="font-mono text-sm font-bold">{fmt(totalDeptRevenue)} ₸</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">Итого по типам оплат</span>
            <span className="font-mono text-xs text-slate-500">{fmt(totalRevenue)} ₸</span>
          </div>
          {totalDeptRevenue - totalRevenue !== 0 && totalRevenue > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-xs text-red-400 font-medium">Расхождение выручки</span>
              <span className="font-mono text-xs text-red-400 font-bold">{fmt(totalDeptRevenue - totalRevenue)} ₸</span>
            </div>
          )}
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
          <button onClick={submitReport} disabled={saving} className="btn-primary flex items-center justify-center gap-2 flex-1">
            <Send className="w-4 h-4" /> Отправить отчёт
          </button>
          <button onClick={generatePDF} className="btn-secondary flex items-center justify-center gap-2">
            <Download className="w-4 h-4" /> PDF
          </button>
        </div>
      )}

      {/* Delete report button (admin only, existing reports) */}
      {canEdit && reportId && (
        <button onClick={() => deleteReport(reportId, date)}
          className="w-full py-3 rounded-xl text-sm font-medium text-red-400 border border-red-500/20 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-2">
          <Trash2 className="w-4 h-4" /> Удалить отчёт
        </button>
      )}
    </div>
  )
}
