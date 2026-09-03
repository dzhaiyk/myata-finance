// Разбор PDF-выписки по счёту Народного банка (Halyk).
// Приложение Halyk отдаёт только PDF, поэтому таблица собирается по координатам
// текста: колонки определяются по строке заголовка, строки — по дате в первой колонке.
// Результат совпадает по форме с parseBankStatement (Kaspi), чтобы импорт был общим.

import { extractPdfText, itemsToLines } from './pdfText.js'
import { categorizeTransaction } from './categorize.js'

const COLUMNS = [
  { key: 'date', label: 'Дата' },
  { key: 'number', label: 'Номер документа' },
  { key: 'debit', label: 'Дебет' },
  { key: 'credit', label: 'Кредит' },
  { key: 'beneficiary', label: 'Контрагент' },
  { key: 'purpose', label: 'Детали платежа' },
  { key: 'vat', label: 'банковские' }, // «НДС на банковские комиссии» — заголовок в три строки
]

const norm = (s) => String(s || '').replace(/\s+/g, ' ').trim()

export const parseAmount = (s) => {
  const t = norm(s).replace(/[\s ]/g, '').replace(/,/g, '')
  if (!/^-?\d+(\.\d+)?$/.test(t)) return null
  return Number(t)
}

const DATE_RE = /^(\d{2})\.(\d{2})\.(\d{4})$/
const isoDate = (s) => {
  const m = DATE_RE.exec(norm(s))
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

// Границы колонок — середины между X заголовков
function columnBounds(headerLine, nextHeaderLine) {
  const found = []
  for (const col of COLUMNS) {
    const all = [...headerLine.items, ...(nextHeaderLine?.items || [])]
    const item = all.find(i => norm(i.text).toLowerCase().startsWith(col.label.toLowerCase()))
    if (item) found.push({ key: col.key, x: item.x })
  }
  if (found.length < 4) return null
  found.sort((a, b) => a.x - b.x)
  return found.map((c, i) => ({
    key: c.key,
    from: i === 0 ? -Infinity : (found[i - 1].x + c.x) / 2,
    to: i === found.length - 1 ? Infinity : (c.x + found[i + 1].x) / 2,
  }))
}

const cellOf = (bounds, x) => bounds.find(b => x >= b.from && x < b.to)?.key || null

function metaFrom(lines) {
  const text = lines.map(l => l.items.map(i => i.text).join(' ')).join('\n')
  const after = (label) => {
    const line = lines.find(l => norm(l.items[0]?.text).toLowerCase().startsWith(label.toLowerCase()))
    return line ? norm(line.items.slice(1).map(i => i.text).join(' ')) : ''
  }
  const account = /(KZ[0-9A-Z]{18})/.exec(text)?.[1] || ''
  const currency = /\((KZT|USD|EUR|RUB)\)/.exec(text)?.[1] || 'KZT'
  const dash = (s) => {
    const m = /(\d{2})-(\d{2})-(\d{4})/.exec(s || '')
    return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
  }
  // «За период с 03-08- по 03-09-» и год строкой ниже: собираем по X
  const period = []
  const pIdx = lines.findIndex(l => /^За период/i.test(norm(l.items[0]?.text)))
  if (pIdx >= 0) {
    const below = lines[pIdx + 1]?.items || []
    for (const it of lines[pIdx].items) {
      if (!/^\d{2}-\d{2}-$/.test(norm(it.text))) continue
      const year = below.find(b => Math.abs(b.x - it.x) < 20 && /^\d{4}$/.test(norm(b.text)))
      period.push(dash(norm(it.text) + (year ? norm(year.text) : '')))
    }
  }
  const balanceLine = (label) => {
    const line = lines.find(l => norm(l.items[0]?.text).toLowerCase().startsWith(label.toLowerCase()))
    if (!line) return { amount: null, date: '' }
    const amount = line.items.map(i => parseAmount(i.text)).find(v => v != null)
    const date = dash(line.items.map(i => i.text).join(' '))
    return { amount: amount ?? null, date }
  }
  const opening = balanceLine('Входящий остаток')
  const closing = balanceLine('Исходящий остаток')
  return {
    bank: after('Банк'), bik: after('БИК'), bin: after('ИИН/БИН'), client: after('Клиент'),
    account, currency,
    periodFrom: period[0] || opening.date, periodTo: period[1] || closing.date,
    openingBalance: opening.amount, openingDate: opening.date,
    closingBalance: closing.amount, closingDate: closing.date,
  }
}

function turnoversFrom(lines) {
  const idx = lines.findIndex(l => /^Обороты/i.test(norm(l.items[0]?.text)))
  if (idx < 0) return { debit: null, credit: null }
  for (const line of lines.slice(idx, idx + 3)) {
    const nums = line.items.map(i => parseAmount(i.text)).filter(v => v != null)
    if (nums.length >= 2) return { debit: nums[0], credit: nums[1] }
  }
  return { debit: null, credit: null }
}

/**
 * Разбирает выписку Halyk из результата extractPdfText.
 * @returns {{meta: object, transactions: Array, totals: object, issues: string[]}}
 */
export function parseHalykStatement(pages) {
  const allLines = pages.map(p => itemsToLines(p.items))
  const meta = metaFrom(allLines.flat())
  const turnovers = turnoversFrom(allLines.flat())

  const transactions = []
  let bounds = null
  let current = null
  const flush = () => {
    if (!current) return
    const debit = parseAmount(current.debit) || 0
    const credit = parseAmount(current.credit) || 0
    if (debit || credit) {
      const beneficiaryRaw = norm(current.beneficiary)
      const binMatch = /(?:БИН|ИИН)\s*(\d{6,12})/.exec(beneficiaryRaw)
      transactions.push({
        date: current.date, dateRaw: current.date,
        number: norm(current.number),
        debit, credit,
        beneficiary: norm(beneficiaryRaw.replace(/(?:БИН|ИИН)\s*\d{6,12}/, '')),
        bin: binMatch ? binMatch[1] : '',
        beneficiaryAccount: '', bik: '', knp: '',
        purpose: norm(current.purpose),
        vat: parseAmount(current.vat) || 0,
      })
    }
    current = null
  }

  for (const lines of allLines) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const first = norm(line.items[0]?.text)
      const isHeader = line.items.some(it => /^Дебет$/i.test(norm(it.text))) && line.items.some(it => /^Кредит$/i.test(norm(it.text)))
      if (isHeader) {
        flush()
        // строка-заголовок таблицы (с «Дата») задаёт колонки; заголовок оборотов — только конец таблицы
        if (/^Дата$/i.test(first)) bounds = columnBounds(line, lines[i - 1]) || bounds
        continue
      }
      if (/^Обороты/i.test(first) || /^Исходящий остаток/i.test(first)) { flush(); continue }
      if (!bounds) continue

      const dateItem = line.items.find(it => cellOf(bounds, it.x) === 'date' && DATE_RE.test(norm(it.text)))
      if (dateItem) {
        flush()
        current = { date: isoDate(dateItem.text), number: '', debit: '', credit: '', beneficiary: '', purpose: '', vat: '' }
      }
      if (!current) continue
      for (const it of line.items) {
        const key = cellOf(bounds, it.x)
        if (!key || key === 'date') continue
        const text = norm(it.text)
        if (!text) continue
        // в денежных колонках принимаем только числа: так номера страниц и
        // подписи «Дебет/Кредит» из блока оборотов не попадают в суммы
        if (key === 'debit' || key === 'credit' || key === 'vat') {
          if (parseAmount(text) == null) continue
        }
        current[key] = current[key] ? `${current[key]} ${text}` : text
      }
    }
  }
  flush()

  const totals = {
    debit: transactions.reduce((s, t) => s + t.debit, 0),
    credit: transactions.reduce((s, t) => s + t.credit, 0),
    count: transactions.length,
  }
  const issues = []
  const close = (a, b) => a != null && b != null && Math.abs(a - b) < 0.5
  if (turnovers.debit != null && !close(turnovers.debit, totals.debit)) {
    issues.push(`Дебет: в выписке ${turnovers.debit.toFixed(2)}, разобрано ${totals.debit.toFixed(2)}`)
  }
  if (turnovers.credit != null && !close(turnovers.credit, totals.credit)) {
    issues.push(`Кредит: в выписке ${turnovers.credit.toFixed(2)}, разобрано ${totals.credit.toFixed(2)}`)
  }
  if (meta.openingBalance != null && meta.closingBalance != null) {
    const expected = meta.openingBalance - totals.debit + totals.credit
    if (!close(expected, meta.closingBalance)) {
      issues.push(`Остаток: ${meta.openingBalance.toFixed(2)} − ${totals.debit.toFixed(2)} + ${totals.credit.toFixed(2)} = ${expected.toFixed(2)}, в выписке ${meta.closingBalance.toFixed(2)}`)
    }
  }
  return { meta, transactions, totals, turnovers, issues }
}

/**
 * PDF-файл → строки в том же формате, что и parseBankStatement (Kaspi).
 * @param {ArrayBuffer} data
 */
export async function parseHalykPdf(data) {
  const { pages } = await extractPdfText(data)
  const parsed = parseHalykStatement(pages)
  const rows = parsed.transactions.map(tx => {
    const { category, confidence, matchedRule } = categorizeTransaction(tx)
    return {
      ...tx, category, confidence, matchedRule,
      isDebit: tx.debit > 0,
      amount: tx.debit > 0 ? tx.debit : tx.credit,
    }
  })
  return { ...parsed, rows }
}
