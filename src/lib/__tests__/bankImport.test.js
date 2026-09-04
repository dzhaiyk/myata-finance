import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  generateTxHash, matchCondition, applyDbRules, withConditions, monthBounds,
  buildImportRows, splitDuplicates, summarizeImport, statementFreshness,
  formatStatementUploadNotification, commitImport, stageStatement,
} from '../bankImport.js'

const parsedTx = (over = {}) => ({
  date: '2026-09-02', dateRaw: '2026-09-03', number: '1001', debit: 150000, credit: 0,
  beneficiary: 'ТОО Поставщик', purpose: 'Оплата за продукты', knp: '710',
  category: 'cogs_kitchen', confidence: 'high', isDebit: true, amount: 150000, ...over,
})

describe('Хеш операции', () => {
  it('строится по календарной дате: операционная дата хеш не меняет', async () => {
    const a = await generateTxHash(parsedTx({ date: '2026-09-02' }))
    const b = await generateTxHash(parsedTx({ date: '2026-09-03' }))
    assert.equal(a, b)
    assert.equal(a.length, 24)
  })
  it('другая сумма — другой хеш', async () => {
    assert.notEqual(await generateTxHash(parsedTx()), await generateTxHash(parsedTx({ amount: 1 })))
  })
})

describe('Правила из базы', () => {
  const rules = withConditions(
    [
      { id: 1, logic: 'and', category_code: 'rent_premises', action: 'categorize' },
      { id: 2, logic: 'or', category_code: null, action: 'hide' },
      { id: 3, logic: 'and', category_code: 'x', action: 'categorize' }, // без условий — пропускается
    ],
    [
      { rule_id: 1, field: 'purpose', operator: 'contains', value: 'аренд' },
      { rule_id: 1, field: 'beneficiary', operator: 'contains', value: 'абласанов' },
      { rule_id: 2, field: 'purpose', operator: 'starts_with', value: 'Перевод между' },
      { rule_id: 2, field: 'amount', operator: 'between', value: '1-5' },
    ],
  )

  it('«и»: оба условия обязательны, регистр не важен', () => {
    assert.equal(applyDbRules(parsedTx({ purpose: 'Аренда за сентябрь', beneficiary: 'ИП Абласанов' }), rules).category, 'rent_premises')
    assert.equal(applyDbRules(parsedTx({ purpose: 'Аренда за сентябрь', beneficiary: 'ИП Другой' }), rules), null)
  })
  it('«или»: достаточно одного условия, действие «скрыть»', () => {
    assert.equal(applyDbRules(parsedTx({ purpose: 'Перевод между счетами' }), rules).action, 'hide')
    assert.equal(applyDbRules(parsedTx({ amount: 3 }), rules).action, 'hide')
  })
  it('условие по направлению понимает и isDebit, и is_debit', () => {
    const cond = { field: 'is_debit', operator: 'equals', value: 'false' }
    assert.equal(matchCondition({ isDebit: false }, cond), true)
    assert.equal(matchCondition({ is_debit: true }, cond), false)
  })
})

describe('Подготовка строк к записи', () => {
  it('правило из базы важнее ключевого слова, скрытые строки выбрасываются', async () => {
    const rules = withConditions(
      [{ id: 1, logic: 'and', category_code: 'opex_household', action: 'categorize' }, { id: 2, logic: 'and', category_code: null, action: 'hide' }],
      [{ rule_id: 1, field: 'beneficiary', operator: 'contains', value: 'Поставщик' }, { rule_id: 2, field: 'purpose', operator: 'contains', value: 'скрыть' }],
    )
    const { rows, hidden } = await buildImportRows([parsedTx(), parsedTx({ purpose: 'скрыть это', beneficiary: 'Другой' })], { rules, accountId: 2, fileName: 'a.xlsx', batchId: 'b1' })
    assert.equal(hidden, 1)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].category, 'opex_household')
    assert.equal(rows[0].confidence, 'auto')
    assert.equal(rows[0].account_id, 2)
    assert.equal(rows[0].period_from, '2026-09-01')
    assert.equal(rows[0].period_to, '2026-09-30')
  })
  it('без правила — категория парсера, без категории — uncategorized', async () => {
    const { rows } = await buildImportRows([parsedTx(), parsedTx({ category: undefined, confidence: undefined })], { accountId: 2 })
    assert.equal(rows[0].category, 'cogs_kitchen')
    assert.equal(rows[1].category, 'uncategorized')
    assert.equal(rows[1].confidence, 'low')
  })
  it('границы месяца: февраль', () => {
    assert.deepEqual(monthBounds('2026-02-10'), { period_from: '2026-02-01', period_to: '2026-02-28' })
  })
  it('дубли по хешу отбрасываются', () => {
    const { fresh, duplicates } = splitDuplicates([{ tx_hash: 'a' }, { tx_hash: 'b' }, { tx_hash: null }], ['b'])
    assert.equal(duplicates, 1)
    assert.deepEqual(fresh.map(r => r.tx_hash), ['a', null])
  })
})

describe('Итог загрузки и свежесть', () => {
  it('summarizeImport считает период, нераспознанные и обороты', () => {
    const s = summarizeImport([
      { transaction_date: '2026-09-02', category: 'uncategorized', is_debit: true, amount: '100' },
      { transaction_date: '2026-09-01', category: 'cogs_bar', is_debit: false, amount: 40 },
    ])
    assert.deepEqual(s, { total: 2, from: '2026-09-01', to: '2026-09-02', uncategorized: 1, debit: 100, credit: 40 })
  })
  it('свежесть: вчера — ок, неделю назад — нет, никогда — never', () => {
    const now = new Date('2026-09-04T12:00:00')
    assert.equal(statementFreshness('2026-09-03', now).ok, true)
    assert.equal(statementFreshness('2026-08-28', now).ok, false)
    assert.equal(statementFreshness(null, now).never, true)
  })
  it('текст для Telegram', () => {
    const t = formatStatementUploadNotification({ accountName: 'Kaspi ИП', manager: 'Айгерим', from: '2026-09-02', to: '2026-09-03', total: 12, duplicates: 9, uncategorized: 2, balanceOk: true })
    assert.match(t, /Kaspi ИП/)
    assert.match(t, /02\.09\.2026 — 03\.09\.2026/)
    assert.match(t, /Новых операций: 12, уже были: 9/)
    assert.match(t, /Остатки сошлись/)
    assert.match(t, /Нужна категоризация/)
    assert.doesNotMatch(formatStatementUploadNotification({ accountName: 'x', total: 1 }), /категоризация|Остатки/)
  })
})

// Заглушка Supabase: цепочка вызовов, ответ задаётся на .insert/.select
function fakeSupabase({ existingHashes = [], insertError = null } = {}) {
  const writes = { bank: [], acct: [] }
  const chain = (result) => {
    const q = {}
    for (const m of ['select', 'eq', 'in', 'order', 'limit', 'insert', 'single']) q[m] = () => q
    q.then = (res, rej) => Promise.resolve(result).then(res, rej)
    return q
  }
  const client = {
    from(table) {
      return {
        select: () => ({
          eq: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }),
          in: async () => ({ data: existingHashes.map(h => ({ tx_hash: h })) }),
        }),
        insert: (rows) => {
          if (table === 'bank_transactions') {
            const list = Array.isArray(rows) ? rows : [rows]
            if (insertError && Array.isArray(rows)) return { select: async () => ({ data: null, error: insertError }) }
            const data = list.map((r, i) => ({ ...r, id: writes.bank.length + i + 1 }))
            writes.bank.push(...data)
            return { select: () => ({ single: async () => ({ data: data[0], error: null }), then: (res) => res({ data, error: null }) }) }
          }
          writes.acct.push(...rows)
          return Promise.resolve({ error: null })
        },
      }
    },
    writes,
  }
  return client
}

describe('Запись в базу', () => {
  it('каждая строка выписки создаёт движение по счёту с привязкой к операции', async () => {
    const sb = fakeSupabase()
    const { inserted, skipped } = await commitImport(sb, [
      { account_id: 2, transaction_date: '2026-09-02', is_debit: true, amount: 100, beneficiary: 'A', category: 'uncategorized' },
      { account_id: 2, transaction_date: '2026-09-02', is_debit: false, amount: 50, beneficiary: '', purpose: 'Возврат', category: 'cogs_bar' },
    ])
    assert.equal(inserted.length, 2)
    assert.equal(skipped, 0)
    assert.equal(sb.writes.acct.length, 2)
    assert.deepEqual(sb.writes.acct.map(t => [t.type, t.amount, t.reference_id, t.description]),
      [['expense', 100, '1', 'A'], ['income', 50, '2', 'Возврат']])
  })
  it('уникальный хеш в пакете → построчная вставка, дубль пропущен', async () => {
    const sb = fakeSupabase({ insertError: { message: 'duplicate key value violates unique constraint' } })
    const { inserted, skipped } = await commitImport(sb, [{ account_id: 2, amount: 1, is_debit: true }, { account_id: 2, amount: 2, is_debit: true }])
    assert.equal(inserted.length + skipped, 2)
  })
  it('пустой список ничего не пишет', async () => {
    const sb = fakeSupabase()
    assert.deepEqual(await commitImport(sb, []), { inserted: [], skipped: 0 })
    assert.equal(sb.writes.bank.length, 0)
  })
  it('stageStatement без счёта отказывает до чтения файла', async () => {
    await assert.rejects(() => stageStatement(fakeSupabase(), { name: 'x.xlsx', data: new ArrayBuffer(0) }, {}), /Не выбран счёт/)
  })
})
