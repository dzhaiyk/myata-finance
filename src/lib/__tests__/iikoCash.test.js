import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePayment, isPayOut, matchRule, splitPayments, mergeWithdrawals, summarize,
} from '../iikoCash.js'

// Формат ответа iiko по кассовым сменам не подтверждён — фикстура покрывает
// несколько правдоподобных вариантов имён полей, и разбор обязан пережить любой.
const RULES = [
  { pattern: 'закуп кухня|мясо|овощи', section: 'suppliers_kitchen', name: '' },
  { pattern: 'закуп бар|пиво', section: 'suppliers_bar', name: '' },
  { pattern: 'табак', section: 'tobacco', name: 'Табак' },
  { pattern: 'угли', section: 'tobacco', name: 'Угли' },
  { pattern: 'аванс', section: 'payroll', name: '' },
  { pattern: 'хозтовар', section: 'other', name: 'Хозтовары' },
  { pattern: 'инкасс', section: 'cash_withdrawals', name: '' },
]

describe('BR-SHF-021 — изъятия из кассовой смены iiko', () => {
  it('платёж читается при разных именах полей', () => {
    assert.deepEqual(
      (({ type, sum, comment }) => ({ type, sum, comment }))(normalizePayment({ type: 'PAY_OUT', sum: 12500, comment: ' Закуп кухня, мясо ' })),
      { type: 'PAY_OUT', sum: 12500, comment: 'Закуп кухня, мясо' },
    )
    const p = normalizePayment({ paymentType: { name: 'Изъятие' }, amount: '3 000,50', description: 'угли' })
    assert.equal(p.type, 'Изъятие'); assert.equal(p.sum, 3000.5); assert.equal(p.comment, 'угли')
  })

  it('внесения отличаются от изъятий по типу, без типа — по знаку', () => {
    assert.equal(isPayOut(normalizePayment({ type: 'PAY_IN', sum: 1000 })), false)
    assert.equal(isPayOut(normalizePayment({ type: 'PAY_OUT', sum: 1000 })), true)
    assert.equal(isPayOut(normalizePayment({ type: 'Внесение', sum: 1000 })), false)
    assert.equal(isPayOut(normalizePayment({ sum: -1000 })), true)
    assert.equal(isPayOut(normalizePayment({ sum: 1000 })), false)
  })

  it('правило: слова через «|», без регистра, первое совпавшее побеждает', () => {
    assert.equal(matchRule('ЗАКУП КУХНЯ мясо', RULES).section, 'suppliers_kitchen')
    assert.equal(matchRule('пиво и мясо', RULES).section, 'suppliers_kitchen') // «мясо» в первом правиле
    assert.equal(matchRule('табак сердце', RULES).name, 'Табак')
    assert.equal(matchRule('что-то странное', RULES), null)
  })

  // Из живого запуска 06.09.2026: комментарии менеджеров — «лед», «дост табак»,
  // «чизкейк», «аванс». Короткое слово не должно ловить чужое слово целиком.
  it('слово ищется с начала слова, а не любой подстрокой', () => {
    const rules = [
      { pattern: 'лед|лёд', section: 'suppliers_bar', name: '' },
      { pattern: 'табак', section: 'tobacco', name: 'Табак' },
    ]
    assert.equal(matchRule('лед', rules).section, 'suppliers_bar')
    assert.equal(matchRule('Лед для бара', rules).section, 'suppliers_bar')
    assert.equal(matchRule('следующая поставка', rules), null)
    assert.equal(matchRule('обследование', rules), null)
    assert.equal(matchRule('табака 2 пачки', rules).name, 'Табак')
    assert.equal(matchRule('дост табак', rules).name, 'Табак')
    assert.equal(matchRule('', []), null)
  })

  it('критерий приёмки: «закуп кухня» попадает в закуп кухни суммой из iiko', () => {
    const { rows } = splitPayments([{ type: 'PAY_OUT', sum: 45000, comment: 'закуп кухня Иванов' }], RULES)
    assert.deepEqual(rows.suppliers_kitchen, [{ name: 'закуп кухня Иванов', amount: '45000', comment: '', source: 'iiko' }])
  })

  it('критерий приёмки: неопознанное не теряется — в «Прочих» с исходным комментарием', () => {
    const split = splitPayments([
      { type: 'PAY_OUT', sum: 7000, comment: 'ремонт вывески' },
      { type: 'PAY_IN', sum: 50000, comment: 'размен' },
      { type: 'PAY_OUT', sum: 0, comment: 'пустой' },
    ], RULES)
    assert.equal(split.rows.other.length, 1)
    assert.equal(split.rows.other[0].name, 'ремонт вывески')
    assert.equal(split.rows.other[0].unmatched, true)
    assert.equal(split.unmatched.length, 1)
    assert.equal(split.skipped.length, 2)
    const s = summarize(split)
    assert.equal(s.added, 1); assert.equal(s.total, 7000); assert.equal(s.unmatched, 1); assert.equal(s.skipped, 2)
    assert.deepEqual(s.fields, ['type', 'sum', 'comment'])
  })

  it('фиксированные строки заполняются по имени, инкассация — в изъятия из кассы', () => {
    const { rows } = splitPayments([
      { type: 'PAY_OUT', sum: 20000, comment: 'табак' },
      { type: 'PAY_OUT', sum: 5000, comment: 'Угли кокос' },
      { type: 'PAY_OUT', sum: 300000, comment: 'инкассация' },
    ], RULES)
    const current = {
      tobacco: [{ name: 'Табак', amount: '', comment: '' }, { name: 'Угли', amount: '', comment: '' }],
      other: [{ name: 'Хозтовары', amount: '', comment: '' }],
      suppliers_kitchen: [{ name: '', amount: '', comment: '' }],
      suppliers_bar: [{ name: '', amount: '', comment: '' }],
      payroll: [{ name: '', amount: '', comment: '' }],
      cash_withdrawals: [{ amount: '', comment: '' }],
    }
    const merged = mergeWithdrawals(current, rows)
    assert.equal(merged.tobacco.find(r => r.name === 'Табак').amount, '20000')
    assert.equal(merged.tobacco.find(r => r.name === 'Угли').amount, '5000')
    assert.equal(merged.tobacco.find(r => r.name === 'Угли').comment, 'Угли кокос')
    assert.deepEqual(merged.cash_withdrawals, [{ amount: '300000', comment: 'инкассация', source: 'iiko' }])
    // пустые шаблонные строки убраны, а фиксированные без сумм остались
    assert.deepEqual(merged.suppliers_kitchen, [{ name: '', amount: '', comment: '' }])
    assert.equal(merged.other.length, 1)
  })

  it('повторный импорт не дублирует и не трогает ручные строки', () => {
    const rules = RULES
    const first = mergeWithdrawals({
      suppliers_kitchen: [{ name: 'Ручной поставщик', amount: '1000', comment: '' }],
      tobacco: [{ name: 'Табак', amount: '', comment: '' }],
      other: [], suppliers_bar: [], payroll: [], cash_withdrawals: [],
    }, splitPayments([
      { type: 'PAY_OUT', sum: 45000, comment: 'закуп кухня' },
      { type: 'PAY_OUT', sum: 20000, comment: 'табак' },
    ], rules).rows)
    const second = mergeWithdrawals(first, splitPayments([
      { type: 'PAY_OUT', sum: 46000, comment: 'закуп кухня' },
      { type: 'PAY_OUT', sum: 21000, comment: 'табак' },
    ], rules).rows)
    assert.deepEqual(second.suppliers_kitchen.map(r => [r.name, r.amount]), [['Ручной поставщик', '1000'], ['закуп кухня', '46000']])
    assert.deepEqual(second.tobacco.map(r => [r.name, r.amount]), [['Табак', '21000']])
  })
})
