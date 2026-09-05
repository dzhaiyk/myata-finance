// Контракт кодов категорий.
// Класс бага №1 из аудита: categorize.js писал коды (marketing_smm, rent_main...),
// которых нет в таблице categories и в PNL_STRUCTURE — суммы молча выпадали из P&L.
// Этот тест сверяет коды во всех местах с каноном — миграциями таблицы categories.
// Списка категорий в коде больше нет (TASK-026): приложение читает справочник.
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { NON_PNL_CATEGORIES } from '../categories.js'
import { seededRules } from './fixtures.js'
import { PAYROLL_CATEGORIES } from '../config.js'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const read = (p) => readFileSync(resolve(root, p), 'utf8')

// Канон: коды из INSERT в миграцию categories — базовый набор (008)
// плюс добавленные позднее (021: acquiring_settlement).
// При добавлении новой категории миграцией — дописать файл сюда.
const CATEGORY_MIGRATIONS = [
  'supabase/migrations/008_dynamic_categories.sql',
  'supabase/migrations/021_closed_loop_bank.sql',
  'supabase/migrations/022_cash_withdrawal_category.sql',
]
const dbCodes = new Set(
  CATEGORY_MIGRATIONS.flatMap(f => {
    const sql = read(f)
    // INSERT INTO categories: строки ('code', 'name', ...) или VALUES ('code', ...)
    return [...sql.matchAll(/(?:^\s*|VALUES\s*)\('([a-z0-9_]+)',\s*'/gm)].map(m => m[1])
  })
)

describe('канон — миграция 008', () => {
  it('коды категорий извлеклись из SQL', () => {
    assert.ok(dbCodes.size > 40, `извлечено только ${dbCodes.size} кодов`)
    assert.ok(dbCodes.has('mkt_smm'))
    assert.ok(dbCodes.has('rent_premises'))
    assert.ok(dbCodes.has('internal'))
  })
})

describe('код ↔ таблица categories', () => {
  // Единственный список кодов, оставшийся в коде, — служебные категории вне P&L
  it('каждая служебная категория (вне P&L) существует в БД', () => {
    for (const code of NON_PNL_CATEGORIES) {
      assert.ok(dbCodes.has(code), `NON_PNL_CATEGORIES.${code} отсутствует в categories`)
    }
  })

  // Правила живут в базе (миграция 027), читаем их из файла миграции
  it('каждое перенесённое правило пишет код, существующий в БД', () => {
    const rules = seededRules()
    assert.equal(rules.length, 70)
    for (const rule of rules) {
      assert.ok(dbCodes.has(rule.category_code),
        `правило ${rule.id} → код ${rule.category_code} отсутствует в БД`)
    }
  })
})

describe('PNL_STRUCTURE ↔ таблица categories', () => {
  const pnlSrc = read('src/lib/pnlSeed.js')   // seed структуры P&L (миграция 029); живая — в базе
  const sourceCodes = [...pnlSrc.matchAll(/source:\s*'(?:bank|both):([a-z0-9_]+)'/g)].map(m => m[1])

  it('bank:/both: коды извлеклись', () => {
    assert.ok(sourceCodes.length > 30, `извлечено только ${sourceCodes.length}`)
  })

  it('каждый bank:/both: код существует в БД', () => {
    for (const code of sourceCodes) {
      assert.ok(dbCodes.has(code), `PNL_STRUCTURE source-код ${code} отсутствует в categories`)
    }
  })
})

describe('CashFlowPage группы категорий ↔ таблица categories', () => {
  const cfSrc = read('src/lib/cashflowCompute.js')   // расчёт CF переехал из страницы (TASK-029)
  const catArrays = [...cfSrc.matchAll(/(?:export )?const [A-Z_]+_CATS = \[([^\]]+)\]/g)]
  // PAYROLL_CATS переехал в config.js (TASK-017): в исходнике страницы его больше
  // нет литералом, поэтому коды ФОТ берём из общего списка
  const cfCodes = [
    ...catArrays.flatMap(m => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map(x => x[1])),
    ...PAYROLL_CATEGORIES,
  ]

  it('CF-группы извлеклись', () => {
    assert.equal(catArrays.length, 7)
    assert.ok(cfCodes.length > 30)
  })

  it('каждый код CF-групп существует в БД', () => {
    for (const code of cfCodes) {
      assert.ok(dbCodes.has(code), `CF-код ${code} отсутствует в categories`)
    }
  })
})

describe('миграция 019 (перекодировка) ↔ таблица categories', () => {
  const remapSql = read('supabase/migrations/019_fix_category_codes.sql')
  const newCodes = [...remapSql.matchAll(/\('([a-z0-9_]+)',\s*'([a-z0-9_]+)'\)/g)].map(m => m[2])

  it('каждый новый код перекодировки существует в БД', () => {
    assert.ok(newCodes.length > 15, `извлечено только ${newCodes.length}`)
    for (const code of newCodes) {
      assert.ok(dbCodes.has(code), `019 перекодирует в ${code}, которого нет в categories`)
    }
  })
})
