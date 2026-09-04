// Загрузка справочника отделов из базы. Кеш и разбор — в config.js, здесь только
// поход в Supabase; импорт ленивый, чтобы модуль оставался тестируемым в node:test
// без Vite-окружения (тот же приём, что в dates.js).
import { setDepartments, getDepartments } from './config.js'

export async function loadDepartments() {
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.from('departments').select('*').order('sort_order')
    if (data) setDepartments(data)
  } catch (_) { /* справочник останется пустым — форма покажет это честно */ }
  return getDepartments()
}

export async function saveDepartment(row) {
  const { supabase } = await import('./supabase')
  const payload = {
    code: row.code, name: row.name,
    for_revenue: !!row.for_revenue, for_staff: !!row.for_staff, for_supply: !!row.for_supply,
    iiko_store: row.iiko_store || null,
    sort_order: Number(row.sort_order) || 0,
    is_active: row.is_active !== false,
  }
  const { error } = row.id
    ? await supabase.from('departments').update(payload).eq('id', row.id)
    : await supabase.from('departments').insert(payload)
  if (!error) await loadDepartments()
  return { error }
}
