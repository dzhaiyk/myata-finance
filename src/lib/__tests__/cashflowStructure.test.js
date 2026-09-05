import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import {
  CF_STRUCTURE, computeMonthCF, PAYROLL_CATS, COGS_CATS, RENT_CATS, UTIL_CATS, MKT_CATS, TAX_CATS, OPEX_OTHER_CATS,
} from '../cashflowCompute.js'
import { setCfStructure, getCfStructure, isCfStructureFromDb, cfBankGroups, toCfLine } from '../cashflowStructure.js'
import { setDepartments } from '../config.js'
import { FIXTURE_DEPARTMENTS } from './fixtures.js'

setDepartments(FIXTURE_DEPARTMENTS)
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const sql = readFileSync(resolve(ROOT, 'supabase/migrations/030_cf_lines.sql'), 'utf8')
const jsonAt = (n) => {
  let pos = -1
  for (let i = 0; i <= n; i++) pos = sql.indexOf("jsonb_to_recordset('", pos + 1)
  const from = pos + "jsonb_to_recordset('".length
  return JSON.parse(sql.slice(from, sql.indexOf("'::jsonb", from)))
}
const seedLines = () => jsonAt(0)
const seedLinks = () => jsonAt(1).map((l, i) => ({ ...l, id: i + 1 }))

const report = (date) => ({
  report_date: date, status: 'submitted',
  data: {
    revenue: [{ type: 'Наличные', amount: '150000' }],
    withdrawals: { suppliers_kitchen: [{ name: 'Мясо', amount: '30000' }], tobacco: [{ name: 'Табак', amount: '9000' }], payroll: [], other: [], cash_withdrawals: [] },
  },
})
const tx = (date, category, amount, is_debit = true) => ({ transaction_date: date, category, amount, is_debit })
const reports = [report('2026-08-05')]
const bank = [
  tx('2026-08-10', 'rent_premises', 400000), tx('2026-08-11', 'util_electric', 35000), tx('2026-08-12', 'payroll_kitchen', 120000),
  tx('2026-08-13', 'mkt_target', 15000), tx('2026-08-15', 'capex_repair', 90000), tx('2026-08-16', 'tax_retail', 45000),
  tx('2026-08-17', 'bank_fee', 3000), tx('2026-08-18', 'cogs_bar', 7000), tx('2026-08-19', 'capex_other', 1000),
]

describe('структура Cash Flow из базы (TASK-029)', () => {
  it('без загрузки — константа и прежние списки', () => {
    setCfStructure([], [])
    assert.equal(isCfStructureFromDb(), false)
    assert.equal(getCfStructure().length, CF_STRUCTURE.length)
    assert.deepEqual(cfBankGroups().cf_bank_utilities, UTIL_CATS)
  })

  it('строка базы превращается в форму константы без потерь', () => {
    for (const r of seedLines()) {
      const fromCode = CF_STRUCTURE.find(l => l.key === r.key)
      assert.ok(fromCode, `в константе нет ${r.key}`)
      assert.deepEqual(toCfLine(r), fromCode, `расходится ${r.key}`)
    }
  })

  it('привязки из seed равны прежним семи спискам', () => {
    setCfStructure(seedLines(), seedLinks())
    const g = cfBankGroups()
    assert.deepEqual(g.cf_bank_payroll, PAYROLL_CATS); assert.deepEqual(g.cf_bank_cogs, COGS_CATS)
    assert.deepEqual(g.cf_bank_rent, RENT_CATS);       assert.deepEqual(g.cf_bank_utilities, UTIL_CATS)
    assert.deepEqual(g.cf_bank_marketing, MKT_CATS);   assert.deepEqual(g.cf_bank_taxes, TAX_CATS)
    assert.deepEqual(g.cf_bank_other_opex, OPEX_OTHER_CATS)
    assert.deepEqual(g.cf_capex_repair, ['capex_repair'])
    setCfStructure([], [])
  })

  // Главный тест этапа: привязки из базы дают те же цифры, что списки в коде
  it('seed из миграции даёт те же цифры, что константы', () => {
    setCfStructure([], [])
    const fromCode = computeMonthCF(2026, 8, reports, bank, [], [])
    setCfStructure(seedLines(), seedLinks())
    const fromDb = computeMonthCF(2026, 8, reports, bank, [], [])
    for (const l of CF_STRUCTURE) assert.equal(fromDb[l.key], fromCode[l.key], `ключ ${l.key}`)
    assert.ok(fromCode.cf_bank_opex < 0 && fromCode.cf_investing < 0, 'фикстура должна давать ненулевой отчёт')
    setCfStructure([], [])
  })

  it('скрытая строка не рисуется, но остаётся в итогах', () => {
    setCfStructure(seedLines().map(r => (r.key === 'cf_bank_utilities' ? { ...r, is_active: false } : r)), seedLinks())
    const v = computeMonthCF(2026, 8, reports, bank, [], [])
    assert.equal(v.cf_bank_utilities, -35000)
    assert.ok(getCfStructure().find(l => l.key === 'cf_bank_utilities').hidden)
    assert.ok(v.cf_bank_opex <= -35000)
    setCfStructure([], [])
  })

  it('порядок — по sort_order, не по приходу из базы', () => {
    setCfStructure([...seedLines()].reverse(), seedLinks())
    assert.equal(getCfStructure()[0].key, 'cf_operating')
    setCfStructure([], [])
  })
})
