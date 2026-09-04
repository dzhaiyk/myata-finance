// Единственное место, где отображаемое название превращается в смысл.
//
// Отделы и строки формы хранятся в отчёте смены как JSONB с названиями, кода
// там пока нет — поэтому сопоставление всё ещё опирается на название. Разница
// с прежним кодом в том, что оно живёт здесь одно, а не разбросано сравнениями
// по четырём файлам, и неопознанное название видно вызывающему, а не тонет молча.
//
// Когда отделы и строки станут справочниками с кодом (TASK-018), меняется
// только этот файл. См. ADR-0010.

// --- Отделы выручки -------------------------------------------------------

export const DEPARTMENT_CODES = ['kitchen', 'bar', 'hookah']

// Названия, под которыми отдел приходит из отчёта смены и из iiko.
// Склады — источник отдела в выгрузке iiko (BR-SHF-019): категория блюда
// заполнена не у всех позиций, склад — у всех.
// Сравнение регистронезависимое и без учёта пробелов по краям.
const DEPARTMENT_NAMES = {
  kitchen: ['кухня', 'склад кухня мята'],
  bar: ['бар', 'склад бар мята'],
  hookah: ['кальян', 'склад кальян мята'],
}

/** Подпись отдела для форм и отчётов. */
export const DEPARTMENT_LABELS = {
  kitchen: 'Кухня',
  bar: 'Бар',
  hookah: 'Кальян',
}

/** Куда попадает выручка с нераспознанным отделом. */
export const OTHER_DEPARTMENT_LABEL = 'Прочее'

const normalize = (name) => String(name ?? '').trim().toLowerCase()

/**
 * Код отдела по его названию.
 * @returns {'kitchen'|'bar'|'hookah'|null} null — название не распознано;
 * вызывающий сам решает, куда его отнести (обычно «Прочее»), и может предупредить.
 */
export function departmentCode(name) {
  const n = normalize(name)
  if (!n) return null
  for (const code of DEPARTMENT_CODES) {
    if (DEPARTMENT_NAMES[code].includes(n)) return code
  }
  return null
}

// --- Строки формы, попадающие в CapEx вместо Food Cost --------------------

// Закупка кальянных аппаратов — это основные средства, а не расходники,
// поэтому из закупа кальяна она уходит в CapEx. Подпись строки в форме отчёта
// смены берётся отсюда же, чтобы переименование было в одном месте.
export const CAPEX_ROW_LABEL = 'Аппараты'

const CAPEX_ROW_NAMES = [normalize(CAPEX_ROW_LABEL)]

/** Строка закупа относится к CapEx, а не к Food Cost. */
export function isCapexRow(name) {
  return CAPEX_ROW_NAMES.includes(normalize(name))
}

// --- Пороги ---------------------------------------------------------------
//
// Значения заведения. Пока они здесь — чтобы не расходиться по экранам, как было
// до 05.09.2026: порог расхождения кассы был скопирован в пять мест, допуск
// остатка счёта в пять, допуск наличных учредителей в три. Следующий шаг —
// таблица settings и экран настроек (TASK-021, ADR-0010).

export const THRESHOLDS = {
  // Расхождение кассы: с какой суммы подсветить и с какой слать в Telegram.
  // Почему два разных числа — открытый вопрос #3 домена shift.
  cashDiscrepancyFlag: 500,
  cashDiscrepancyAlert: 1000,
  // Допуск при сверке остатка счёта с выпиской
  accountBalanceTolerance: 100,
  // Допуск необъяснённых наличных у учредителей
  ownerCashTolerance: 500000,
  // Допуск сверки ФОТ: ведомость против выдач
  payrollTolerance: 1000,
  // Доля ФОТ в выручке, выше которой аналитика поднимает тревогу
  payrollShareAlert: 0.35,
  // Ориентир доли ФОТ на графике
  payrollShareTarget: 0.30,
}

// --- Границы показателей --------------------------------------------------

// Единая норма food cost для всех экранов (BR-RPT-018, решение владельца 05.09.2026):
// до warn — зелёный, между warn и critical — жёлтый, от critical — красный.
// Тот же critical служит признаком аномалии в аналитике.
// target — ориентир на графике, к нему стремимся; warn и critical красят цифры.
export const FOOD_COST_BANDS = { target: 0.30, warn: 0.35, critical: 0.40 }

// Границы операционной маржи, в долях. Выше good — зелёный, выше warn — жёлтый.
export const MARGIN_BANDS = { good: 0.30, warn: 0.15 }

/** @returns {'green'|'yellow'|'red'} уровень food cost по доле (0.37 = 37 %). */
export function foodCostLevel(pct) {
  const v = Number(pct) || 0
  if (v < FOOD_COST_BANDS.warn) return 'green'
  if (v < FOOD_COST_BANDS.critical) return 'yellow'
  return 'red'
}

/** Food cost дошёл до красной зоны — аналитика считает это аномалией. */
export const isFoodCostAnomaly = (pct) => (Number(pct) || 0) >= FOOD_COST_BANDS.critical

/** @returns {'green'|'yellow'|'red'} уровень маржи по доле. */
export function marginLevel(pct) {
  const v = Number(pct) || 0
  if (v >= MARGIN_BANDS.good) return 'green'
  if (v >= MARGIN_BANDS.warn) return 'yellow'
  return 'red'
}

// --- Списки категорий -----------------------------------------------------

// Статьи ФОТ в P&L. До 05.09.2026 список был скопирован в четыре места.
export const PAYROLL_CATEGORIES = [
  'payroll_mgmt', 'payroll_kitchen', 'payroll_bar', 'payroll_hookah',
  'payroll_hall', 'payroll_transport', 'payroll_other',
]

// --- Уведомления ----------------------------------------------------------
//
// Типы, которые приложение действительно умеет отправлять. Напоминание «отчёт не
// сдан» и еженедельный алерт по food cost сюда не входят: без сервера выполнить их
// некому, вернутся вместе с VPS (TASK-009). Подписи живут на экране настроек —
// здесь только ключи и значения по умолчанию.

export const NOTIFICATION_DEFAULTS = {
  cash_discrepancy: true,
  daily_report: true,
  bank_import: true,
}

export const NOTIFICATION_KEYS = Object.keys(NOTIFICATION_DEFAULTS)

/** Оставляет только известные типы: в базе могут лежать ключи от старых версий. */
export function pickKnownNotifications(value) {
  const out = { ...NOTIFICATION_DEFAULTS }
  for (const key of NOTIFICATION_KEYS) {
    if (typeof value?.[key] === 'boolean') out[key] = value[key]
  }
  return out
}

let notifications = { ...NOTIFICATION_DEFAULTS }

export const getNotifications = () => ({ ...notifications })

export function setNotifications(value) {
  notifications = pickKnownNotifications(value)
  return getNotifications()
}

/** Выключить можно только известный тип; незнакомый считается включённым. */
export function isNotificationEnabled(key) {
  if (!NOTIFICATION_KEYS.includes(key)) return true
  return notifications[key] !== false
}
