// Клиент к iiko Cloud API через Netlify-функцию /api/iiko.
// Ключ хранится на стороне функции; здесь только состав запроса и разбор ответа.

import {
  departmentCode, departmentCodeByIikoStore, departmentsFor,
  departmentLabel, FALLBACK_DEPARTMENT_CODE,
} from './config.js'

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

export const PAYMENT_TYPES = ['Наличные', 'Kaspi', 'Halyk', 'Wolt', 'Glovo', 'Yandex Eda', 'Прочее']

/**
 * Код отдела по значению из выгрузки iiko: сначала по складу списания
 * (BR-SHF-019), затем по названию — на случай, если поле настроят иначе.
 * Нераспознанное уходит в запасной отдел, а не теряется.
 */
export function departmentCodeOf(value) {
  return departmentCodeByIikoStore(value) || departmentCode(value) || FALLBACK_DEPARTMENT_CODE
}

/** Подпись отдела для показа. */
export const normalizeDepartment = (value) => departmentLabel(departmentCodeOf(value))

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
      // ключи — коды отделов из справочника, не отображаемые названия
      departments: Object.fromEntries(departmentsFor('revenue').map(d => [d.code, 0])),
      payments: Object.fromEntries(PAYMENT_TYPES.map(p => [p, 0])),
      checks: 0, total: 0,
    })
    const code = departmentCodeOf(row[fields.department])
    if (day.departments[code] === undefined) day.departments[code] = 0
    day.departments[code] += sum
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
    departments: departmentsFor('revenue').map(d => ({
      code: d.code, name: d.name, amount: String(day.departments[d.code] || 0),
    })),
    revenue: PAYMENT_TYPES.map(type => ({ type, amount: String(day.payments[type] || 0), checks: '' })),
    checks: day.checks,
    total: day.total,
  }
}

// --- изъятия из кассы: OLAP-отчёт TRANSACTIONS (TASK-037) -----------------
//
// Методов /resto/api/v2/cashshifts/* в этом API нет — iiko отвечал на них 404
// (проверено 06.09.2026). Кассовые операции берём отчётом TRANSACTIONS с того
// же эндпоинта, что и выручку. Имена полей в разных версиях iiko отличаются,
// поэтому сначала спрашиваем у сервера список доступных полей и выбираем из
// него; если список не отдался — работаем по кандидатам по умолчанию.

export const TRANSACTION_FIELDS = {
  date: ['DateTime.Typed', 'DateTime.DateTyped', 'DateTime.OperDayFilter', 'OpenDate.Typed'],
  type: ['TransactionType', 'Transaction.Type', 'OperationType'],
  comment: ['TransactionComment', 'Comment', 'Description', 'Transaction.Comment'],
  account: ['Account.Name', 'Account.StoreOrAccount', 'CounteragentAccount.Name'],
  session: ['Session.Number', 'CashRegister.Number', 'Session.CashRegister.Number'],
  out: ['Sum.Outcoming', 'Sum.Out'],
  in: ['Sum.Incoming', 'Sum.In'],
  sum: ['Sum.ResignedSum', 'Sum', 'Amount'],
}

/** Первое из имён-кандидатов, которое сервер назвал доступным. */
export function pickOlapField(columns, candidates) {
  const names = Array.isArray(columns) ? columns.map(c => c?.name ?? c) : Object.keys(columns || {})
  const set = new Set(names.map(String))
  return candidates.find(c => set.has(c)) || null
}

/** Разбор ответа `olap/columns` в набор полей отчёта транзакций. */
export function pickTransactionFields(columns) {
  const has = columns && (Array.isArray(columns) ? columns.length : Object.keys(columns).length)
  if (!has) return { ...defaultTransactionFields(), discovered: false }
  const f = {}
  for (const [key, candidates] of Object.entries(TRANSACTION_FIELDS)) f[key] = pickOlapField(columns, candidates)
  // без даты и суммы отчёт не построить — падаем на умолчания
  if (!f.date || !(f.out || f.sum)) return { ...defaultTransactionFields(), discovered: false }
  return { ...f, discovered: true }
}

function defaultTransactionFields() {
  const first = {}
  for (const [key, candidates] of Object.entries(TRANSACTION_FIELDS)) first[key] = candidates[0]
  return first
}

/** Тело запроса OLAP TRANSACTIONS за одну операционную дату. */
export function buildTransactionsRequest({ from, to, fields }) {
  const rowFields = [fields.date, fields.type, fields.comment, fields.account, fields.session].filter(Boolean)
  const aggregate = [fields.out, fields.in, fields.sum].filter(Boolean)
  return {
    reportType: 'TRANSACTIONS',
    buildSummary: false,
    groupByRowFields: rowFields,
    groupByColFields: [],
    aggregateFields: aggregate,
    filters: {
      [fields.date]: { filterType: 'DateRange', periodType: 'CUSTOM', from, to, includeLow: true, includeHigh: true },
    },
  }
}

/**
 * Строки отчёта → платежи в общем виде: сумма отрицательна, когда деньги ушли
 * из кассы, — по этому знаку `isPayOut` отличит изъятие от внесения, даже если
 * название типа операции незнакомое.
 */
export function mapTransactionRows(rows, fields) {
  return (rows || []).map(row => {
    const outSum = fields.out ? num(row[fields.out]) : 0
    const inSum = fields.in ? num(row[fields.in]) : 0
    const plain = fields.sum ? num(row[fields.sum]) : 0
    const signed = (fields.out || fields.in) ? inSum - outSum : plain
    return {
      type: String(row[fields.type] ?? ''),
      sum: signed,
      comment: String(row[fields.comment] ?? '').trim(),
      date: String(row[fields.date] ?? ''),
      account: fields.account ? String(row[fields.account] ?? '') : '',
      raw: row,
    }
  })
}

/**
 * Кассовые операции за операционную дату.
 * @param {{date: string}} params дата YYYY-MM-DD
 * @returns {Promise<{payments: object[], fields: object, rows: number}>}
 */
export async function fetchCashPayments({ date }) {
  let columns = null
  try { columns = await iikoRequest('olap_columns', {}, { reportType: 'TRANSACTIONS' }) } catch { /* спросим по умолчанию */ }
  const fields = pickTransactionFields(columns)
  const res = await iikoRequest('olap', buildTransactionsRequest({ from: date, to: date, fields }))
  const rows = res?.data || []
  return { payments: mapTransactionRows(rows, fields), fields, rows: rows.length }
}
