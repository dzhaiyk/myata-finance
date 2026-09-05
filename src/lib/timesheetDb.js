// Табель: поход в базу. Чистая логика — timesheet.js. Импорт ленивый (как в departments.js).
import { periodTotals } from './timesheet.js'

const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const pad = (n) => String(n).padStart(2, '0')
export const periodRange = ({ year, month, period }) => ({
  from: `${year}-${pad(month)}-${period === 1 ? '01' : '16'}`,
  to: `${year}-${pad(month)}-${pad(period === 1 ? 15 : daysInMonth(year, month))}`,
})

export async function loadTimesheet(p) {
  const { supabase } = await import('./supabase')
  const { from, to } = periodRange(p)
  const [e, f, s] = await Promise.all([
    supabase.from('timesheet_entries').select('*').gte('work_date', from).lte('work_date', to),
    supabase.from('timesheet_fines').select('*').eq('year', p.year).eq('month', p.month).eq('period', p.period),
    supabase.from('staff').select('id, full_name, department, position_id, is_active').order('department').order('full_name'),
  ])
  return { entries: e.data || [], fines: f.data || [], staff: s.data || [], error: e.error || f.error || s.error }
}

/** Сохранить смены одного периода: пришедшие — upsert, отсутствующие в наборе — удалить. */
export async function saveTimesheet(p, entries, fines) {
  const { supabase } = await import('./supabase')
  const { from, to } = periodRange(p)
  const rows = (entries || []).filter(e => Number(e.share) > 0)
    .map(e => ({ staff_id: e.staff_id, work_date: e.work_date, share: Number(e.share), comment: e.comment || null }))
  // сначала чистим период по затронутым сотрудникам, потом пишем набор целиком
  const staffIds = [...new Set([...(entries || []).map(e => e.staff_id), ...(fines || []).map(f => f.staff_id)])]
  if (staffIds.length) {
    const del = await supabase.from('timesheet_entries').delete().in('staff_id', staffIds).gte('work_date', from).lte('work_date', to)
    if (del.error) return { error: del.error }
  }
  if (rows.length) {
    const ins = await supabase.from('timesheet_entries').upsert(rows, { onConflict: 'staff_id,work_date' })
    if (ins.error) return { error: ins.error }
  }
  const fineRows = (fines || []).map(f => ({ staff_id: f.staff_id, year: p.year, month: p.month, period: p.period, amount: Number(f.amount) || 0, comment: f.comment || null }))
  for (const f of fineRows) {
    const r = f.amount > 0
      ? await supabase.from('timesheet_fines').upsert(f, { onConflict: 'staff_id,year,month,period' })
      : await supabase.from('timesheet_fines').delete().match({ staff_id: f.staff_id, year: p.year, month: p.month, period: p.period })
    if (r.error) return { error: r.error }
  }
  return { error: null }
}

/** Импорт разобранной книги: записи уже с staff_id. Пишет по периодам через saveTimesheet. */
export async function importTimesheet(parsed, staffIdByName) {
  const byPeriod = new Map()
  for (const e of parsed.entries) {
    const sid = staffIdByName[e.name]; if (!sid) continue
    const [y, m, d] = e.work_date.split('-').map(Number)
    const key = `${y}-${m}-${d <= 15 ? 1 : 2}`
    const bucket = byPeriod.get(key) || { p: { year: y, month: m, period: d <= 15 ? 1 : 2 }, entries: [], fines: [] }
    bucket.entries.push({ staff_id: sid, work_date: e.work_date, share: e.share })
    byPeriod.set(key, bucket)
  }
  for (const f of parsed.fines) {
    const sid = staffIdByName[f.name]; if (!sid) continue
    const key = `${f.year}-${f.month}-${f.period}`
    const bucket = byPeriod.get(key) || { p: { year: f.year, month: f.month, period: f.period }, entries: [], fines: [] }
    bucket.fines.push({ staff_id: sid, amount: f.amount })
    byPeriod.set(key, bucket)
  }
  let periods = 0
  for (const { p, entries, fines } of byPeriod.values()) {
    const { error } = await saveTimesheet(p, entries, fines)
    if (error) return { error, periods }
    periods += 1
  }
  return { error: null, periods }
}

/** Смены и штрафы за период для расчёта зарплаты. */
export async function timesheetTotals(p) {
  const { entries, fines } = await loadTimesheet(p)
  return periodTotals(entries, fines, p)
}
