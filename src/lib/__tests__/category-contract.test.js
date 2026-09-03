// Контракт кодов категорий.
// Класс бага №1 из аудита: categorize.js писал коды (marketing_smm, rent_main...),
// которых нет в таблице categories и в PNL_STRUCTURE — суммы молча выпадали из P&L.
// Этот тест сверяет коды во всех местах с каноном — миграцией 008 (таблица categories).
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve, dirname } from 'node:path'
import { CATEGORIES, KEYWORD_RULES } from '../categorize.js'

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

describe('categorize.js ↔ таблица categories', () => {
  it('каждый код CATEGORIES существует в БД', () => {
    for (const code of Object.keys(CATEGORIES)) {
      assert.ok(dbCodes.has(code), `CATEGORIES.${code} отсутствует в categories (миграция 008)`)
    }
  })

  it('каждое KEYWORD_RULES-правило пишет код, существующий в БД', () => {
    for (const rule of KEYWORD_RULES) {
      assert.ok(dbCodes.has(rule.category),
        `правило /${rule.pattern.source}/ → код ${rule.category} отсутствует в БД`)
    }
  })
})

describe('PNL_STRUCTURE ↔ таблица categories', () => {
  const pnlSrc = read('src/pages/PnLPage.jsx')
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
  const cfSrc = read('src/pages/CashFlowPage.jsx')
  const catArrays = [...cfSrc.matchAll(/const [A-Z_]+_CATS = \[([^\]]+)\]/g)]
  const cfCodes = catArrays.flatMap(m => [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map(x => x[1]))

  it('CF-группы извлеклись', () => {
    assert.equal(catArrays.length, 8)
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
