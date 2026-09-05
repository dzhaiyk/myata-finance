// Табель смен: сетка сотрудники × дни за полмесяца, штрафы, импорт из Excel (TASK-038).
// Доля смены 1 / 0.7 / 0.5 — начисление = ставка × доля (BR-PAY).
import { Fragment, useEffect, useMemo, useState } from 'react'
import * as XLSX from 'xlsx'
import { useAuthStore } from '@/lib/store'
import { cn, MONTHS_RU, money } from '@/lib/utils'
import { yearsRange } from '@/lib/dates'
import { departmentLabel, currencySymbol } from '@/lib/config'
import { parseTimesheetWorkbook, matchStaff } from '@/lib/timesheet'
import { loadTimesheet, saveTimesheet, importTimesheet, periodRange } from '@/lib/timesheetDb'
import { Save, Upload, CalendarDays, AlertTriangle } from 'lucide-react'

const SHARES = ['', '1', '0.7', '0.5']
// Нажатие перебирает доли по кругу: на планшете это одно движение пальцем,
// а не выбор из списка. Пустая ячейка — сотрудник не работал.
const cycleShare = (v) => SHARES[(SHARES.indexOf(String(v || '')) + 1) % SHARES.length]
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб']
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

  // Строки сгруппированы по отделу: табель читается как ведомость, а не как
  // один длинный список; порядок отделов — из справочника (staff уже отсортирован)
  const groups = useMemo(() => {
    const by = new Map()
    for (const s of staff) {
      const k = s.department || ''
      if (!by.has(k)) by.set(k, [])
      by.get(k).push(s)
    }
    return [...by.entries()]
  }, [staff])
  const totalShifts = useMemo(
    () => Math.round(staff.reduce((sum, s) => sum + totalOf(s.id), 0) * 100) / 100,
    [staff, cells, days])
  const totalFines = useMemo(
    () => staff.reduce((sum, s) => sum + (Number(fines[s.id]?.amount) || 0), 0),
    [staff, fines])

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
          {loading ? <p className="text-sm text-slate-500">Загрузка...</p> : (
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className="table-header text-left sticky left-0 z-10 bg-slate-850 min-w-[190px]">Сотрудник</th>
                    {days.map(d => {
                      const dow = new Date(p.year, p.month - 1, d).getDay()
                      const weekend = dow === 0 || dow === 6
                      return (
                        <th key={d} className={cn('table-header text-center w-11 px-0', weekend && 'text-brand-400/80')}>
                          <div className="leading-none">{d}</div>
                          <div className="text-2xs font-normal normal-case tracking-normal opacity-70 mt-0.5">{WEEKDAYS_SHORT[dow]}</div>
                        </th>
                      )
                    })}
                    <th className="table-header text-right w-20">Смены</th>
                    <th className="table-header text-right w-32 pr-5">Штраф, {currencySymbol()}</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(([dept, list]) => (
                    <Fragment key={dept}>
                      <tr>
                        <td colSpan={days.length + 3} className="sticky left-0 bg-slate-800/50 px-5 py-1.5 text-2xs font-semibold uppercase tracking-wide text-slate-500 border-t border-slate-800">
                          {departmentLabel(dept)}
                        </td>
                      </tr>
                      {list.map(s => (
                        <tr key={s.id} className="group">
                          <td className="table-cell sticky left-0 z-10 bg-slate-850 group-hover:bg-slate-800/60 whitespace-nowrap">
                            <div className="font-medium">{s.full_name}</div>
                          </td>
                          {days.map(d => {
                            const k = `${s.id}|${d}`
                            const v = cells[k] || ''
                            const dow = new Date(p.year, p.month - 1, d).getDay()
                            const weekend = dow === 0 || dow === 6
                            return (
                              <td key={d} className={cn('border-t border-slate-800 p-0.5 text-center', weekend && 'bg-slate-800/40')}>
                                <button
                                  type="button" disabled={!canEdit}
                                  onClick={() => setCells(c => ({ ...c, [k]: cycleShare(v) }))}
                                  aria-label={`${s.full_name}, ${d} число: ${v || 'не работал'}`}
                                  className={cn(
                                    'w-9 h-9 rounded-lg text-sm font-medium transition-transform duration-100 active:scale-[0.88] disabled:pointer-events-none',
                                    v === '1' && 'bg-brand-500/20 text-brand-400',
                                    v && v !== '1' && 'bg-amber-500/20 text-amber-400',
                                    !v && 'text-slate-700 hover:bg-slate-800',
                                  )}
                                >{v || '·'}</button>
                              </td>
                            )
                          })}
                          <td className="table-cell text-right font-mono font-semibold">{totalOf(s.id) || <span className="text-slate-700">0</span>}</td>
                          <td className="table-cell text-right pr-5">
                            <input type="number" inputMode="decimal" value={fines[s.id]?.amount || ''} disabled={!canEdit} placeholder="0"
                              onChange={e => setFines(f => ({ ...f, [s.id]: { ...(f[s.id] || {}), amount: e.target.value } }))}
                              className="input text-sm w-28 text-right py-1.5" style={{ minHeight: '2.25rem' }} />
                          </td>
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="sticky left-0 bg-slate-850 px-4 py-3 text-sm font-semibold border-t border-slate-750">Итого</td>
                    <td colSpan={days.length} className="border-t border-slate-750" />
                    <td className="px-4 py-3 text-right font-mono font-bold border-t border-slate-750">{totalShifts}</td>
                    <td className="px-4 py-3 text-right font-mono border-t border-slate-750 pr-5">{totalFines ? money(totalFines) : ''}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <p className="text-xs text-slate-500">Нажатие на клетку меняет долю смены: пусто → 1 → 0.7 → 0.5.</p>
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
