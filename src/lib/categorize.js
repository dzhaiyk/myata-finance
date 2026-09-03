// Auto-categorization rules for bank statement imports
// Priority: keyword in purpose > beneficiary pattern > KNP code
// ВАЖНО: коды категорий обязаны совпадать с таблицей categories (миграция 008)
// и с PNL_STRUCTURE/CF-группами. Не вводить новые коды без миграции.
import { businessDateFromParts } from './dates.js'

export const CATEGORIES = {
  // Revenue
  income_kaspi: { label: 'Доход Kaspi', group: 'revenue', pnl: null },
  income_cash: { label: 'Доход наличные', group: 'revenue', pnl: null },
  income_halyk: { label: 'Доход Halyk', group: 'revenue', pnl: null },
  income_other: { label: 'Прочий доход', group: 'revenue', pnl: null },

  // COGS
  cogs_kitchen: { label: 'Закуп кухня', group: 'cogs', pnl: 'Закуп кухня' },
  cogs_bar: { label: 'Закуп бар', group: 'cogs', pnl: 'Закуп бар' },
  cogs_hookah: { label: 'Закуп кальян', group: 'cogs', pnl: 'Закуп кальян' },

  // Payroll
  payroll_mgmt: { label: 'ФОТ Менеджмент', group: 'payroll', pnl: 'ФОТ Менеджмент' },
  payroll_kitchen: { label: 'ФОТ Кухня', group: 'payroll', pnl: 'ФОТ Кухня' },
  payroll_bar: { label: 'ФОТ Бар', group: 'payroll', pnl: 'ФОТ Бар' },
  payroll_hookah: { label: 'ФОТ Кальян', group: 'payroll', pnl: 'ФОТ Кальян' },
  payroll_hall: { label: 'ФОТ Зал', group: 'payroll', pnl: 'ФОТ Зал' },
  payroll_transport: { label: 'Развозка', group: 'payroll', pnl: 'Развозка' },
  payroll_other: { label: 'ФОТ Прочее', group: 'payroll', pnl: 'ФОТ Прочее' },

  // Marketing
  mkt_smm: { label: 'Маркетинг — СММ', group: 'marketing', pnl: 'СММ' },
  mkt_target: { label: 'Маркетинг — Таргет', group: 'marketing', pnl: 'Таргет' },
  mkt_2gis: { label: 'Маркетинг — 2ГИС', group: 'marketing', pnl: '2ГИС' },
  mkt_yandex: { label: 'Маркетинг — Яндекс', group: 'marketing', pnl: 'Яндекс' },
  mkt_google: { label: 'Маркетинг — Google', group: 'marketing', pnl: 'Google' },
  mkt_other: { label: 'Маркетинг — Прочее', group: 'marketing', pnl: 'Маркетинг прочее' },

  // Rent
  rent_premises: { label: 'Аренда помещения', group: 'rent', pnl: 'Аренда помещения' },
  rent_warehouse: { label: 'Аренда склада/кровли', group: 'rent', pnl: 'Аренда склада и кровли' },
  rent_property_tax: { label: 'Налог на недвижимость', group: 'rent', pnl: 'Налог на недвижимость' },

  // Utilities
  util_electric: { label: 'Электричество', group: 'utilities', pnl: 'Электричество' },
  util_water: { label: 'Водоснабжение', group: 'utilities', pnl: 'Водоснабжение' },
  util_heating: { label: 'Отопление', group: 'utilities', pnl: 'Отопление' },
  util_bi: { label: 'BI Service', group: 'utilities', pnl: 'BI Service' },
  util_internet: { label: 'Интернет и связь', group: 'utilities', pnl: 'Интернет и связь' },
  util_waste: { label: 'Вывоз мусора', group: 'utilities', pnl: 'Вывоз мусора' },
  util_other: { label: 'Ком.услуги прочее', group: 'utilities', pnl: 'Ком.услуги прочее' },

  // Other OpEx
  household: { label: 'Хозтовары', group: 'opex_other', pnl: 'Хозтовары' },
  bank_fee: { label: 'Комиссии банка', group: 'opex_other', pnl: 'Комиссии банка/эквайринг' },
  opex_security: { label: 'Система безопасности', group: 'opex_other', pnl: 'Система безопасности' },
  opex_software: { label: 'Программное обеспечение', group: 'opex_other', pnl: 'Программное обеспечение' },
  opex_menu: { label: 'Меню', group: 'opex_other', pnl: 'Меню' },
  opex_pest: { label: 'Дератизация', group: 'opex_other', pnl: 'Дератизация/дезинсекция' },
  opex_grease: { label: 'Чистка жироуловителей', group: 'opex_other', pnl: 'Чистка жироуловителей' },
  opex_repair: { label: 'Мелкий ремонт', group: 'opex_other', pnl: 'Мелкий ремонт' },
  opex_uniform: { label: 'Форма персонала', group: 'opex_other', pnl: 'Форма для персонала' },
  opex_music: { label: 'Авторские права (КАО)', group: 'opex_other', pnl: 'Авторские права на музыку (КАО)' },
  opex_royalty: { label: 'Роялти', group: 'opex_other', pnl: 'Роялти' },
  opex_misc: { label: 'Прочие OpEx', group: 'opex_other', pnl: 'Прочее' },

  // Taxes
  tax_retail: { label: 'Розничный налог', group: 'taxes', pnl: 'Розничный налог' },
  tax_payroll: { label: 'Налоги по зарплате', group: 'taxes', pnl: 'Налоги по зарплате' },
  tax_insurance: { label: 'Страхование сотрудников', group: 'taxes', pnl: 'Страхование сотрудников' },
  tax_alcohol: { label: 'Лицензия на алкоголь', group: 'taxes', pnl: 'Лицензия на алкоголь' },
  tax_hookah: { label: 'Лицензия на кальян', group: 'taxes', pnl: 'Лицензия на кальян' },
  tax_other: { label: 'Налоги прочее', group: 'taxes', pnl: 'Налоги прочее' },

  // CapEx
  capex_repair: { label: 'Ремонт (CapEx)', group: 'capex', pnl: 'Ремонт' },
  capex_furniture: { label: 'Мебель и техника', group: 'capex', pnl: 'Мебель и техника' },
  capex_other: { label: 'CapEx прочее', group: 'capex', pnl: 'CAPEX прочее' },

  // Cash flow only
  dividends: { label: 'Дивиденды', group: 'dividends', pnl: null },
  internal: { label: 'Внутренний перевод', group: 'internal', pnl: null },
  acquiring_settlement: { label: 'Зачисление эквайринга', group: 'acquiring', pnl: null },
  cash_withdrawal: { label: 'Снятие наличных со счёта', group: 'internal', pnl: null },
  uncategorized: { label: '❓ Не распознано', group: 'uncategorized', pnl: null },
}

// Keyword rules: check purpose field first, then beneficiary
// Order matters — first match wins
export const KEYWORD_RULES = [
  // Движение денег банк ↔ касса ↔ эквайринг — раньше эти строки попадали в «комиссию банка»
  // или в «зачисление эквайринга» и искажали P&L/CF. Проверяются первыми.
  { field: 'purpose', pattern: /взнос наличных/i, category: 'internal' },                 // касса → счёт
  { field: 'purpose', pattern: /комисси\S* за снят/i, category: 'bank_fee' },             // раньше самого снятия!
  { field: 'purpose', pattern: /снят\S* наличных/i, category: 'cash_withdrawal' },       // счёт → наличные (куда — решает пользователь)
  { field: 'purpose', pattern: /возврат продаж/i, category: 'acquiring_settlement' },      // возврат покупателю по карте (дебет)
  { field: 'purpose', pattern: /продажи с kaspi/i, category: 'acquiring_settlement' },     // зачисление выручки Kaspi Pay
  { field: 'purpose', pattern: /расчеты по карточкам/i, category: 'acquiring_settlement' }, // зачисление эквайринга Halyk
  { field: 'purpose', pattern: /пополнение с терминала/i, category: 'acquiring_settlement' }, // зачисление POS Halyk (выписка по счёту)
  { field: 'purpose', pattern: /комисси\S* за операци/i, category: 'bank_fee' },           // «Комиссия за операцию …» в выписке Halyk
  // Поступления не от эквайринга: субаренда места под станции зарядки. Правило
  // должно стоять выше правила «аренда» по назначению, иначе доход уйдёт в расход.
  { field: 'beneficiary', pattern: /PowerBNK/i, isDebit: false, category: 'income_other' }, // арендатор станций зарядки платит нам (ответ 04.09.2026)
  { field: 'purpose', pattern: /перевод собственных средств на карту/i, category: 'cash_withdrawal' }, // обналичка через карту учредителя (ответ 03.09.2026)
  { field: 'purpose', pattern: /ИПН с доходов, не облагаемых/i, category: 'tax_retail' },     // налог ИП с дохода — не ФОТ (ответ 03.09.2026)
  { field: 'purpose', pattern: /страхован\S* жизни/i, category: 'tax_insurance' },           // Nomad Life — страхование сотрудников
  { field: 'purpose', pattern: /строительно.монтажн|услуги дизайнера/i, category: 'capex_repair' },
  { field: 'purpose', pattern: /мебел/i, category: 'capex_furniture' },
  { field: 'purpose', pattern: /бесконтактн\S* меню/i, category: 'opex_menu' },
  { field: 'purpose', pattern: /крафт.пакет/i, category: 'household' },
  // Purpose-based keywords (бухгалтер пишет в Назначение)
  { field: 'purpose', pattern: /кухня/i, category: 'cogs_kitchen' },
  { field: 'purpose', pattern: /бар/i, category: 'cogs_bar' },
  { field: 'purpose', pattern: /кальян|дымн/i, category: 'cogs_hookah' },
  { field: 'purpose', pattern: /хоз\s*товар/i, category: 'household' },
  { field: 'purpose', pattern: /хозка/i, category: 'household' },                         // сленг бухгалтера в назначении
  // Налог на имущество арендодатель перевыставляет нам раз в год, и в назначении
  // стоит «За аренду/лизинг…» — правило обязано стоять выше правила аренды
  { field: 'purpose', pattern: /налог\S*\s+(на\s+)?(имуществ|недвижим)/i, category: 'rent_property_tax' },
  { field: 'purpose', pattern: /аренд\S*\s+(лайтбокс|склад|кровл)/i, category: 'rent_warehouse' },
  // Аренда помещения — только платежи арендодателю (условие учредителя 04.09.2026)
  { field: 'purpose', pattern: /аренд/i, beneficiary: /Абласанов/i, category: 'rent_premises' },
  { field: 'purpose', pattern: /отопление|горяч/i, category: 'util_heating' },
  { field: 'purpose', pattern: /коммунальн/i, category: 'util_other' },
  { field: 'purpose', pattern: /электри/i, category: 'util_electric' },
  { field: 'purpose', pattern: /водоснаб/i, category: 'util_water' },
  { field: 'purpose', pattern: /вывоз.*мусор/i, category: 'util_waste' },
  { field: 'purpose', pattern: /дератизац|дезинсек/i, category: 'opex_pest' },
  { field: 'purpose', pattern: /жироулов/i, category: 'opex_grease' },
  { field: 'purpose', pattern: /розничн.*налог/i, category: 'tax_retail' },
  { field: 'purpose', pattern: /ИПН|подоходн/i, category: 'tax_payroll' },
  { field: 'purpose', pattern: /пенсион|социальн|медицинск|страхован/i, category: 'tax_payroll' },
  { field: 'purpose', pattern: /лицензи.*алкоголь/i, category: 'tax_alcohol' },
  { field: 'purpose', pattern: /лицензи.*дымн|лицензи.*кальян/i, category: 'tax_hookah' },
  { field: 'purpose', pattern: /безвозмезд.*перевод/i, category: 'dividends' },
  { field: 'purpose', pattern: /дивиденд/i, category: 'dividends' },
  { field: 'purpose', pattern: /зарплат|ЗП/i, category: 'payroll_other' },
  { field: 'purpose', pattern: /операций по картам/i, category: 'bank_fee' },
  { field: 'purpose', pattern: /информационно-технолог/i, category: 'bank_fee' },
  { field: 'purpose', pattern: /комисси.*ведени.*счет/i, category: 'bank_fee' },
  { field: 'purpose', pattern: /маркетинг|реклам/i, category: 'mkt_other' },
  { field: 'purpose', pattern: /СММ|smm/i, category: 'mkt_smm' },
  { field: 'purpose', pattern: /таргет/i, category: 'mkt_target' },
  { field: 'purpose', pattern: /роялти/i, category: 'opex_royalty' },
  { field: 'purpose', pattern: /kaspi ?pay.*депозит|депозит.*kaspi ?pay|со счета.*на.*счет/i, category: 'internal' },

  // Beneficiary-based rules
  { field: 'beneficiary', pattern: /Дюсебекова/i, category: 'payroll_mgmt' }, // бухгалтер (ответ учредителя 03.09.2026)
  { field: 'beneficiary', pattern: /Бақыт Әділет/i, category: 'dividends' },
  { field: 'beneficiary', pattern: /Nomad Life/i, category: 'tax_insurance' },
  // «Фин помощь» от учредителя — возврат выведенных средств в оборот, не доход (ответ 03.09.2026)
  { field: 'beneficiary', pattern: /Ахметқали Алмаз/i, isDebit: false, category: 'internal' },
  // Kaspi Pay: направление решает — кредит = зачисление выручки с терминалов
  // (нужно для сверки «терминалы ↔ зачисления»), дебет = комиссия эквайринга
  { field: 'beneficiary', pattern: /Kaspi Pay/i, isDebit: false, category: 'acquiring_settlement' },
  { field: 'beneficiary', pattern: /Kaspi Pay/i, isDebit: true, category: 'bank_fee' },
  { field: 'beneficiary', pattern: /KASPI BANK/i, isDebit: false, category: 'acquiring_settlement' },
  { field: 'beneficiary', pattern: /KASPI BANK/i, isDebit: true, category: 'bank_fee' },
  { field: 'beneficiary', pattern: /2ГИС|2gis/i, category: 'mkt_2gis' },
  { field: 'beneficiary', pattern: /авторское/i, category: 'opex_music' },
  { field: 'beneficiary', pattern: /Алатау Жарық|электри/i, category: 'util_electric' },
  { field: 'beneficiary', pattern: /Алматы Су/i, category: 'util_water' },
  { field: 'beneficiary', pattern: /тепловые сети/i, category: 'util_heating' },
  { field: 'beneficiary', pattern: /Кузет|охран/i, category: 'opex_security' },
  { field: 'beneficiary', pattern: /Кафе Софт|iiko/i, category: 'opex_software' },
  { field: 'beneficiary', pattern: /Управляющая компания Мята/i, category: 'opex_royalty' },
  { field: 'beneficiary', pattern: /Ак Тартип/i, category: 'opex_pest' },
  { field: 'beneficiary', pattern: /RIM PARTNERS/i, category: 'internal' },
  { field: 'beneficiary', pattern: /Izdeu|Jarnama/i, category: 'mkt_other' },
  { field: 'beneficiary', pattern: /ЖК 4YOU/i, category: 'rent_premises' },
  { field: 'beneficiary', pattern: /Абласанов/i, category: 'rent_premises' },   // арендодатель помещения
  { field: 'beneficiary', pattern: /УГД|налоговое/i, category: 'tax_payroll' },
  { field: 'beneficiary', pattern: /Государственная корпораци/i, category: 'tax_payroll' },
]

/**
 * Auto-categorize a bank transaction
 * @param {{ beneficiary: string, purpose: string, debit: number, credit: number }} tx
 * @returns {{ category: string, confidence: 'high'|'medium'|'low', matchedRule: string|null }}
 */
export function categorizeTransaction(tx) {
  const { beneficiary = '', purpose = '' } = tx
  const txIsDebit = (Number(tx.debit) || 0) > 0

  for (const rule of KEYWORD_RULES) {
    // Правило с isDebit применяется только к своему направлению (дебет/кредит)
    if (rule.isDebit !== undefined && rule.isDebit !== txIsDebit) continue
    const text = rule.field === 'purpose' ? purpose : beneficiary
    if (!rule.pattern.test(text)) continue
    // Дополнительные условия правила: получатель и/или назначение (логика «и»)
    if (rule.beneficiary && !rule.beneficiary.test(beneficiary)) continue
    if (rule.purpose && !rule.purpose.test(purpose)) continue
    const extra = [rule.beneficiary && `beneficiary: ${rule.beneficiary.source}`, rule.purpose && `purpose: ${rule.purpose.source}`]
      .filter(Boolean).join(' + ')
    return {
      category: rule.category,
      confidence: rule.field === 'purpose' ? 'high' : 'medium',
      matchedRule: `${rule.field}: ${rule.pattern.source}${extra ? ` + ${extra}` : ''}`,
    }
  }

  return { category: 'uncategorized', confidence: 'low', matchedRule: null }
}

/**
 * Parse Kaspi Business bank statement Excel file
 * Actual column layout (from Kaspi bank export):
 *   [0] = № документа (document number, e.g. "94779730")
 *   [1] = Дата операции (date string, e.g. "30.01.2026 23:42:00")
 *   [2] = Дебет (debit amount or null)
 *   [3] = Кредит (credit amount or null)
 *   [4] = Наименование бенефициара (beneficiary, may contain \r\n + ИИН/БИН)
 *   [5] = ИИК бенефициара (IBAN of beneficiary)
 *   [6] = БИК банка бенефициара (BIC/SWIFT of beneficiary bank)
 *   [7] = КНП (payment code)
 *   [8] = Назначение платежа (purpose)
 *
 * First ~11 rows are metadata (account info, period, balances).
 * Row 11 is column headers. Some files have a row of [1,2,3,...9] after headers.
 *
 * Операционная дата: транзакции до cutoffHour (граница операционного дня)
 * относятся к предыдущей дате — заведение закрывается после полуночи.
 * dateRaw (календарная дата) сохраняется для стабильности tx_hash-дедупликации.
 */
export function parseBankStatement(rows, { cutoffHour } = {}) {
  // Find the header row by looking for "Дебет" in position [2]
  let headerIdx = -1
  for (let i = 0; i < Math.min(20, rows.length); i++) {
    const cell = String(rows[i]?.[2] || '')
    if (/дебет/i.test(cell)) { headerIdx = i; break }
  }
  // Fallback: skip first 11 rows
  const startIdx = headerIdx >= 0 ? headerIdx + 1 : 11

  const dataRows = rows.filter((row, i) => {
    if (i < startIdx) return false
    // Skip numbered index row (e.g. [1,2,3,4,5,6,7,8,9])
    if (row[0] === 1 && row[1] === 2 && row[2] === 3) return false
    // Skip summary/totals rows ("Итого обороты...", "Итого операций...")
    if (typeof row[1] === 'string' && /^Итого/i.test(row[1])) return false
    // Must have a numeric debit or credit
    const debit = row[2]
    const credit = row[3]
    return (typeof debit === 'number' && debit > 0) || (typeof credit === 'number' && credit > 0)
  })

  return dataRows.map(row => {
    // Extract beneficiary name (strip \r\n and ИИН/БИН suffix)
    const rawBeneficiary = String(row[4] || '')
    const beneficiary = rawBeneficiary.split(/[\r\n]+/)[0].trim()
    // Extract BIN from beneficiary field if present
    const binMatch = rawBeneficiary.match(/ИИН\/БИН\s*(\d+)/)
    const bin = binMatch ? binMatch[1] : ''

    // Parse date: "30.01.2026 23:42:00" → calendar "2026-01-30" + hour 23
    const rawDate = String(row[1] || '')
    let dateRaw = rawDate
    let hour = null
    const dateMatch = rawDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})(?:\s+(\d{1,2}):)?/)
    if (dateMatch) {
      dateRaw = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`
      if (dateMatch[4] != null) hour = Number(dateMatch[4])
    }
    // Операционная дата: ночные операции (до cutoffHour) — к предыдущему дню
    const date = dateMatch ? businessDateFromParts(dateRaw, hour, cutoffHour) : dateRaw

    const tx = {
      date,
      dateRaw,
      number: String(row[0] || ''),
      debit: typeof row[2] === 'number' ? row[2] : 0,
      credit: typeof row[3] === 'number' ? row[3] : 0,
      beneficiary,
      bin,
      beneficiaryAccount: String(row[5] || ''),
      bik: String(row[6] || ''),
      knp: String(row[7] || ''),
      purpose: String(row[8] || ''),
    }

    const { category, confidence, matchedRule } = categorizeTransaction(tx)

    return {
      ...tx,
      category,
      confidence,
      matchedRule,
      isDebit: tx.debit > 0,
      amount: tx.debit > 0 ? tx.debit : tx.credit,
    }
  })
}

/**
 * Извлекает остатки начала/конца периода из шапки выписки (первые ~20 строк
 * метаданных). Возвращает { opening, closing } — null, если не найдены
 * (формат может отличаться, тогда сверка полноты просто не выполняется).
 *
 * Сверка полноты файла: opening + Σкредит − Σдебет должно равняться closing.
 * Ловит обрезанный или отредактированный файл ДО записи в базу.
 */
export function parseStatementBalances(rows) {
  const findBalance = (labelRe) => {
    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i] || []
      for (let c = 0; c < row.length; c++) {
        if (typeof row[c] === 'string' && labelRe.test(row[c])) {
          // Число — в этой же ячейке после текста или в следующих ячейках строки
          const inCell = String(row[c]).replace(/\s/g, ' ').match(/(-?[\d\s]+[.,]?\d*)\s*(?:₸|KZT|тг)?\s*$/i)
          if (inCell) {
            const num = Number(inCell[1].replace(/\s/g, '').replace(',', '.'))
            if (!isNaN(num) && /\d/.test(inCell[1])) return num
          }
          for (let k = c + 1; k < row.length; k++) {
            if (typeof row[k] === 'number') return row[k]
            if (typeof row[k] === 'string' && row[k].trim() !== '') {
              const num = Number(row[k].replace(/\s/g, '').replace(',', '.'))
              if (!isNaN(num)) return num
            }
          }
        }
      }
    }
    return null
  }

  return {
    opening: findBalance(/остаток.*(на\s*начало|входящ)|входящ.*остаток/i),
    closing: findBalance(/остаток.*(на\s*конец|исходящ)|исходящ.*остаток/i),
  }
}
