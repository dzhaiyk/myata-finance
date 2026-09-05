// Изъятия из кассовой смены iiko → строки секций расходов отчёта смены (BR-SHF-021).
// Чистые функции: ни сети, ни базы. Формат ответа iiko по кассовым сменам не
// подтверждён поддержкой, поэтому разбор терпимый: поле ищется по нескольким
// именам, а сырой платёж сохраняется рядом — предпросмотр покажет его как есть.

export const WITHDRAWAL_SECTIONS = ['suppliers_kitchen', 'suppliers_bar', 'tobacco', 'payroll', 'other', 'cash_withdrawals']
export const UNMATCHED_SECTION = 'other'
export const SOURCE = 'iiko'

const FIELD = {
  sum: ['sum', 'amount', 'value', 'total'],
  comment: ['comment', 'description', 'note', 'reason', 'name'],
  type: ['type', 'paymentType', 'kind', 'operationType', 'documentType'],
  date: ['date', 'dateTime', 'createdAt', 'openDate', 'time'],
  id: ['id', 'documentId', 'documentNumber'],
}

export function pickField(raw, names) {
  if (!raw || typeof raw !== 'object') return undefined
  const keys = Object.keys(raw)
  for (const n of names) {
    const k = keys.find(key => key.toLowerCase() === n.toLowerCase())
    if (k !== undefined && raw[k] != null && raw[k] !== '') return raw[k]
  }
  return undefined
}

const num = (v) => (typeof v === 'number' ? v : Number(String(v ?? '').replace(/\s/g, '').replace(',', '.')) || 0)

/** Один платёж кассовой смены в общем виде. */
export function normalizePayment(raw) {
  const typeRaw = pickField(raw, FIELD.type)
  return {
    id: pickField(raw, FIELD.id) ?? null,
    type: typeRaw == null ? '' : String(typeof typeRaw === 'object' ? (typeRaw.name ?? typeRaw.code ?? '') : typeRaw),
    sum: num(pickField(raw, FIELD.sum)),
    comment: String(pickField(raw, FIELD.comment) ?? '').trim(),
    date: String(pickField(raw, FIELD.date) ?? ''),
    raw,
  }
}

/** Изъятие (деньги ушли из кассы), а не внесение. Без типа судим по знаку. */
export function isPayOut(p) {
  const t = String(p.type || '').toLowerCase()
  if (/out|expense|изъят|выдач|расход|withdraw/.test(t)) return true
  if (/in\b|income|внес|приход|deposit/.test(t)) return false
  return p.sum < 0
}

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Правило {pattern, section, name}: pattern — слова через «|», без учёта регистра. */
export function ruleRegex(rule) {
  const alts = String(rule?.pattern || '').split('|').map(s => s.trim()).filter(Boolean).map(escapeRe)
  return alts.length ? new RegExp(alts.join('|'), 'i') : null
}

export function matchRule(comment, rules) {
  for (const rule of rules || []) {
    if (!WITHDRAWAL_SECTIONS.includes(rule.section)) continue
    const re = ruleRegex(rule)
    if (re && re.test(comment || '')) return rule
  }
  return null
}

/**
 * Платежи смены → строки по секциям. Внесения пропускаются, неопознанные
 * изъятия попадают в «Прочие расходы» с исходным комментарием — не теряются.
 */
export function splitPayments(rawPayments, rules, { unmatchedName = 'Изъятие iiko' } = {}) {
  const rows = Object.fromEntries(WITHDRAWAL_SECTIONS.map(s => [s, []]))
  const unmatched = []
  const skipped = []
  for (const raw of rawPayments || []) {
    const p = normalizePayment(raw)
    if (!isPayOut(p) || !p.sum) { skipped.push(p); continue }
    const amount = Math.abs(p.sum)
    const rule = matchRule(p.comment, rules)
    if (rule) {
      const row = rule.section === 'cash_withdrawals'
        ? { amount: String(amount), comment: p.comment, source: SOURCE }
        : { name: rule.name || p.comment || rule.pattern, amount: String(amount), comment: rule.name ? p.comment : '', source: SOURCE }
      rows[rule.section].push(row)
    } else {
      rows[UNMATCHED_SECTION].push({ name: p.comment || unmatchedName, amount: String(amount), comment: 'iiko: не распознано', source: SOURCE, unmatched: true })
      unmatched.push(p)
    }
  }
  return { rows, unmatched, skipped }
}

const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase()
const isBlank = (r) => !num(r.amount) && !String(r.name || '').trim() && !String(r.comment || '').trim()

/**
 * Накладывает строки из iiko на текущие изъятия. Повторный запуск не дублирует:
 * прежние строки с source=iiko снимаются, фиксированные строки (Табак, Хозтовары…)
 * заполняются по имени, ручные строки менеджера не трогаются.
 */
export function mergeWithdrawals(current, rows, fixedSections = ['tobacco', 'other']) {
  const out = {}
  for (const section of WITHDRAWAL_SECTIONS) {
    const fixed = fixedSections.includes(section)
    let list = (current?.[section] || []).map(r => ({ ...r }))
    // снять прошлый импорт
    list = list.filter(r => r.source !== SOURCE || (fixed && !r.unmatched && FIXED_ROW(r, current?.[section])))
    for (const r of list) if (r.source === SOURCE) { r.amount = ''; r.comment = ''; delete r.source }
    for (const row of rows?.[section] || []) {
      const target = fixed && !row.unmatched ? list.find(r => same(r.name, row.name)) : null
      if (target) {
        target.amount = String(num(target.amount) + num(row.amount))
        target.comment = [target.comment, row.comment].filter(Boolean).join('; ')
        target.source = SOURCE
      } else {
        list.push({ ...row })
      }
    }
    if (section !== 'tobacco' && section !== 'other') list = list.filter(r => !isBlank(r))
    else list = list.filter(r => !(isBlank(r) && !String(r.name || '').trim()))
    if (!list.length) list.push(section === 'cash_withdrawals' ? { amount: '', comment: '' } : { name: '', amount: '', comment: '' })
    out[section] = list
  }
  return out
}

// Фиксированная строка — та, что была в секции с именем и без импорта: её
// оставляем, лишь обнулив сумму импорта.
function FIXED_ROW(r) { return !!String(r.name || '').trim() }

/** Сводка для предпросмотра: сколько подставлено, что не распознано, какие поля пришли. */
export function summarize(split) {
  const added = Object.values(split.rows).reduce((s, list) => s + list.length, 0)
  const total = Object.values(split.rows).flat().reduce((s, r) => s + num(r.amount), 0)
  const sample = split.unmatched[0]?.raw || split.skipped[0]?.raw || null
  return {
    added, total: Math.round(total * 100) / 100,
    unmatched: split.unmatched.length, skipped: split.skipped.length,
    fields: sample ? Object.keys(sample) : [],
  }
}
