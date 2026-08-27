import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIES, KEYWORD_RULES, categorizeTransaction, parseBankStatement } from '../categorize.js'

describe('categorizeTransaction', () => {
  it('purpose-правило: высокая уверенность', () => {
    const r = categorizeTransaction({ purpose: 'Оплата за продукты кухня', beneficiary: 'ТОО Продукты' })
    assert.equal(r.category, 'cogs_kitchen')
    assert.equal(r.confidence, 'high')
  })

  it('beneficiary-правило: средняя уверенность', () => {
    const r = categorizeTransaction({ purpose: 'Оплата по счёту', beneficiary: 'ТОО 2ГИС Казахстан' })
    assert.equal(r.category, 'mkt_2gis')
    assert.equal(r.confidence, 'medium')
  })

  it('аренда → rent_premises (новый код, не rent_main)', () => {
    const r = categorizeTransaction({ purpose: 'Аренда помещения за март', beneficiary: 'ИП Арендодатель' })
    assert.equal(r.category, 'rent_premises')
  })

  it('зарплата → payroll_other (кода payroll в БД нет)', () => {
    const r = categorizeTransaction({ purpose: 'Выплата зарплаты за март', beneficiary: 'Сотрудник' })
    assert.equal(r.category, 'payroll_other')
  })

  it('внутренний перевод → internal (не internal_transfer)', () => {
    const r = categorizeTransaction({ purpose: 'Перевод со счета КазКом на депозитный счет', beneficiary: '' })
    assert.equal(r.category, 'internal')
  })

  it('ничего не совпало → uncategorized/low', () => {
    const r = categorizeTransaction({ purpose: 'xyzzy', beneficiary: 'qwerty' })
    assert.equal(r.category, 'uncategorized')
    assert.equal(r.confidence, 'low')
  })

  it('каждое правило ссылается на существующую категорию', () => {
    for (const rule of KEYWORD_RULES) {
      assert.notEqual(CATEGORIES[rule.category], undefined,
        `правило /${rule.pattern.source}/ → неизвестный код ${rule.category}`)
    }
  })
})

// Мини-выписка в формате Kaspi Business (см. комментарий в parseBankStatement)
const kaspiRows = [
  ['ТОО "RIM PARTNERS"'],                       // метаданные
  ['Выписка по счету', 'KZ123'],
  [],
  ['№', 'Дата операции', 'Дебет', 'Кредит', 'Бенефициар', 'ИИК', 'БИК', 'КНП', 'Назначение'],
  [1, 2, 3, 4, 5, 6, 7, 8, 9],                  // индексная строка — пропускается
  ['94779730', '30.01.2026 23:42:00', 150000, null, 'ТОО Поставщик Мяса\r\nИИН/БИН 123456789012', 'KZ111', 'BANKKZ', '710', 'Оплата за продукты кухня'],
  ['94779731', '31.01.2026 01:15:00', 80000, null, 'ИП Кальянщик', 'KZ222', 'BANKKZ', '710', 'Табак для кальяна'],
  ['94779732', '31.01.2026 14:00:00', null, 250000, 'Kaspi Gold', 'KZ333', 'BANKKZ', '190', 'Пополнение'],
  [null, 'Итого обороты', 230000, 250000],      // сводная строка — пропускается
  [null, 'Итого операций: 3'],
]

describe('parseBankStatement', () => {
  const parsed = parseBankStatement(kaspiRows, { cutoffHour: 6 })
  const byNum = (n) => parsed.find(t => t.number === n)

  it('находит 3 транзакции, пропуская метаданные, индексную и итоговые строки', () => {
    assert.equal(parsed.length, 3)
  })

  it('вечерняя транзакция (23:42) остаётся в своей дате', () => {
    assert.equal(byNum('94779730').date, '2026-01-30')
    assert.equal(byNum('94779730').dateRaw, '2026-01-30')
  })

  it('ночная транзакция (01:15) уходит в предыдущий операционный день', () => {
    assert.equal(byNum('94779731').date, '2026-01-30')      // операционная дата
    assert.equal(byNum('94779731').dateRaw, '2026-01-31')   // календарная — для стабильного tx_hash
  })

  it('дневная транзакция не переносится', () => {
    assert.equal(byNum('94779732').date, '2026-01-31')
  })

  it('бенефициар очищается от ИИН/БИН, БИН извлекается', () => {
    assert.equal(byNum('94779730').beneficiary, 'ТОО Поставщик Мяса')
    assert.equal(byNum('94779730').bin, '123456789012')
  })

  it('дебет/кредит и сумма', () => {
    assert.equal(byNum('94779730').isDebit, true)
    assert.equal(byNum('94779730').amount, 150000)
    assert.equal(byNum('94779732').isDebit, false)
    assert.equal(byNum('94779732').amount, 250000)
  })

  it('авто-категоризация применяется при парсинге', () => {
    assert.equal(byNum('94779730').category, 'cogs_kitchen')
    assert.equal(byNum('94779731').category, 'cogs_hookah')
  })

  it('cutoffHour 0 отключает перенос ночных транзакций', () => {
    const noShift = parseBankStatement(kaspiRows, { cutoffHour: 0 })
    assert.equal(noShift.find(t => t.number === '94779731').date, '2026-01-31')
  })
})
