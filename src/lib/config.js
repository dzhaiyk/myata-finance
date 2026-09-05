// Единственное место, где отображаемое название превращается в смысл.
//
// Отделы и строки формы хранятся в отчёте смены как JSONB с названиями, кода
// там пока нет — поэтому сопоставление всё ещё опирается на название. Разница
// с прежним кодом в том, что оно живёт здесь одно, а не разбросано сравнениями
// по четырём файлам, и неопознанное название видно вызывающему, а не тонет молча.
//
// Когда отделы и строки станут справочниками с кодом (TASK-018), меняется
// только этот файл. См. ADR-0010.

// --- Отделы -------------------------------------------------------------
//
// Справочник приходит из таблицы `departments` (миграция 025) и кешируется здесь;
// загружается при старте приложения. Набора отделов в коде нет: он свой у каждого
// заведения (ADR-0010). Пока справочник не загружен, он пуст — форма честно
// покажет, что отделы не подгрузились, вместо того чтобы предлагать чужие.

const USAGE_FIELD = { revenue: 'for_revenue', staff: 'for_staff', supply: 'for_supply' }

let departments = []

const normalize = (name) => String(name ?? '').trim().toLowerCase()

export const getDepartments = () => departments.map(d => ({ ...d }))

export function setDepartments(rows) {
  departments = (rows || [])
    .map(r => ({
      // id нужен экрану настроек, чтобы обновлять строку, а не вставлять новую
      id: r.id,
      code: String(r.code || ''),
      name: String(r.name || ''),
      for_revenue: r.for_revenue === true,
      for_staff: r.for_staff === true,
      for_supply: r.for_supply === true,
      iiko_store: r.iiko_store || null,
      sort_order: Number(r.sort_order) || 0,
      is_active: r.is_active !== false,
    }))
    .filter(d => d.code)
    .sort((a, b) => a.sort_order - b.sort_order || a.code.localeCompare(b.code))
  return getDepartments()
}

/** Отделы, предлагаемые в конкретном месте: 'revenue' | 'staff' | 'supply'. */
export function departmentsFor(usage) {
  const field = USAGE_FIELD[usage]
  if (!field) return []
  return getDepartments().filter(d => d.is_active && d[field])
}

export const departmentByCode = (code) =>
  departments.find(d => d.code === String(code || '')) || null

/** Подпись отдела; для неизвестного кода — сам код, чтобы не показывать пустоту. */
export const departmentLabel = (code) => departmentByCode(code)?.name || String(code || '')

/**
 * Код отдела по коду или отображаемому названию.
 * Название принимается ради старых записей, где кода ещё нет.
 * @returns {string|null} null — не распознано; вызывающий решает, куда отнести.
 */
export function departmentCode(value) {
  const v = normalize(value)
  if (!v) return null
  const byCode = departments.find(d => normalize(d.code) === v)
  if (byCode) return byCode.code
  const byName = departments.find(d => normalize(d.name) === v)
  return byName ? byName.code : null
}

// Код, куда попадает выручка с нераспознанным отделом. Это системное понятие,
// а не значение заведения: справочник клиента должен содержать такой отдел
// (в seed миграции 025 это «Прочее»). Если его нет, сумма не теряется —
// она видна отдельно как unassigned.
export const FALLBACK_DEPARTMENT_CODE = 'other'

/**
 * Подпись статьи P&L. Если статья привязана к отделу и у неё есть шаблон,
 * название собирается из шаблона и текущего названия отдела: «ФОТ {department}»
 * → «ФОТ Асхана». Иначе берётся собственное имя статьи (миграция 026).
 */
export function categoryLabel(category) {
  if (!category) return ''
  const { name_template: tpl, department, name } = category
  if (!tpl || !department) return name || ''
  const dep = departmentByCode(department)
  if (!dep) return name || ''
  return tpl.replace('{department}', dep.name)
}

// Транслитерация для автоматического кода: код нельзя менять после создания,
// поэтому его не вводят руками, а получают из названия (ADR-0010).
const TRANSLIT = {
  а:'a', б:'b', в:'v', г:'g', д:'d', е:'e', ё:'e', ж:'zh', з:'z', и:'i', й:'i',
  к:'k', л:'l', м:'m', н:'n', о:'o', п:'p', р:'r', с:'s', т:'t', у:'u', ф:'f',
  х:'h', ц:'c', ч:'ch', ш:'sh', щ:'sch', ъ:'', ы:'y', ь:'', э:'e', ю:'yu', я:'ya',
  ә:'a', ғ:'g', қ:'k', ң:'n', ө:'o', ұ:'u', ү:'u', һ:'h', і:'i',
}

/**
 * Код из названия: латиница, нижний регистр, подчёркивания.
 * При совпадении с уже занятым добавляется числовой суффикс.
 */
export function codeFromName(name, taken = []) {
  const base = [...normalize(name)]
    .map(ch => (TRANSLIT[ch] !== undefined ? TRANSLIT[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  if (!base) return ''
  const busy = new Set(taken)
  if (!busy.has(base)) return base
  for (let i = 2; i < 100; i++) {
    if (!busy.has(`${base}_${i}`)) return `${base}_${i}`
  }
  return `${base}_${Date.now()}`
}

/** Код отдела по названию склада в iiko (BR-SHF-019). */
export function departmentCodeByIikoStore(store) {
  const v = normalize(store)
  if (!v) return null
  const found = departments.find(d => d.iiko_store && normalize(d.iiko_store) === v)
  return found ? found.code : null
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
  // Расхождение кассы: один порог и на подсветку, и на уведомление.
  // 0 — сходиться должно в ноль (решение владельца 05.09.2026, BR-SHF-020):
  // за 242 смены расхождение было 6 раз и ни разу не превышало 444 ₸,
  // поэтому прежние 500 и 1000 не срабатывали никогда.
  cashDiscrepancy: 0,
  // Допуск при сверке остатка счёта с выпиской
  accountBalanceTolerance: 100,
  // Допуск необъяснённых наличных у учредителей (BR-CTL, 05.09.2026)
  ownerCashTolerance: 200000,
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

// --- Бренд заведения ------------------------------------------------------
//
// Название заведения, юрлицо и логотип приходят из настроек (`settings`, ключ
// `general`) и кешируются здесь. В коде их нет: у каждого клиента свои
// (ADR-0010). Пока настройки не загружены, показываются нейтральные подписи —
// чужого названия пользователь не увидит ни на секунду.

// Валюта, локаль и часовой пояс — тоже настройки заведения (ADR-0010).
// Пустой часовой пояс означает «как у браузера»: так работало до TASK-020,
// и для одного заведения в одном городе это верно.
const BRANDING_FALLBACK = {
  app_title: 'Финансовый учёт',
  restaurant_name: '',
  company: '',
  logo_url: '',
  currency: 'KZT',
  locale: 'ru-RU',
  timezone: '',
}

// Символы для валют, которые пишутся знаком. Для остальных показывается код.
const CURRENCY_SYMBOLS = {
  KZT: '₸', RUB: '₽', USD: '$', EUR: '€', GBP: '£', UAH: '₴',
  KGS: 'с', AZN: '₼', TRY: '₺', GEL: '₾', AMD: '֏', JPY: '¥', CNY: '¥',
}

let branding = { ...BRANDING_FALLBACK }

export const getBranding = () => ({ ...branding })

export function setBranding(value) {
  const pick = (key) => {
    const v = value?.[key]
    return typeof v === 'string' && v.trim() ? v.trim() : BRANDING_FALLBACK[key]
  }
  branding = {
    app_title: pick('app_title'),
    restaurant_name: pick('restaurant_name'),
    company: pick('company'),
    logo_url: pick('logo_url'),
    currency: pick('currency'),
    locale: pick('locale'),
    timezone: pick('timezone'),
  }
  return getBranding()
}

/** Код валюты заведения, например KZT. */
export const currencyCode = () => branding.currency

/** Знак валюты; для валюты без знака — её код. */
export const currencySymbol = () => CURRENCY_SYMBOLS[branding.currency] || branding.currency

/** Локаль для форматирования чисел и дат. */
export const locale = () => branding.locale

/**
 * Часовой пояс заведения. Пусто — берётся пояс браузера: для одного заведения
 * это верно, но менеджер в поездке получил бы чужую операционную дату.
 */
export const timezone = () => branding.timezone || undefined

/** Десятичный разделитель локали: в русской нотации запятая. */
export function decimalSeparator(loc = branding.locale) {
  try {
    return new Intl.NumberFormat(loc).formatToParts(1.1).find(p => p.type === 'decimal')?.value || '.'
  } catch { return '.' }
}

/** Название приложения для вкладки, сайдбара и экрана входа. */
export const appTitle = () => branding.app_title

/** Название заведения. Пусто, пока настройки не загружены. */
export const venueName = () => branding.restaurant_name

/** Строка копирайта: год текущий, а не зашитый. */
export function copyrightLine(year = new Date().getFullYear()) {
  const parts = [branding.company, branding.restaurant_name].filter(Boolean)
  return parts.length ? `© ${year} ${parts.join(' — ')}` : `© ${year}`
}

/** Заголовок документа: «<заведение> — <что это>», если заведение известно. */
export const documentTitle = (what) => (branding.restaurant_name ? `${branding.restaurant_name} — ${what}` : what)
