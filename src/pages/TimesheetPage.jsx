// Табель смен: сетка сотрудники × дни за полмесяца, штрафы, импорт из Excel (TASK-038).
// Доля смены 1 / 0.7 / 0.5 — начисление = ставка × доля (BR-PAY).
import { useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAuthStore } from '@/lib/store'
import { cn, MONTHS_RU } from '@/lib/utils'
import { yearsRange } from '@/lib/dates'
import { departmentLabel } from '@/lib/config'
import { parseTimesheetWorkbook, matchStaff } from '@/lib/timesheet'
import { loadTimesheet, saveTimesheet, importTimesheet, periodRange } from '@/lib/timesheetDb'
import { Save, Upload, CalendarDays, AlertTriangle } from 'lucide-react'

const SHARES = ['', '1', '0.7', '0.5']
const daysOf = ({ year, month, period }) => {
  const { from, to } = periodRange({ year, month, period })
  const a = Number(from.slice(-2)), b = Number(to.slice(-2))
  return Array.from({ length: b - a + 1 }, (_, i) => a + i)
}
const pad = (n) => String(n).padStart(2, '0')

export default function TimesheetPage() {
  const { hasPermission } = useAuthStore()
  const canEdit = hasPermission('timesheet.manage')
  const now = new Date()
  const [p, setP] = useState({ year: now.getFullYear(), month: now.getMonth() + 1, period: now.getDate() <= 15 ? 1 : 2 })
  const [tab, setTab] = useState('grid')
  const [staff, setStaff] = useState([])
  const [cells, setCells] = useState({})     // `${staff_id}|${day}` → share
  const [fines, setFines] = useState({})     // staff_id → { amount, comment }
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const days = useMemo(() => daysOf(p), [p])

  const load = async () => {
    setLoading(true)
    const { entries, fines: f, staff: s } = await loadTimesheet(p)
    setStaff(s.filter(x => x.is_active !== false))
    const c = {}; entries.forEach(e => { c[`${e.staff_id}|${Number(e.work_date.slice(-2))}`] = String(e.share) })
    const fm = {}; f.forEach(x => { fm[x.staff_id] = { amount: x.amount, comment: x.comment || '' } })
    setCells(c); setFines(fm); setLoading(false)
  }
  useEffect(() => { load() }, [p.year, p.month, p.period])

  const totalOf = (sid) => Math.round(days.reduce((s, d) => s + (Number(cells[`${sid}|${d}`]) || 0), 0) * 100) / 100

  const save = async () => {
    setStatus('Сохранение...')
    const entries = []
    staff.forEach(s => days.forEach(d => {
      const share = Number(cells[`${s.id}|${d}`])
      entries.push({ staff_id: s.id, work_date: `${p.year}-${pad(p.month)}-${pad(d)}`, share: share || 0 })
    }))
    const fineRows = staff.map(s => ({ staff_id: s.id, amount: Number(fines[s.id]?.amount) || 0, comment: fines[s.id]?.comment || '' }))
    const { error } = await saveTimesheet(p, entries, fineRows)
    setStatus(error ? '❌ ' + error.message : '✅ Сохранено')
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Табель</h1>
          <p className="text-sm text-slate-500 mt-0.5">Смена — 1, часть смены — 0.7 или 0.5; начисление = ставка × доля</p>
        </div>
        <div className="flex gap-2">
          {[['grid', 'Смены'], ['import', 'Импорт из Excel']].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} className={cn('px-3 py-1.5 rounded-lg text-sm font-medium', tab === k ? 'bg-brand-600/20 text-brand-400' : 'text-slate-500 hover:text-slate-300')}>{l}</button>
          ))}
        </div>
      </div>

      {tab === 'grid' && (
        <div className="card space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="w-4 h-4 text-slate-500" />
            <select value={p.year} onChange={e => setP(x => ({ ...x, year: Number(e.target.value) }))} className="input text-sm">
              {yearsRange().map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={p.month} onChange={e => setP(x => ({ ...x, month: Number(e.target.value) }))} className="input text-sm">
              {MONTHS_RU.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={p.period} onChange={e => setP(x => ({ ...x, period: Number(e.target.value) }))} className="input text-sm">
              <option value={1}>1–15</option><option value={2}>16–конец</option>
            </select>
            {canEdit && <button onClick={save} className="btn-primary text-sm flex items-center gap-2 ml-auto"><Save className="w-4 h-4" /> Сохранить</button>}
            {status && <span className="text-xs text-slate-400">{status}</span>}
          </div>
          {loading ? <p className="text-xs text-slate-500">Загрузка...</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr>
                  <th className="table-header text-left sticky left-0 bg-slate-900">Сотрудник</th>
                  {days.map(d => <th key={d} className="table-header text-center w-10">{d}</th>)}
                  <th className="table-header text-right">Смены</th>
                  <th className="table-header text-right">Штраф</th>
                </tr></thead>
                <tbody>
                  {staff.map(s => (
                    <tr key={s.id} className="hover:bg-slate-800/30">
                      <td className="table-cell sticky left-0 bg-slate-900 whitespace-nowrap">
                        <div className="font-medium">{s.full_name}</div>
                        <div className="text-[10px] text-slate-500">{departmentLabel(s.department)}</div>
                      </td>
                      {days.map(d => {
                        const k = `${s.id}|${d}`
                        return (
                          <td key={d} className="table-cell p-0.5 text-center">
                            <select value={cells[k] || ''} disabled={!canEdit}
                              onChange={e => setCells(c => ({ ...c, [k]: e.target.value }))}
                              className={cn('w-10 text-center text-xs rounded bg-transparent border border-transparent focus:border-brand-500', cells[k] && 'bg-brand-500/10 text-brand-300')}>
                              {SHARES.map(v => <option key={v} value={v}>{v || '·'}</option>)}
                            </select>
                          </td>
                        )
                      })}
                      <td className="table-cell text-right font-mono">{totalOf(s.id) || ''}</td>
                      <td className="table-cell text-right">
                        <input type="number" value={fines[s.id]?.amount || ''} disabled={!canEdit} placeholder="0"
                          onChange={e => setFines(f => ({ ...f, [s.id]: { ...(f[s.id] || {}), amount: e.target.value } }))}
                          className="input text-xs w-24 text-right" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === 'import' && <ImportTab canEdit={canEdit} onDone={load} />}
    </div>
  )
}

function ImportTab({ canEdit, onDone }) {
  const [parsed, setParsed] = useState(null)
  const [staff, setStaff] = useState([])
  const [map, setMap] = useState({})
  const [status, setStatus] = useState('')
  const [startYear, setStartYear] = useState(new Date().getFullYear() - 1)

  useEffect(() => { loadTimesheet({ year: 2000, month: 1, period: 1 }).then(r => setStaff(r.staff)) }, [])

  const onFile = async (file) => {
    if (!file) return
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array' })
    const sheets = wb.SheetNames.map(name => ({ name, rows: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true }) }))
    const res = parseTimesheetWorkbook(sheets, Number(startYear))
    const names = [...new Set(res.entries.map(e => e.name).concat(res.fines.map(f => f.name)))]
    const m = matchStaff(names, staff)
    setParsed({ ...res, names, unmatched: m.unmatched })
    setMap(m.matched)
    setStatus('')
  }

  const commit = async () => {
    const missing = parsed.names.filter(n => !map[n])
    if (missing.length) { setStatus(`❌ Не сопоставлены: ${missing.join(', ')}`); return }
    setStatus('Импорт...')
    const { error, periods } = await importTimesheet(parsed, map)
    setStatus(error ? '❌ ' + error.message : `✅ Импортировано периодов: ${periods}`)
    if (!error) onDone()
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center"><Upload className="w-5 h-5 text-indigo-400" /></div>
        <div>
          <div className="text-sm font-semibold">Импорт табеля из Excel</div>
          <div className="text-xs text-slate-500">Лист = полмесяца, даты берутся из имени листа. Телефоны и «наличка» не импортируются</div>
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <div><label className="label">Год первого листа</label>
          <input type="number" value={startYear} onChange={e => setStartYear(e.target.value)} className="input text-sm w-28" /></div>
        <div><label className="label">Файл</label>
          <input type="file" accept=".xlsx,.xls" disabled={!canEdit} onChange={e => onFile(e.target.files?.[0])} className="text-sm" /></div>
      </div>

      {parsed && (
        <div className="space-y-3">
          <div className="text-xs text-slate-400">
            Периодов: {parsed.periods.length} · смен: {parsed.entries.length} · штрафов: {parsed.fines.length}
          </div>
          {parsed.issues.length > 0 && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs space-y-1">
              <div className="flex items-center gap-2 text-amber-300 font-medium"><AlertTriangle className="w-3.5 h-3.5" /> Замечания по файлу — импорт возможен, но проверьте</div>
              {parsed.issues.map((i, k) => <div key={k} className="text-slate-400">{i}</div>)}
            </div>
          )}
          <div>
            <div className="text-xs font-semibold text-slate-400 mb-2">Сопоставление имён</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {parsed.names.map(n => (
                <label key={n} className="flex items-center gap-2 text-xs">
                  <span className={cn('w-40 truncate', !map[n] && 'text-amber-300')}>{n}</span>
                  <select value={map[n] || ''} onChange={e => setMap(m => ({ ...m, [n]: Number(e.target.value) || undefined }))} className="input text-xs flex-1" disabled={!canEdit}>
                    <option value="">— не сопоставлен —</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.full_name}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>
          {parsed.notes.length > 0 && (
            <details className="text-xs text-slate-500"><summary>Заметки из последней колонки ({parsed.notes.length}) — не импортируются</summary>
              <div className="mt-1 space-y-0.5">{parsed.notes.slice(0, 40).map((n, k) => <div key={k}>{n.name}: {n.note}</div>)}</div>
            </details>
          )}
          {canEdit && <button onClick={commit} className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" /> Импортировать</button>}
          {status && <span className="text-xs text-slate-400 ml-3">{status}</span>}
        </div>
      )}
    </div>
  )
}
