// Справочник отделов живёт в базе (миграция 025), в коде его нет — тесты
// подставляют свой набор, как это сделает любое заведение.
export const FIXTURE_DEPARTMENTS = [
  { code: 'kitchen', name: 'Кухня', for_revenue: true, for_staff: true, for_supply: true, iiko_store: 'СКЛАД КУХНЯ МЯТА', sort_order: 1, is_active: true },
  { code: 'bar', name: 'Бар', for_revenue: true, for_staff: true, for_supply: true, iiko_store: 'СКЛАД БАР МЯТА', sort_order: 2, is_active: true },
  { code: 'hookah', name: 'Кальян', for_revenue: true, for_staff: true, for_supply: true, iiko_store: 'СКЛАД КАЛЬЯН МЯТА', sort_order: 3, is_active: true },
  { code: 'hall', name: 'Зал', for_revenue: false, for_staff: true, for_supply: false, sort_order: 4, is_active: true },
  { code: 'household', name: 'Хозтовары', for_revenue: false, for_staff: false, for_supply: true, sort_order: 5, is_active: true },
  { code: 'other', name: 'Прочее', for_revenue: true, for_staff: true, for_supply: true, sort_order: 6, is_active: true },
  { code: 'closed', name: 'Закрытый', for_revenue: true, for_staff: true, for_supply: true, sort_order: 7, is_active: false },
]

// Перенесённые в базу правила категоризации (миграция 027). Тесты читают их
// из файла миграции, а не из кода: в коде правил больше нет (TASK-022).
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

export function seededRules() {
  const sql = readFileSync(resolve(ROOT, 'supabase/migrations/027_categorization_rules_seed.sql'), 'utf8')
  const from = sql.indexOf("jsonb_to_recordset('") + "jsonb_to_recordset('".length
  const json = sql.slice(from, sql.indexOf("'::jsonb", from))
  return JSON.parse(json)
    .sort((a, b) => a.ord - b.ord)
    .map(r => ({
      id: r.ord, logic: 'and', category_code: r.category, action: 'categorize',
      conditions: [
        { field: r.field, operator: 'matches', value: r.pattern },
        ...(r.is_debit != null ? [{ field: 'is_debit', operator: 'equals', value: r.is_debit }] : []),
        ...(r.extra_field ? [{ field: r.extra_field, operator: 'matches', value: r.extra_pattern }] : []),
      ],
    }))
}
