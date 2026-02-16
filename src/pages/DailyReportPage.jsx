import { useState } from 'react'
import { fmt, cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { sendTelegramNotification, formatDailyReportNotification, formatCashDiscrepancyAlert } from '@/lib/telegram'
import { Save, Send, AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Plus, Trash2 } from 'lucide-react'

const INIT_SUPPLIERS = (prefix, count) => Array.from({ length: count }, (_, i) => ({ name: '', amount: 0, comment: '' }))

const SECTIONS = [
  { key: 'suppliers_kitchen', label: 'Поставщики КУХНЯ', color: 'green', icon: '🍽' },
  { key: 'suppliers_bar', label: 'Поставщики БАР', color: 'blue', icon: '🍸' },
  { key: 'tobacco', label: 'Табак и расходники кальян', color: 'amber', icon: '💨', fixed: ['Табак', 'Угли', 'Расходники кальян', 'Доставка'] },
  { key: 'payroll', label: 'ЗП и авансы персоналу', color: 'indigo', icon: '👥' },
  { key: 'other', label: 'Прочие расходы', color: 'rose', icon: '📦', fixed: ['Хозтовары', 'Мелкий ремонт', 'Доставка (Яндекс)', 'Канцтовары', 'Прочее'] },
]

const PAYMENT_TYPES = ['Наличные', 'Kaspi', 'Halyk', 'Wolt', 'Glovo', 'Yandex Eda', 'Прочее']
const DEPARTMENTS = ['Кухня', 'Бар', 'Кальян', 'Прочее']

export default function DailyReportPage() {
  const { profile } = useAuthStore()
  const [date, setDate] = useState(new Date().toISOString().split('T')[0])
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [expanded, setExpanded] = useState({ suppliers_kitchen: true, suppliers_bar: true, tobacco: true, payroll: true, other: true })

  // Cash section
  const [cashStart, setCashStart] = useState(0)
  const [cashDeposit, setCashDeposit] = useState(0)
  const [cashActual, setCashActual] = useState(0)
  const [inkassation, setInkassation] = useState(0)

  // Withdrawal sections
  const [withdrawals, setWithdrawals] = useState({
    suppliers_kitchen: INIT_SUPPLIERS('kitchen', 5),
    suppliers_bar: INIT_SUPPLIERS('bar', 5),
    tobacco: [{ name: 'Табак', amount: 0 }, { name: 'Угли', amount: 0 }, { name: 'Расходники кальян', amount: 0 }, { name: 'Доставка', amount: 0 }],
    payroll: INIT_SUPPLIERS('payroll', 5),
    other: [{ name: 'Хозтовары', amount: 0 }, { name: 'Мелкий ремонт', amount: 0 }, { name: 'Доставка (Яндекс)', amount: 0 }, { name: 'Канцтовары', amount: 0 }, { name: 'Прочее', amount: 0 }],
  })

  // Revenue
  const [revenue, setRevenue] = useState(PAYMENT_TYPES.map(t => ({ type: t, amount: 0, checks: 0 })))
  const [departments, setDepartments] = useState(DEPARTMENTS.map(d => ({ name: d, amount: 0 })))

  // Calculations
  const sectionTotal = (key) => withdrawals[key].reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const totalWithdrawals = SECTIONS.reduce((s, sec) => s + sectionTotal(sec.key), 0)
  const totalRevenue = revenue.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const totalDeptRevenue = departments.reduce((s, d) => s + (Number(d.amount) || 0), 0)
  const cashSales = Number(revenue[0]?.amount) || 0
  const cashExpected = (Number(cashStart) || 0) + (Number(cashDeposit) || 0) + cashSales - totalWithdrawals - (Number(inkassation) || 0)
  const discrepancy = (Number(cashActual) || 0) - cashExpected

  const updateWithdrawal = (section, idx, field, value) => {
    setWithdrawals(prev => ({
      ...prev,
      [section]: prev[section].map((r, i) => i === idx ? { ...r, [field]: field === 'amount' ? Number(value) || 0 : value } : r)
    }))
  }

  const addRow = (section) => {
    setWithdrawals(prev => ({
      ...prev,
      [section]: [...prev[section], { name: '', amount: 0, comment: '' }]
    }))
  }

  const removeRow = (section, idx) => {
    setWithdrawals(prev => ({
      ...prev,
      [section]: prev[section].filter((_, i) => i !== idx)
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    const reportData = {
      date, manager: profile?.full_name || 'Unknown',
      cash_start: cashStart, cash_deposit: cashDeposit, cash_actual: cashActual, inkassation,
      withdrawals, revenue, departments,
      total_revenue: totalRevenue, total_withdrawals: totalWithdrawals,
      cash_expected: cashExpected, discrepancy,
    }

    try {
      const { error } = await supabase.from('daily_reports').upsert({
        report_date: date,
        manager_id: profile?.id,
        manager_name: profile?.full_name,
        data: reportData,
        total_revenue: totalRevenue,
        total_withdrawals: totalWithdrawals,
        cash_discrepancy: discrepancy,
      }, { onConflict: 'report_date' })

      if (error) throw error

      // Send Telegram notification
      await sendTelegramNotification(formatDailyReportNotification({
        date, manager: profile?.full_name,
        revenue: totalRevenue, withdrawals: totalWithdrawals,
        cashExpected, cashActual: Number(cashActual),
        discrepancy,
        departments: {
          kitchen: departments[0]?.amount || 0,
          bar: departments[1]?.amount || 0,
          hookah: departments[2]?.amount || 0,
        }
      }))

      // Alert if discrepancy
      if (Math.abs(discrepancy) > 1000) {
        await sendTelegramNotification(formatCashDiscrepancyAlert(date, profile?.full_name, discrepancy))
      }

      setSaved(true)
      setTimeout(() => setSaved(false), 3000)
    } catch (e) {
      console.error(e)
      alert('Ошибка сохранения: ' + e.message)
    }
    setSaving(false)
  }

  const generateWhatsAppText = () => {
    let text = `🍃 *Мята — Отчёт за ${date}*\n👤 ${profile?.full_name}\n\n`
    text += `💰 *Выручка: ${fmt(totalRevenue)} ₸*\n`
    departments.forEach(d => { if (d.amount) text += `  ${d.name}: ${fmt(d.amount)} ₸\n` })
    text += `\n📤 Изъятия: ${fmt(totalWithdrawals)} ₸\n`
    text += `💵 Остаток (ожид.): ${fmt(cashExpected)} ₸\n`
    text += `💵 Остаток (факт): ${fmt(cashActual)} ₸\n`
    if (discrepancy !== 0) text += `⚠️ *Расхождение: ${fmt(discrepancy)} ₸*`
    else text += `✅ Расхождений нет`
    return text
  }

  const shareWhatsApp = () => {
    const text = encodeURIComponent(generateWhatsAppText())
    window.open(`https://wa.me/?text=${text}`, '_blank')
  }

  const NumInput = ({ value, onChange, className = '' }) => (
    <input
      type="number"
      value={value || ''}
      onChange={e => onChange(Number(e.target.value) || 0)}
      className={cn('input text-right font-mono text-sm tabular-nums w-full', className)}
      placeholder="0"
    />
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Отчёт дня</h1>
          <p className="text-sm text-slate-500 mt-0.5">Менеджер: {profile?.full_name || '—'}</p>
        </div>
        <div className="flex items-center gap-3">
          <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input text-sm" />
        </div>
      </div>

      {/* Section 1: КАССА */}
      <div className="card">
        <h2 className="text-base font-display font-bold text-brand-400 mb-4">💵 Касса</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Остаток на начало смены</label>
            <NumInput value={cashStart} onChange={setCashStart} />
          </div>
          <div>
            <label className="label">Внесение вчерашней выручки</label>
            <NumInput value={cashDeposit} onChange={setCashDeposit} />
          </div>
        </div>
      </div>

      {/* Withdrawal Sections */}
      {SECTIONS.map(sec => {
        const isOpen = expanded[sec.key]
        const total = sectionTotal(sec.key)
        const colorMap = { green: 'border-green-500/20 bg-green-500/5', blue: 'border-blue-500/20 bg-blue-500/5', amber: 'border-amber-500/20 bg-amber-500/5', indigo: 'border-indigo-500/20 bg-indigo-500/5', rose: 'border-rose-500/20 bg-rose-500/5' }
        const isFixed = !!sec.fixed

        return (
          <div key={sec.key} className={cn('card border', colorMap[sec.color])}>
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [sec.key]: !prev[sec.key] }))}
              className="flex items-center justify-between w-full text-left"
            >
              <div className="flex items-center gap-2">
                <span>{sec.icon}</span>
                <h2 className="text-sm font-display font-bold">{sec.label}</h2>
                {total > 0 && <span className="badge-yellow">{fmt(total)} ₸</span>}
              </div>
              {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
            </button>

            {isOpen && (
              <div className="mt-4 space-y-2">
                {/* Headers */}
                <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-500 uppercase px-1">
                  <div className="col-span-5">Наименование / ФИО</div>
                  <div className="col-span-3 text-right">Сумма (₸)</div>
                  <div className="col-span-3">Комментарий</div>
                  <div className="col-span-1" />
                </div>

                {withdrawals[sec.key].map((row, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-5">
                      {isFixed ? (
                        <div className="text-sm text-slate-300 px-3 py-2">{row.name}</div>
                      ) : (
                        <input
                          value={row.name}
                          onChange={e => updateWithdrawal(sec.key, idx, 'name', e.target.value)}
                          className="input text-sm w-full"
                          placeholder={sec.key.includes('supplier') ? 'Название поставщика' : 'ФИО сотрудника'}
                        />
                      )}
                    </div>
                    <div className="col-span-3">
                      <NumInput value={row.amount} onChange={v => updateWithdrawal(sec.key, idx, 'amount', v)} />
                    </div>
                    <div className="col-span-3">
                      <input
                        value={row.comment || ''}
                        onChange={e => updateWithdrawal(sec.key, idx, 'comment', e.target.value)}
                        className="input text-sm w-full"
                        placeholder="—"
                      />
                    </div>
                    <div className="col-span-1 flex justify-center">
                      {!isFixed && (
                        <button onClick={() => removeRow(sec.key, idx)} className="p-1 text-slate-600 hover:text-red-400">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}

                {!isFixed && (
                  <button onClick={() => addRow(sec.key)} className="flex items-center gap-1.5 text-xs text-brand-400 hover:text-brand-300 mt-2 px-1">
                    <Plus className="w-3.5 h-3.5" /> Добавить строку
                  </button>
                )}

                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <span className="text-sm font-semibold font-mono">{fmt(total)} ₸</span>
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Total withdrawals + inkassation + actual cash */}
      <div className="card bg-red-500/5 border-red-500/20">
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-red-400">ИТОГО ИЗЪЯТИЙ</span>
          <span className="text-lg font-mono font-bold text-red-400">{fmt(totalWithdrawals)} ₸</span>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="label">Инкассация на счёт</label>
            <NumInput value={inkassation} onChange={setInkassation} />
          </div>
          <div>
            <label className="label">Остаток наличных на конец (ФАКТ) ⭐</label>
            <NumInput value={cashActual} onChange={setCashActual} className="!border-yellow-500/50 !bg-yellow-500/10" />
          </div>
        </div>
      </div>

      {/* Section 2: REVENUE */}
      <div className="card border-green-500/20 bg-green-500/5">
        <h2 className="text-base font-display font-bold text-green-400 mb-4">💰 Доходы (из iiko)</h2>
        <div className="space-y-2">
          <div className="grid grid-cols-12 gap-2 text-[11px] font-medium text-slate-500 uppercase px-1">
            <div className="col-span-4">Тип оплаты</div>
            <div className="col-span-4 text-right">Сумма (₸)</div>
            <div className="col-span-2 text-right">Чеков</div>
            <div className="col-span-2 text-right">Ср. чек</div>
          </div>
          {revenue.map((r, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 items-center">
              <div className="col-span-4 text-sm text-slate-300 px-1">{r.type}</div>
              <div className="col-span-4">
                <NumInput value={r.amount} onChange={v => setRevenue(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))} />
              </div>
              <div className="col-span-2">
                <NumInput value={r.checks} onChange={v => setRevenue(prev => prev.map((x, j) => j === i ? { ...x, checks: v } : x))} />
              </div>
              <div className="col-span-2 text-right text-sm font-mono text-slate-400">
                {r.checks > 0 ? fmt(r.amount / r.checks) : '—'}
              </div>
            </div>
          ))}
          <div className="flex items-center justify-between pt-3 border-t border-green-500/20">
            <span className="text-sm font-bold text-green-400">ИТОГО ВЫРУЧКА</span>
            <span className="text-lg font-mono font-bold text-green-400">{fmt(totalRevenue)} ₸</span>
          </div>
        </div>
      </div>

      {/* Section 3: DEPARTMENTS */}
      <div className="card border-amber-500/20 bg-amber-500/5">
        <h2 className="text-base font-display font-bold text-amber-400 mb-4">📊 Выручка по отделам</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {departments.map((d, i) => (
            <div key={i}>
              <label className="label">{d.name}</label>
              <NumInput value={d.amount} onChange={v => setDepartments(prev => prev.map((x, j) => j === i ? { ...x, amount: v } : x))} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between pt-3 mt-3 border-t border-amber-500/20">
          <span className="text-sm font-semibold">Итого</span>
          <div className="flex items-center gap-3">
            <span className="font-mono text-sm font-bold">{fmt(totalDeptRevenue)} ₸</span>
            {totalDeptRevenue !== totalRevenue && totalRevenue > 0 && (
              <span className="badge-red text-[10px]">≠ Выручке ({fmt(totalRevenue - totalDeptRevenue)})</span>
            )}
          </div>
        </div>
      </div>

      {/* Section 4: CASH VERIFICATION */}
      <div className={cn('card border-2', Math.abs(discrepancy) > 500 ? 'border-red-500/50 bg-red-500/10' : 'border-green-500/30 bg-green-500/5')}>
        <h2 className="text-base font-display font-bold mb-4 flex items-center gap-2">
          {Math.abs(discrepancy) > 500 ? <AlertTriangle className="w-5 h-5 text-red-400" /> : <CheckCircle2 className="w-5 h-5 text-green-400" />}
          Сверка кассы
        </h2>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between"><span className="text-slate-400">Остаток на начало</span><span className="font-mono">{fmt(cashStart)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">+ Внесение</span><span className="font-mono">{fmt(cashDeposit)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">+ Наличные продажи</span><span className="font-mono text-green-400">{fmt(cashSales)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">− Изъятия</span><span className="font-mono text-red-400">{fmt(totalWithdrawals)}</span></div>
          <div className="flex justify-between"><span className="text-slate-400">− Инкассация</span><span className="font-mono text-red-400">{fmt(inkassation)}</span></div>
          <div className="h-px bg-slate-700 my-2" />
          <div className="flex justify-between font-bold"><span>Ожидаемый остаток</span><span className="font-mono text-blue-400">{fmt(cashExpected)} ₸</span></div>
          <div className="flex justify-between font-bold"><span>Фактический остаток</span><span className="font-mono text-green-400">{fmt(cashActual)} ₸</span></div>
          <div className="h-px bg-slate-700 my-2" />
          <div className={cn('flex justify-between text-lg font-bold', Math.abs(discrepancy) > 500 ? 'text-red-400' : 'text-green-400')}>
            <span>РАСХОЖДЕНИЕ</span>
            <span className="font-mono">{discrepancy > 0 ? '+' : ''}{fmt(discrepancy)} ₸</span>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary flex items-center justify-center gap-2 flex-1">
          <Save className="w-4 h-4" />
          {saving ? 'Сохранение...' : saved ? '✅ Сохранено' : 'Сохранить отчёт'}
        </button>
        <button onClick={shareWhatsApp} className="btn-secondary flex items-center justify-center gap-2 flex-1">
          <Send className="w-4 h-4" />
          Отправить в WhatsApp
        </button>
      </div>
    </div>
  )
}
