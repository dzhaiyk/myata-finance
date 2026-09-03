import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizeDepartment, normalizePaymentType, mapOlapRows, buildSalesRequest,
  toDailyReportShape, OLAP_FIELDS,
} from '../iiko.js'

describe('iiko — справочники под отчёт смены', () => {
  it('категории блюд раскладываются по четырём отделам', () => {
    assert.equal(normalizeDepartment('Кухня'), 'Кухня')
    assert.equal(normalizeDepartment('Горячие блюда'), 'Кухня')
    assert.equal(normalizeDepartment('Десерты'), 'Кухня')
    assert.equal(normalizeDepartment('Барная карта'), 'Бар')
    assert.equal(normalizeDepartment('Коктейли'), 'Бар')
    assert.equal(normalizeDepartment('Кальяны'), 'Кальян')
    assert.equal(normalizeDepartment('Дымный коктейль'), 'Кальян')
    assert.equal(normalizeDepartment('Сувениры'), 'Прочее')
    assert.equal(normalizeDepartment(null), 'Прочее')
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
  const rows = [
    { 'OpenDate.Typed': '2026-09-01', DishCategory: 'Кухня', 'PayTypes.Combo': 'Наличные', DishDiscountSumInt: 100000, 'UniqOrderId.OrdersCount': 10 },
    { 'OpenDate.Typed': '2026-09-01', DishCategory: 'Барная карта', 'PayTypes.Combo': 'Kaspi QR', DishDiscountSumInt: 80000.5, 'UniqOrderId.OrdersCount': 8 },
    { 'OpenDate.Typed': '2026-09-01', DishCategory: 'Кальяны', 'PayTypes.Combo': 'Halyk POS', DishDiscountSumInt: 70000, 'UniqOrderId.OrdersCount': 7 },
    { 'OpenDate.Typed': '2026-09-02', DishCategory: 'Кухня', 'PayTypes.Combo': 'Наличные', DishDiscountSumInt: 50000, 'UniqOrderId.OrdersCount': 5 },
  ]

  it('складывает выручку по дням, отделам и оплатам', () => {
    const days = mapOlapRows(rows)
    assert.deepEqual(Object.keys(days).sort(), ['2026-09-01', '2026-09-02'])
    const d1 = days['2026-09-01']
    assert.equal(d1.departments['Кухня'], 100000)
    assert.equal(d1.departments['Бар'], 80000.5)
    assert.equal(d1.departments['Кальян'], 70000)
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
    assert.deepEqual(body.groupByRowFields, [OLAP_FIELDS.date, OLAP_FIELDS.category, OLAP_FIELDS.payType])
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
