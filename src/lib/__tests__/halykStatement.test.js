import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { extractPdfText, itemsToLines } from '../pdfText.js'
import { parseAmount, parseHalykStatement, parseHalykPdf } from '../halykStatement.js'
import { applyDbRules } from '../bankImport.js'
import { seededRules } from './fixtures.js'

// --- сборка тестового PDF ------------------------------------------------
// Повторяет то, как реально устроена выписка Halyk: Type0/Identity-H,
// двухбайтовые коды глифов и ToUnicode-таблица; текст позиционируется через Tm.

function buildPdf(items) {
  const chars = [...new Set(items.map(i => i.text).join(''))]
  const code = new Map(chars.map((c, i) => [c, i + 1]))
  const hex = (text) => [...text].map(c => code.get(c).toString(16).padStart(4, '0')).join('')
  const content = items.map(i =>
    `BT\n1 0 0 1 ${i.x} ${i.y} Tm\n/F1 10 Tf\n<${hex(i.text)}> Tj\nET\n`).join('')
  const cmap = `/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n1 begincodespacerange\n<0000><FFFF>\nendcodespacerange\n` +
    `${chars.length} beginbfchar\n` +
    chars.map(c => `<${code.get(c).toString(16).padStart(4, '0')}><${c.codePointAt(0).toString(16).padStart(4, '0')}>`).join('\n') +
    `\nendbfchar\nendcmap\nend\nend`
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R]/Count 1>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Resources<</ColorSpace<</CS/DeviceRGB>>/Font<</F1 4 0 R>>>>/Contents 6 0 R>>',
    '<</Subtype/Type0/Type/Font/BaseFont/TestFont/Encoding/Identity-H/DescendantFonts[5 0 R]/ToUnicode 7 0 R>>',
    '<</Type/Font/Subtype/CIDFontType2/BaseFont/TestFont/CIDSystemInfo<</Registry(Adobe)/Ordering(Identity)/Supplement 0>>/DW 500>>',
    `<</Length ${content.length}>>stream\n${content}\nendstream`,
    `<</Length ${cmap.length}>>stream\n${cmap}\nendstream`,
  ]
  let pdf = '%PDF-1.4\n'
  objs.forEach((body, i) => { pdf += `${i + 1} 0 obj\n${body}\nendobj\n` })
  pdf += 'trailer\n<</Root 1 0 R/Size 8>>\n%%EOF'
  const bytes = new Uint8Array(pdf.length)
  for (let i = 0; i < pdf.length; i++) bytes[i] = pdf.charCodeAt(i) & 0xff
  return bytes.buffer
}

// Координаты повторяют реальную выписку Halyk (колонки 31/92/193/254/306/410/548)
const statementItems = ({ debit2 = '3,300.00', turnoverDebit = '1 103 300.00' } = {}) => [
  { x: 30, y: 750, text: 'Банк' }, { x: 186, y: 750, text: 'АО «Народный Банк Казахстана»' },
  { x: 30, y: 734, text: 'БИК' }, { x: 186, y: 734, text: 'HSBKKZKX' },
  { x: 30, y: 718, text: 'ИИН/БИН' }, { x: 186, y: 718, text: '211140017093' },
  { x: 30, y: 702, text: 'Клиент' }, { x: 186, y: 702, text: 'ИП AKHMETKALI' },
  { x: 30, y: 686, text: 'Счет' }, { x: 66, y: 686, text: '(Валюта)' },
  { x: 186, y: 686, text: 'KZ596018861000196861' }, { x: 296, y: 686, text: '(KZT)' },
  { x: 412, y: 780, text: 'За период с' }, { x: 467, y: 780, text: '01-08-' }, { x: 515, y: 780, text: 'по' }, { x: 529, y: 780, text: '31-08-' },
  { x: 467, y: 768, text: '2026' }, { x: 529, y: 768, text: '2026' },
  { x: 25, y: 596, text: 'Входящий остаток:' }, { x: 264, y: 596, text: '100 000.00' },
  { x: 306, y: 596, text: 'Дата остатка:' }, { x: 499, y: 596, text: '01-08-2026' },
  // заголовок таблицы
  { x: 536, y: 566, text: 'НДС на' },
  { x: 41, y: 557, text: 'Дата' }, { x: 84, y: 557, text: 'Номер документа' }, { x: 178, y: 557, text: 'Дебет' },
  { x: 250, y: 557, text: 'Кредит' }, { x: 332, y: 557, text: 'Контрагент' }, { x: 436, y: 557, text: 'Детали платежа' },
  { x: 529, y: 557, text: 'банковские' },
  // строка 1 — зачисление эквайринга (кредит), продолжение на второй строке
  { x: 31, y: 535, text: '05.08.2026' }, { x: 89, y: 535, text: 'AW2085580397' }, { x: 254, y: 535, text: '1,100,000.00' },
  { x: 306, y: 535, text: 'АО Народный Банк' }, { x: 410, y: 535, text: 'Референс 4066993547' },
  { x: 306, y: 526, text: 'Казахстана' }, { x: 410, y: 526, text: 'Пополнение с терминала' },
  { x: 306, y: 517, text: 'БИН 940140000385' }, { x: 410, y: 517, text: '11070009' },
  // строка 2 — комиссия банка (дебет) с НДС
  { x: 31, y: 495, text: '12.08.2026' }, { x: 92, y: 495, text: '004561374415' }, { x: 193, y: 495, text: debit2 },
  { x: 306, y: 495, text: 'Алматинский городской' }, { x: 410, y: 495, text: 'Комиссия за операцию' }, { x: 548, y: 495, text: '455.17' },
  { x: 306, y: 486, text: 'филиал Народного Банка' }, { x: 410, y: 486, text: 'согласно тарифам банка' },
  { x: 306, y: 477, text: 'БИН 960941000145' },
  // строка 3 — аренда (дебет)
  { x: 31, y: 455, text: '20.08.2026' }, { x: 92, y: 455, text: 'ONBQAOA3R' }, { x: 193, y: 455, text: '1,100,000.00' },
  { x: 306, y: 455, text: 'ИП Абласанов Ж.Б.' }, { x: 410, y: 455, text: 'Оплата за аренду Август' },
  { x: 306, y: 446, text: 'БИН 100440015934' },
  // номер страницы — не должен попасть в суммы
  { x: 569, y: 27, text: '1' },
  // обороты и исходящий остаток
  { x: 178, y: 400, text: 'Дебет' }, { x: 250, y: 400, text: 'Кредит' }, { x: 541, y: 400, text: 'НДС' },
  { x: 25, y: 390, text: 'Обороты:' }, { x: 306, y: 390, text: 'За период:' }, { x: 420, y: 390, text: '01-08-2026 - 31-08-2026' },
  { x: 178, y: 380, text: turnoverDebit }, { x: 250, y: 380, text: '1 100 000.00' },
  { x: 25, y: 350, text: 'Исходящий остаток:' }, { x: 264, y: 350, text: '96 700.00' },
  { x: 306, y: 350, text: 'Дата остатка:' }, { x: 499, y: 350, text: '31-08-2026' },
]

describe('pdfText — извлечение текста с координатами', () => {
  it('декодирует кириллицу через ToUnicode и сохраняет позиции', async () => {
    const { pages } = await extractPdfText(buildPdf([
      { x: 30, y: 750, text: 'Банк' }, { x: 186, y: 750, text: 'АО «Народный Банк»' },
    ]))
    assert.equal(pages.length, 1)
    const lines = itemsToLines(pages[0].items)
    assert.equal(lines.length, 1)
    assert.deepEqual(lines[0].items.map(i => i.text), ['Банк', 'АО «Народный Банк»'])
    assert.equal(lines[0].items[0].x, 30)
    assert.equal(lines[0].items[1].x, 186)
  })

  it('группирует элементы в строки сверху вниз', async () => {
    const { pages } = await extractPdfText(buildPdf([
      { x: 10, y: 100, text: 'низ' }, { x: 10, y: 200, text: 'верх' }, { x: 50, y: 200, text: 'тоже' },
    ]))
    const lines = itemsToLines(pages[0].items)
    assert.deepEqual(lines.map(l => l.items.map(i => i.text).join(' ')), ['верх тоже', 'низ'])
  })
})

describe('parseAmount', () => {
  it('понимает разделители банка', () => {
    assert.equal(parseAmount('1,900.00'), 1900)
    assert.equal(parseAmount('1 100 000.00'), 1100000)
    assert.equal(parseAmount('24 842.87'), 24842.87)
  })
  it('не считает числом подписи и мусор', () => {
    assert.equal(parseAmount('Дебет'), null)
    assert.equal(parseAmount(''), null)
    assert.equal(parseAmount('11070009 ПОПОЛНЕНИЕ'), null)
  })
})

describe('Выписка Halyk (PDF) — разбор в транзакции', () => {
  it('собирает шапку, строки и сходится с оборотами выписки', async () => {
    const res = await parseHalykPdf(buildPdf(statementItems()))
    assert.equal(res.meta.bank, 'АО «Народный Банк Казахстана»')
    assert.equal(res.meta.account, 'KZ596018861000196861')
    assert.equal(res.meta.currency, 'KZT')
    assert.equal(res.meta.periodFrom, '2026-08-01')
    assert.equal(res.meta.periodTo, '2026-08-31')
    assert.equal(res.meta.openingBalance, 100000)
    assert.equal(res.meta.closingBalance, 96700)

    assert.equal(res.rows.length, 3)
    assert.equal(res.totals.credit, 1100000)
    assert.equal(res.totals.debit, 1103300)
    assert.deepEqual(res.issues, [])
  })

  it('склеивает многострочные ячейки и вытаскивает БИН', async () => {
    const { rows } = await parseHalykPdf(buildPdf(statementItems()))
    const settlement = rows.find(r => !r.isDebit)
    assert.equal(settlement.date, '2026-08-05')
    assert.equal(settlement.amount, 1100000)
    assert.equal(settlement.beneficiary, 'АО Народный Банк Казахстана')
    assert.equal(settlement.bin, '940140000385')
    assert.equal(settlement.purpose, 'Референс 4066993547 Пополнение с терминала 11070009')
  })

  // Разбор категорию не ставит: правила живут в базе (миграция 027) и
  // применяются в buildImportRows. Здесь проверяем связку разбор → правила.
  it('разобранные строки категоризуются правилами', async () => {
    const { rows } = await parseHalykPdf(buildPdf(statementItems()))
    const rules = seededRules()
    const cat = (r) => applyDbRules({ ...r, is_debit: r.isDebit }, rules)?.category || 'uncategorized'
    assert.equal(rows.find(r => !r.isDebit).category, 'uncategorized')
    assert.equal(cat(rows.find(r => !r.isDebit)), 'acquiring_settlement')
    assert.equal(cat(rows.find(r => r.purpose.includes('Комиссия за операцию'))), 'bank_fee')
    assert.equal(cat(rows.find(r => r.purpose.includes('аренду'))), 'rent_premises')
  })

  it('НДС по комиссии не попадает в сумму операции', async () => {
    const { rows } = await parseHalykPdf(buildPdf(statementItems()))
    const fee = rows.find(r => r.purpose.includes('Комиссия за операцию'))
    assert.equal(fee.amount, 3300)
    assert.equal(fee.vat, 455.17)
  })

  it('расхождение с оборотами выписки попадает в issues', async () => {
    const res = await parseHalykPdf(buildPdf(statementItems({ debit2: '3,000.00' })))
    assert.equal(res.totals.debit, 1103000)
    assert.equal(res.issues.length, 2) // не сходятся и обороты, и остаток
    assert.match(res.issues[0], /Дебет/)
    assert.match(res.issues[1], /Остаток/)
  })

  it('пустой PDF не роняет разбор', async () => {
    const res = await parseHalykPdf(buildPdf([{ x: 10, y: 700, text: 'Пусто' }]))
    assert.deepEqual(res.rows, [])
    assert.deepEqual(res.issues, [])
  })
})

describe('parseHalykStatement — работа со страницами', () => {
  it('строки второй страницы разбираются по колонкам первой', async () => {
    const page1 = statementItems().filter(i => i.y > 460)
    const page2 = statementItems().filter(i => i.y <= 460)
    const { pages } = await extractPdfText(buildPdf(page1))
    const { pages: p2 } = await extractPdfText(buildPdf(page2))
    const res = parseHalykStatement([pages[0], p2[0]])
    assert.equal(res.transactions.length, 3)
    assert.equal(res.totals.debit, 1103300)
  })
})
