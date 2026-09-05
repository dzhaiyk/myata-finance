// Пороги и нормы заведения: settings.thresholds → кеш в config.js (TASK-021).
// Нет записи — работают значения по умолчанию из config.js.
import { setThresholds, getThresholds } from './config.js'

export async function loadThresholds() {
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.from('settings').select('value').eq('key', 'thresholds').single()
    if (data?.value) setThresholds(data.value)
  } catch { /* нет записи — значения по умолчанию */ }
  return getThresholds()
}

/** @returns {{error: null|{message: string}}} */
export async function saveThresholds(value) {
  const errors = setThresholds(value)
  if (errors.length) return { error: { message: errors.join('; ') } }
  const { supabase } = await import('./supabase')
  const { error } = await supabase.from('settings').upsert(
    { key: 'thresholds', value: getThresholds(), updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  return { error }
}
