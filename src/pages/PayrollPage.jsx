import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt, MONTHS_RU, money } from '@/lib/utils'
import { formatLocalDate, yearsRange } from '@/lib/dates'
import { timesheetTotals } from '@/lib/timesheetDb'
import { Calculator, Save, CheckCircle2, DollarSign, Calendar, Users } from 'lucide-react'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

export default function PayrollPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('payroll.manage')

  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [period, setPeriod] = useState(new Date().getDate() <= 15 ? 1 : 2)
  const [staff, setStaff] = useState([])
  const [positions, setPositions] = useState([])
  const [rows, setRows] = useState([])
  const [saving, setSaving] = useState(false)
  const [periodId, setPeriodId] = useState(null)
  const [periodStatus, setPeriodStatus] = useState('draft')
  const [advancesByName, setAdvancesByName] = useState({})

  useEffect(() => { loadData() }, [year, month, period])

  const loadData = async () => {
    const [staffRes, posRes] = await Promise.all([
      supabase.from('staff').select('*').eq('is_active', true).order('department, full_name'),
      supabase.from('positions').select('*'),
    ])
    const staffData = staffRes.data || []
    const posData = posRes.data || []
    setStaff(staffData)
    setPositions(posData)

    // Calculate period date range
    const startDay = period === 1 ? 1 : 16
    const endDay = period === 1 ? 15 : new Date(year, month, 0).getDate()
    const startDate = `${year}-${String(month).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`
    const endDate = `${year}-${String(month).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`

    // Load advances from daily reports for this period
    // Только отправленные отчёты — черновики могут измениться или быть удалены
    const { data: reports } = await supabase
      .from('daily_reports')
      .select('data, report_date')
      .gte('report_date', startDate)
      .lte('report_date', endDate)
      .eq('status', 'submitted')

    // Sum advances per staff name from daily reports
    const advancesByName = {}
    ;(reports || []).forEach(r => {
      const payrollRows = (r.data?.withdrawals?.payroll) || []
      payrollRows.forEach(row => {
        if (row.name && Number(row.amount) > 0) {
          const key = row.name.trim().toLowerCase()
          if (!advancesByName[key]) advancesByName[key] = { total: 0, details: [] }
          advancesByName[key].total += Number(row.amount)
          advancesByName[key].details.push({ date: r.report_date, amount: Number(row.amount), comment: row.comment || '' })
        }
      })
    })

    // Load period — НЕ создаём при просмотре (иначе мусорные периоды на каждый клик);
    // период создаётся при первом сохранении расчёта
    const { data: per } = await supabase
      .from('payroll_periods')
      .select('*')
      .eq('year', year).eq('month', month).eq('period', period)
      .maybeSingle()

    setPeriodId(per?.id || null)
    const perStatus = per?.status || 'draft'
    setPeriodStatus(perStatus)

    let details = []
    if (per) {
      const { data } = await supabase
        .from('payroll_details')
        .select('*')
        .eq('period_id', per.id)
      details = data || []
    }

    const buildRow = (s, pos, existing) => {
      const dailyRate = s.daily_rate_override || pos?.daily_rate || 0
      const salesPct = s.sales_pct_override || pos?.sales_pct || 0
      // Match advances by staff name (case-insensitive)
      const nameKey = s.full_name.trim().toLowerCase()
      const autoAdvances = advancesByName[nameKey]?.total || 0
      const advDetails = advancesByName[nameKey]?.details || []

      if (existing) {
        const r = { ...existing }
        // Выплаченный период — исторические ставки не трогаем;
        // черновик — подтягиваем актуальные ставки из справочника и пересчитываем
        if (perStatus !== 'paid') {
          r.daily_rate = dailyRate
          r.sales_pct = salesPct
        }
        r.position_name = pos?.name || existing.position_name || '—'
        r.advances_from_reports = autoAdvances
        r.advances_details = advDetails
        // Авто-обновление аванса только если он не был исправлен вручную (флаг из БД)
        if (perStatus !== 'paid' && !existing.manual_advances) {
          r.advances = autoAdvances
        }
        r.daily_total = r.days_worked * r.daily_rate
        r.sales_bonus = Math.round(r.sales_amount * r.sales_pct / 100)
        r.total_earned = r.daily_total + r.sales_bonus
        r.total_payout = r.total_earned - r.advances - r.deductions
        return r
      }

      const row = makeRow(s, pos, dailyRate, salesPct)
      row.advances = autoAdvances
      row.advances_from_reports = autoAdvances
      row.advances_details = advDetails
      row.total_payout = row.total_earned - row.advances - row.deductions
      return row
    }

    const staffRows = staffData.map(s => {
      const pos = posData.find(p => p.id === s.position_id)
      const existing = details.find(d => d.staff_id === s.id)
      return buildRow(s, pos, existing)
    })

    // Сохранённые строки уволенных сотрудников: раньше пересохранение периода
    // их молча удаляло — теперь показываем и сохраняем вместе с остальными
    const orphanRows = details
      .filter(d => !staffData.some(s => s.id === d.staff_id))
      .map(d => {
        const nameKey = (d.staff_name || '').trim().toLowerCase()
        return {
          ...d,
          department: 'Уволенные',
          advances_from_reports: advancesByName[nameKey]?.total || 0,
          advances_details: advancesByName[nameKey]?.details || [],
        }
      })

    setRows([...staffRows, ...orphanRows])
    setAdvancesByName(advancesByName)
  }

  const makeRow = (s, pos, dailyRate, salesPct) => ({
    staff_id: s.id,
    staff_name: s.full_name,
    position_name: pos?.name || '—',
    department: s.department,
    days_worked: 0,
    daily_rate: dailyRate,
    daily_total: 0,
    sales_amount: 0,
    sales_pct: salesPct,
    sales_bonus: 0,
    advances: 0,
    deductions: 0,
    total_earned: 0,
    total_payout: 0,
    notes: '',
  })

  // Смены и штрафы из табеля (TASK-038): подставляются, расчёт пересчитывается,
  // ручная правка остаётся возможной — как с выручкой из iiko
  const [tsStatus, setTsStatus] = useState('')
  const fillFromTimesheet = async () => {
    setTsStatus('Читаю табель...')
    const { shifts, fine } = await timesheetTotals({ year, month, period })
    let touched = 0
    setRows(prev => prev.map(r => {
      if (!r.staff_id || (shifts[r.staff_id] === undefined && fine[r.staff_id] === undefined)) return r
      touched += 1
      const u = { ...r, days_worked: shifts[r.staff_id] ?? r.days_worked, deductions: fine[r.staff_id] ?? r.deductions }
      u.daily_total = u.days_worked * u.daily_rate
      u.sales_bonus = Math.round(u.sales_amount * u.sales_pct / 100)
      u.total_earned = u.daily_total + u.sales_bonus
      u.total_payout = u.total_earned - u.advances - u.deductions
      return u
    }))
    setTsStatus(touched ? `✅ Из табеля: ${touched} чел.` : 'В табеле за этот период пусто')
  }

  const updateRow = (idx, field, value) => {
    setRows(prev => prev.map((r, i) => {
      if (i !== idx) return r
      const updated = { ...r, [field]: Number(value) || 0 }
      // Recalculate
      updated.daily_total = updated.days_worked * updated.daily_rate
      updated.sales_bonus = Math.round(updated.sales_amount * updated.sales_pct / 100)
      updated.total_earned = updated.daily_total + updated.sales_bonus
      updated.total_payout = updated.total_earned - updated.advances - updated.deductions
      return updated
    }))
  }

  const handleSave = async () => {
    if (periodStatus === 'paid' && !confirm('Период уже отмечен как выплаченный. Перезаписать расчёт?')) return
    setSaving(true)
    try {
      // Период создаётся при первом сохранении (а не при каждом просмотре)
      let pid = periodId
      if (!pid) {
        const { data: newPer, error: perErr } = await supabase
          .from('payroll_periods')
          .insert({ year, month, period })
          .select()
          .single()
        if (perErr) throw perErr
        pid = newPer.id
        setPeriodId(pid)
      }
      // Delete existing details for this period
      // (rows включают и уволенных — их строки пересоздаются, а не теряются)
      await supabase.from('payroll_details').delete().eq('period_id', pid)
      // Insert new
      const details = rows.map(r => ({
        period_id: pid,
        staff_id: r.staff_id,
        staff_name: r.staff_name,
        position_name: r.position_name,
        days_worked: r.days_worked,
        daily_rate: r.daily_rate,
        daily_total: r.daily_total,
        sales_amount: r.sales_amount,
        sales_pct: r.sales_pct,
        sales_bonus: r.sales_bonus,
        advances: r.advances,
        deductions: r.deductions,
        total_earned: r.total_earned,
        total_payout: r.total_payout,
        notes: r.notes || null,
        manual_advances: !!(r._manual_advances || r.manual_advances),
      }))
      const { error } = await supabase.from('payroll_details').insert(details)
      if (error) throw error
      alert('✅ Расчёт сохранён')
    } catch (e) { alert('Ошибка: ' + e.message) }
    setSaving(false)
  }

  const markPaid = async () => {
    if (!periodId) return alert('Сначала сохраните расчёт')
    if (!confirm('Отметить период как выплаченный?')) return
    await supabase.from('payroll_periods').update({ status: 'paid', paid_date: formatLocalDate() }).eq('id', periodId)
    setPeriodStatus('paid')
  }

  // Summary
  const totalEarned = rows.reduce((s, r) => s + r.total_earned, 0)
  const totalAdvances = rows.reduce((s, r) => s + r.advances, 0)
  const totalPayout = rows.reduce((s, r) => s + r.total_payout, 0)
  const totalDailyPart = rows.reduce((s, r) => s + r.daily_total, 0)
  const totalSalesBonus = rows.reduce((s, r) => s + r.sales_bonus, 0)

  const periodLabel = period === 1 ? '1–15' : `16–${new Date(year, month, 0).getDate()}`
  const payDate = period === 1 ? `16-17 ${MONTHS_RU[month - 1]?.toLowerCase()}` : `1-2 ${MONTHS_RU[month % 12]?.toLowerCase() || 'янв'}`

  // Group by department
  const departments = [...new Set(rows.map(r => r.department))]

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Калькулятор зарплаты</h1>
          <p className="text-sm text-slate-500 mt-0.5">Расчёт выплат сотрудникам</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input text-sm">
            {MONTHS_RU.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input text-sm">
            {yearsRange(2025).map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <div className="flex bg-slate-900 rounded-lg p-0.5">
            <button onClick={() => setPeriod(1)} className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all', period === 1 ? 'bg-slate-700 text-white' : 'text-slate-500')}>1–15</button>
            <button onClick={() => setPeriod(2)} className={cn('px-3 py-1.5 rounded-md text-xs font-medium transition-all', period === 2 ? 'bg-slate-700 text-white' : 'text-slate-500')}>16–конец</button>
          </div>
          {canManage && periodStatus !== 'paid' && (
            <button onClick={fillFromTimesheet} className="btn-secondary text-sm flex items-center gap-2" title="Смены и штрафы за период из табеля; поля остаются редактируемыми">
              <Calendar className="w-4 h-4" /> Из табеля
            </button>
          )}
          {tsStatus && <span className="text-xs text-slate-400">{tsStatus}</span>}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <div className="card-hover text-center">
          <div className="stat-label">Период</div>
          <div className="stat-value text-lg">{periodLabel} {MONTHS_RU[month - 1]?.slice(0, 3)}</div>
          <div className="text-[10px] text-slate-500 mt-1">Выплата: {payDate}</div>
        </div>
        <div className="card-hover text-center">
          <div className="stat-label">Ставки</div>
          <div className="stat-value text-lg text-blue-400">{money(totalDailyPart)}</div>
        </div>
        <div className="card-hover text-center">
          <div className="stat-label">% от продаж</div>
          <div className="stat-value text-lg text-purple-400">{money(totalSalesBonus)}</div>
        </div>
        <div className="card-hover text-center">
          <div className="stat-label">Авансы</div>
          <div className="stat-value text-lg text-yellow-400">−{money(totalAdvances)}</div>
        </div>
        <div className="card-hover text-center bg-brand-500/5 border-brand-500/20">
          <div className="stat-label">К выплате</div>
          <div className="stat-value text-lg text-brand-400">{money(totalPayout)}</div>
        </div>
      </div>

      {/* Status */}
      {periodStatus === 'paid' && (
        <div className="card border-green-500/20 bg-green-500/5 flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-green-400" />
          <span className="text-sm text-green-400 font-medium">Период выплачен</span>
        </div>
      )}

      {/* Table by department */}
      {departments.map(dept => {
        const deptRows = rows.filter(r => r.department === dept).map((r, i) => ({ ...r, _idx: rows.indexOf(r) }))
        if (deptRows.length === 0) return null
        return (
          <div key={dept} className="card overflow-x-auto p-0">
            <div className="px-4 py-3 bg-slate-900/50 border-b border-slate-800">
              <span className="text-sm font-bold text-slate-300">{dept}</span>
              <span className="text-xs text-slate-500 ml-2">({deptRows.length} чел.)</span>
            </div>
            <table className="w-full text-sm min-w-[900px]">
              <thead><tr>
                <th className="table-header text-left w-40">Сотрудник</th>
                <th className="table-header text-left w-24">Должность</th>
                <th className="table-header text-center w-16">Дни</th>
                <th className="table-header text-right w-24">Ставка</th>
                <th className="table-header text-right w-24">По ставке</th>
                <th className="table-header text-right w-28">Продажи</th>
                <th className="table-header text-center w-12">%</th>
                <th className="table-header text-right w-24">Бонус</th>
                <th className="table-header text-right w-24">Аванс</th>
                <th className="table-header text-right w-24 font-bold">К выплате</th>
              </tr></thead>
              <tbody>
                {deptRows.map(r => (
                  <tr key={r.staff_id} className="hover:bg-slate-800/30">
                    <td className="table-cell font-medium text-xs">{r.staff_name}</td>
                    <td className="table-cell text-xs text-slate-500">{r.position_name}</td>
                    <td className="table-cell text-center">
                      <input type="number" value={r.days_worked || ''} onChange={e => updateRow(r._idx, 'days_worked', e.target.value)}
                        className="input text-xs text-center w-14 py-1 px-1" min="0" max="15" />
                    </td>
                    <td className="table-cell text-right font-mono text-xs text-slate-400">{fmt(r.daily_rate)}</td>
                    <td className="table-cell text-right font-mono text-xs">{fmt(r.daily_total)}</td>
                    <td className="table-cell text-right">
                      <input type="text" inputMode="numeric" value={r.sales_amount || ''} onChange={e => updateRow(r._idx, 'sales_amount', e.target.value.replace(/[^0-9]/g, ''))}
                        className="input text-xs text-right w-24 py-1 px-1 font-mono" placeholder="0" />
                    </td>
                    <td className="table-cell text-center text-xs text-slate-500">{r.sales_pct}%</td>
                    <td className="table-cell text-right font-mono text-xs text-purple-400">{fmt(r.sales_bonus)}</td>
                    <td className="table-cell text-right">
                      <div className="relative group">
                        <input type="text" inputMode="numeric" value={r.advances || ''} onChange={e => {
                          const row = { ...rows[r._idx], advances: Number(e.target.value.replace(/[^0-9]/g, '')) || 0, manual_advances: true }
                          row.total_payout = row.total_earned - row.advances - row.deductions
                          setRows(prev => prev.map((rr, i) => i === r._idx ? row : rr))
                        }}
                          className={cn('input text-xs text-right w-20 py-1 px-1 font-mono', r.advances_from_reports > 0 && '!border-yellow-500/40')} placeholder="0" />
                        {r.advances_details?.length > 0 && (
                          <div className="hidden group-hover:block absolute right-0 bottom-full mb-1 z-30 bg-slate-800 border border-slate-700 rounded-lg p-2 shadow-xl min-w-[200px]">
                            <div className="text-[10px] font-semibold text-yellow-400 mb-1">Авансы из отчётов:</div>
                            {r.advances_details.map((d, i) => (
                              <div key={i} className="text-[10px] text-slate-400 flex justify-between gap-3">
                                <span>{d.date}{d.comment ? ` — ${d.comment}` : ''}</span>
                                <span className="font-mono">{money(d.amount)}</span>
                              </div>
                            ))}
                            <div className="text-[10px] font-semibold text-yellow-300 mt-1 pt-1 border-t border-slate-700 flex justify-between">
                              <span>Итого</span><span className="font-mono">{money(r.advances_from_reports)}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className={cn('table-cell text-right font-mono text-xs font-bold', r.total_payout < 0 ? 'text-red-400' : 'text-brand-400')}>
                      {money(r.total_payout)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}

      {rows.length === 0 && (
        <div className="card text-center py-16">
          <Users className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <div className="text-lg font-semibold text-slate-400">Нет сотрудников</div>
          <div className="text-sm text-slate-600 mt-1">Добавьте сотрудников на странице «Персонал»</div>
        </div>
      )}

      {/* Actions */}
      {rows.length > 0 && (
        <div className="flex flex-col sm:flex-row gap-3">
          <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center justify-center gap-2 flex-1">
            <Save className="w-4 h-4" />{saving ? 'Сохранение...' : 'Сохранить расчёт'}
          </button>
          {periodStatus !== 'paid' && canManage && (
            <button onClick={markPaid} className="btn-secondary flex items-center justify-center gap-2">
              <CheckCircle2 className="w-4 h-4" /> Отметить как выплачено
            </button>
          )}
        </div>
      )}

      {/* Info */}
      <div className="card border-blue-500/20 bg-blue-500/5">
        <div className="text-sm font-semibold text-blue-300 mb-2">📋 Как работает расчёт</div>
        <div className="text-xs text-slate-400 space-y-1">
          <p><b className="text-slate-300">Период 1 (1–15):</b> выплата 16–17 числа текущего месяца</p>
          <p><b className="text-slate-300">Период 2 (16–конец):</b> выплата 1–2 числа следующего месяца</p>
          <p><b className="text-slate-300">К выплате</b> = (Дни × Ставка) + (Продажи × %) − Авансы − Удержания</p>
          <p><b className="text-yellow-400">Авансы</b> подтягиваются автоматически из ежедневных отчётов (секция «ЗП и авансы»). Наведите на поле аванса чтобы увидеть детали. Можно скорректировать вручную.</p>
          <p>Данные продаж вносите из iiko вручную. Ставки и % берутся из справочника «Должности».</p>
        </div>
      </div>
    </div>
  )
}
