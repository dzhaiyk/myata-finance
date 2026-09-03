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

  it('движение денег банк ↔ касса ↔ эквайринг не путается с комиссией', () => {
    const kb = 'АО "KASPI BANK"'
    assert.equal(categorizeTransaction({ purpose: 'Снятия наличных в Kaspi Банкомат', beneficiary: kb, debit: 500000 }).category, 'cash_withdrawal')
    assert.equal(categorizeTransaction({ purpose: 'Комиссия за снятия наличных в Kaspi Банкомат', beneficiary: kb, debit: 4750 }).category, 'bank_fee')
    assert.equal(categorizeTransaction({ purpose: 'Взнос наличных в Kaspi Business', beneficiary: kb, credit: 200000 }).category, 'internal')
    assert.equal(categorizeTransaction({ purpose: 'Продажи с Kaspi.kz за 30/01/2026', beneficiary: kb, credit: 583989 }).category, 'acquiring_settlement')
    assert.equal(categorizeTransaction({ purpose: 'Возврат продаж с Kaspi.kz за 16/01/2026', beneficiary: kb, debit: 280000 }).category, 'acquiring_settlement')
    assert.equal(categorizeTransaction({ purpose: 'Оплата за услуги операций по картам Kaspi Gold', beneficiary: kb, debit: 3327 }).category, 'bank_fee')
    assert.equal(categorizeTransaction({ purpose: 'Расчеты по карточкам за 20/12/22', beneficiary: 'НАРОДНЫЙ СБЕРЕГАТЕЛЬНЫЙ БАНК', credit: 90000 }).category, 'acquiring_settlement')
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

describe('новые формулировки Kaspi (2026)', () => {
  it('перевод депозит ↔ Kaspi Pay без «интернет отделения» → internal', () => {
    const kb = 'ИП AHMETKALI'
    assert.equal(categorizeTransaction({ purpose: 'Перевод с Депозита U34948588-002 от 31/05/2026 на счет Kaspi Pay', beneficiary: kb, credit: 2700000 }).category, 'internal')
    assert.equal(categorizeTransaction({ purpose: 'Перевод со счета Kaspi Pay на Депозит U34948588-002 от 31/05/2026', beneficiary: kb, debit: 2000000 }).category, 'internal')
  })

  it('«Хозка» в назначении → household', () => {
    const r = categorizeTransaction({ purpose: 'За товары. Оплата за 04.05. Хозка.', beneficiary: 'ИП Tiger Sharks', debit: 155095 })
    assert.equal(r.category, 'household')
  })
})

describe('решения аудита 03.09.2026', () => {
  it('перевод собственных средств на карту учредителя → cash_withdrawal (не дивиденды)', () => {
    const r = categorizeTransaction({ purpose: 'Перевод собственных средств на карту Kaspi Gold *0291', beneficiary: 'Алмаз А.', debit: 1500000 })
    assert.equal(r.category, 'cash_withdrawal')
  })
  it('ИПН ИП «не облагаемых у источника» → tax_retail, ИПН с зарплат → tax_payroll', () => {
    assert.equal(categorizeTransaction({ purpose: 'ИПН с доходов, не облагаемых у источника выплаты за август 2026г', beneficiary: 'УГД по Бостандыкскому району', debit: 1745000 }).category, 'tax_retail')
    assert.equal(categorizeTransaction({ purpose: 'ИПН с доходов, облагаемых у источника выплаты за июль 2026г', beneficiary: 'УГД по Жетысускому району', debit: 39600 }).category, 'tax_payroll')
  })
  it('страхование жизни сотрудников (Nomad Life) → tax_insurance', () => {
    assert.equal(categorizeTransaction({ purpose: 'За страховую премия (взнос) по страхованию жизни. Оплата по счету', beneficiary: 'АО "Компания по страхованию жизни "Nomad Life"', debit: 85000 }).category, 'tax_insurance')
  })
  it('«Фин помощь» от учредителя (кредит) → internal', () => {
    assert.equal(categorizeTransaction({ purpose: 'Фин помощь. Пополнение', beneficiary: 'Ахметқали Алмаз Маратұлы', credit: 3000000 }).category, 'internal')
  })
  it('СМР / дизайнер → capex_repair, мебель → capex_furniture, меню → opex_menu, крафт-пакеты → household', () => {
    assert.equal(categorizeTransaction({ purpose: 'За услуги по ремонту товаров и техническому обслуживанию. Оплата по счету #3 Строительно монтажные работы.', beneficiary: 'ИП "Esko Group"', debit: 5000000 }).category, 'capex_repair')
    assert.equal(categorizeTransaction({ purpose: 'За профессиональные, научные и технические услуги. Оплата по счету #01 Аванс за услуги дизайнера.', beneficiary: 'ИП ELZAT MUQASH', debit: 800000 }).category, 'capex_repair')
    assert.equal(categorizeTransaction({ purpose: 'За профессиональные, научные и технические услуги. Изготовление и установка мебели.', beneficiary: 'ИП ЖАНАТОВА Л.Е.', debit: 1114652 }).category, 'capex_furniture')
    assert.equal(categorizeTransaction({ purpose: 'За профессиональные, научные и технические услуги. Подписка на бесконтактное меню.', beneficiary: 'ТОО KAMI GROUP', debit: 75000 }).category, 'opex_menu')
    assert.equal(categorizeTransaction({ purpose: 'За товары. Оплата по счету#7 от 18.06.26г Крафт пакеты.', beneficiary: 'ИП МҰХАМЕТЖАН', debit: 66000 }).category, 'household')
  })
})
