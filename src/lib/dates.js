import { timezone } from './config.js'
// supabase импортируется лениво внутри load/save — модуль остаётся чистым
// и тестируется встроенным node:test без Vite-окружения (import.meta.env)

// Первый год данных заведения (исторический импорт начинается с 2022)
export const START_YEAR = 2022

// Список лет от `from` до текущего (+extraForward лет вперёд).
// Автоматически расширяется с наступлением нового года — не хардкодить [2022..2026].
export function yearsRange(from = START_YEAR, extraForward = 0) {
  const current = new Date().getFullYear() + extraForward
  const years = []
  for (let y = from; y <= current; y++) years.push(y)
  return years
}

// Граница операционного дня: заведение закрывается ночью (~02:00),
// поэтому операции после полуночи и до этой границы относятся к ПРЕДЫДУЩЕЙ дате.
// Настраивается в «Настройки → Операционный день», хранится в settings (key='shift').
export const DEFAULT_CUTOFF_HOUR = 6

let cachedCutoffHour = DEFAULT_CUTOFF_HOUR

export function getCutoffHour() {
  return cachedCutoffHour
}

export function setCutoffHour(hour) {
  const h = Number(hour)
  if (Number.isInteger(h) && h >= 0 && h <= 12) cachedCutoffHour = h
}

// Загружается один раз при старте приложения (store.initialize)
export async function loadCutoffHour() {
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.from('settings').select('value').eq('key', 'shift').single()
    if (data?.value?.cutoff_hour != null) setCutoffHour(data.value.cutoff_hour)
  } catch (_) { /* нет записи — используем DEFAULT_CUTOFF_HOUR */ }
  return cachedCutoffHour
}

export async function saveCutoffHour(hour) {
  setCutoffHour(hour)
  const { supabase } = await import('./supabase')
  const { error } = await supabase.from('settings').upsert(
    { key: 'shift', value: { cutoff_hour: cachedCutoffHour }, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  return { error }
}

/**
 * Календарные части момента в часовом поясе заведения. Пустой пояс — как у
 * браузера: так работало до TASK-020 и для одного заведения это верно, но
 * менеджер, открывший отчёт в поездке, получил бы чужую операционную дату.
 */
export function zonedParts(d = new Date(), tz = timezone()) {
  if (!tz) return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours() }
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
    }).formatToParts(d)
    const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
    return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) }
  } catch {
    return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(), hour: d.getHours() }
  }
}

const pad = (n) => String(n).padStart(2, '0')

// Дата YYYY-MM-DD в поясе заведения (toISOString даёт UTC и в UTC+5 до 05:00 сдвигает на вчера)
export function formatLocalDate(d = new Date()) {
  const { year, month, day } = zonedParts(d)
  return `${year}-${pad(month)}-${pad(day)}`
}

// Операционная дата: до границы (например 06:00) — предыдущий календарный день.
// Отчёт, заполняемый в 02:30 после закрытия смены, получит дату вчерашней смены.
export function getBusinessDate(d = new Date(), cutoffHour = cachedCutoffHour) {
  const { year, month, day, hour } = zonedParts(d)
  if (hour >= cutoffHour) return `${year}-${pad(month)}-${pad(day)}`
  // сдвиг на день назад считаем в UTC: арифметика по календарю, без пояса
  const prev = new Date(Date.UTC(year, month - 1, day) - 86400000)
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`
}

// Для строки даты-времени из выписки: календарная дата + час → операционная дата
export function businessDateFromParts(isoDate, hour, cutoffHour = cachedCutoffHour) {
  if (hour == null || hour >= cutoffHour) return isoDate
  const [y, m, d] = isoDate.split('-').map(Number)
  // дата из выписки уже календарная — сдвигаем её по календарю, без пояса
  const prev = new Date(Date.UTC(y, m - 1, d) - 86400000)
  return `${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`
}
