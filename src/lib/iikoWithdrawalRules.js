// Правила «комментарий изъятия → секция отчёта» лежат в settings (key
// iiko_withdrawals), как и всё, что зависит от заведения (правило 11).
// Пустые правила — корректное состояние: всё уходит в «Прочие расходы».
let cached = null

export const EMPTY_RULE = () => ({ pattern: '', section: 'other', name: '' })

export function getWithdrawalRules() { return cached || [] }

export function setWithdrawalRules(rules) {
  cached = (Array.isArray(rules) ? rules : [])
    .map(r => ({ pattern: String(r.pattern || '').trim(), section: String(r.section || 'other'), name: String(r.name || '').trim() }))
    .filter(r => r.pattern)
  return cached
}

export async function loadWithdrawalRules() {
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.from('settings').select('value').eq('key', 'iiko_withdrawals').single()
    setWithdrawalRules(data?.value?.rules || [])
  } catch { setWithdrawalRules([]) }
  return getWithdrawalRules()
}

export async function saveWithdrawalRules(rules) {
  const clean = setWithdrawalRules(rules)
  const { supabase } = await import('./supabase')
  const { error } = await supabase.from('settings').upsert(
    { key: 'iiko_withdrawals', value: { rules: clean }, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  )
  return { error }
}
