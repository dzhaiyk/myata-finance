import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORIES, categorizeTransaction, parseBankStatement } from '../categorize.js'
import { applyDbRules } from '../bankImport.js'
import { seededRules } from './fixtures.js'

const RULES = seededRules()

// Правила переехали в базу (миграция 027), поэтому проверяются через движок
// правил на наборе из файла миграции — то же, что применяется в приложении.
const cat = (tx) => applyDbRules({ beneficiary: '', purpose: '', is_debit: true, ...tx }, RULES)?.category
    || 'uncategorized'

describe('категоризация по правилам из базы', () => {
  it('правило по назначению платежа', () => {
    assert.equal(cat({ purpose: 'Оплата за продукты кухня', beneficiary: 'ТОО Продукты' }), 'cogs_kitchen')
  })

  it('правило по получателю', () => {
    assert.equal(cat({ purpose: 'Оплата по счёту', beneficiary: 'ТОО 2ГИС Казахстан' }), 'mkt_2gis')
  })

  it('аренда → rent_premises (новый код, не rent_main)', () => {
    assert.equal(cat({ purpose: 'Аренда помещения за март', beneficiary: 'ИП Абласанов Ж.Б.' }), 'rent_premises')
  })

  it('зарплата → payroll_other (кода payroll в БД нет)', () => {
    assert.equal(cat({ purpose: 'Выплата зарплаты за март', beneficiary: 'Сотрудник' }), 'payroll_other')
  })

  it('внутренний перевод → internal (не internal_transfer)', () => {
    assert.equal(cat({ purpose: 'Перевод со счета КазКом на депозитный счет' }), 'internal')
  })

  it('движение денег банк ↔ касса ↔ эквайринг не путается с комиссией', () => {
    const kb = 'АО "KASPI BANK"'
    assert.equal(cat({ purpose: 'Снятия наличных в Kaspi Банкомат', beneficiary: kb }), 'cash_withdrawal')
    assert.equal(cat({ purpose: 'Комиссия за снятия наличных в Kaspi Банкомат', beneficiary: kb }), 'bank_fee')
    assert.equal(cat({ purpose: 'Взнос наличных в Kaspi Business', beneficiary: kb, is_debit: false }), 'internal')
    assert.equal(cat({ purpose: 'Продажи с Kaspi.kz за 30/01/2026', beneficiary: kb, is_debit: false }), 'acquiring_settlement')
    assert.equal(cat({ purpose: 'Возврат продаж с Kaspi.kz за 16/01/2026', beneficiary: kb }), 'acquiring_settlement')
    assert.equal(cat({ purpose: 'Оплата за услуги операций по картам Kaspi Gold', beneficiary: kb }), 'bank_fee')
    assert.equal(cat({ purpose: 'Расчеты по карточкам за 20/12/22', beneficiary: 'НАРОДНЫЙ СБЕРЕГАТЕЛЬНЫЙ БАНК', is_debit: false }), 'acquiring_settlement')
  })

  // Направление решает: одно и то же имя даёт разные категории
  it('Kaspi Pay: кредит — зачисление эквайринга, дебет — комиссия', () => {
    assert.equal(cat({ beneficiary: 'Kaspi Pay', is_debit: false }), 'acquiring_settlement')
    assert.equal(cat({ beneficiary: 'Kaspi Pay', is_debit: true }), 'bank_fee')
  })

  it('ничего не совпало → uncategorized', () => {
    assert.equal(cat({ purpose: 'xyzzy', beneficiary: 'qwerty' }), 'uncategorized')
  })

  it('разбор файла категорию не ставит — это делает движок правил', () => {
    const r = categorizeTransaction({ purpose: 'Оплата за продукты кухня' })
    assert.equal(r.category, 'uncategorized')
    assert.equal(r.confidence, 'low')
  })

  it('каждое правило ссылается на существующую категорию', () => {
    for (const rule of RULES) {
      assert.notEqual(CATEGORIES[rule.category_code], undefined,
        `правило ${rule.id} → неизвестный код ${rule.category_code}`)
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

  // Категорию ставит движок правил из базы, а не разбор файла (миграция 027)
  it('разбор оставляет строки без категории, правила решают дальше', () => {
    assert.equal(byNum('94779730').category, 'uncategorized')
    assert.equal(cat({ purpose: byNum('94779730').purpose }), 'cogs_kitchen')
    assert.equal(cat({ purpose: byNum('94779731').purpose }), 'cogs_hookah')
  })

  it('cutoffHour 0 отключает перенос ночных транзакций', () => {
    const noShift = parseBankStatement(kaspiRows, { cutoffHour: 0 })
    assert.equal(noShift.find(t => t.number === '94779731').date, '2026-01-31')
  })
})

describe('новые формулировки Kaspi (2026)', () => {
  it('перевод депозит ↔ Kaspi Pay без «интернет отделения» → internal', () => {
    const kb = 'ИП AHMETKALI'
    assert.equal(cat({ purpose: 'Перевод с Депозита U34948588-002 от 31/05/2026 на счет Kaspi Pay', beneficiary: kb, is_debit: false }), 'internal')
    assert.equal(cat({ purpose: 'Перевод со счета Kaspi Pay на Депозит U34948588-002 от 31/05/2026', beneficiary: kb, is_debit: true }), 'internal')
  })

  it('«Хозка» в назначении → household', () => {
    const category = cat({ purpose: 'За товары. Оплата за 04.05. Хозка.', beneficiary: 'ИП Tiger Sharks', is_debit: true })
    assert.equal(category, 'household')
  })
})

describe('решения аудита 03.09.2026', () => {
  it('перевод собственных средств на карту учредителя → cash_withdrawal (не дивиденды)', () => {
    const category = cat({ purpose: 'Перевод собственных средств на карту Kaspi Gold *0291', beneficiary: 'Алмаз А.', is_debit: true })
    assert.equal(category, 'cash_withdrawal')
  })
  it('ИПН ИП «не облагаемых у источника» → tax_retail, ИПН с зарплат → tax_payroll', () => {
    assert.equal(cat({ purpose: 'ИПН с доходов, не облагаемых у источника выплаты за август 2026г', beneficiary: 'УГД по Бостандыкскому району', is_debit: true }), 'tax_retail')
    assert.equal(cat({ purpose: 'ИПН с доходов, облагаемых у источника выплаты за июль 2026г', beneficiary: 'УГД по Жетысускому району', is_debit: true }), 'tax_payroll')
  })
  it('страхование жизни сотрудников (Nomad Life) → tax_insurance', () => {
    assert.equal(cat({ purpose: 'За страховую премия (взнос) по страхованию жизни. Оплата по счету', beneficiary: 'АО "Компания по страхованию жизни "Nomad Life"', is_debit: true }), 'tax_insurance')
  })
  it('«Фин помощь» от учредителя (кредит) → internal', () => {
    assert.equal(cat({ purpose: 'Фин помощь. Пополнение', beneficiary: 'Ахметқали Алмаз Маратұлы', is_debit: false }), 'internal')
  })
  it('СМР / дизайнер → capex_repair, мебель → capex_furniture, меню → opex_menu, крафт-пакеты → household', () => {
    assert.equal(cat({ purpose: 'За услуги по ремонту товаров и техническому обслуживанию. Оплата по счету #3 Строительно монтажные работы.', beneficiary: 'ИП "Esko Group"', is_debit: true }), 'capex_repair')
    assert.equal(cat({ purpose: 'За профессиональные, научные и технические услуги. Оплата по счету #01 Аванс за услуги дизайнера.', beneficiary: 'ИП ELZAT MUQASH', is_debit: true }), 'capex_repair')
    assert.equal(cat({ purpose: 'За профессиональные, научные и технические услуги. Изготовление и установка мебели.', beneficiary: 'ИП ЖАНАТОВА Л.Е.', is_debit: true }), 'capex_furniture')
    assert.equal(cat({ purpose: 'За профессиональные, научные и технические услуги. Подписка на бесконтактное меню.', beneficiary: 'ТОО KAMI GROUP', is_debit: true }), 'opex_menu')
    assert.equal(cat({ purpose: 'За товары. Оплата по счету#7 от 18.06.26г Крафт пакеты.', beneficiary: 'ИП МҰХАМЕТЖАН', is_debit: true }), 'household')
  })
})

describe('ответы учредителя 03.09.2026 (вечер)', () => {
  it('ИП Дюсебекова — бухгалтер → payroll_mgmt', () => {
    const category = cat({ purpose: 'За профессиональные, научные и технические услуги. Оплата за оказание услуг', beneficiary: 'ИП Дюсебекова А.А.', is_debit: true })
    assert.equal(category, 'payroll_mgmt')
  })
})

describe('прочий доход на счёт (04.09.2026)', () => {
  it('поступление от арендатора станций зарядки → income_other', () => {
    const category = cat({
      purpose: 'Оплата по Договору №523 от 01.07.2025 за октябрь 25 г. Платежи по лизингу (текущая аренда)',
      beneficiary: 'ЧК PowerBNK Ltd.', is_debit: false,
    })
    assert.equal(category, 'income_other')
  })

  it('платёж в их адрес (дебет) прочим доходом не считается', () => {
    const category = cat({
      purpose: 'Оплата по Договору №523 за аренду оборудования', beneficiary: 'ЧК PowerBNK Ltd.', is_debit: true,
    })
    assert.notEqual(category, 'income_other')
  })
})

describe('аренда и налог на имущество (04.09.2026)', () => {
  it('аренда засчитывается только платежам арендодателю', () => {
    assert.equal(cat({
      purpose: 'За аренду/лизинг. Аренда за Август 2026.', beneficiary: 'ИП Абласанов Ж. Б.', is_debit: true,
    }), 'rent_premises')
    // тот же текст, но другой получатель — в аренду помещения не попадает
    assert.notEqual(cat({
      purpose: 'Оплата за аренду оборудования', beneficiary: 'ТОО Прокат', is_debit: true,
    }), 'rent_premises')
  })

  it('возмещение налога на имущество не уходит в аренду', () => {
    const category = cat({
      purpose: 'За аренду/лизинг. Возмещение налога на имущество за 2024 год.',
      beneficiary: 'ИП Абласанов Ж.Б.', is_debit: true,
    })
    assert.equal(category, 'rent_property_tax')
  })

  it('аренда лайтбокса — склад/кровля, а не помещение', () => {
    assert.equal(cat({
      purpose: 'Оплата по счету#84 от 03.07.26г. Аренда лайтбокса июль.', beneficiary: 'ОСИ "ЖК 4YOU"', is_debit: true,
    }), 'rent_warehouse')
  })
})
