import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { PNL_STRUCTURE } from '../pnlSeed.js'
import { setPnlStructure, getPnlStructure, isPnlStructureFromDb, toStructureLine } from '../pnlStructure.js'
import { computeMonthValues } from '../pnlCompute.js'
import { setDepartments } from '../config.js'
import { FIXTURE_DEPARTMENTS } from './fixtures.js'

setDepartments(FIXTURE_DEPARTMENTS)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

// Строки из файла миграции 029 — то же, что лежит в базе
function seededLines() {
  const sql = readFileSync(resolve(ROOT, 'supabase/migrations/029_pnl_lines.sql'), 'utf8')
  const from = sql.indexOf("jsonb_to_recordset('") + "jsonb_to_recordset('".length
  return JSON.parse(sql.slice(from, sql.indexOf("'::jsonb", from)))
}

const report = (date, over = {}) => ({
  report_date: date, status: 'submitted',
  data: {
    departments: [
      { code: 'kitchen', name: 'Кухня', amount: '100000' }, { code: 'bar', name: 'Бар', amount: '80000' },
      { code: 'hookah', name: 'Кальян', amount: '70000' }, { code: 'other', name: 'Прочее', amount: '5000' },
    ],
    withdrawals: {
      suppliers_kitchen: [{ name: 'Мясо', amount: '30000' }], suppliers_bar: [{ name: 'Кола', amount: '12000' }],
      tobacco: [{ name: 'Табак', amount: '9000' }, { name: 'Аппараты', amount: '50000' }],
      payroll: [{ name: 'Техперсонал', amount: '4000' }], other: [{ name: 'Хозтовары', amount: '2500' }],
    },
    ...over,
  },
})
const tx = (date, category, amount, is_debit = true) => ({ transaction_date: date, category, amount, is_debit })
const reports = [report('2026-08-05'), report('2026-08-06')]
const bank = [
  tx('2026-08-10', 'rent_premises', 400000), tx('2026-08-11', 'util_electric', 35000),
  tx('2026-08-12', 'payroll_kitchen', 120000), tx('2026-08-13', 'mkt_target', 15000),
  tx('2026-08-14', 'income_other', 20000, false), tx('2026-08-15', 'capex_repair', 90000),
  tx('2026-08-16', 'tax_retail', 45000), tx('2026-08-17', 'bank_fee', 3000),
]

describe('структура P&L из базы (TASK-028)', () => {
  it('без загрузки отдаётся константа', () => {
    setPnlStructure([])
    assert.equal(isPnlStructureFromDb(), false)
    assert.equal(getPnlStructure().length, PNL_STRUCTURE.length)
  })

  it('строка базы превращается в форму константы без потерь', () => {
    for (const r of seededLines()) {
      const fromDb = toStructureLine(r)
      const fromCode = PNL_STRUCTURE.find(l => l.key === r.key)
      assert.ok(fromCode, `в константе нет ${r.key}`)
      assert.deepEqual(fromDb, fromCode, `расходится строка ${r.key}`)
    }
  })

  // Главный тест этапа: seed и константа дают одни цифры ключ за ключом
  it('seed из миграции даёт те же цифры, что константа', () => {
    setPnlStructure([])
    const fromCode = computeMonthValues(2026, 8, reports, bank, [])
    setPnlStructure(seededLines())
    assert.equal(isPnlStructureFromDb(), true)
    const fromDb = computeMonthValues(2026, 8, reports, bank, [])
    for (const key of Object.keys(fromCode)) {
      if (key === 'unknown_departments') continue
      assert.equal(fromDb[key], fromCode[key], `ключ ${key}: база ${fromDb[key]}, код ${fromCode[key]}`)
    }
    assert.ok(fromCode.revenue > 0 && fromCode.expenses > 0, 'фикстура должна давать ненулевой отчёт')
    setPnlStructure([])
  })

  it('скрытая строка не рисуется, но её сумма остаётся в итогах', () => {
    const rows = seededLines().map(r => (r.key === 'util_electric' ? { ...r, is_active: false } : r))
    setPnlStructure(rows)
    const v = computeMonthValues(2026, 8, reports, bank, [])
    assert.equal(v.util_electric, 35000)
    assert.ok(getPnlStructure().find(l => l.key === 'util_electric').hidden)
    assert.equal(v.utilities, 35000)
    setPnlStructure([])
  })

  it('порядок строк — по sort_order, а не по приходу из базы', () => {
    setPnlStructure([...seededLines()].reverse())
    assert.equal(getPnlStructure()[0].key, 'revenue')
    setPnlStructure([])
  })
})
