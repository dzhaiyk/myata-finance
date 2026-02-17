// Auto-categorization rules for bank statement imports
// Priority: keyword in purpose > beneficiary pattern > KNP code

export const CATEGORIES = {
  // Revenue
  revenue_kitchen: { label: 'Доходы — Кухня', group: 'revenue', pnl: 'Кухня' },
  revenue_bar: { label: 'Доходы — Бар', group: 'revenue', pnl: 'Бар' },
  revenue_hookah: { label: 'Доходы — Кальян', group: 'revenue', pnl: 'Кальян' },
  revenue_other: { label: 'Доходы — Прочее', group: 'revenue', pnl: 'Прочее' },

  // COGS
  cogs_kitchen: { label: 'Закуп кухня', group: 'cogs', pnl: 'Закуп кухня' },
  cogs_bar: { label: 'Закуп бар', group: 'cogs', pnl: 'Закуп бар' },
  cogs_hookah: { label: 'Закуп кальян', group: 'cogs', pnl: 'Закуп кальян' },

  // Payroll
  payroll: { label: 'ФОТ', group: 'payroll', pnl: 'ФОТ Прочее' },
  payroll_mgmt: { label: 'ФОТ Менеджмент', group: 'payroll', pnl: 'ФОТ Менеджмент' },
  payroll_kitchen: { label: 'ФОТ Кухня', group: 'payroll', pnl: 'ФОТ Кухня' },
  payroll_bar: { label: 'ФОТ Бар', group: 'payroll', pnl: 'ФОТ Бар' },
  payroll_hookah: { label: 'ФОТ Кальян', group: 'payroll', pnl: 'ФОТ Дымный коктейль' },
  payroll_hall: { label: 'ФОТ Зал', group: 'payroll', pnl: 'ФОТ Зал' },

  // Marketing
  marketing_smm: { label: 'Маркетинг — СММ', group: 'marketing', pnl: 'СММ' },
  marketing_target: { label: 'Маркетинг — Таргет', group: 'marketing', pnl: 'Таргет' },
  marketing_2gis: { label: 'Маркетинг — 2ГИС', group: 'marketing', pnl: '2ГИС' },
  marketing_yandex: { label: 'Маркетинг — Яндекс', group: 'marketing', pnl: 'Яндекс' },
  marketing_google: { label: 'Маркетинг — Google', group: 'marketing', pnl: 'Google' },
  marketing_other: { label: 'Маркетинг — Прочее', group: 'marketing', pnl: 'Маркетинг прочее' },

  // Rent
  rent_main: { label: 'Аренда помещения', group: 'rent', pnl: 'Аренда помещения' },
  rent_storage: { label: 'Аренда склада/кровли', group: 'rent', pnl: 'Аренда склада и кровли' },
  rent_property_tax: { label: 'Налог на недвижимость', group: 'rent', pnl: 'Налог на недвижимость' },

  // Utilities
  util_electric: { label: 'Электричество', group: 'utilities', pnl: 'Электричество' },
  util_water: { label: 'Водоснабжение', group: 'utilities', pnl: 'Водоснабжение' },
  util_heating: { label: 'Отопление', group: 'utilities', pnl: 'Отопление' },
  util_bi: { label: 'BI Service', group: 'utilities', pnl: 'BI Service' },
  util_internet: { label: 'Интернет и связь', group: 'utilities', pnl: 'Интернет и связь' },
  util_trash: { label: 'Вывоз мусора', group: 'utilities', pnl: 'Вывоз мусора' },
  util_other: { label: 'Ком.услуги прочее', group: 'utilities', pnl: 'Ком.услуги прочее' },

  // Other OpEx
  opex_supplies: { label: 'Хозтовары', group: 'opex_other', pnl: 'Хозтовары' },
  opex_bank_fees: { label: 'Комиссии банка', group: 'opex_other', pnl: 'Комиссии банка/эквайринг' },
  opex_security: { label: 'Система безопасности', group: 'opex_other', pnl: 'Система безопасности' },
  opex_software: { label: 'Программное обеспечение', group: 'opex_other', pnl: 'Программное обеспечение' },
  opex_menu: { label: 'Меню', group: 'opex_other', pnl: 'Меню' },
  opex_pest: { label: 'Дератизация', group: 'opex_other', pnl: 'Дератизация/дезинсекция' },
  opex_grease: { label: 'Чистка жироуловителей', group: 'opex_other', pnl: 'Чистка жироуловителей' },
  opex_repair: { label: 'Мелкий ремонт', group: 'opex_other', pnl: 'Мелкий ремонт' },
  opex_uniform: { label: 'Форма персонала', group: 'opex_other', pnl: 'Форма для персонала' },
  opex_kao: { label: 'Авторские права (КАО)', group: 'opex_other', pnl: 'Авторские права на музыку (КАО)' },
  opex_royalty: { label: 'Роялти', group: 'opex_other', pnl: 'Роялти' },
  opex_other: { label: 'Прочие OpEx', group: 'opex_other', pnl: 'Прочее' },

  // Taxes
  tax_retail: { label: 'Розничный налог', group: 'taxes', pnl: 'Розничный налог' },
  tax_payroll: { label: 'Налоги по зарплате', group: 'taxes', pnl: 'Налоги по зарплате' },
  tax_insurance: { label: 'Страхование сотрудников', group: 'taxes', pnl: 'Страхование сотрудников' },
  tax_alcohol: { label: 'Лицензия на алкоголь', group: 'taxes', pnl: 'Лицензия на алкоголь' },
  tax_hookah: { label: 'Лицензия на кальян', group: 'taxes', pnl: 'Лицензия на дымный коктейль' },
  tax_other: { label: 'Налоги прочее', group: 'taxes', pnl: 'Налоги прочее' },

  // CapEx
  capex_repair: { label: 'Ремонт (CapEx)', group: 'capex', pnl: 'Ремонт' },
  capex_equipment: { label: 'Мебель и техника', group: 'capex', pnl: 'Мебель и техника' },
  capex_other: { label: 'CapEx прочее', group: 'capex', pnl: 'CAPEX прочее' },

  // Cash flow only
  dividends: { label: 'Дивиденды', group: 'dividends', pnl: null },
  internal_transfer: { label: 'Внутренний перевод', group: 'internal', pnl: null },
  uncategorized: { label: '❓ Не распознано', group: 'uncategorized', pnl: null },
}

// Keyword rules: check purpose field first, then beneficiary
// Order matters — first match wins
export const KEYWORD_RULES = [
  // Purpose-based keywords (бухгалтер пишет в Назначение)
  { field: 'purpose', pattern: /кухня/i, category: 'cogs_kitchen' },
  { field: 'purpose', pattern: /бар/i, category: 'cogs_bar' },
  { field: 'purpose', pattern: /кальян|дымн/i, category: 'cogs_hookah' },
  { field: 'purpose', pattern: /хоз\s*товар/i, category: 'opex_supplies' },
  { field: 'purpose', pattern: /аренд/i, category: 'rent_main' },
  { field: 'purpose', pattern: /отопление|горяч/i, category: 'util_heating' },
  { field: 'purpose', pattern: /коммунальн/i, category: 'util_other' },
  { field: 'purpose', pattern: /электри/i, category: 'util_electric' },
  { field: 'purpose', pattern: /водоснаб/i, category: 'util_water' },
  { field: 'purpose', pattern: /вывоз.*мусор/i, category: 'util_trash' },
  { field: 'purpose', pattern: /дератизац|дезинсек/i, category: 'opex_pest' },
  { field: 'purpose', pattern: /жироулов/i, category: 'opex_grease' },
  { field: 'purpose', pattern: /розничн.*налог/i, category: 'tax_retail' },
  { field: 'purpose', pattern: /ИПН|подоходн/i, category: 'tax_payroll' },
  { field: 'purpose', pattern: /пенсион|социальн|медицинск|страхован/i, category: 'tax_payroll' },
  { field: 'purpose', pattern: /лицензи.*алкоголь/i, category: 'tax_alcohol' },
  { field: 'purpose', pattern: /лицензи.*дымн|лицензи.*кальян/i, category: 'tax_hookah' },
  { field: 'purpose', pattern: /безвозмезд.*перевод/i, category: 'dividends' },
  { field: 'purpose', pattern: /дивиденд/i, category: 'dividends' },
  { field: 'purpose', pattern: /зарплат|ЗП/i, category: 'payroll' },
  { field: 'purpose', pattern: /операций по картам/i, category: 'opex_bank_fees' },
  { field: 'purpose', pattern: /информационно-технолог/i, category: 'opex_bank_fees' },
  { field: 'purpose', pattern: /комисси.*ведени.*счет/i, category: 'opex_bank_fees' },
  { field: 'purpose', pattern: /маркетинг|реклам/i, category: 'marketing_other' },
  { field: 'purpose', pattern: /СММ|smm/i, category: 'marketing_smm' },
  { field: 'purpose', pattern: /таргет/i, category: 'marketing_target' },
  { field: 'purpose', pattern: /роялти/i, category: 'opex_royalty' },
  { field: 'purpose', pattern: /KaspiPay.*Депозит|со счета.*на.*счет/i, category: 'internal_transfer' },

  // Beneficiary-based rules
  { field: 'beneficiary', pattern: /Бақыт Әділет/i, category: 'dividends' },
  { field: 'beneficiary', pattern: /Kaspi Pay/i, category: 'opex_bank_fees' },
  { field: 'beneficiary', pattern: /KASPI BANK/i, category: 'opex_bank_fees' },
  { field: 'beneficiary', pattern: /2ГИС|2gis/i, category: 'marketing_2gis' },
  { field: 'beneficiary', pattern: /авторское/i, category: 'opex_kao' },
  { field: 'beneficiary', pattern: /Алатау Жарық|электри/i, category: 'util_electric' },
  { field: 'beneficiary', pattern: /Алматы Су/i, category: 'util_water' },
  { field: 'beneficiary', pattern: /тепловые сети/i, category: 'util_heating' },
  { field: 'beneficiary', pattern: /Кузет|охран/i, category: 'opex_security' },
  { field: 'beneficiary', pattern: /Кафе Софт|iiko/i, category: 'opex_software' },
  { field: 'beneficiary', pattern: /Управляющая компания Мята/i, category: 'opex_royalty' },
  { field: 'beneficiary', pattern: /Ак Тартип/i, category: 'opex_pest' },
  { field: 'beneficiary', pattern: /RIM PARTNERS/i, category: 'internal_transfer' },
  { field: 'beneficiary', pattern: /Izdeu|Jarnama/i, category: 'marketing_other' },
  { field: 'beneficiary', pattern: /ЖК 4YOU/i, category: 'rent_main' },
  { field: 'beneficiary', pattern: /Абласанов/i, category: 'rent_storage' },
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

  for (const rule of KEYWORD_RULES) {
    const text = rule.field === 'purpose' ? purpose : beneficiary
    if (rule.pattern.test(text)) {
      return {
        category: rule.category,
        confidence: rule.field === 'purpose' ? 'high' : 'medium',
        matchedRule: `${rule.field}: ${rule.pattern.source}`
      }
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
 */
export function parseBankStatement(rows) {
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

    // Parse date: "30.01.2026 23:42:00" → "2026-01-30"
    const rawDate = String(row[1] || '')
    let date = rawDate
    const dateMatch = rawDate.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/)
    if (dateMatch) {
      date = `${dateMatch[3]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[1].padStart(2, '0')}`
    }

    const tx = {
      date,
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
