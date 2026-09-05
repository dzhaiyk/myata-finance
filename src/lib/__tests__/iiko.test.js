import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeDepartment, normalizePaymentType, mapOlapRows, buildSalesRequest,
  toDailyReportShape, OLAP_FIELDS,
  pickOlapField, pickTransactionFields, buildTransactionsRequest, mapTransactionRows,
} from '../iiko.js'
import { setDepartments } from '../config.js'
import { FIXTURE_DEPARTMENTS } from './fixtures.js'

// Справочник отделов приходит из базы — подставляем набор заведения
setDepartments(FIXTURE_DEPARTMENTS)

describe('iiko — справочники под отчёт смены', () => {
  // Отдел определяется складом из справочника, а не угадыванием по названию:
  // прежняя эвристика по словам («горячие», «коктейль») убрана вместе с
  // переходом на Store.Name (BR-SHF-019) и справочник отделов (миграция 025).
  it('отдел берётся из справочника: по складу, коду или названию', () => {
    assert.equal(normalizeDepartment('СКЛАД КУХНЯ МЯТА'), 'Кухня')
    assert.equal(normalizeDepartment('СКЛАД БАР МЯТА'), 'Бар')
    assert.equal(normalizeDepartment('kitchen'), 'Кухня')
    assert.equal(normalizeDepartment('Кальян'), 'Кальян')
  })

  it('незнакомый склад не теряется, а уходит в запасной отдел', () => {
    assert.equal(normalizeDepartment('СКЛАД БАНКЕТ'), 'Прочее')
    assert.equal(normalizeDepartment('Горячие блюда'), 'Прочее')
    assert.equal(normalizeDepartment(null), 'Прочее')
  })

  // BR-SHF-019: отдел берётся из склада списания, а не из категории блюда
  it('склады iiko раскладываются по отделам', () => {
    assert.equal(normalizeDepartment('СКЛАД КУХНЯ МЯТА'), 'Кухня')
    assert.equal(normalizeDepartment('СКЛАД БАР МЯТА'), 'Бар')
    assert.equal(normalizeDepartment('СКЛАД КАЛЬЯН МЯТА'), 'Кальян')
    assert.equal(normalizeDepartment('  склад бар мята  '), 'Бар')
    assert.equal(normalizeDepartment('СКЛАД БАНКЕТ'), 'Прочее')
  })

  it('типы оплат приводятся к типам приложения', () => {
    assert.equal(normalizePaymentType('Наличные'), 'Наличные')
    assert.equal(normalizePaymentType('CASH'), 'Наличные')
    assert.equal(normalizePaymentType('Kaspi QR'), 'Kaspi')
    assert.equal(normalizePaymentType('Каспи перевод'), 'Kaspi')
    assert.equal(normalizePaymentType('Halyk POS'), 'Halyk')
    assert.equal(normalizePaymentType('Народный банк'), 'Halyk')
    assert.equal(normalizePaymentType('Wolt'), 'Wolt')
    assert.equal(normalizePaymentType('Яндекс Еда'), 'Yandex Eda')
    assert.equal(normalizePaymentType('Сертификат'), 'Прочее')
  })
})

describe('iiko — разбор OLAP-ответа', () => {
  // Отдел приходит складом списания (BR-SHF-019)
  const rows = [
    { 'OpenDate.Typed': '2026-09-01', 'Store.Name': 'СКЛАД КУХНЯ МЯТА', 'PayTypes.Combo': 'Наличные', DishDiscountSumInt: 100000, 'UniqOrderId.OrdersCount': 10 },
    { 'OpenDate.Typed': '2026-09-01', 'Store.Name': 'СКЛАД БАР МЯТА', 'PayTypes.Combo': 'Kaspi QR', DishDiscountSumInt: 80000.5, 'UniqOrderId.OrdersCount': 8 },
    { 'OpenDate.Typed': '2026-09-01', 'Store.Name': 'СКЛАД КАЛЬЯН МЯТА', 'PayTypes.Combo': 'Halyk POS', DishDiscountSumInt: 70000, 'UniqOrderId.OrdersCount': 7 },
    { 'OpenDate.Typed': '2026-09-02', 'Store.Name': 'СКЛАД КУХНЯ МЯТА', 'PayTypes.Combo': 'Наличные', DishDiscountSumInt: 50000, 'UniqOrderId.OrdersCount': 5 },
  ]

  it('складывает выручку по дням, отделам и оплатам', () => {
    const days = mapOlapRows(rows)
    assert.deepEqual(Object.keys(days).sort(), ['2026-09-01', '2026-09-02'])
    const d1 = days['2026-09-01']
    // ключи — коды отделов из справочника
    assert.equal(d1.departments.kitchen, 100000)
    assert.equal(d1.departments.bar, 80000.5)
    assert.equal(d1.departments.hookah, 70000)
    assert.equal(d1.payments['Наличные'], 100000)
    assert.equal(d1.payments['Kaspi'], 80000.5)
    assert.equal(d1.payments['Halyk'], 70000)
    assert.equal(d1.checks, 25)
    assert.equal(d1.total, 250000.5)
    // сумма по отделам всегда равна сумме по оплатам — это первая сверка отчёта
    const byDept = Object.values(d1.departments).reduce((s, v) => s + v, 0)
    const byPay = Object.values(d1.payments).reduce((s, v) => s + v, 0)
    assert.equal(byDept, byPay)
  })

  it('пустой ответ не роняет разбор', () => {
    assert.deepEqual(mapOlapRows([]), {})
    assert.deepEqual(mapOlapRows(null), {})
  })

  it('строки без даты игнорируются', () => {
    assert.deepEqual(mapOlapRows([{ DishCategory: 'Кухня', DishDiscountSumInt: 1000 }]), {})
  })

  it('дата с временем обрезается до дня', () => {
    const days = mapOlapRows([{ 'OpenDate.Typed': '2026-09-01T21:30:00', DishCategory: 'Кухня', 'PayTypes.Combo': 'Наличные', DishDiscountSumInt: 1000 }])
    assert.ok(days['2026-09-01'])
  })

  it('день превращается в структуру отчёта смены', () => {
    const day = mapOlapRows(rows)['2026-09-01']
    const shape = toDailyReportShape(day)
    assert.deepEqual(shape.departments.map(d => d.name), ['Кухня', 'Бар', 'Кальян', 'Прочее'])
    assert.equal(shape.departments[0].amount, '100000')
    assert.equal(shape.revenue.find(r => r.type === 'Kaspi').amount, '80000.5')
    assert.equal(shape.checks, 25)
  })
})

describe('iiko — тело запроса OLAP', () => {
  it('фильтр по датам и группировки соответствуют полям отчёта', () => {
    const body = buildSalesRequest({ from: '2026-09-01', to: '2026-09-02', organizationIds: ['org-1'] })
    assert.equal(body.reportType, 'SALES')
    assert.deepEqual(body.groupByRowFields, [OLAP_FIELDS.date, OLAP_FIELDS.department, OLAP_FIELDS.payType])
    assert.deepEqual(body.aggregateFields, [OLAP_FIELDS.sum, OLAP_FIELDS.orders])
    assert.equal(body.filters[OLAP_FIELDS.date].from, '2026-09-01')
    assert.equal(body.filters[OLAP_FIELDS.date].to, '2026-09-02')
    assert.deepEqual(body.filters['Department.Id'].values, ['org-1'])
    assert.deepEqual(body.filters.OrderDeleted.values, ['NOT_DELETED'])
  })

  it('без организаций фильтр по подразделению не добавляется', () => {
    const body = buildSalesRequest({ from: '2026-09-01', to: '2026-09-01' })
    assert.equal(body.filters['Department.Id'], undefined)
  })
})

// TASK-037: методов /resto/api/v2/cashshifts/* в этом API нет — iiko отвечал на
// них 404 (06.09.2026). Изъятия берём отчётом TRANSACTIONS с того же эндпоинта,
// что и выручку, а имена полей спрашиваем у сервера.
describe('iiko — изъятия из кассы через OLAP TRANSACTIONS', () => {
  const COLUMNS = {
    'DateTime.Typed': { name: 'DateTime.Typed' },
    TransactionType: { name: 'TransactionType' },
    TransactionComment: { name: 'TransactionComment' },
    'Account.Name': { name: 'Account.Name' },
    'Session.Number': { name: 'Session.Number' },
    'Sum.Outcoming': { name: 'Sum.Outcoming' },
    'Sum.Incoming': { name: 'Sum.Incoming' },
  }

  it('поле выбирается из того, что сервер назвал доступным', () => {
    assert.equal(pickOlapField(COLUMNS, ['Нет.Такого', 'TransactionType']), 'TransactionType')
    assert.equal(pickOlapField(COLUMNS, ['Нет.Такого']), null)
    // сервер может отдать список массивом
    assert.equal(pickOlapField([{ name: 'Sum.ResignedSum' }], ['Sum.Outcoming', 'Sum.ResignedSum']), 'Sum.ResignedSum')
  })

  it('набор полей: из ответа сервера, иначе по умолчанию', () => {
    const f = pickTransactionFields(COLUMNS)
    assert.equal(f.discovered, true)
    assert.equal(f.date, 'DateTime.Typed')
    assert.equal(f.out, 'Sum.Outcoming')
    assert.equal(f.comment, 'TransactionComment')
    // пустой ответ или список без даты — работаем по умолчанию, а не падаем
    assert.equal(pickTransactionFields(null).discovered, false)
    assert.equal(pickTransactionFields({}).discovered, false)
    assert.equal(pickTransactionFields({ Foo: {} }).date, 'DateTime.Typed')
  })

  it('запрос строится на одну дату и только по существующим полям', () => {
    const body = buildTransactionsRequest({ from: '2026-09-05', to: '2026-09-05', fields: pickTransactionFields(COLUMNS) })
    assert.equal(body.reportType, 'TRANSACTIONS')
    assert.deepEqual(body.groupByRowFields, ['DateTime.Typed', 'TransactionType', 'TransactionComment', 'Account.Name', 'Session.Number'])
    // Sum.ResignedSum сервер не назвал — в запрос не попадает
    assert.deepEqual(body.aggregateFields, ['Sum.Outcoming', 'Sum.Incoming'])
    assert.equal(body.filters['DateTime.Typed'].from, '2026-09-05')
  })

  it('деньги из кассы — отрицательная сумма, внесение — положительная', () => {
    const fields = pickTransactionFields(COLUMNS)
    const rows = [
      { 'DateTime.Typed': '2026-09-05', TransactionType: 'Изъятие денег', TransactionComment: 'закуп кухня', 'Sum.Outcoming': 45000, 'Sum.Incoming': 0 },
      { 'DateTime.Typed': '2026-09-05', TransactionType: 'Внесение денег', TransactionComment: 'размен', 'Sum.Outcoming': 0, 'Sum.Incoming': 50000 },
    ]
    const [out, inc] = mapTransactionRows(rows, fields)
    assert.equal(out.sum, -45000)
    assert.equal(out.comment, 'закуп кухня')
    assert.equal(out.type, 'Изъятие денег')
    assert.equal(inc.sum, 50000)
  })

  it('одно поле суммы вместо пары приход/расход тоже понимается', () => {
    const fields = pickTransactionFields({ 'DateTime.Typed': {}, 'Sum.ResignedSum': {}, TransactionType: {} })
    assert.equal(fields.out, null)
    assert.equal(fields.sum, 'Sum.ResignedSum')
    const [row] = mapTransactionRows([{ 'DateTime.Typed': '2026-09-05', TransactionType: 'Изъятие', 'Sum.ResignedSum': -7000 }], fields)
    assert.equal(row.sum, -7000)
  })
})
