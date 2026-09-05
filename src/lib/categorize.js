// Разбор банковских выписок (Kaspi Business). Категорий здесь нет: список
// статей — таблица categories (справочник), правила — bank_rules (миграция
// 027). Копия списка в коде жила до TASK-026 и расходилась с базой.
import { businessDateFromParts } from './dates.js'

// Правила категоризации переехали в базу (таблицы `bank_rules` и
// `bank_rule_conditions`, миграция 027). В коде их держать нельзя: там были
// фамилии арендодателя, бухгалтера и учредителей, своё юрлицо, адрес и
// поставщики Алматы — при продаже другому заведению всё это уехало бы к нему
// (ADR-0010, правило 11).
//
// Применяются они в `buildImportRows`, где есть доступ к базе, и раньше
// разбора файла ничего не категоризируют.

/**
 * Разбор файла категорию не определяет: правила живут в базе и применяются
 * в `buildImportRows`. Функция оставлена, чтобы парсеры выписок не знали,
 * откуда берутся правила.
 */
export function categorizeTransaction() {
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
