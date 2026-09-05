// Операции эквайринга: разбор выписок Kaspi (xlsx) и Halyk POS (pdf) и сверка
// с безналом смены (TASK-048, BR-CTL-019).
//
// Зачем: известный фрод в общепите — оплату пробивают как безнал, а с гостя
// берут наличными. Тогда в отчёте безнал есть, а денег от эквайрера нет.
// Обратный случай (деньги пришли, чека нет) тоже виден — так нашлась смена
// 12 января 2026 года.
//
// Ключевая деталь: эквайрер датирует операцию календарным днём, а смена
// заканчивается в 06:00 (BR-SHF-001). Без приведения к операционному дню
// ночные продажи дают ложные расхождения в сотни тысяч тенге в обе стороны.
import { businessDateFromParts } from './dates.js'

export const ACQUIRERS = { kaspi: 'Kaspi', halyk_pos: 'Halyk POS' }

const num = (v) => {
  if (typeof v === 'number') return v
  const s = String(v ?? '').replace(/\s| /g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : 0
}

/** «13.01.2026» → «2026-01-13»; иначе null. */
export function isoFromDots(v) {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})/.exec(String(v ?? '').trim())
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null
}

const hourOf = (t) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t ?? '').trim())
  return m ? Number(m[1]) : null
}

/**
 * Выписка Kaspi по эквайрингу (лист как массив массивов).
 * Шапка даёт БИН и название продавца, дальше строки операций.
 * @returns {{merchant: string|null, bin: string|null, ops: object[], issues: string[]}}
 */
export function parseKaspiAcquiring(rows, { cutoffHour } = {}) {
  const issues = []
  let merchant = null, bin = null, header = -1
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const cells = (rows[i] || []).map(c => String(c ?? '').trim())
    if (cells.includes('ИИН/БИН')) bin = cells[cells.indexOf('ИИН/БИН') + 1] || null
    if (cells.includes('Наименование')) merchant = cells[cells.indexOf('Наименование') + 1] || null
    if (cells.includes('Дата') && cells.includes('Сумма') && cells.includes('Тип операции')) { header = i; break }
  }
  if (header < 0) return { merchant, bin, ops: [], issues: ['в файле нет таблицы операций — это выписка Kaspi по эквайрингу?'] }

  const col = {}
  ;(rows[header] || []).forEach((c, i) => { col[String(c ?? '').trim()] = i })
  const ops = []
  for (let i = header + 1; i < rows.length; i++) {
    const r = rows[i] || []
    const iso = isoFromDots(r[col['Дата']])
    if (!iso) continue
    const time = String(r[col['Время']] ?? '').trim()
    const no = String(r[col['Номер операции']] ?? '').trim()
    if (!no) { issues.push(`строка ${i + 1}: нет номера операции`); continue }
    ops.push({
      acquirer: 'kaspi', merchant, operation_no: no,
      op_type: String(r[col['Тип операции']] ?? '').trim() || null,
      operated_on: iso, operated_at: time,
      business_date: businessDateFromParts(iso, hourOf(time), cutoffHour),
      amount: num(r[col['Сумма']]),
      fee: num(r[col['Стоимость услуг Kaspi']]),
      pay_method: String(r[col['Способ оплаты']] ?? '').trim() || null,
      channel: String(r[col['Канал оплаты']] ?? '').trim() || null,
      terminal: null,
    })
  }
  if (!ops.length) issues.push('операции не найдены')
  return { merchant, bin, ops, issues }
}

const POS_NUM = String.raw`-?\d[\d\s ]*[.,]\d+`

/**
 * Выписка Halyk по POS-договору: страницы из `extractPdfText`.
 * Запись занимает три строки: дата операции, строка с суммами, время.
 */
export function parseHalykPos(pages, { cutoffHour } = {}) {
  const issues = []
  const lines = []
  for (const page of pages || []) {
    for (const l of linesOf(page)) lines.push(l)
  }
  let merchant = null
  const mm = lines.join('\n').match(/ИП\s+[A-ZА-Я][\w-]*|ТОО\s+"?[^"\n]{2,40}"?/)
  if (mm) merchant = mm[0].trim()

  const ops = []
  let lastDate = null, pending = null, seq = 0
  const rowRe = new RegExp(String.raw`(Оплата|Возврат)\s+(${POS_NUM})\s+(${POS_NUM})\s+(${POS_NUM})`)
  const dateRe = /(\d{2})\.(\d{2})\.(\d{4})/
  const timeRe = /^\s*(\d{2}):(\d{2}):(\d{2})(?:\s|$)/
  const termRe = /\s(\d{7,10})\s+\d{6}-\d{2}\/\d{2}\/\d{2}/

  for (const raw of lines) {
    const line = String(raw)
    const only = line.trim()
    if (dateRe.test(only) && !rowRe.test(line)) {
      const m = dateRe.exec(only)
      lastDate = `${m[3]}-${m[2]}-${m[1]}`
    }
    const m = rowRe.exec(line)
    if (m) {
      // В строке с суммами первой стоит дата зачисления — она на день-два
      // позже. Операционный день считаем по дате самой транзакции, она
      // пришла отдельной строкой выше.
      const term = termRe.exec(line)
      pending = {
        type: m[1], amount: num(m[2]), settled: num(m[3]), fee: num(m[4]),
        date: lastDate, terminal: term ? term[1] : null,
        auth: (line.match(/\s(\d{6})\s+[A-Z0-9]{10,}/) || [])[1] || null,
        rrn: (line.match(/\s([A-Z0-9]{12,})\s+[\d.]{6,}\.{0,3}\d*/) || [])[1] || null,
      }
      continue
    }
    const t = timeRe.exec(line)
    if (t && pending) {
      const time = `${t[1]}:${t[2]}:${t[3]}`
      if (!pending.date) { issues.push('операция без даты пропущена'); pending = null; continue }
      seq += 1
      // Возврат приходит с тем же RRN, что и оплата, — различаем суффиксом,
      // иначе одна из двух строк потеряется при защите от повторной загрузки
      const base = pending.rrn || pending.auth || `${pending.date}T${time}#${seq}`
      ops.push({
        acquirer: 'halyk_pos', merchant, op_type: pending.type,
        operation_no: pending.type === 'Возврат' ? `${base}-R` : base,
        operated_on: pending.date, operated_at: time,
        business_date: businessDateFromParts(pending.date, Number(t[1]), cutoffHour),
        amount: pending.amount, fee: pending.fee,
        pay_method: null, channel: null, terminal: pending.terminal,
      })
      pending = null
    }
  }
  if (!ops.length) issues.push('операции не найдены — это выписка Halyk по POS-договору?')
  return { merchant, ops, issues }
}

function linesOf(page) {
  if (Array.isArray(page?.lines)) return page.lines
  const items = page?.items || []
  const byY = []
  for (const it of [...items].sort((a, b) => b.y - a.y || a.x - b.x)) {
    const row = byY.find(l => Math.abs(l.y - it.y) <= 2)
    if (row) row.items.push(it); else byY.push({ y: it.y, items: [it] })
  }
  return byY.map(l => l.items.sort((a, b) => a.x - b.x).map(i => i.text).join(' '))
}

/** Суммы операций по операционным дням. */
export function sumByBusinessDate(ops) {
  const by = {}
  for (const o of ops || []) by[o.business_date] = (by[o.business_date] || 0) + (Number(o.amount) || 0)
  for (const k of Object.keys(by)) by[k] = Math.round(by[k] * 100) / 100
  return by
}

/**
 * Сверка безнала смены с эквайрингом по дням.
 * Безнал смены — выручка отчёта за вычетом наличных: он приходит из iiko
 * и его же видит менеджер.
 * @returns {{days: object[], ok: boolean, worst: object|null, totals: object}}
 */
export function reconcileAcquiring({ reports, ops, threshold = 10000 }) {
  const acq = sumByBusinessDate(ops)
  const days = []
  const byDate = new Map()
  for (const r of reports || []) {
    const revenue = (r.data?.revenue || [])
    const cash = revenue.filter(x => /налич/i.test(String(x.type))).reduce((s, x) => s + num(x.amount), 0)
    const total = revenue.reduce((s, x) => s + num(x.amount), 0)
    byDate.set(r.report_date, { card: Math.round((total - cash) * 100) / 100 })
  }
  for (const date of [...new Set([...byDate.keys(), ...Object.keys(acq)])].sort()) {
    const card = byDate.get(date)?.card ?? null
    const acquiring = acq[date] ?? 0
    if (card == null && !acquiring) continue
    const diff = Math.round(((card ?? 0) - acquiring) * 100) / 100
    days.push({
      date, card, acquiring, diff,
      // безнал больше эквайринга — деньги по карте не пришли: это и есть фрод
      status: card == null ? 'no_report' : Math.abs(diff) <= threshold ? 'ok' : diff > 0 ? 'missing_money' : 'extra_money',
    })
  }
  const bad = days.filter(d => d.status === 'missing_money' || d.status === 'extra_money')
  const worst = bad.slice().sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0] || null
  return {
    days, ok: bad.length === 0, worst,
    totals: {
      card: Math.round(days.reduce((s, d) => s + (d.card || 0), 0) * 100) / 100,
      acquiring: Math.round(days.reduce((s, d) => s + d.acquiring, 0) * 100) / 100,
      flagged: bad.length,
    },
  }
}
