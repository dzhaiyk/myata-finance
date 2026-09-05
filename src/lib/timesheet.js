// Табель смен: чистый разбор листа Excel и итоги (TASK-038, BR-PAY «доля смены»).
// Формат файла «штатный график»: лист = полмесяца, строка = сотрудник,
// колонки: №, ФИО, должность (или процент от продаж), дни, «смены», «ШТРАФ»,
// последняя — телефон / «наличка». Шапка ненадёжна: месяц в ней бывает чужой,
// день бывает продублирован, лист второй половины бывает копией первой —
// поэтому даты берём из имени листа и порядка колонок, а не из шапки.

const MONTHS = 12
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate()
const pad = (n) => String(n).padStart(2, '0')
export const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`

/**
 * Имя листа → период. «01.12-15.12», «16.01-31.01», «1.02-15.02», «16.09-30».
 * Год: стартовый для первого листа; когда месяц идёт назад — следующий год.
 * @returns {{year, month, period, from, to}|null}
 */
export function parseSheetName(name, prevYearMonth, startYear) {
  // «01.01.26-15.01» — год бывает вписан в имя двумя цифрами; он надёжнее переноса по месяцам
  const m = String(name || '').match(/^\s*(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?\s*-\s*(\d{1,2})(?:\.(\d{1,2}))?/)
  if (!m) return null
  const fromDay = Number(m[1]), month = Number(m[2])
  if (month < 1 || month > MONTHS) return null
  let year
  if (m[3]) year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
  else {
    year = prevYearMonth ? prevYearMonth.year : startYear
    if (prevYearMonth && month < prevYearMonth.month) year += 1
  }
  const period = fromDay <= 15 ? 1 : 2
  const from = period === 1 ? 1 : 16
  const to = period === 1 ? 15 : daysInMonth(year, month)
  return { year, month, period, from, to }
}

const num = (v) => {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').trim())
  return Number.isFinite(n) ? n : null
}
export const normalizeName = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/**
 * Разбор одного листа. rows — массив строк (значения ячеек), как отдаёт SheetJS.
 * Возвращает записи табеля, штрафы, служебные заметки и проблемы.
 */
export function parseTimesheetSheet(rows, period) {
  const out = { entries: [], fines: [], notes: [], issues: [] }
  if (!period || !rows?.length) return out
  const header = rows[0] || [], dayHeader = rows[1] || []
  // колонки дней: с четвёртой, пока идут подряд числа 1..31 в строке 2
  const dayCols = []
  let expected = period.from
  for (let c = 3; c < Math.max(header.length, dayHeader.length); c++) {
    const d = num(dayHeader[c])
    if (d === null) { if (dayCols.length) break; else continue }
    if (d !== expected) {
      // повтор дня (май: 12 | 12 | 14) — берём по порядку, отмечаем
      out.issues.push(`колонка ${c + 1}: в шапке день ${d}, по порядку ${expected}`)
    }
    if (expected > period.to) break
    dayCols.push({ col: c, day: expected })
    expected += 1
  }
  if (!dayCols.length) { out.issues.push('не найдены колонки дней'); return out }
  const lastDayCol = dayCols[dayCols.length - 1].col
  const fineCol = header.findIndex((h, i) => i > lastDayCol && /штраф/i.test(String(h ?? '')))
  const shiftsCol = header.findIndex((h, i) => i > lastDayCol && /смен/i.test(String(h ?? '')))

  for (let r = 2; r < rows.length; r++) {
    const row = rows[r] || []
    const name = String(row[1] ?? '').trim()
    if (!name) continue
    const posCell = row[2]
    const pct = num(posCell)
    const position = pct !== null && pct < 1 ? null : (posCell ? String(posCell).trim() : null)
    const salesPct = pct !== null && pct < 1 ? pct : null
    let total = 0
    for (const { col, day } of dayCols) {
      const share = num(row[col])
      if (share === null || share <= 0) continue
      if (share > 1) { out.issues.push(`${name}, день ${day}: доля ${share} > 1`); continue }
      out.entries.push({ name, position, salesPct, work_date: iso(period.year, period.month, day), share: Math.round(share * 100) / 100 })
      total += share
    }
    const declared = shiftsCol >= 0 ? num(row[shiftsCol]) : null
    if (declared !== null && Math.abs(declared - total) > 0.01) {
      out.issues.push(`${name}: в листе «смены» ${declared}, по дням ${Math.round(total * 100) / 100}`)
    }
    const fine = fineCol >= 0 ? num(row[fineCol]) : null
    if (fine) out.fines.push({ name, year: period.year, month: period.month, period: period.period, amount: fine })
    // последняя непустая ячейка после итогов — телефон или «наличка»: не импортируем, только показываем
    const tail = row.slice(Math.max(lastDayCol + 1, shiftsCol + 1, fineCol + 1)).map(v => String(v ?? '').trim()).filter(Boolean)
    if (tail.length) out.notes.push({ name, note: tail[tail.length - 1] })
  }
  return out
}

/**
 * Разбор книги целиком: sheets — [{name, rows}], startYear — год первого листа.
 */
export function parseTimesheetWorkbook(sheets, startYear) {
  const result = { entries: [], fines: [], notes: [], issues: [], periods: [] }
  let prev = null
  for (const sh of sheets || []) {
    const period = parseSheetName(sh.name, prev, startYear)
    if (!period) { result.issues.push(`лист «${sh.name}»: имя не похоже на период, пропущен`); continue }
    // лист второй половины, оказавшийся копией первой (дни 1..15 при from=16)
    const firstDay = num((sh.rows?.[1] || [])[3])
    if (firstDay !== null && firstDay !== period.from) {
      result.issues.push(`лист «${sh.name}»: в шапке дни начинаются с ${firstDay}, а период с ${period.from} — лист пропущен, проверьте файл`)
      prev = { year: period.year, month: period.month }
      continue
    }
    const parsed = parseTimesheetSheet(sh.rows, period)
    result.periods.push({ sheet: sh.name, ...period, entries: parsed.entries.length })
    result.entries.push(...parsed.entries)
    result.fines.push(...parsed.fines)
    result.notes.push(...parsed.notes)
    result.issues.push(...parsed.issues.map(i => `лист «${sh.name}»: ${i}`))
    prev = { year: period.year, month: period.month }
  }
  return result
}

/** Сопоставление имён из табеля с сотрудниками: точное по нормализованному имени, иначе — в нераспознанные. */
export function matchStaff(names, staff) {
  const byName = new Map((staff || []).map(s => [normalizeName(s.full_name), s]))
  const matched = {}, unmatched = []
  for (const n of new Set(names)) {
    const key = normalizeName(n)
    const hit = byName.get(key) || (staff || []).find(s => normalizeName(s.full_name).startsWith(key))
    if (hit) matched[n] = hit.id; else unmatched.push(n)
  }
  return { matched, unmatched }
}

/** Итоги по сотруднику за период: смены (сумма долей) и штраф. */
export function periodTotals(entries, fines, { year, month, period }) {
  const from = period === 1 ? 1 : 16, to = period === 1 ? 15 : daysInMonth(year, month)
  const inPeriod = (d) => d >= iso(year, month, from) && d <= iso(year, month, to)
  const shifts = {}
  for (const e of entries || []) if (inPeriod(e.work_date)) shifts[e.staff_id] = Math.round(((shifts[e.staff_id] || 0) + Number(e.share)) * 100) / 100
  const fine = {}
  for (const f of fines || []) if (f.year === year && f.month === month && f.period === period) fine[f.staff_id] = Number(f.amount) || 0
  return { shifts, fine }
}
