import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { fmt, cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification, formatDailyReportNotification, formatCashDiscrepancyAlert } from '@/lib/telegram'
import { Save, Send, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Plus, Trash2, Calendar, ArrowLeft, FileText, Eye, Clock, Check, Pencil, Download } from 'lucide-react'
import jsPDF from 'jspdf'

const MoneyInput = ({ value, onChange, className = '', disabled = false }) => (
  <input type="text" inputMode="decimal" value={value} disabled={disabled}
    onChange={e => onChange(e.target.value.replace(/[^0-9.,]/g, '').replace('.', ','))}
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
  { key: 'suppliers_kitchen', label: 'Закуп Кухня', color: 'green', icon: '🍽', supplierCat: 'Кухня' },
  { key: 'suppliers_bar', label: 'Закуп Бар', color: 'blue', icon: '🍸', supplierCat: 'Бар' },
  { key: 'tobacco', label: 'Закуп Кальян', color: 'amber', icon: '💨', fixed: true },
  { key: 'payroll', label: 'Авансы персоналу', color: 'indigo', icon: '👥', isPayroll: true },
  { key: 'other', label: 'Прочие расходы', color: 'rose', icon: '📦', fixed: true },
  { key: 'cash_withdrawals', label: 'Изъятия из кассы', color: 'red', icon: '💸' },
]
const FIXED_ROWS = {
  tobacco: ['Табак', 'Угли', 'Расходники кальян', 'Аппараты', 'Доставка'],
  other: ['Хозтовары', 'Мелкий ремонт', 'Доставка (Яндекс)', 'Канцтовары', 'Прочее'],
}
const PAYMENT_TYPES = ['Наличные', 'Kaspi', 'Halyk', 'Wolt', 'Glovo', 'Yandex Eda', 'Прочее']
const DEPARTMENTS = ['Кухня', 'Бар', 'Кальян', 'Прочее']

const JournalPagination = ({ page, total, pageSize, onChange }) => {
  const totalPages = Math.ceil(total / pageSize)
  // Display pages in reverse: display page 1 = oldest (internal last), display page N = newest (internal 0)
  const displayPage = totalPages - page // 1-based, 1=oldest, totalPages=newest
  const pages = []
  for (let d = 1; d <= totalPages; d++) {
    if (d === 1 || d === totalPages || Math.abs(d - displayPage) <= 1) {
      pages.push(d)
    } else if (pages[pages.length - 1] !== '...') {
      pages.push('...')
    }
  }
  const goToDisplay = (d) => onChange(totalPages - d) // convert display page to internal
  return (
    <div className="flex items-center justify-center gap-1.5 py-3">
      <button onClick={() => goToDisplay(displayPage - 1)} disabled={displayPage <= 1}
        className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-30 disabled:pointer-events-none">
        ← Старые
      </button>
      {pages.map((d, i) =>
        d === '...' ? <span key={`dots-${i}`} className="text-slate-600 px-1">...</span> : (
          <button key={d} onClick={() => goToDisplay(d)}
            className={`text-xs px-2.5 py-1.5 rounded-lg transition-colors ${d === displayPage ? 'bg-brand-500/20 text-brand-400 font-bold' : 'text-slate-400 hover:bg-slate-800 hover:text-white'}`}>
            {d}
          </button>
        )
      )}
      <button onClick={() => goToDisplay(displayPage + 1)} disabled={displayPage >= totalPages}
        className="btn-secondary text-xs px-2.5 py-1.5 disabled:opacity-30 disabled:pointer-events-none">
        Новые →
      </button>
    </div>
  )
}

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
  const location = useLocation()
  const [mode, setMode] = useState('journal')
  const [journal, setJournal] = useState([])
  const [journalLoading, setJournalLoading] = useState(true)
  const [journalPage, setJournalPage] = useState(0)
  const [journalTotal, setJournalTotal] = useState(0)
  const JOURNAL_PAGE_SIZE = 20

  // Form state
  const [reportId, setReportId] = useState(null)
  const [status, setStatus] = useState('draft')
  const [date, setDate] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [saving, setSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState(null)
  const [expanded, setExpanded] = useState({ suppliers_kitchen: true, suppliers_bar: true, tobacco: true, payroll: true, other: true, cash_withdrawals: true })
  const [savedSuppliers, setSavedSuppliers] = useState({ Кухня: [], Бар: [], Кальян: [], Хозтовары: [], Прочее: [] })
  const [savedStaff, setSavedStaff] = useState([])
  const [cashStart, setCashStart] = useState('')
  const [cashEnd, setCashEnd] = useState('')
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
  const [allAccounts, setAllAccounts] = useState([]) // all accounts for parent lookup
  const [terminalAccounts, setTerminalAccounts] = useState([]) // sub-accounts (have parent_account_id)
  const [terminals, setTerminals] = useState({}) // { accountId: amount }

  useEffect(() => { loadJournal(); loadSavedEntities() }, [])

  // Reset to journal when navigating to this page (even if already here)
  useEffect(() => {
    setMode('journal')
    loadJournal()
  }, [location.key])

  const loadJournal = async (page = journalPage) => {
    setJournalLoading(true)
    const from = page * JOURNAL_PAGE_SIZE
    const to = from + JOURNAL_PAGE_SIZE - 1
    const { data, count } = await supabase
      .from('daily_reports').select('*', { count: 'exact' })
      .order('status', { ascending: true })       // draft first
      .order('report_date', { ascending: false })
      .range(from, to)
    setJournal(data || [])
    setJournalTotal(count || 0)
    setJournalLoading(false)
  }

  const loadSavedEntities = async () => {
    const [supRes, staffRes, acctRes] = await Promise.all([
      supabase.from('suppliers').select('*').eq('is_active', true).order('name'),
      supabase.from('staff').select('*').eq('is_active', true).order('full_name'),
      supabase.from('accounts').select('*').eq('is_active', true).order('sort_order, id'),
    ])
    if (supRes.data) {
      const grouped = { Кухня: [], Бар: [], Кальян: [], Хозтовары: [], Прочее: [] }
      supRes.data.forEach(s => { if (grouped[s.category]) grouped[s.category].push(s) })
      setSavedSuppliers(grouped)
    }
    if (staffRes.data) setSavedStaff(staffRes.data)
    if (acctRes.data) {
      const allAccounts = acctRes.data
      setTerminalAccounts(allAccounts.filter(a => a.parent_account_id))
      // Store all accounts for parent name lookup
      setAllAccounts(allAccounts)
    }
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

  const openReport = async (report) => {
    const d = report.data || {}
    setReportId(report.id)
    setStatus(report.status || 'draft')
    setDate(report.report_date)
    setCashEnd(String(d.cash_end || d.cash_actual || ''))
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
    setTerminals(d.terminals || {})
    setMode('form')

    // Для черновиков: касса на начало = касса на конец предыдущей закрытой смены
    const isDraft = !report.status || report.status === 'draft'
    if (isDraft) {
      const { data: prevReport } = await supabase
        .from('daily_reports').select('data')
        .eq('status', 'submitted')
        .lt('report_date', report.report_date)
        .order('report_date', { ascending: false })
        .limit(1).single()
      const prevCashEnd = prevReport?.data?.cash_end ?? prevReport?.data?.cash_actual
      setCashStart(prevCashEnd != null ? String(prevCashEnd) : String(d.cash_start || ''))
    } else {
      setCashStart(String(d.cash_start || ''))
    }
  }

  const newReport = async () => {
    setReportId(null); setStatus('draft')
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1)
    setDate(yesterday.toISOString().split('T')[0])
    setCashStart(''); setCashEnd('')
    setWithdrawals(emptyWithdrawals())
    setRevenue(PAYMENT_TYPES.map(t => ({ type: t, amount: '', checks: '' })))
    setDepartments(DEPARTMENTS.map(d => ({ name: d, amount: '' })))
    setTerminals({})
    setLastSaved(null)
    setMode('form')
    // Касса на начало = касса на конец предыдущей закрытой смены
    const { data: prevReport } = await supabase
      .from('daily_reports').select('data')
      .eq('status', 'submitted')
      .order('report_date', { ascending: false })
      .limit(1).single()
    const prevCashEnd = prevReport?.data?.cash_end ?? prevReport?.data?.cash_actual
    if (prevCashEnd != null) {
      setCashStart(String(prevCashEnd))
    } else {
      // Fallback: если нет закрытых смен, берём из счёта
      const bal = await getCashBalance()
      setCashStart(String(bal || 0))
    }
  }

  // Calculations
  const num = (v) => Number(String(v).replace(',', '.')) || 0
  const sectionTotal = (key) => (withdrawals[key] || []).reduce((s, r) => s + num(r.amount), 0)
  const totalWithdrawals = SECTIONS.reduce((s, sec) => s + sectionTotal(sec.key), 0)
  const totalRevenue = revenue.reduce((s, r) => s + num(r.amount), 0)
  const totalDeptRevenue = departments.reduce((s, d) => s + num(d.amount), 0)
  const revenueDiscrepancy = totalDeptRevenue - totalRevenue
  // Group terminal accounts by parent, compute totals per parent
  const terminalsByParent = terminalAccounts.reduce((acc, ta) => {
    const pid = ta.parent_account_id
    if (!acc[pid]) acc[pid] = { accounts: [], total: 0 }
    acc[pid].accounts.push(ta)
    acc[pid].total += num(terminals[ta.id])
    return acc
  }, {})

  // Aggregate terminal totals by payment type for discrepancy check
  const terminalTotalsByPaymentType = {}
  Object.entries(terminalsByParent).forEach(([parentId, group]) => {
    const parent = allAccounts.find(a => a.id === Number(parentId))
    const matchingPt = revenue.find(r => parent?.bank_name && r.type.toLowerCase().includes(parent.bank_name.toLowerCase()))
    const ptKey = matchingPt?.type || parentId
    if (!terminalTotalsByPaymentType[ptKey]) terminalTotalsByPaymentType[ptKey] = 0
    terminalTotalsByPaymentType[ptKey] += group.total
  })

  const cashSales = num(revenue.find(r => r.type === 'Наличные')?.amount)
  const cashExpected = num(cashStart) + cashSales - totalWithdrawals
  const discrepancy = num(cashEnd) - cashExpected

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
      cash_end: num(cashEnd), withdrawals, revenue, departments, terminals,
      total_revenue: totalRevenue, total_dept_revenue: totalDeptRevenue,
      total_withdrawals: totalWithdrawals, cash_expected: cashExpected, discrepancy,
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
    if (!num(cashEnd)) {
      if (!confirm('Остаток на конец смены не указан. Всё равно отправить?')) return
    }
    setSaving(true)
    try {
      const payload = buildPayload('submitted')
      const { data, error } = await supabase.from('daily_reports').upsert(payload, { onConflict: 'report_date' }).select().single()
      if (error) throw error
      if (data) setReportId(data.id)
      setStatus('submitted')

      // Sync cash account balance with cashEnd
      if (num(cashEnd)) {
        try {
          const { data: cashAccount } = await supabase
            .from('accounts').select('*').eq('type', 'cash').limit(1).single()
          if (cashAccount) {
            // Удалить старые корректировки за эту дату (предотвращение дублей)
            await supabase.from('account_transactions')
              .delete()
              .eq('account_id', cashAccount.id)
              .eq('reference_type', 'daily_report')
              .eq('transaction_date', date)

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
            const diff = num(cashEnd) - currentBalance
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

      // Sync terminal account balances
      try {
        // Delete old terminal transactions for this date
        for (const ta of terminalAccounts) {
          await supabase.from('account_transactions')
            .delete()
            .eq('account_id', ta.id)
            .eq('reference_type', 'daily_report')
            .eq('transaction_date', date)
        }
        // Create new transactions for each terminal with amount > 0
        const terminalInserts = terminalAccounts
          .filter(ta => num(terminals[ta.id]) > 0)
          .map(ta => ({
            account_id: ta.id,
            transaction_date: date,
            type: 'income',
            amount: num(terminals[ta.id]),
            description: `Выручка по терминалу за ${date}`,
            reference_type: 'daily_report',
          }))
        if (terminalInserts.length > 0) {
          await supabase.from('account_transactions').insert(terminalInserts)
        }
      } catch (_) {}

      // Telegram notifications
      try {
        await sendTelegramNotification(formatDailyReportNotification({
          date, manager: profile?.full_name, revenue: totalRevenue, withdrawals: totalWithdrawals,
          cashExpected, cashActual: num(cashEnd), discrepancy,
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
    if (!confirm('Вернуть отчёт в черновик? Транзакции по этому отчёту будут удалены и пересозданы при повторной отправке.')) return
    // Удалить account_transactions за эту дату
    await supabase.from('account_transactions')
      .delete()
      .eq('reference_type', 'daily_report')
      .eq('transaction_date', date)
    setStatus('draft')
    await supabase.from('daily_reports').update({ status: 'draft', submitted_at: null }).eq('id', reportId)
    loadJournal()
  }

  // Delete report (admin only)
  const deleteReport = async (id, reportDate) => {
    if (!confirm(`Удалить отчёт за ${reportDate}? Все связанные транзакции будут удалены.`)) return
    // Удалить связанные транзакции из account_transactions
    await supabase.from('account_transactions')
      .delete()
      .eq('reference_type', 'daily_report')
      .eq('transaction_date', reportDate)
    // Удалить сам отчёт
    await supabase.from('daily_reports').delete().eq('id', id)
    if (mode === 'form') setMode('journal')
    loadJournal()
  }

  // Generate PDF using direct jsPDF API with Roboto font
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

    const divider = () => {
      y += 2
      doc.setDrawColor(200, 200, 200); doc.setLineWidth(0.3)
      doc.line(L, y, R, y)
      y += 4
    }
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

    subHeader('Выручка по отделам')
    departments.forEach(d => {
      if (num(d.amount) > 0) row(d.name, `${fmt(num(d.amount))} ₸`)
    })
    divider()
    row('Итого по отделам', `${fmt(totalDeptRevenue)} ₸`, { bold: true })
    y += 3

    subHeader('Доходы по типам оплат')
    revenue.forEach(r => {
      if (num(r.amount) > 0) {
        const checks = num(r.checks)
        const label = checks > 0 ? `${r.type} (${checks} чек.)` : r.type
        row(label, `${fmt(num(r.amount))} ₸`)
      }
    })
    divider()
    row('Итого по типам оплат', `${fmt(totalRevenue)} ₸`, { bold: true })
    y += 2

    // Сверка выручки
    if (totalRevenue > 0 || totalDeptRevenue > 0) {
      divider()
      if (revenueDiscrepancy !== 0) {
        row('Расхождение выручки', `${fmt(revenueDiscrepancy)} ₸`, { bold: true, color: [220, 53, 69] })
      } else {
        setNormal(9); doc.setTextColor(34, 139, 34)
        doc.text('Выручка сходится', L + 4, y)
        doc.setTextColor(30)
        y += 5
      }
    }

    // Терминалы
    if (terminalAccounts.length > 0 && Object.values(terminals).some(v => num(v) > 0)) {
      y += 4
      subHeader('Терминалы')
      Object.entries(terminalsByParent).forEach(([parentId, group]) => {
        const parent = allAccounts.find(a => a.id === Number(parentId))
        if (group.total <= 0) return
        setNormal(9); doc.setTextColor(120)
        doc.text(parent?.name || 'Счёт', L + 4, y); y += 5; doc.setTextColor(30)
        group.accounts.forEach(ta => {
          if (num(terminals[ta.id]) > 0) row(`  ${ta.name}`, `${fmt(num(terminals[ta.id]))} ₸`)
        })
        row(`  Итого`, `${fmt(group.total)} ₸`, { bold: true })
      })
    }
    y += 4

    // ══════════ BLOCK 2: РАСХОДЫ ══════════
    sectionHeader('РАСХОДЫ', [220, 53, 69])

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
    doc.text('ИТОГО РАСХОДОВ', L + 4, y)
    doc.setTextColor(220, 53, 69)
    doc.text(`${fmt(totalWithdrawals)} ₸`, R - 2, y, { align: 'right' })
    doc.setTextColor(30)
    y += 8

    // ══════════ BLOCK 3: КАССА ══════════
    checkPage(80)
    sectionHeader('КАССА', [59, 130, 246])

    row('Остаток на начало', `${fmt(num(cashStart))} ₸`)
    row('+ Наличные продажи', `${fmt(cashSales)} ₸`, { color: [34, 139, 34] })
    row('− Расходы наличными', `${fmt(totalWithdrawals)} ₸`, { color: [220, 53, 69] })
    divider()
    row('Ожидаемый остаток', `${fmt(cashExpected)} ₸`, { bold: true, color: [59, 130, 246] })
    row('Фактический остаток', `${fmt(num(cashEnd))} ₸`, { bold: true, color: [34, 139, 34] })
    boldDivider()

    if (discrepancy === 0) {
      setBold(12); doc.setTextColor(34, 139, 34)
      doc.text('Расхождений нет', L + 4, y)
    } else if (Math.abs(discrepancy) <= 500) {
      setBold(12); doc.setTextColor(245, 158, 11)
      doc.text('РАСХОЖДЕНИЕ', L + 4, y)
      doc.text(`${discrepancy > 0 ? '+' : ''}${fmt(discrepancy)} ₸`, R - 2, y, { align: 'right' })
    } else {
      setBold(12); doc.setTextColor(220, 53, 69)
      doc.text('РАСХОЖДЕНИЕ', L + 4, y)
      doc.text(`${discrepancy > 0 ? '+' : ''}${fmt(discrepancy)} ₸`, R - 2, y, { align: 'right' })
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
    text += `💰 Выручка по отделам: ${fmt(totalDeptRevenue)} ₸\n`
    departments.forEach(d => { if (num(d.amount)) text += `  ${d.name}: ${fmt(num(d.amount))} ₸\n` })
    text += `💰 По типам оплат: ${fmt(totalRevenue)} ₸\n`
    if (terminalAccounts.length > 0 && Object.values(terminals).some(v => num(v) > 0)) {
      text += `\n📱 Терминалы:\n`
      Object.entries(terminalsByParent).forEach(([parentId, group]) => {
        const parent = allAccounts.find(a => a.id === Number(parentId))
        group.accounts.forEach(ta => {
          if (num(terminals[ta.id]) > 0) text += `  ${ta.name}: ${fmt(num(terminals[ta.id]))} ₸\n`
        })
        text += `  Итого (${parent?.name || '?'}): ${fmt(group.total)} ₸\n`
      })
    }
    text += `\n📤 Расходы: ${fmt(totalWithdrawals)} ₸\n`
    text += `💵 Касса начало: ${fmt(num(cashStart))} ₸\n`
    text += `💵 Касса конец: ${fmt(num(cashEnd))} ₸\n`
    text += `💵 Ожидаемый: ${fmt(cashExpected)} ₸\n`
    if (discrepancy === 0) {
      text += `✅ Расхождений нет`
    } else if (Math.abs(discrepancy) <= 500) {
      text += `⚠️ Расхождение: ${fmt(discrepancy)} ₸`
    } else {
      text += `🚨 Расхождение: ${fmt(discrepancy)} ₸`
    }
    text += `\n\n📎 PDF отчёт скачан — прикрепите файл к сообщению`
    return text
  }

  const isSubmitted = status === 'submitted'
  const isLocked = isSubmitted

  // ============ JOURNAL VIEW ============
  if (mode === 'journal') {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-display font-bold tracking-tight">Журнал отчётов</h1>
            <p className="text-sm text-slate-500 mt-0.5">Отчёты {journalPage * JOURNAL_PAGE_SIZE + 1}–{Math.min((journalPage + 1) * JOURNAL_PAGE_SIZE, journalTotal)} из {journalTotal}</p>
          </div>
          <button onClick={newReport} className="btn-primary text-sm flex items-center gap-2 shrink-0">
            <Plus className="w-4 h-4" /> Новый отчёт
          </button>
        </div>

        <div className="card flex flex-wrap items-center gap-3">
          <Calendar className="w-4 h-4 text-slate-500" />
          <span className="text-sm text-slate-400">Открыть за дату:</span>
          <input type="date" id="journal-date-picker" className="input text-sm flex-1 min-w-[140px]" />
          <button className="btn-primary text-sm" onClick={async () => {
            const pickedDate = document.getElementById('journal-date-picker').value
            if (!pickedDate) return
            const { data: existing } = await supabase
              .from('daily_reports').select('*')
              .eq('report_date', pickedDate).limit(1).single()
            if (existing) {
              openReport(existing)
            } else {
              setReportId(null); setStatus('draft')
              setCashStart(''); setCashEnd('')
              setWithdrawals(emptyWithdrawals())
              setRevenue(PAYMENT_TYPES.map(t => ({ type: t, amount: '', checks: '' })))
              setDepartments(DEPARTMENTS.map(d => ({ name: d, amount: '' })))
              setTerminals({}); setLastSaved(null)
              setDate(pickedDate)
              setMode('form')
            }
          }}>Открыть</button>
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
            {journalTotal > JOURNAL_PAGE_SIZE && <JournalPagination page={journalPage} total={journalTotal} pageSize={JOURNAL_PAGE_SIZE} onChange={p => { setJournalPage(p); loadJournal(p) }} />}
            {journal.map(r => {
              const disc = r.cash_discrepancy || 0
              const hasDisc = Math.abs(disc) > 500
              const isDraft = r.status === 'draft' || !r.status
              return (
                <div key={r.id} className={cn('card w-full text-left flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 hover:border-brand-500/30 transition-all group',
                  hasDisc && !isDraft && 'border-red-500/20',
                  isDraft && 'border-yellow-500/20')}>
                  <button onClick={() => openReport(r)} className="flex items-center gap-3 flex-1 min-w-0 w-full sm:w-auto">
                    <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold shrink-0',
                      isDraft ? 'bg-yellow-500/15 text-yellow-400' : hasDisc ? 'bg-red-500/15 text-red-400' : 'bg-green-500/15 text-green-400')}>
                      {new Date(r.report_date + 'T12:00:00').getDate()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium flex flex-wrap items-center gap-2">
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
                  <div className="flex items-center gap-3 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end pl-[52px] sm:pl-0 shrink-0">
                    <div className="text-right">
                      <div className="text-sm font-mono font-semibold text-green-400">{fmt(r.total_revenue || 0)} ₸</div>
                      <div className="text-[10px] text-slate-500">выручка</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono text-red-400">{fmt(r.total_withdrawals || 0)} ₸</div>
                      <div className="text-[10px] text-slate-500">расходы</div>
                    </div>
                    {hasDisc && !isDraft && (
                      <div className="text-right">
                        <div className="text-sm font-mono font-bold text-red-400 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />{fmt(disc)} ₸
                        </div>
                        <div className="text-[10px] text-red-500">расхождение</div>
                      </div>
                    )}
                    <div className="flex items-center gap-1 shrink-0">
                      {canEdit && (
                        <button onClick={(e) => { e.stopPropagation(); deleteReport(r.id, r.report_date) }}
                          className="p-2 text-slate-600 hover:text-red-400 transition-colors" title="Удалить отчёт">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => openReport(r)} className="p-2">
                        <Eye className="w-4 h-4 text-slate-600 group-hover:text-brand-400" />
                      </button>
                    </div>
                  </div>
                </div>
              )
            })}
            {journalTotal > JOURNAL_PAGE_SIZE && <JournalPagination page={journalPage} total={journalTotal} pageSize={JOURNAL_PAGE_SIZE} onChange={p => { setJournalPage(p); loadJournal(p) }} />}
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
        <div className="card border-green-500/20 bg-green-500/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
            <span className="text-sm text-green-400 font-medium">Отчёт отправлен. Только просмотр.</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={generatePDF} className="btn-secondary text-xs flex items-center gap-1.5">
              <Download className="w-3.5 h-3.5" /> PDF
            </button>
            {canEdit && (
              <button onClick={reopenReport} className="btn-secondary text-xs flex items-center gap-1.5">
                <Pencil className="w-3.5 h-3.5" /> Вернуть в черновик
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══════════ БЛОК 1: ДОХОДЫ ══════════ */}
      <div className="space-y-4">
        <h2 className="text-lg font-display font-bold text-green-400 flex items-center gap-2">💰 Доходы</h2>

        {/* Выручка по отделам */}
        <div className="card border-green-500/20 bg-green-500/5">
          <h3 className="text-sm font-display font-bold text-green-300 mb-3">Выручка по отделам</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {departments.map((d, i) => (
              <div key={i}><label className="label">{d.name}</label><MoneyInput value={d.amount} onChange={v => setDepartments(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))} disabled={isLocked} /></div>
            ))}
          </div>
          <div className="flex items-center justify-between pt-3 mt-3 border-t border-green-500/20">
            <span className="text-sm font-bold">Итого по отделам</span>
            <span className="text-lg font-mono font-bold">{fmt(totalDeptRevenue)} ₸</span>
          </div>
        </div>

        {/* Доходы по типам оплат */}
        <div className="card border-green-500/20 bg-green-500/5">
          <h3 className="text-sm font-display font-bold text-green-300 mb-3">Доходы по типам оплат</h3>
          <div className="space-y-2">
            <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-500 uppercase px-1">
              <div className="col-span-4">Тип оплаты</div><div className="col-span-4 text-right">Сумма (₸)</div>
              <div className="col-span-2 text-right">Чеков</div><div className="col-span-2 text-right">Ср. чек</div>
            </div>
            {revenue.map((r, i) => (
              <div key={i}>
                {/* Mobile: stacked */}
                <div className="sm:hidden space-y-1 py-2 border-b border-slate-800/50 last:border-0">
                  <div className="text-xs text-slate-400 px-1">{r.type}</div>
                  <div className="grid grid-cols-3 gap-2">
                    <MoneyInput value={r.amount} onChange={v => setRevenue(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))} disabled={isLocked} />
                    <MoneyInput value={r.checks} onChange={v => setRevenue(prev => prev.map((x, j) => j === i ? { ...x, checks: v } : x))} disabled={isLocked} />
                    <div className="text-right text-sm font-mono text-slate-400 self-center">{num(r.checks) > 0 ? fmt(num(r.amount) / num(r.checks)) : '—'}</div>
                  </div>
                </div>
                {/* Desktop: row */}
                <div className="hidden sm:grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4 text-sm text-slate-300 px-1">{r.type}</div>
                  <div className="col-span-4"><MoneyInput value={r.amount} onChange={v => setRevenue(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))} disabled={isLocked} /></div>
                  <div className="col-span-2"><MoneyInput value={r.checks} onChange={v => setRevenue(prev => prev.map((x, j) => j === i ? { ...x, checks: v } : x))} disabled={isLocked} /></div>
                  <div className="col-span-2 text-right text-sm font-mono text-slate-400">{num(r.checks) > 0 ? fmt(num(r.amount) / num(r.checks)) : '—'}</div>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3 border-t border-green-500/20">
              <span className="text-sm font-bold">Итого по типам оплат</span>
              <span className="text-lg font-mono font-bold">{fmt(totalRevenue)} ₸</span>
            </div>
          </div>
        </div>

        {/* Сверка выручки */}
        {(totalRevenue > 0 || totalDeptRevenue > 0) && (
          <div className={cn('card border', revenueDiscrepancy !== 0 ? 'border-red-500/30 bg-red-500/5' : 'border-green-500/30 bg-green-500/5')}>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-slate-400">Итого по отделам</span><span className="font-mono">{fmt(totalDeptRevenue)} ₸</span></div>
              <div className="flex justify-between"><span className="text-slate-400">Итого по типам оплат</span><span className="font-mono">{fmt(totalRevenue)} ₸</span></div>
              <div className="h-px bg-slate-700 my-1" />
              {revenueDiscrepancy !== 0 ? (
                <div className="flex items-center justify-between text-red-400 font-bold">
                  <span className="flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Расхождение выручки</span>
                  <span className="font-mono">{fmt(revenueDiscrepancy)} ₸</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-green-400 font-bold">
                  <CheckCircle2 className="w-4 h-4" /> Выручка сходится
                </div>
              )}
            </div>
          </div>
        )}

        {/* Терминалы (подсчёта) */}
        {terminalAccounts.length > 0 && (
          <div className="card border-orange-500/20 bg-orange-500/5">
            <h3 className="text-sm font-display font-bold text-orange-300 mb-3">📱 Терминалы</h3>
            {Object.entries(terminalsByParent).map(([parentId, group]) => {
              const parent = allAccounts.find(a => a.id === Number(parentId))
              const matchingPaymentType = revenue.find(r => parent?.bank_name && r.type.toLowerCase().includes(parent.bank_name.toLowerCase()))
              const ptKey = matchingPaymentType?.type || parentId
              // Check if this is the last parent for this payment type — show discrepancy only once
              const parentsForPt = Object.entries(terminalsByParent).filter(([pid]) => {
                const p = allAccounts.find(a => a.id === Number(pid))
                const mpt = revenue.find(r => p?.bank_name && r.type.toLowerCase().includes(p.bank_name.toLowerCase()))
                return (mpt?.type || pid) === ptKey
              })
              const isLastForPt = parentsForPt[parentsForPt.length - 1]?.[0] === parentId
              const paymentAmount = num(matchingPaymentType?.amount)
              const totalForPt = terminalTotalsByPaymentType[ptKey] || 0
              const terminalDiscrepancy = paymentAmount > 0 || totalForPt > 0 ? totalForPt - paymentAmount : null
              return (
                <div key={parentId} className="mb-4 last:mb-0">
                  <div className="text-xs font-semibold text-slate-500 uppercase mb-2 flex items-center gap-1.5">
                    {parent?.icon} {parent?.name || 'Счёт'}
                  </div>
                  <div className="space-y-2">
                    {group.accounts.map(ta => (
                      <div key={ta.id} className="flex items-center gap-3">
                        <span className="text-sm text-slate-300 w-28 sm:w-40 shrink-0 truncate">{ta.icon} {ta.name}</span>
                        <MoneyInput value={terminals[ta.id] || ''} onChange={v => setTerminals(prev => ({ ...prev, [ta.id]: v }))} disabled={isLocked} />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between pt-2 mt-2 border-t border-orange-500/20">
                    <span className="text-sm font-bold">Итого {parent?.name || ''}</span>
                    <span className="text-sm font-mono font-bold">{fmt(group.total)} ₸</span>
                  </div>
                  {isLastForPt && terminalDiscrepancy !== null && (
                    <div className={cn('flex items-center justify-between mt-1 text-xs',
                      terminalDiscrepancy === 0 ? 'text-green-400' : 'text-red-400')}>
                      <span>{terminalDiscrepancy === 0 ? '✅ Сходится с «' : '⚠️ Расхождение с «'}{matchingPaymentType?.type || '?'}»</span>
                      {terminalDiscrepancy !== 0 && <span className="font-mono font-bold">{terminalDiscrepancy > 0 ? '+' : ''}{fmt(terminalDiscrepancy)} ₸</span>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══════════ БЛОК 2: РАСХОДЫ ══════════ */}
      <div className="space-y-4">
        <h2 className="text-lg font-display font-bold text-red-400 flex items-center gap-2">📤 Расходы</h2>

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
                  <span>{sec.icon}</span><h3 className="text-sm font-display font-bold">{sec.label}</h3>
                  {total > 0 && <span className="badge-yellow">{fmt(total)} ₸</span>}
                </div>
                {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
              </button>
              {isOpen && (
                <div className="mt-4 space-y-2">
                  {isCashW ? (
                    <>
                      <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-500 uppercase px-1">
                        <div className="col-span-4 text-right">Сумма (₸)</div>
                        <div className="col-span-7">Комментарий</div>
                        <div className="col-span-1" />
                      </div>
                      {(withdrawals[sec.key] || []).map((row, idx) => (
                        <div key={idx} className="flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:items-center py-2 sm:py-0 border-b border-slate-800/30 sm:border-0 last:border-0">
                          <div className="sm:col-span-4"><MoneyInput value={row.amount} onChange={v => updateWithdrawal(sec.key, idx, 'amount', v)} disabled={isLocked} /></div>
                          <div className="sm:col-span-7 flex items-center gap-2">
                            <input value={row.comment || ''} onChange={e => updateWithdrawal(sec.key, idx, 'comment', e.target.value)} className="input text-sm w-full" placeholder="Причина изъятия" disabled={isLocked} />
                            <div className="sm:hidden shrink-0">
                              {!isLocked && <button onClick={() => removeRow(sec.key, idx)} className="p-2 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
                          </div>
                          <div className="col-span-1 hidden sm:flex justify-center">
                            {!isLocked && <button onClick={() => removeRow(sec.key, idx)} className="p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
                          </div>
                        </div>
                      ))}
                      {!isLocked && <button onClick={() => addRow(sec.key)} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-2 px-1"><Plus className="w-3.5 h-3.5" /> Добавить изъятие</button>}
                    </>
                  ) : (
                    <>
                      <div className="hidden sm:grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-500 uppercase px-1">
                        <div className="col-span-5">{isPayroll ? 'Сотрудник' : 'Поставщик'}</div>
                        <div className="col-span-3 text-right">Сумма (₸)</div>
                        <div className="col-span-3">Комментарий</div><div className="col-span-1" />
                      </div>
                      {withdrawals[sec.key].map((row, idx) => (
                        <div key={idx} className="flex flex-col sm:grid sm:grid-cols-12 gap-2 sm:items-center py-2 sm:py-0 border-b border-slate-800/30 sm:border-0 last:border-0">
                          <div className="sm:col-span-5">
                            {isFixed ? <div className="text-sm text-slate-300 px-3 py-2">{row.name}</div>
                              : <NameInput value={row.name} onChange={v => updateWithdrawal(sec.key, idx, 'name', v)} suggestions={suggestions} placeholder={isPayroll ? 'Сотрудник' : 'Поставщик'} disabled={isLocked} />}
                          </div>
                          <div className="flex items-center gap-2 sm:contents">
                            <div className="flex-1 sm:col-span-3"><MoneyInput value={row.amount} onChange={v => updateWithdrawal(sec.key, idx, 'amount', v)} disabled={isLocked} /></div>
                            <div className="flex-1 sm:col-span-3"><input value={row.comment || ''} onChange={e => updateWithdrawal(sec.key, idx, 'comment', e.target.value)} className="input text-sm w-full" placeholder="—" disabled={isLocked} /></div>
                            <div className="shrink-0 sm:col-span-1 sm:flex sm:justify-center">
                              {!isFixed && !isLocked && <button onClick={() => removeRow(sec.key, idx)} className="p-2 sm:p-1 text-slate-600 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>}
                            </div>
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

        {/* ИТОГО РАСХОДОВ */}
        <div className="card bg-red-500/5 border-red-500/20">
          <div className="flex items-center justify-between">
            <span className="text-sm font-bold text-red-400">ИТОГО РАСХОДОВ</span>
            <span className="text-lg font-mono font-bold text-red-400">{fmt(totalWithdrawals)} ₸</span>
          </div>
        </div>
      </div>

      {/* ══════════ БЛОК 3: КАССА ══════════ */}
      <div className="space-y-4">
        <h2 className="text-lg font-display font-bold text-blue-400 flex items-center gap-2">💵 Касса</h2>

        <div className="card border-blue-500/20 bg-blue-500/5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Остаток на начало смены</label>
              <MoneyInput value={cashStart} onChange={() => {}} disabled={true} className="opacity-50 cursor-not-allowed" />
            </div>
            <div>
              <label className="label">Остаток на конец смены</label>
              <MoneyInput value={cashEnd} onChange={setCashEnd} disabled={isLocked} className="!border-blue-500/50 !bg-blue-500/10" />
            </div>
          </div>

          {/* Сверка кассы */}
          <div className="pt-4 border-t border-blue-500/20 space-y-2 text-sm">
            <div className="text-xs font-semibold text-slate-500 uppercase mb-2">Сверка кассы</div>
            <div className="flex justify-between"><span className="text-slate-400">Остаток на начало</span><span className="font-mono">{fmt(num(cashStart))} ₸</span></div>
            <div className="flex justify-between"><span className="text-slate-400">+ Наличные продажи</span><span className="font-mono text-green-400">{fmt(cashSales)} ₸</span></div>
            <div className="flex justify-between"><span className="text-slate-400">− Расходы наличными</span><span className="font-mono text-red-400">{fmt(totalWithdrawals)} ₸</span></div>
            <div className="h-px bg-slate-700 my-2" />
            <div className="flex justify-between font-bold"><span>Ожидаемый остаток</span><span className="font-mono text-blue-400">{fmt(cashExpected)} ₸</span></div>
            <div className="flex justify-between font-bold"><span>Фактический остаток</span><span className="font-mono text-green-400">{fmt(num(cashEnd))} ₸</span></div>
            <div className="h-px bg-slate-700 my-2" />
            <div className={cn('flex justify-between text-lg font-bold',
              discrepancy === 0 ? 'text-green-400' : Math.abs(discrepancy) <= 500 ? 'text-yellow-400' : 'text-red-400')}>
              <span>{discrepancy === 0 ? '✅ Расхождений нет' : Math.abs(discrepancy) <= 500 ? 'Расхождение' : '⚠️ Расхождение'}</span>
              {discrepancy !== 0 && <span className="font-mono">{discrepancy > 0 ? '+' : ''}{fmt(discrepancy)} ₸</span>}
            </div>
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
