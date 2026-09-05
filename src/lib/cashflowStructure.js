// Структура Cash Flow из базы (cf_lines и cf_line_categories, миграция 030,
// ADR-0011). Кеш — в форме CF_STRUCTURE, поэтому расчёт и страница не
// различают источник. Пока база не загружена, отдаётся константа и прежние
// списки категорий.
import {
  setBankGroupsSource, CF_STRUCTURE, PAYROLL_CATS, COGS_CATS, RENT_CATS, UTIL_CATS, MKT_CATS, TAX_CATS, OPEX_OTHER_CATS,
} from './cashflowCompute.js'

let lines = null
let allLines = []
let groups = null   // { cf_key: [category_code] }

// расчёт спрашивает привязку здесь: из базы, иначе прежние списки
setBankGroupsSource(() => cfBankGroups())

const FALLBACK_GROUPS = {
  cf_bank_payroll: PAYROLL_CATS, cf_bank_cogs: COGS_CATS, cf_bank_rent: RENT_CATS,
  cf_bank_utilities: UTIL_CATS, cf_bank_marketing: MKT_CATS, cf_bank_taxes: TAX_CATS,
  cf_bank_other_opex: OPEX_OTHER_CATS,
  cf_capex_repair: ['capex_repair'], cf_capex_furniture: ['capex_furniture'], cf_capex_other: ['capex_other'],
}

const byOrder = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || String(a.key ?? a.id).localeCompare(String(b.key ?? b.id))

export function toCfLine(r) {
  const out = { key: r.key, label: r.label, level: Number(r.level) || 0, section: r.section }
  if (r.calc) out.calc = r.calc
  if (r.parent_key) out.parent = r.parent_key
  if (r.is_active === false) out.hidden = true
  return out
}

export function setCfStructure(rows, links) {
  const sorted = [...(rows || [])].sort(byOrder)
  allLines = sorted.map(r => ({ ...r }))
  lines = sorted.length ? sorted.map(toCfLine) : null
  if (links && links.length) {
    groups = {}
    for (const l of [...links].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id)) {
      (groups[l.cf_key] = groups[l.cf_key] || []).push(l.category_code)
    }
  } else groups = null
  return getCfStructure()
}

/** Строки CF в порядке показа; скрытые помечены hidden, из расчёта не выпадают. */
export const getCfStructure = () => (lines ? lines.slice() : CF_STRUCTURE.slice())
export const getCfLines = () => allLines.map(r => ({ ...r }))
export const isCfStructureFromDb = () => lines !== null

/** Статьи банка, складывающиеся в строку CF. Из базы, иначе прежние списки. */
export const cfBankGroups = () => ({ ...(groups || FALLBACK_GROUPS) })

export async function loadCfStructure() {
  try {
    const { supabase } = await import('./supabase')
    const [l, c] = await Promise.all([
      supabase.from('cf_lines').select('*').order('sort_order').order('id'),
      supabase.from('cf_line_categories').select('*').order('cf_key').order('sort_order'),
    ])
    if (l.data?.length) setCfStructure(l.data, c.data || [])
  } catch (_) { /* остаётся константа */ }
  return getCfStructure()
}

export async function saveCfLine(row) {
  const { supabase } = await import('./supabase')
  const payload = {
    key: row.key, label: String(row.label || '').trim(), level: Number(row.level) || 0,
    section: row.section, calc: row.calc || null, parent_key: row.parent_key || null,
    sort_order: Number(row.sort_order) || 0, is_active: row.is_active !== false,
  }
  const { error } = await supabase.from('cf_lines').upsert(payload, { onConflict: 'key' })
  if (!error) await loadCfStructure()
  return { error }
}
