import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { parseSheetName, parseTimesheetSheet, parseTimesheetWorkbook, matchStaff, periodTotals, iso } from '../timesheet.js'

// Вымышленные сотрудники — в тестах персональных данных нет
const H = (label, days, extra = []) => [label, 'ФИО', 'должность', ...days.map(() => 'пн'), ...extra]
const D = (days, extra = []) => ['', '', '', ...days, ...extra.map(() => '')]

describe('табель — имя листа → период (TASK-038)', () => {
  it('первая и вторая половина месяца', () => {
    assert.deepEqual(parseSheetName('01.12-15.12', null, 2025), { year: 2025, month: 12, period: 1, from: 1, to: 15 })
    assert.deepEqual(parseSheetName('16.12-31.12', { year: 2025, month: 12 }, 2025), { year: 2025, month: 12, period: 2, from: 16, to: 31 })
  })
  it('год из имени листа, если он там есть: «01.01.26-15.01»', () => {
    const p = parseSheetName('01.01.26-15.01', { year: 2025, month: 12 }, 2025)
    assert.equal(p.year, 2026); assert.equal(p.month, 1); assert.equal(p.period, 1)
  })
  it('год переходит по месяцам, когда в имени его нет: декабрь 2025 → «1.02-15.02»', () => {
    const p = parseSheetName('1.02-15.02', { year: 2025, month: 12 }, 2025)
    assert.equal(p.year, 2026); assert.equal(p.month, 2)
  })
  it('«16.09-30» без второго месяца — вторая половина сентября', () => {
    const p = parseSheetName('16.09-30', { year: 2026, month: 9 }, 2026)
    assert.deepEqual([p.period, p.from, p.to], [2, 16, 30])
  })
  it('февраль: to = 28', () => {
    assert.equal(parseSheetName('16.02-28.02', { year: 2026, month: 1 }, 2026).to, 28)
  })
  it('чужое имя листа → null', () => { assert.equal(parseSheetName('Лист2', null, 2026), null) })
})

describe('табель — разбор листа', () => {
  const period = { year: 2026, month: 3, period: 1, from: 1, to: 15 }
  const days = Array.from({ length: 15 }, (_, i) => i + 1)
  const rows = [
    H('март', days, ['', 'смены', 'ШТРАФ', '']),
    D(days, ['', '', '', '']),
    [1, 'Тестова Анна', 'Управляющая', 1, 1, '', 1, 1, 1, 1, '', 1, 1, 1, 1, 1, 1, '', '', 12, '', 'Анна +7 700'],
    [2, 'Пробный Иван', 0.07, '', 1, 0.7, '', 1, '', 0.5, 1, '', '', 1, 1, '', 1, 1, '', 8.2, 5000, 'наличка'],
    ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', 0, '', ''],
    [3, 'Ошибкин Пётр', 'Бармен', 1, 1, 1, '', '', '', '', '', '', '', '', '', '', '', '', '', 5, '', ''],
  ]
  const r = parseTimesheetSheet(rows, period)

  it('полные и дробные смены, даты из периода', () => {
    const anna = r.entries.filter(e => e.name === 'Тестова Анна')
    assert.equal(anna.length, 12)
    assert.equal(anna[0].work_date, iso(2026, 3, 1))
    const ivan = r.entries.filter(e => e.name === 'Пробный Иван')
    assert.deepEqual(ivan.map(e => e.share), [1, 0.7, 1, 0.5, 1, 1, 1, 1, 1])
    assert.equal(ivan.find(e => e.share === 0.7).work_date, iso(2026, 3, 3))
  })
  it('процент в колонке должности — ставка от продаж, должность пустая', () => {
    const ivan = r.entries.find(e => e.name === 'Пробный Иван')
    assert.equal(ivan.salesPct, 0.07); assert.equal(ivan.position, null)
    assert.equal(r.entries.find(e => e.name === 'Тестова Анна').position, 'Управляющая')
  })
  it('штраф за полумесяц, телефон и «наличка» не импортируются — только заметка', () => {
    assert.deepEqual(r.fines, [{ name: 'Пробный Иван', year: 2026, month: 3, period: 1, amount: 5000 }])
    assert.ok(r.notes.some(n => n.name === 'Тестова Анна' && n.note === 'Анна +7 700'))
    assert.ok(r.notes.some(n => n.name === 'Пробный Иван' && n.note === 'наличка'))
    assert.ok(!r.entries.some(e => 'note' in e))
  })
  it('расхождение «смены» в листе с суммой по дням — замечание, не ошибка', () => {
    assert.ok(r.issues.some(i => i.startsWith('Ошибкин Пётр') && i.includes('5') && i.includes('3')))
    assert.equal(r.entries.filter(e => e.name === 'Ошибкин Пётр').length, 3)
  })
  it('пустая строка-разделитель пропускается', () => {
    assert.ok(!r.entries.some(e => e.name === ''))
  })
})

describe('табель — книга целиком', () => {
  const mk = (name, from, count, label = 'м') => ({
    name, rows: [H(label, Array(count).fill(0), ['смены']), D(Array.from({ length: count }, (_, i) => from + i), ['']),
      [1, 'Тестова Анна', 'Админ', ...Array(count).fill(1), count]],
  })
  it('декабрь → январь: год увеличивается', () => {
    const res = parseTimesheetWorkbook([mk('01.12-15.12', 1, 15), mk('16.12-31.12', 16, 16), mk('01.01.26-15.01', 1, 15)], 2025)
    assert.deepEqual(res.periods.map(p => [p.year, p.month, p.period]), [[2025, 12, 1], [2025, 12, 2], [2026, 1, 1]])
    assert.equal(res.entries.filter(e => e.work_date.startsWith('2026-01')).length, 15)
  })
  it('лист второй половины с днями 1..15 — копия, пропускается с замечанием', () => {
    const res = parseTimesheetWorkbook([mk('1.09-15.09', 1, 15), mk('16.09-30', 1, 15)], 2026)
    assert.equal(res.periods.length, 1)
    assert.ok(res.issues.some(i => i.includes('16.09-30') && i.includes('пропущен')))
  })
  it('продублированный день в шапке: берём по порядку и отмечаем', () => {
    const sheet = { name: '1.05-15.05', rows: [H('МАЙ', Array(15).fill(0), ['смены']), D([1,2,3,4,5,6,7,8,9,10,11,12,12,14,15], ['']),
      [1, 'Тестова Анна', 'Админ', ...Array(15).fill(1), 15]] }
    const res = parseTimesheetWorkbook([sheet], 2026)
    assert.equal(res.entries.length, 15)
    assert.ok(res.entries.some(e => e.work_date === iso(2026, 5, 13)))
    assert.ok(res.issues.some(i => i.includes('день 12') && i.includes('13')))
  })
  it('лист с чужим именем пропускается', () => {
    const res = parseTimesheetWorkbook([{ name: 'Лист2', rows: [[]] }], 2026)
    assert.equal(res.periods.length, 0); assert.ok(res.issues[0].includes('Лист2'))
  })
})

describe('табель — сопоставление с сотрудниками и итоги', () => {
  const staff = [{ id: 1, full_name: 'Тестова Анна' }, { id: 2, full_name: 'Пробный Иван Сергеевич' }, { id: 3, full_name: 'Другой' }]
  it('точное совпадение, совпадение по началу, нераспознанные', () => {
    const m = matchStaff(['тестова анна', 'Пробный Иван', 'Неизвестный'], staff)
    assert.equal(m.matched['тестова анна'], 1)
    assert.equal(m.matched['Пробный Иван'], 2)
    assert.deepEqual(m.unmatched, ['Неизвестный'])
  })
  it('итоги за полумесяц: сумма долей и штраф', () => {
    const entries = [
      { staff_id: 1, work_date: '2026-03-01', share: 1 }, { staff_id: 1, work_date: '2026-03-02', share: 0.7 },
      { staff_id: 1, work_date: '2026-03-16', share: 1 }, // другая половина
      { staff_id: 2, work_date: '2026-03-15', share: 0.5 },
    ]
    const fines = [{ staff_id: 2, year: 2026, month: 3, period: 1, amount: 5000 }, { staff_id: 2, year: 2026, month: 3, period: 2, amount: 1 }]
    const t = periodTotals(entries, fines, { year: 2026, month: 3, period: 1 })
    assert.deepEqual(t.shifts, { 1: 1.7, 2: 0.5 })
    assert.deepEqual(t.fine, { 2: 5000 })
  })
})
