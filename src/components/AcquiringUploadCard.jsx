// Загрузка выписок эквайринга: Kaspi (xlsx) и Halyk по POS-договору (pdf).
// Операции нужны, чтобы подтвердить безнал смены живыми деньгами (BR-CTL-019):
// если оплату пробили картой, а взяли наличными, операции у эквайрера не будет.
import { useEffect, useState } from 'react'
import { Upload, CreditCard, Check, AlertTriangle } from 'lucide-react'
import { money, cn } from '@/lib/utils'
import { ACQUIRERS } from '@/lib/acquiring'
import { parseAcquiringFile, saveAcquiringOps, acquiringCoverage } from '@/lib/acquiringDb'

export default function AcquiringUploadCard({ canUpload }) {
  const [coverage, setCoverage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [staged, setStaged] = useState(null)
  const [notice, setNotice] = useState(null)

  const refresh = () => acquiringCoverage().then(setCoverage).catch(() => {})
  useEffect(() => { refresh() }, [])

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBusy(true); setNotice(null); setStaged(null)
    try {
      const data = await file.arrayBuffer()
      const res = await parseAcquiringFile({ name: file.name, data })
      if (!res.ops.length) throw new Error(res.issues[0] || 'операции не найдены')
      const dates = res.ops.map(o => o.business_date).sort()
      setStaged({
        ...res, fileName: file.name,
        total: res.ops.reduce((s, o) => s + o.amount, 0),
        fee: res.ops.reduce((s, o) => s + (o.fee || 0), 0),
        from: dates[0], to: dates[dates.length - 1],
      })
    } catch (err) {
      setNotice({ ok: false, text: String(err.message || err) })
    }
    setBusy(false)
  }

  const save = async () => {
    if (!staged) return
    setBusy(true)
    const { saved, error } = await saveAcquiringOps(staged.ops, { sourceFile: staged.fileName })
    setNotice(error
      ? { ok: false, text: `Ошибка: ${error.message}` }
      : { ok: true, text: `${ACQUIRERS[staged.acquirer]}: загружено ${saved} операций за ${staged.from} — ${staged.to}` })
    setStaged(null); setBusy(false); refresh()
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-blue-500/15 flex items-center justify-center shrink-0">
            <CreditCard className="w-5 h-5 text-blue-400" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Выписки эквайринга</div>
            <div className="text-xs text-slate-500">
              {coverage?.count
                ? `${coverage.count} операций, ${coverage.from} — ${coverage.to}`
                : 'подтверждают безнал смены живыми деньгами'}
            </div>
          </div>
        </div>
        {canUpload && (
          <label className="btn-secondary text-xs flex items-center gap-1.5 shrink-0 cursor-pointer whitespace-nowrap">
            <Upload className="w-3.5 h-3.5" /> {busy ? 'Читаю…' : 'Загрузить'}
            <input type="file" accept=".xlsx,.xls,.pdf" className="hidden" onChange={handleFile} disabled={busy} />
          </label>
        )}
      </div>

      <p className="text-xs text-slate-500">
        Kaspi — выгрузка по эквайрингу в формате Excel, Halyk — выписка по POS-договору в PDF.
        Повторная загрузка того же файла дубликатов не создаёт.
      </p>

      {staged && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 space-y-2 text-xs">
          <div className="font-medium text-slate-200">
            {ACQUIRERS[staged.acquirer]}{staged.merchant ? ` · ${staged.merchant}` : ''}
          </div>
          <div className="text-slate-400">
            операций {staged.ops.length} на {money(staged.total)}, комиссия {money(Math.abs(staged.fee))};
            смены с {staged.from} по {staged.to}
          </div>
          {staged.issues?.length > 0 && (
            <div className="text-amber-400 flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />{staged.issues.slice(0, 3).join('; ')}
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button onClick={save} disabled={busy} className="btn-primary text-xs">Сохранить</button>
            <button onClick={() => setStaged(null)} className="btn-secondary text-xs">Отмена</button>
          </div>
        </div>
      )}

      {notice && (
        <div className={cn('text-xs flex items-start gap-1.5', notice.ok ? 'text-green-400' : 'text-red-400')}>
          {notice.ok ? <Check className="w-3.5 h-3.5 shrink-0 mt-0.5" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />}
          {notice.text}
        </div>
      )}
    </div>
  )
}
