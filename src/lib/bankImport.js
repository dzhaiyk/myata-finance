// Импорт банковской выписки: общий конвейер для страницы «Импорт выписки»
// и для ежедневной загрузки из отчёта смены.
//
//   файл → parseStatementFile → строки в формате parseBankStatement
//        → buildImportRows (правила из базы, период, хеш)
//        → splitDuplicates (tx_hash уже в базе — повтор)
//        → commitImport (bank_transactions + движение по счёту)
//
// Здесь нет React и нет прямого обращения к Supabase-клиенту: клиент
// передаётся параметром, поэтому всё тестируется без браузера.

import { parseBankStatement, parseStatementBalances } from './categorize.js'
import { checkStatementFreshness } from './reconcile.js'
import { money } from './utils.js'

// Хеш для дедупликации — по КАЛЕНДАРНОЙ дате (dateRaw), а не по операционной:
// иначе уже загруженные строки при повторном импорте становятся «новыми».
export async function generateTxHash(tx) {
  const hashDate = tx.dateRaw || tx.date
  const str = `${hashDate}|${tx.number}|${tx.amount}|${tx.isDebit}|${(tx.beneficiary || '').trim().toLowerCase()}|${(tx.purpose || '').slice(0, 120).trim().toLowerCase()}`
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str))
  return Array.from(new Uint8Array(buf)).slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('')
}

// Одно условие правила из bank_rule_conditions. Поддерживает и разобранную
// строку (isDebit), и строку из базы (is_debit).
export function matchCondition(tx, cond) {
  if (cond.field === 'is_debit') {
    const val = tx.is_debit !== undefined ? tx.is_debit : tx.isDebit
    return String(val) === cond.value
  }
  const fieldVal = (() => {
    if (cond.field === 'beneficiary') return tx.beneficiary || ''
    if (cond.field === 'purpose') return tx.purpose || ''
    if (cond.field === 'knp') return tx.knp || ''
    if (cond.field === 'amount') return String(Math.abs(tx.amount || 0))
    return ''
  })()
  const val = String(cond.value ?? '')
  switch (cond.operator) {
    // Регулярное выражение: правила, перенесённые из кода (миграция 027),
    // хранятся как есть, чтобы поведение не поехало при переносе
    case 'matches': {
      try { return new RegExp(val, 'i').test(fieldVal) } catch { return false }
    }
    case 'contains': return fieldVal.toLowerCase().includes(val.toLowerCase())
    case 'not_contains': return !fieldVal.toLowerCase().includes(val.toLowerCase())
    case 'equals': return fieldVal.toLowerCase() === val.toLowerCase()
    case 'not_equals': return fieldVal.toLowerCase() !== val.toLowerCase()
    case 'starts_with': return fieldVal.toLowerCase().startsWith(val.toLowerCase())
    case 'gt': return Number(fieldVal) > Number(val)
    case 'gte': return Number(fieldVal) >= Number(val)
    case 'lt': return Number(fieldVal) < Number(val)
    case 'lte': return Number(fieldVal) <= Number(val)
    case 'between': {
      const [min, max] = val.split('-').map(Number)
      const n = Number(fieldVal)
      return n >= min && n <= max
    }
    default: return false
  }
}

/** Правила из базы с их условиями: первое совпавшее выигрывает. */
export function withConditions(rules, conditions) {
  return rules.map(r => ({ ...r, conditions: conditions.filter(c => c.rule_id === r.id) }))
}

export function applyDbRules(tx, rules) {
  for (const rule of rules) {
    if (!rule.conditions?.length) continue
    const matches = rule.conditions.map(c => matchCondition(tx, c))
    const pass = rule.logic === 'and' ? matches.every(Boolean) : matches.some(Boolean)
    if (pass) return { category: rule.category_code, action: rule.action, ruleId: rule.id }
  }
  return null
}

export async function loadActiveRules(supabase) {
  const [rRes, cRes] = await Promise.all([
    // Порядок обязателен: выигрывает первое совпавшее правило. Без сортировки
    // приоритет зависел бы от того, как база вернёт строки.
    supabase.from('bank_rules').select('*').eq('is_active', true).order('sort_order').order('id'),
    supabase.from('bank_rule_conditions').select('*'),
  ])
  return withConditions(rRes.data || [], cRes.data || [])
}

/** Период начисления по умолчанию — месяц операции. */
export function monthBounds(isoDate) {
  const d = new Date(isoDate)
  const base = isNaN(d) ? new Date() : d
  const y = base.getFullYear(), m = base.getMonth() + 1
  const mm = String(m).padStart(2, '0')
  return { period_from: `${y}-${mm}-01`, period_to: `${y}-${mm}-${new Date(y, m, 0).getDate()}` }
}

/**
 * Файл выписки → строки. PDF — Halyk, Excel — Kaspi Business.
 * balanceCheck: остаток начала + обороты = остаток конца; null, если в файле
 * остатков нет. Обрезанный или отредактированный файл ловится здесь, до базы.
 */
export async function parseStatementFile({ name, data }, { cutoffHour } = {}) {
  const isPdf = /\.pdf$/i.test(name || '')
  if (isPdf) {
    const { parseHalykPdf } = await import('./halykStatement.js')
    const res = await parseHalykPdf(data)
    if (!res.rows.length) throw new Error('В PDF не найдено ни одной операции. Это выписка по счёту Halyk?')
    let balanceCheck = null
    const { openingBalance, closingBalance } = res.meta || {}
    if (openingBalance != null && closingBalance != null) {
      const turnover = res.totals.credit - res.totals.debit
      const delta = Math.round((openingBalance + turnover - closingBalance) * 100) / 100
      balanceCheck = { opening: openingBalance, closing: closingBalance, delta, ok: Math.abs(delta) < 1 }
    }
    return { rows: res.rows, balanceCheck, parseIssues: res.issues || [], isPdf }
  }
  const XLSX = await import('xlsx')
  const wb = XLSX.read(data)
  const sheetRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 })
  const rows = parseBankStatement(sheetRows, { cutoffHour })
  if (!rows.length) throw new Error('В файле не найдено ни одной операции. Это выписка Kaspi Business?')
  const balances = parseStatementBalances(sheetRows)
  let balanceCheck = null
  if (balances.opening != null && balances.closing != null) {
    const turnover = rows.reduce((s, t) => s + (t.credit || 0) - (t.debit || 0), 0)
    const delta = Math.round((balances.opening + turnover - balances.closing) * 100) / 100
    balanceCheck = { ...balances, delta, ok: Math.abs(delta) < 1 }
  }
  return { rows, balanceCheck, parseIssues: [], isPdf }
}

/** Разобранные строки → строки bank_transactions. Правило «скрыть» выбрасывает строку. */
export async function buildImportRows(parsed, { rules = [], accountId, fileName = '', batchId } = {}) {
  let hidden = 0
  const rows = []
  for (const tx of parsed) {
    const rule = applyDbRules(tx, rules)
    if (rule?.action === 'hide') { hidden++; continue }
    rows.push({
      transaction_date: tx.date, amount: Math.abs(tx.amount), is_debit: tx.isDebit,
      beneficiary: tx.beneficiary || '', purpose: tx.purpose || '', knp: tx.knp || '',
      category: rule?.category || tx.category || 'uncategorized',
      confidence: rule ? 'auto' : tx.confidence || 'low',
      import_file: fileName, import_batch_id: batchId,
      tx_hash: await generateTxHash(tx),
      ...monthBounds(tx.date),
      account_id: accountId,
    })
  }
  return { rows, hidden }
}

export function splitDuplicates(rows, existingHashes) {
  const known = new Set(existingHashes)
  const fresh = rows.filter(r => !r.tx_hash || !known.has(r.tx_hash))
  return { fresh, duplicates: rows.length - fresh.length }
}

/** Файл → готовые к записи строки, без записи в базу. */
export async function stageStatement(supabase, file, { accountId, cutoffHour } = {}) {
  if (!accountId) throw new Error('Не выбран счёт для импорта')
  const parsed = await parseStatementFile(file, { cutoffHour })
  const rules = await loadActiveRules(supabase)
  const batchId = crypto.randomUUID()
  const { rows, hidden } = await buildImportRows(parsed.rows, { rules, accountId, fileName: file.name, batchId })
  let existing = []
  if (rows.length) {
    const hashes = rows.map(r => r.tx_hash).filter(Boolean)
    const { data, error } = await supabase.from('bank_transactions').select('tx_hash').in('tx_hash', hashes)
    if (error) throw error
    existing = (data || []).map(e => e.tx_hash)
  }
  const { fresh, duplicates } = splitDuplicates(rows, existing)
  return {
    rows: fresh, hidden, duplicates, parsedCount: parsed.rows.length,
    balanceCheck: parsed.balanceCheck, parseIssues: parsed.parseIssues, fileName: file.name,
  }
}

/**
 * Запись подтверждённых строк. Каждая строка выписки двигает баланс счёта,
 * категория влияет только на P&L и Cash Flow — поэтому движение по счёту
 * создаётся для всех строк, включая нераспознанные.
 */
export async function commitImport(supabase, rows, { reviewNote = null } = {}) {
  if (!rows?.length) return { inserted: [], skipped: 0 }
  // Пометка «к проверке» ставится на все строки файла: снять её можно на странице «Импорт выписки»
  if (reviewNote) rows = rows.map(r => ({ ...r, review_note: reviewNote }))
  let inserted = []
  let skipped = 0
  const { data, error } = await supabase.from('bank_transactions').insert(rows).select()
  if (error) {
    if (!/unique|duplicate/i.test(error.message || '')) throw error
    // Пакет упёрся в уникальный tx_hash — вставляем по одной, дубли пропускаем
    for (const row of rows) {
      const { data: one, error: e2 } = await supabase.from('bank_transactions').insert(row).select().single()
      if (e2) skipped++; else inserted.push(one)
    }
  } else {
    inserted = data || []
  }
  const acctTxs = inserted.filter(r => r.account_id).map(r => ({
    account_id: r.account_id,
    transaction_date: r.transaction_date,
    type: r.is_debit ? 'expense' : 'income',
    amount: Number(r.amount),
    description: r.beneficiary || r.purpose || r.category,
    reference_type: 'bank_import',
    reference_id: String(r.id),
    category: r.category,
  }))
  if (acctTxs.length) {
    const { error: e3 } = await supabase.from('account_transactions').insert(acctTxs)
    if (e3) throw e3
  }
  return { inserted, skipped }
}

/** Текст пометки для файла, у которого не сошлись остатки; null, если всё в порядке. */
export function balanceReviewNote(balanceCheck, fileName = '') {
  if (!balanceCheck || balanceCheck.ok) return null
  const delta = Math.round(balanceCheck.delta)
  return `Остатки в файле не сошлись на ${money(delta)} (${fileName || 'файл'})`
}

export function summarizeImport(rows) {
  const dates = rows.map(r => r.transaction_date).filter(Boolean).sort()
  return {
    total: rows.length,
    from: dates[0] || null,
    to: dates[dates.length - 1] || null,
    uncategorized: rows.filter(r => !r.category || r.category === 'uncategorized').length,
    debit: rows.filter(r => r.is_debit).reduce((s, r) => s + Number(r.amount), 0),
    credit: rows.filter(r => !r.is_debit).reduce((s, r) => s + Number(r.amount), 0),
  }
}

/** Дата последней операции по каждому счёту — по одному крошечному запросу на счёт. */
export async function loadLastStatementDates(supabase, accounts) {
  const entries = await Promise.all(accounts.map(async a => {
    const { data } = await supabase.from('bank_transactions').select('transaction_date')
      .eq('account_id', a.id).order('transaction_date', { ascending: false }).limit(1)
    return [a.id, data?.[0]?.transaction_date || null]
  }))
  return Object.fromEntries(entries)
}

/** Свежесть выписки одного счёта: тот же порог, что и на странице «Контроль». */
export function statementFreshness(lastDate, now = new Date(), warnDays = 3) {
  return checkStatementFreshness(lastDate ? [{ transaction_date: lastDate }] : [], now, warnDays)
}

const ruDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '—')

/** Текст для Telegram после загрузки выписки — чистая функция, живёт здесь ради тестов. */
export function formatStatementUploadNotification({ accountName, manager, from, to, total, duplicates = 0, uncategorized = 0, balanceOk = null }) {
  const period = from && to ? (from === to ? ruDate(from) : `${ruDate(from)} — ${ruDate(to)}`) : '—'
  const balance = balanceOk == null ? '' : balanceOk ? '\n✅ Остатки сошлись' : '\n⚠️ Остатки НЕ сошлись'
  const tail = uncategorized > 0 ? '\n\n⚠️ Нужна категоризация' : ''
  return `🏦 <b>Выписка загружена: ${accountName}</b>
👤 ${manager || '—'}
📅 ${period}
📊 Новых операций: ${total}${duplicates ? `, уже были: ${duplicates}` : ''}
❓ Без категории: ${uncategorized}${balance}${tail}`
}
