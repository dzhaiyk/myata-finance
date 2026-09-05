import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { cn, fmt, money } from '@/lib/utils'
import { getCutoffHour } from '@/lib/dates'
import {
  loadLastStatementDates, stageStatement, commitImport, summarizeImport,
  statementFreshness, formatStatementUploadNotification, balanceReviewNote,
} from '@/lib/bankImport'
import { sendTelegramNotification } from '@/lib/telegram'
import { Landmark, Upload, CheckCircle2, AlertTriangle, X } from 'lucide-react'
import { locale } from '@/lib/config'

const shortDate = (iso) => (iso ? new Date(iso + 'T12:00:00').toLocaleDateString(locale(), { day: 'numeric', month: 'short' }) : '—')

// Ежедневная загрузка выписок из отчёта смены. Менеджер только загружает файл:
// категории ставит учредитель или бухгалтер на странице «Импорт выписки».
// Счета без единой операции (депозиты) не показываются — по ним выписки не нужны.
export default function StatementUploadCard({ accounts, date, managerName, onFreshness }) {
  const [lastDates, setLastDates] = useState(null)
  const [onDate, setOnDate] = useState({}) // { accountId: { n, debit, credit } } — операции за дату отчёта
  const [staged, setStaged] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const inputs = useRef({})

  const ids = accounts.map(a => a.id).join(',')
  useEffect(() => { if (accounts.length) refresh() }, [ids])

  const refresh = async () => {
    const [dates, perDate] = await Promise.all([loadLastStatementDates(supabase, accounts), loadOnDate()])
    setLastDates(dates); setOnDate(perDate)
  }
  // Что уже есть в базе за дату отчёта — чтобы после загрузки сразу было видно, что день закрыт
  const loadOnDate = async () => {
    if (!date) return {}
    const { data } = await supabase.from('bank_transactions').select('account_id, amount, is_debit').eq('transaction_date', date)
    const acc = {}
    for (const t of data || []) {
      const cur = acc[t.account_id] || (acc[t.account_id] = { n: 0, debit: 0, credit: 0 })
      cur.n++; cur[t.is_debit ? 'debit' : 'credit'] += Number(t.amount)
    }
    return acc
  }
  useEffect(() => { if (accounts.length && lastDates) loadOnDate().then(setOnDate) }, [date])

  const operating = accounts.filter(a => lastDates && lastDates[a.id])
  const rows = operating.map(a => ({ account: a, ...statementFreshness(lastDates[a.id]) }))

  useEffect(() => {
    if (lastDates) onFreshness?.(rows.map(r => ({ id: r.account.id, name: r.account.name, ok: r.ok, daysAgo: r.daysAgo, never: r.never })))
  }, [lastDates])

  const handleFile = async (account, e) => {
    const file = e.target.files[0]
    e.target.value = ''
    if (!file) return
    setBusyId(account.id); setNotice(null); setStaged(null)
    try {
      const data = await file.arrayBuffer()
      const res = await stageStatement(supabase, { name: file.name, data }, { accountId: account.id, cutoffHour: getCutoffHour() })
      if (res.rows.length === 0) {
        setNotice({ ok: true, text: `${file.name}: все ${res.parsedCount} операций уже загружены` })
      } else {
        setStaged({ account, ...res, summary: summarizeImport(res.rows) })
      }
    } catch (err) {
      setNotice({ ok: false, text: err.message })
    }
    setBusyId(null)
  }

  const confirmImport = async () => {
    if (!staged) return
    setSaving(true)
    try {
      const { inserted, skipped } = await commitImport(supabase, staged.rows, { reviewNote: balanceReviewNote(staged.balanceCheck, staged.fileName) })
      const s = summarizeImport(inserted)
      setNotice({ ok: true, text: `${staged.account.name}: сохранено ${inserted.length} операций` + (skipped ? `, пропущено ${skipped}` : '') + (s.uncategorized ? `, без категории ${s.uncategorized}` : '') })
      try {
        await sendTelegramNotification(formatStatementUploadNotification({
          accountName: staged.account.name, manager: managerName, from: s.from, to: s.to,
          total: inserted.length, duplicates: staged.duplicates, uncategorized: s.uncategorized,
          balanceOk: staged.balanceCheck ? staged.balanceCheck.ok : null,
        }), 'bank_import')
      } catch (_) {}
      setStaged(null)
      await refresh()
    } catch (err) {
      setNotice({ ok: false, text: err.message })
    }
    setSaving(false)
  }

  if (!lastDates) return null

  return (
    <div className="card border-sky-500/20 bg-sky-500/5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-display font-bold text-sky-300 flex items-center gap-2"><Landmark className="w-4 h-4" /> Выписки банков</h3>
        <span className="text-2xs text-slate-500">Выгрузите из приложения банка выписку за вчера и сегодня, повторы отбросятся сами</span>
      </div>

      {operating.length === 0 && (
        <div className="text-xs text-slate-500">Ни по одному счёту ещё нет операций — первую выписку загрузите на странице «Импорт выписки».</div>
      )}

      {rows.map(({ account, ok, daysAgo, never }) => (
        <div key={account.id} className="flex items-center justify-between gap-3 text-sm">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('w-2 h-2 rounded-full shrink-0', ok ? 'bg-green-400' : 'bg-amber-400')} />
            <span className="text-slate-200 truncate">{account.name}</span>
            <span className={cn('text-xs', ok ? 'text-slate-500' : 'text-amber-400')}>
              {never ? 'выписки нет' : `до ${shortDate(lastDates[account.id])} · ${daysAgo === 0 ? 'сегодня' : `${daysAgo} дн. назад`}`}
            </span>
            {date && (
              <span className={cn('text-2xs whitespace-nowrap', onDate[account.id] ? 'text-slate-400' : 'text-slate-600')}>
                {onDate[account.id] ? `за ${shortDate(date)}: ${onDate[account.id].n} оп., −${fmt(onDate[account.id].debit)} / +${fmt(onDate[account.id].credit)}` : `за ${shortDate(date)}: нет операций`}
              </span>
            )}
          </div>
          <input type="file" accept=".xlsx,.xls,.pdf" className="hidden"
            ref={el => { inputs.current[account.id] = el }} onChange={e => handleFile(account, e)} />
          <button onClick={() => inputs.current[account.id]?.click()} disabled={busyId != null || saving}
            className="btn-secondary text-xs flex items-center gap-1.5 shrink-0 disabled:opacity-50">
            <Upload className="w-3.5 h-3.5" /> {busyId === account.id ? 'Разбор…' : 'Загрузить'}
          </button>
        </div>
      ))}

      {staged && (
        <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3 space-y-2 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-300 font-medium truncate">{staged.fileName} → {staged.account.name}</span>
            <button onClick={() => setStaged(null)} className="text-slate-500 hover:text-slate-100"><X className="w-4 h-4" /></button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div><div className="text-slate-500">Период</div><div className="font-mono text-slate-200">{shortDate(staged.summary.from)} — {shortDate(staged.summary.to)}</div></div>
            <div><div className="text-slate-500">Новых</div><div className="font-mono text-green-400">{staged.rows.length}</div></div>
            <div><div className="text-slate-500">Уже были</div><div className="font-mono text-slate-300">{staged.duplicates}</div></div>
            <div><div className="text-slate-500">Без категории</div><div className={cn('font-mono', staged.summary.uncategorized ? 'text-amber-400' : 'text-slate-300')}>{staged.summary.uncategorized}</div></div>
          </div>
          <div className="text-slate-400">Списания {money(staged.summary.debit)} · Поступления {money(staged.summary.credit)}{staged.hidden ? ` · скрыто правилами ${staged.hidden}` : ''}</div>
          {staged.balanceCheck && (
            <div className={cn('flex items-center gap-1.5', staged.balanceCheck.ok ? 'text-green-400' : 'text-amber-400')}>
              {staged.balanceCheck.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
              {staged.balanceCheck.ok ? 'Остатки в файле сходятся' : `Остатки не сходятся на ${money(staged.balanceCheck.delta)} — сохраним с пометкой «к проверке», лучше выгрузить файл заново`}
            </div>
          )}
          {staged.parseIssues?.length > 0 && <div className="text-amber-400">{staged.parseIssues.slice(0, 3).join('; ')}</div>}
          <button onClick={confirmImport} disabled={saving}
            className="btn-primary text-xs w-full disabled:opacity-50">
            {saving ? 'Сохранение…' : `Сохранить ${staged.rows.length} операций`}
          </button>
        </div>
      )}

      {notice && (
        <div className={cn('flex items-center gap-2 text-xs', notice.ok ? 'text-green-400' : 'text-red-400')}>
          {notice.ok ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}
    </div>
  )
}
