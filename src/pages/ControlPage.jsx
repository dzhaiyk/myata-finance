import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt, MONTHS_RU } from '@/lib/utils'
import { yearsRange } from '@/lib/dates'
import {
  checkRevenueConsistency, checkCashDiscrepancies, checkAcquiring, checkAccountBalance,
  checkPayroll, findMissingShifts, checkStatementFreshness, countOpenIssues, reportTotals, num,
} from '@/lib/reconcile'
import { ShieldCheck, AlertTriangle, CheckCircle2, XCircle, MinusCircle, CalendarX, Upload } from 'lucide-react'

const CURRENT_YEAR = new Date().getFullYear()
const CURRENT_MONTH = new Date().getMonth() + 1

const PAYROLL_CATS = ['payroll_mgmt', 'payroll_kitchen', 'payroll_bar', 'payroll_hookah', 'payroll_hall', 'payroll_transport', 'payroll_other']

// Карточка одной сверки: зелёный / красный / серый (нет данных)
const Check = ({ title, subtitle, state, value, detail }) => {
  const Icon = state === 'ok' ? CheckCircle2 : state === 'fail' ? XCircle : MinusCircle
  const tone = state === 'ok' ? 'text-green-400 border-green-500/25 bg-green-500/5'
    : state === 'fail' ? 'text-red-400 border-red-500/25 bg-red-500/5'
    : 'text-slate-500 border-slate-700/50 bg-slate-800/20'
  return (
    <div className={cn('card border', tone)}>
      <div className="flex items-start gap-3">
        <Icon className="w-5 h-5 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-slate-200">{title}</div>
          <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
          {value && <div className={cn('text-lg font-mono font-bold mt-2', tone.split(' ')[0])}>{value}</div>}
          {detail && <div className="text-xs text-slate-400 mt-1">{detail}</div>}
        </div>
      </div>
    </div>
  )
}

export default function ControlPage() {
  const { hasPermission } = useAuthStore()
  const [year, setYear] = useState(CURRENT_YEAR)
  const [month, setMonth] = useState(CURRENT_MONTH)
  const [reports, setReports] = useState([])
  const [bankTx, setBankTx] = useState([])
  const [accounts, setAccounts] = useState([])
  const [acctTx, setAcctTx] = useState([])
  const [balances, setBalances] = useState([])
  const [payrollDetails, setPayrollDetails] = useState([])
  const [loading, setLoading] = useState(true)

  const startDate = `${year}-${String(month).padStart(2, '0')}-01`
  const endDate = `${year}-${String(month).padStart(2, '0')}-${new Date(year, month, 0).getDate()}`

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const [repRes, btRes, accRes, atRes, balRes, ppRes] = await Promise.all([
        supabase.from('daily_reports').select('*').gte('report_date', startDate).lte('report_date', endDate).order('report_date'),
        supabase.from('bank_transactions').select('*').gte('transaction_date', startDate).lte('transaction_date', endDate),
        supabase.from('accounts').select('*').eq('is_active', true).order('sort_order, id'),
        supabase.from('account_transactions').select('account_id, transaction_date, type, amount'),
        supabase.from('account_balances').select('*').gte('balance_date', startDate).lte('balance_date', endDate),
        supabase.from('payroll_periods').select('id, year, month, payroll_details(total_earned)').eq('year', year).eq('month', month),
      ])
      setReports(repRes.data || [])
      setBankTx(btRes.data || [])
      setAccounts(accRes.data || [])
      setAcctTx(atRes.data || [])
      setBalances(balRes.data || [])
      setPayrollDetails((ppRes.data || []).flatMap(p => p.payroll_details || []))
      setLoading(false)
    }
    load()
  }, [year, month])

  const submitted = useMemo(() => reports.filter(r => r.status === 'submitted'), [reports])

  const checks = useMemo(() => {
    const open = countOpenIssues(reports, bankTx)
    const missing = findMissingShifts(reports, startDate, endDate)
    const freshness = checkStatementFreshness(bankTx)
    const revenue = checkRevenueConsistency(submitted)
    const cashDisc = checkCashDiscrepancies(submitted)
    const acquiring = checkAcquiring(submitted, bankTx)

    // ФОТ: нал авансы из отчётов + безнал по банку
    const cashAdvances = submitted.reduce(
      (s, r) => s + (r.data?.withdrawals?.payroll || []).reduce((x, row) => x + num(row.amount), 0), 0)
    const bankPayroll = bankTx
      .filter(t => t.is_debit && PAYROLL_CATS.includes(t.category))
      .reduce((s, t) => s + num(t.amount), 0)
    const payroll = checkPayroll(payrollDetails, cashAdvances, bankPayroll)

    // Остатки счетов: расчёт ↔ последняя сверка месяца
    const accountChecks = accounts.filter(a => !a.parent_account_id).map(a => {
      const childIds = accounts.filter(c => c.parent_account_id === a.id).map(c => c.id)
      const ids = [a.id, ...childIds]
      const expected = ids.reduce((sum, id) => {
        const acct = accounts.find(x => x.id === id)
        const initial = num(acct?.initial_balance)
        const moved = acctTx.filter(t => t.account_id === id && t.transaction_date <= endDate)
          .reduce((s, t) => s + (t.type === 'income' || t.type === 'transfer_in' ? num(t.amount) : -num(t.amount)), 0)
        return sum + initial + moved
      }, 0)
      const last = balances.filter(b => b.account_id === a.id)
        .sort((x, y) => y.balance_date.localeCompare(x.balance_date))[0]
      return { account: a, expected, actual: last?.actual_balance ?? null,
        date: last?.balance_date, ...checkAccountBalance(expected, last?.actual_balance ?? null) }
    })

    return { open, missing, freshness, revenue, cashDisc, acquiring, payroll, accountChecks }
  }, [reports, submitted, bankTx, accounts, acctTx, balances, payrollDetails, startDate, endDate])

  if (!hasPermission('dashboard.view')) {
    return <div className="text-center text-slate-500 py-20">Нет доступа</div>
  }
  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка сверок...</div>

  const { open, missing, freshness, revenue, cashDisc, acquiring, payroll, accountChecks } = checks
  const blockers = [
    missing.length > 0, open.drafts > 0, open.uncategorized > 0, !freshness.ok,
    revenue.length > 0, cashDisc.length > 0,
    acquiring.hasData && !acquiring.ok,
    !payroll.ok,
    accountChecks.some(a => a.ok === false),
  ].filter(Boolean).length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Контроль</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Сверка денежных потоков · {MONTHS_RU[month - 1]} {year}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={month} onChange={e => setMonth(Number(e.target.value))} className="input text-sm">
            {MONTHS_RU.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
          </select>
          <select value={year} onChange={e => setYear(Number(e.target.value))} className="input text-sm">
            {yearsRange().map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* Итоговый вердикт по месяцу */}
      <div className={cn('card border flex items-center gap-4',
        blockers === 0 ? 'border-green-500/30 bg-green-500/5' : 'border-red-500/30 bg-red-500/5')}>
        <ShieldCheck className={cn('w-10 h-10 shrink-0', blockers === 0 ? 'text-green-400' : 'text-red-400')} />
        <div>
          <div className={cn('text-lg font-display font-bold', blockers === 0 ? 'text-green-400' : 'text-red-400')}>
            {blockers === 0 ? 'Контур замкнут — месяц можно закрывать' : `Разрывов контроля: ${blockers}`}
          </div>
          <div className="text-xs text-slate-400 mt-0.5">
            {blockers === 0
              ? 'Все сверки сошлись: смены сданы, выписка полная, деньги отслежены'
              : 'Пока разрывы не устранены, цифры месяца нельзя считать достоверными'}
          </div>
        </div>
      </div>

      {/* Полнота данных */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Полнота данных</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Check title="Смены сданы" subtitle="Отчёт за каждый день месяца"
            state={missing.length === 0 ? 'ok' : 'fail'}
            value={missing.length === 0 ? `${submitted.length} смен` : `${missing.length} пропущено`}
            detail={missing.length > 0 ? missing.slice(0, 5).join(', ') + (missing.length > 5 ? '…' : '') : null} />
          <Check title="Черновики закрыты" subtitle="Отчёты со статусом «черновик»"
            state={open.drafts === 0 ? 'ok' : 'fail'}
            value={open.drafts === 0 ? 'нет' : `${open.drafts} шт.`} />
          <Check title="Выписка свежая" subtitle="Дней с последней банковской операции"
            state={freshness.never ? 'none' : freshness.ok ? 'ok' : 'fail'}
            value={freshness.never ? 'нет данных' : `${freshness.daysAgo} дн.`}
            detail={freshness.lastDate ? `последняя: ${freshness.lastDate}` : 'загрузите выписку'} />
          <Check title="Транзакции разнесены" subtitle="Нераспознанные строки выписки"
            state={open.uncategorized === 0 ? 'ok' : 'fail'}
            value={open.uncategorized === 0 ? 'все' : `${open.uncategorized} шт.`} />
        </div>
      </div>

      {/* Сверки денег */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Сверки денежных потоков</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Check title="Выручка сходится" subtitle="Отделы ↔ типы оплат"
            state={revenue.length === 0 ? 'ok' : 'fail'}
            value={revenue.length === 0 ? 'сходится' : `${revenue.length} смен`}
            detail={revenue.length > 0 ? `худшая: ${revenue[0].date}, ${fmt(revenue[0].delta)} ₸` : null} />
          <Check title="Касса" subtitle="Ожидаемый ↔ фактический остаток"
            state={cashDisc.length === 0 ? 'ok' : 'fail'}
            value={cashDisc.length === 0 ? 'без расхождений' : `${cashDisc.length} смен`}
            detail={cashDisc.length > 0 ? `худшая: ${cashDisc[0].date}, ${fmt(cashDisc[0].discrepancy)} ₸` : null} />
          <Check title="Эквайринг" subtitle="Терминалы ↔ зачисления банка"
            state={!acquiring.hasData ? 'none' : acquiring.ok ? 'ok' : 'fail'}
            value={!acquiring.hasData ? 'нет данных' : `${acquiring.deltaPct > 0 ? '+' : ''}${acquiring.deltaPct}%`}
            detail={acquiring.hasData
              ? `терминалы ${fmt(acquiring.terminalsTotal)} → зачислено ${fmt(acquiring.settled)} ₸`
              : 'нужны терминалы в отчётах и выписка'} />
          <Check title="ФОТ" subtitle="Начислено ↔ выплачено"
            state={payrollDetails.length === 0 ? 'none' : payroll.ok ? 'ok' : 'fail'}
            value={payrollDetails.length === 0 ? 'нет расчёта' : `${fmt(payroll.delta)} ₸`}
            detail={payrollDetails.length > 0
              ? `начислено ${fmt(payroll.accrued)} → выплачено ${fmt(payroll.paid)} ₸` : null} />
        </div>
      </div>

      {/* Остатки счетов */}
      <div>
        <h2 className="text-sm font-semibold text-slate-400 mb-3">Остатки счетов на конец месяца</h2>
        <div className="card p-0 overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead><tr>
              <th className="table-header text-left">Счёт</th>
              <th className="table-header text-right">Расчётный</th>
              <th className="table-header text-right">Сверен (факт)</th>
              <th className="table-header text-right">Расхождение</th>
              <th className="table-header text-center">Статус</th>
            </tr></thead>
            <tbody>
              {accountChecks.map(a => (
                <tr key={a.account.id} className="hover:bg-slate-800/30">
                  <td className="table-cell">{a.account.icon} {a.account.name}</td>
                  <td className="table-cell text-right font-mono text-xs">{fmt(a.expected)} ₸</td>
                  <td className="table-cell text-right font-mono text-xs">
                    {a.actual != null ? `${fmt(a.actual)} ₸` : '—'}
                    {a.date && <span className="text-slate-600 ml-1">({a.date})</span>}
                  </td>
                  <td className={cn('table-cell text-right font-mono text-xs font-bold',
                    a.ok === null ? 'text-slate-600' : a.ok ? 'text-green-400' : 'text-red-400')}>
                    {a.delta != null ? `${a.delta > 0 ? '+' : ''}${fmt(a.delta)} ₸` : '—'}
                  </td>
                  <td className="table-cell text-center">
                    {a.ok === null ? <span className="badge text-[10px] bg-slate-700/40 text-slate-500">не сверен</span>
                      : a.ok ? <span className="badge badge-green text-[10px]">сходится</span>
                      : <span className="badge badge-red text-[10px]">расхождение</span>}
                  </td>
                </tr>
              ))}
              {accountChecks.length === 0 && (
                <tr><td colSpan={5} className="table-cell text-center text-slate-500 py-6">Нет активных счетов</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Детализация разрывов */}
      {(missing.length > 0 || revenue.length > 0 || cashDisc.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {missing.length > 0 && (
            <div className="card border-red-500/20 bg-red-500/5">
              <div className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                <CalendarX className="w-3.5 h-3.5" /> Пропущенные смены ({missing.length})
              </div>
              <div className="text-xs text-slate-400 space-y-0.5 max-h-40 overflow-y-auto">
                {missing.map(d => <div key={d}>{d}</div>)}
              </div>
            </div>
          )}
          {revenue.length > 0 && (
            <div className="card border-red-500/20 bg-red-500/5">
              <div className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Выручка не сходится ({revenue.length})
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {revenue.map(r => (
                  <div key={r.date} className="flex justify-between text-xs">
                    <span className="text-slate-400">{r.date} — {r.manager}</span>
                    <span className="font-mono text-red-400">{fmt(r.delta)} ₸</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {cashDisc.length > 0 && (
            <div className="card border-red-500/20 bg-red-500/5">
              <div className="text-xs font-semibold text-red-400 mb-2 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5" /> Расхождения кассы ({cashDisc.length})
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {cashDisc.map(r => (
                  <div key={r.date} className="flex justify-between text-xs">
                    <span className="text-slate-400">{r.date} — {r.manager}</span>
                    <span className="font-mono text-red-400">{fmt(r.discrepancy)} ₸</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card border-blue-500/20 bg-blue-500/5">
        <div className="text-sm font-semibold text-blue-300 mb-2 flex items-center gap-2">
          <Upload className="w-4 h-4" /> Как замкнуть контур
        </div>
        <div className="text-xs text-slate-400 space-y-1">
          <p><b className="text-slate-300">Ежедневно:</b> менеджер сдаёт отчёт смены, бухгалтер загружает выписку за день.</p>
          <p><b className="text-slate-300">Эквайринг</b> сверяется накопительно за месяц: банк зачисляет с задержкой и минус комиссия (~1.5%). Отклонение больше 1% — повод разбираться.</p>
          <p><b className="text-slate-300">Остатки счетов</b> сверяйте на вкладке «Счета → Сверка»: расчётный остаток должен совпадать с банковским приложением.</p>
        </div>
      </div>
    </div>
  )
}
