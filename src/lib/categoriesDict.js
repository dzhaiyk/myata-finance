// Справочник статей P&L: чистые помощники и поход в базу (ADR-0011, TASK-027).
// supabase импортируется лениво — модуль тестируется в node:test.
import { codeFromName } from './config.js'

export const CATEGORY_TYPES = [
  { value: 'income', label: 'Доход' },
  { value: 'cogs', label: 'Себестоимость' },
  { value: 'opex', label: 'Операционные расходы' },
  { value: 'below_ebitda', label: 'Ниже EBITDA' },
  { value: 'other', label: 'Вне P&L' },
]

const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.code).localeCompare(String(b.code))

/**
 * Плоский список → статьи верхнего уровня с детьми. Глубина одна: подстатья
 * с несуществующим или не-верхним родителем поднимается наверх, а не теряется.
 */
export function categoryTree(list) {
  const rows = (list || []).map(c => ({ ...c, children: [] }))
  const byCode = new Map(rows.map(c => [c.code, c]))
  const roots = []
  for (const c of rows) {
    const parent = c.parent_code ? byCode.get(c.parent_code) : null
    if (parent && !parent.parent_code) parent.children.push(c)
    else roots.push(c)
  }
  roots.sort(byOrder)
  roots.forEach(r => r.children.sort(byOrder))
  return roots
}

/** Кто может быть родителем для статьи: активные статьи верхнего уровня того же типа, кроме неё самой. */
export function parentOptions(list, cat) {
  return (list || [])
    .filter(c => c.code !== cat?.code && !c.parent_code && c.is_active !== false && c.type === cat?.type)
    .sort(byOrder)
}

/**
 * Проверка перед сохранением. Возвращает список ошибок; пустой — можно сохранять.
 * Глубина один уровень: у подстатьи не может быть детей, родитель не может быть подстатьёй.
 */
export function validateCategory(cat, list) {
  const errors = []
  const all = list || []
  if (!String(cat?.name || '').trim()) errors.push('Нужно название')
  if (!cat?.type) errors.push('Нужен тип')
  if (cat?.parent_code) {
    const parent = all.find(c => c.code === cat.parent_code)
    if (!parent) errors.push('Родительская статья не найдена')
    else {
      if (parent.code === cat.code) errors.push('Статья не может быть родителем самой себе')
      if (parent.parent_code) errors.push('Вложенность — один уровень: родитель сам подстатья')
      if (parent.type !== cat.type) errors.push('Подстатья должна быть того же типа, что родитель')
    }
    if (all.some(c => c.parent_code === cat.code && c.code !== cat.code)) {
      errors.push('У статьи есть подстатьи — её нельзя вложить')
    }
  }
  return errors
}

/** Новый код статьи из названия, с суффиксом при совпадении. */
export const newCategoryCode = (name, list) => codeFromName(name, (list || []).map(c => c.code))

// --- база -------------------------------------------------------------------

export async function loadCategories() {
  const { supabase } = await import('./supabase')
  const { data, error } = await supabase.from('categories').select('*').order('sort_order').order('code')
  return { rows: data || [], error }
}

export async function saveCategory(row) {
  const { supabase } = await import('./supabase')
  const payload = {
    code: row.code, name: String(row.name).trim(), type: row.type,
    pnl_group: row.pnl_group || null, parent_code: row.parent_code || null,
    department: row.department || null, name_template: row.name_template || null,
    sort_order: Number(row.sort_order) || 0, is_active: row.is_active !== false,
  }
  const { error } = await supabase.from('categories').upsert(payload, { onConflict: 'code' })
  return { error }
}
