// Структура P&L из базы (таблица pnl_lines, миграция 029, ADR-0011).
// Кеш держит строки в той же форме, что PNL_STRUCTURE в коде, поэтому
// pnlCompute и страница P&L не различают источник. Пока база не загружена
// (или пуста), отдаётся константа — она же seed нового клиента.
import { PNL_STRUCTURE } from './pnlSeed.js'

let lines = null            // null — из базы ничего не приходило
let allLines = []           // включая скрытые, для редактора

/** Строка базы → форма, которую понимает pnlCompute. */
export function toStructureLine(r) {
  const out = { key: r.key, label: r.label, level: Number(r.level) || 0, section: r.section }
  if (r.source_kind === 'daily') out.source = `daily:${r.daily_field || ''}`
  else if (r.source_kind) {
    out.source = `${r.source_kind}:${r.category_code || ''}`
    if (r.daily_field) out.dailyField = r.daily_field
  }
  if (r.calc) out.calc = r.calc
  if (r.department) out.dept = r.department
  if (r.label_prefix) out.labelPrefix = r.label_prefix
  if (r.parent_key) out.parent = r.parent_key
  if (r.is_active === false) out.hidden = true
  return out
}

export function setPnlStructure(rows) {
  const sorted = [...(rows || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.key).localeCompare(String(b.key)))
  allLines = sorted.map(r => ({ ...r }))
  lines = sorted.length ? sorted.map(toStructureLine) : null
  return getPnlStructure()
}

/**
 * Строки отчёта в порядке показа. Скрытая строка остаётся в расчёте (её сумма
 * входит в итоги), но помечена hidden — страница её не рисует.
 */
export const getPnlStructure = () => (lines ? lines.slice() : PNL_STRUCTURE.slice())

/** Строки как в базе, для редактора. Пусто — база не загружена. */
export const getPnlLines = () => allLines.map(r => ({ ...r }))

export const isPnlStructureFromDb = () => lines !== null

export async function loadPnlStructure() {
  try {
    const { supabase } = await import('./supabase')
    const { data } = await supabase.from('pnl_lines').select('*').order('sort_order').order('id')
    if (data?.length) setPnlStructure(data)
  } catch (_) { /* остаётся константа */ }
  return getPnlStructure()
}

export async function savePnlLine(row) {
  const { supabase } = await import('./supabase')
  const payload = {
    key: row.key, label: String(row.label || '').trim(), level: Number(row.level) || 0, section: row.section,
    source_kind: row.source_kind || null, category_code: row.category_code || null,
    daily_field: row.daily_field || null, calc: row.calc || null,
    department: row.department || null, label_prefix: row.label_prefix || null,
    parent_key: row.parent_key || null,
    sort_order: Number(row.sort_order) || 0, is_active: row.is_active !== false,
  }
  const { error } = await supabase.from('pnl_lines').upsert(payload, { onConflict: 'key' })
  if (!error) await loadPnlStructure()
  return { error }
}
