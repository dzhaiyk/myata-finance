// Клиент к iiko Cloud API через Netlify-функцию /api/iiko.
// Ключ хранится на стороне функции; здесь только состав запроса и разбор ответа.

import { departmentCode, DEPARTMENT_LABELS } from './config.js'

const PROXY_URL = import.meta.env?.VITE_IIKO_PROXY_URL || '/api/iiko'
const PROXY_KEY = import.meta.env?.VITE_IIKO_PROXY_KEY || ''

export async function iikoRequest(action, body = {}, query = undefined) {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(PROXY_KEY ? { 'x-proxy-key': PROXY_KEY } : {}) },
    body: JSON.stringify({ action, body, ...(query ? { query } : {}) }),
  })
  const text = await res.text()
  let data = null
  try { data = JSON.parse(text) } catch { /* не JSON */ }
  if (!res.ok) throw new Error(data?.error ? `${data.error}${data.details ? `: ${data.details}` : ''}` : `iiko: HTTP ${res.status}`)
  return data
}

// iikoServer отдаёт подразделения, iikoCloud — организации: пробуем по очереди
export async function getDepartments() {
  try { return await iikoRequest('departments') }
  catch { return await iikoRequest('organizations', { returnAdditionalInfo: false }) }
}

// Список доступных полей OLAP — нужен, если названия колонок в вашем iiko другие
export const getOlapColumns = (reportType = 'SALES') =>
  iikoRequest('olap_columns', {}, { reportType })

// Поля OLAP-отчёта вынесены в константы: если в iiko они называются иначе,
// правится одно место (и можно передать свои через параметр fields).
//
// Отдел берётся из склада списания, а не из категории блюда (BR-SHF-019):
// за июнь–4 сентября 2026 склад заполнен у 100 % выручки, категория — у 82,7 %.
export const OLAP_FIELDS = {
  date: 'OpenDate.Typed',
  department: 'Store.Name',
  payType: 'PayTypes.Combo',
  sum: 'DishDiscountSumInt',
  orders: 'UniqOrderId.OrdersCount',
}

export function buildSalesRequest({ organizationIds, from, to, fields = OLAP_FIELDS }) {
  return {
    reportType: 'SALES',
    buildSummary: false,
    groupByRowFields: [fields.date, fields.department, fields.payType],
    groupByColFields: [],
    aggregateFields: [fields.sum, fields.orders],
    filters: {
      [fields.date]: { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
      OrderDeleted: { filterType: 'IncludeValues', values: ['NOT_DELETED'] },
      DeletedWithWriteoff: { filterType: 'IncludeValues', values: ['NOT_DELETED'] },
      ...(organizationIds?.length ? { 'Department.Id': { filterType: 'IncludeValues', values: organizationIds } } : {}),
    },
  }
}

// --- нормализация справочников iiko под справочники приложения -----------

export const DEPARTMENTS = ['Кухня', 'Бар', 'Кальян', 'Прочее']
export const PAYMENT_TYPES = ['Наличные', 'Kaspi', 'Halyk', 'Wolt', 'Glovo', 'Yandex Eda', 'Прочее']

export function normalizeDepartment(name) {
  // Точное совпадение по справочнику — единственное место сопоставления (ADR-0010)
  const code = departmentCode(name)
  if (code) return DEPARTMENT_LABELS[code]
  // Запасной разбор по смыслу названия: на случай, если в iiko настроят
  // другие склады или понадобится разобрать категорию блюда
  const s = String(name || '').toLowerCase()
  if (/кальян|дым|табак|hookah/.test(s)) return 'Кальян'
  if (/бар|напит|коктейл|алкогол|пиво|вино|чай|кофе|лимонад|bar/.test(s)) return 'Бар'
  if (/кухн|кух|блюд|горяч|салат|десерт|завтрак|пицц|суш|kitchen|food/.test(s)) return 'Кухня'
  return 'Прочее'
}

export function normalizePaymentType(name) {
  const s = String(name || '').toLowerCase()
  if (/налич|cash/.test(s)) return 'Наличные'
  if (/kaspi|каспи/.test(s)) return 'Kaspi'
  if (/halyk|халык|народн/.test(s)) return 'Halyk'
  if (/wolt|волт/.test(s)) return 'Wolt'
  if (/glovo|глово/.test(s)) return 'Glovo'
  if (/yandex|яндекс/.test(s)) return 'Yandex Eda'
  return 'Прочее'
}

const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.')) || 0)
const dateOf = (v) => String(v ?? '').slice(0, 10)

/**
 * Строки OLAP → выручка по дням: отделы, типы оплат, чеки.
 * @returns {Record<string, {departments: Record<string, number>, payments: Record<string, number>, checks: number, total: number}>}
 */
export function mapOlapRows(rows, fields = OLAP_FIELDS) {
  const byDate = {}
  for (const row of rows || []) {
    const date = dateOf(row[fields.date])
    if (!date) continue
    const sum = num(row[fields.sum])
    const day = byDate[date] || (byDate[date] = {
      departments: Object.fromEntries(DEPARTMENTS.map(d => [d, 0])),
      payments: Object.fromEntries(PAYMENT_TYPES.map(p => [p, 0])),
      checks: 0, total: 0,
    })
    day.departments[normalizeDepartment(row[fields.department])] += sum
    day.payments[normalizePaymentType(row[fields.payType])] += sum
    day.checks += num(row[fields.orders])
    day.total += sum
  }
  for (const day of Object.values(byDate)) {
    day.total = Math.round(day.total * 100) / 100
    for (const key of Object.keys(day.departments)) day.departments[key] = Math.round(day.departments[key] * 100) / 100
    for (const key of Object.keys(day.payments)) day.payments[key] = Math.round(day.payments[key] * 100) / 100
  }
  return byDate
}

/**
 * Выручка за период из iiko, уже в терминах отчёта смены.
 * @param {{from: string, to: string, organizationIds?: string[]}} params даты YYYY-MM-DD
 */
export async function fetchSales({ from, to, organizationIds }) {
  const body = buildSalesRequest({ organizationIds, from, to })
  const res = await iikoRequest('olap', body)
  return mapOlapRows(res?.data || [])
}

/**
 * Приводит день из iiko к структуре data отчёта смены (revenue/departments).
 */
export function toDailyReportShape(day) {
  if (!day) return null
  return {
    departments: DEPARTMENTS.map(name => ({ name, amount: String(day.departments[name] || 0) })),
    revenue: PAYMENT_TYPES.map(type => ({ type, amount: String(day.payments[type] || 0), checks: '' })),
    checks: day.checks,
    total: day.total,
  }
}
