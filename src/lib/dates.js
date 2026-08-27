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

// Локальная дата YYYY-MM-DD без UTC-сдвига (toISOString в UTC+5 до 05:00 утра даёт вчерашний день)
export function formatLocalDate(d = new Date()) {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// Операционная дата: до границы (например 06:00) — предыдущий календарный день.
// Отчёт, заполняемый в 02:30 после закрытия смены, получит дату вчерашней смены.
export function getBusinessDate(d = new Date(), cutoffHour = cachedCutoffHour) {
  const dt = new Date(d)
  if (dt.getHours() < cutoffHour) dt.setDate(dt.getDate() - 1)
  return formatLocalDate(dt)
}

// Для строки даты-времени из выписки: календарная дата + час → операционная дата
export function businessDateFromParts(isoDate, hour, cutoffHour = cachedCutoffHour) {
  if (hour == null || hour >= cutoffHour) return isoDate
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() - 1)
  return formatLocalDate(dt)
}
