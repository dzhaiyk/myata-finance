// Загрузка бренда заведения из настроек (`settings`, ключ `general`).
// Кеш и разбор — в config.js; supabase импортируется лениво, чтобы модуль
// оставался тестируемым в node:test (тот же приём, что в dates.js).
import { setBranding, getBranding } from './config.js'

export async function loadBranding() {
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.from('settings').select('value').eq('key', 'general').single()
    if (data?.value) setBranding(data.value)
  } catch (_) { /* останутся нейтральные подписи */ }
  return getBranding()
}

export async function saveBranding(value) {
  setBranding(value)
  const { supabase } = await import('./supabase')
  // не затираем остальные поля ключа general (валюта и прочее)
  const { data } = await supabase.from('settings').select('value').eq('key', 'general').single()
  const next = { ...(data?.value || {}), ...getBranding() }
  const { error } = await supabase.from('settings').upsert(
    { key: 'general', value: next, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  return { error }
}
