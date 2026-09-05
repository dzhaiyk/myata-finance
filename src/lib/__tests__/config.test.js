import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  departmentCode,
  isCapexRow,
  CAPEX_ROW_LABEL,
  departmentsFor,
  departmentLabel,
  departmentCodeByIikoStore,
  setDepartments,
  getDepartments,
  THRESHOLDS,
  FOOD_COST_BANDS,
  MARGIN_BANDS,
  DEFAULT_THRESHOLDS,
  getThresholds,
  setThresholds,
  validateThresholds,
  foodCostLevel,
  isFoodCostAnomaly,
  marginLevel,
  PAYROLL_CATEGORIES,
  NOTIFICATION_KEYS,
  pickKnownNotifications,
  getNotifications,
  setNotifications,
  isNotificationEnabled,
  codeFromName,
  categoryLabel,
  setBranding,
  getBranding,
  appTitle,
  venueName,
  copyrightLine,
  documentTitle,
  currencyCode,
  currencySymbol,
  locale,
  timezone,
  decimalSeparator,
} from '../config.js'
import { FIXTURE_DEPARTMENTS } from './fixtures.js'

describe('config — справочник отделов (ADR-0010)', () => {
  it('без загруженного справочника ничего не выдумывает', () => {
    setDepartments([])
    assert.deepEqual(getDepartments(), [])
    assert.deepEqual(departmentsFor('revenue'), [])
    assert.equal(departmentCode('Кухня'), null)
    setDepartments(FIXTURE_DEPARTMENTS)
  })

  it('узнаёт отдел по коду и по названию', () => {
    setDepartments(FIXTURE_DEPARTMENTS)
    assert.equal(departmentCode('kitchen'), 'kitchen')
    assert.equal(departmentCode('Кухня'), 'kitchen')
    assert.equal(departmentCode('  бар '), 'bar')
    assert.equal(departmentCode('КАЛЬЯН'), 'hookah')
  })

  it('неизвестное название возвращает null, а не молча чужой отдел', () => {
    assert.equal(departmentCode('Пекарня'), null)
    assert.equal(departmentCode(''), null)
    assert.equal(departmentCode(null), null)
  })

  it('отделы предлагаются по назначению, отключённые не показываются', () => {
    assert.deepEqual(departmentsFor('revenue').map(d => d.code), ['kitchen', 'bar', 'hookah', 'other'])
    assert.deepEqual(departmentsFor('staff').map(d => d.code), ['kitchen', 'bar', 'hookah', 'hall', 'other'])
    assert.deepEqual(departmentsFor('supply').map(d => d.code), ['kitchen', 'bar', 'hookah', 'household', 'other'])
    assert.deepEqual(departmentsFor('чего-то'), [])
  })

  it('склад iiko сопоставляется с отделом', () => {
    assert.equal(departmentCodeByIikoStore('СКЛАД БАР МЯТА'), 'bar')
    assert.equal(departmentCodeByIikoStore('  склад кухня мята '), 'kitchen')
    assert.equal(departmentCodeByIikoStore('СКЛАД БАНКЕТ'), null)
    assert.equal(departmentCodeByIikoStore(null), null)
  })

  it('подпись по коду, для незнакомого — сам код', () => {
    assert.equal(departmentLabel('hookah'), 'Кальян')
    assert.equal(departmentLabel('bakery'), 'bakery')
  })

  // Без id экран настроек сохранял правку как вставку и падал на уникальности кода
  it('id из базы сохраняется — по нему обновляется строка', () => {
    setDepartments([{ id: 42, code: 'bakery', name: 'Пекарня', for_revenue: true, sort_order: 1 }])
    assert.equal(getDepartments()[0].id, 42)
    setDepartments(FIXTURE_DEPARTMENTS)
  })

  // Код создаётся из названия один раз: менять его нельзя, на него ссылаются данные
  it('код получается из названия транслитерацией', () => {
    assert.equal(codeFromName('Асхана'), 'ashana')
    assert.equal(codeFromName('Летняя терраса'), 'letnyaya_terrasa')
    assert.equal(codeFromName('Bakery #2'), 'bakery_2')
    assert.equal(codeFromName('  Бар  '), 'bar')
  })

  it('занятый код получает суффикс, пустое название — пустой код', () => {
    assert.equal(codeFromName('Асхана', ['ashana']), 'ashana_2')
    assert.equal(codeFromName('Асхана', ['ashana', 'ashana_2']), 'ashana_3')
    assert.equal(codeFromName('   '), '')
    assert.equal(codeFromName('!!!'), '')
  })

  // TASK-025: «ФОТ Кухня» должно идти за переименованием отдела
  it('подпись статьи собирается из шаблона и названия отдела', () => {
    setDepartments(FIXTURE_DEPARTMENTS)
    const cat = { code: 'payroll_kitchen', name: 'ФОТ Кухня', department: 'kitchen', name_template: 'ФОТ {department}' }
    assert.equal(categoryLabel(cat), 'ФОТ Кухня')
    setDepartments(FIXTURE_DEPARTMENTS.map(d => (d.code === 'kitchen' ? { ...d, name: 'Асхана' } : d)))
    assert.equal(categoryLabel(cat), 'ФОТ Асхана')
    setDepartments(FIXTURE_DEPARTMENTS)
  })

  it('статья без отдела или шаблона показывает своё имя', () => {
    assert.equal(categoryLabel({ name: 'Аренда помещения' }), 'Аренда помещения')
    assert.equal(categoryLabel({ name: 'ФОТ Кухня', department: 'kitchen' }), 'ФОТ Кухня')
    assert.equal(categoryLabel({ name: 'ФОТ Кухня', name_template: 'ФОТ {department}' }), 'ФОТ Кухня')
    assert.equal(categoryLabel({ name: 'Что-то', department: 'bakery', name_template: 'ФОТ {department}' }), 'Что-то')
    assert.equal(categoryLabel(null), '')
  })

  it('справочник отсортирован по порядку, а не по приходу из базы', () => {
    setDepartments([...FIXTURE_DEPARTMENTS].reverse())
    assert.deepEqual(getDepartments().map(d => d.code).slice(0, 3), ['kitchen', 'bar', 'hookah'])
    setDepartments(FIXTURE_DEPARTMENTS)
  })

  it('строка CapEx узнаётся по подписи из этого же модуля', () => {
    assert.equal(isCapexRow(CAPEX_ROW_LABEL), true)
    assert.equal(isCapexRow('аппараты'), true)
    assert.equal(isCapexRow('Табак'), false)
    assert.equal(isCapexRow(null), false)
  })
})

// TASK-017: значения переехали сюда из пяти-шести файлов. Снимок нужен, чтобы
// случайная правка числа не прошла молча — пороги влияют на цвета и уведомления.
describe('пороги и границы', () => {
  it('значения порогов зафиксированы', () => {
    assert.deepEqual(THRESHOLDS, {
      cashDiscrepancy: 0,
      accountBalanceTolerance: 100,
      ownerCashTolerance: 200000,
      payrollTolerance: 1000,
      payrollShareAlert: 0.35,
      payrollShareTarget: 0.30,
    })
  })

  // BR-RPT-018: одна норма food cost на всё приложение
  it('границы food cost едины и упорядочены', () => {
    assert.deepEqual(FOOD_COST_BANDS, { target: 0.30, warn: 0.35, critical: 0.40 })
    assert.ok(FOOD_COST_BANDS.target < FOOD_COST_BANDS.warn)
    assert.ok(FOOD_COST_BANDS.warn < FOOD_COST_BANDS.critical)
  })

  it('уровень food cost по границам', () => {
    assert.equal(foodCostLevel(0.29), 'green')
    assert.equal(foodCostLevel(0.349), 'green')
    assert.equal(foodCostLevel(0.35), 'yellow')
    assert.equal(foodCostLevel(0.399), 'yellow')
    assert.equal(foodCostLevel(0.40), 'red')
    assert.equal(foodCostLevel(null), 'green')
  })

  // Аномалия в аналитике — та же красная граница, отдельного числа больше нет
  it('аномалия совпадает с красной границей', () => {
    assert.equal(isFoodCostAnomaly(0.399), false)
    assert.equal(isFoodCostAnomaly(0.40), true)
  })

  it('уровень маржи по границам', () => {
    assert.deepEqual(MARGIN_BANDS, { good: 0.30, warn: 0.15 })
    assert.equal(marginLevel(0.31), 'green')
    assert.equal(marginLevel(0.30), 'green')
    assert.equal(marginLevel(0.20), 'yellow')
    assert.equal(marginLevel(0.14), 'red')
  })

  // TASK-021: пороги приходят из settings.thresholds; объекты меняются на месте,
  // чтобы экраны, читающие THRESHOLDS.x напрямую, увидели новые значения.
  it('пороги из настроек применяются на месте и откатываются к умолчанию', () => {
    const before = getThresholds()
    assert.deepEqual(setThresholds({ cashDiscrepancy: 500, foodCost: { warn: 0.33 } }), [])
    assert.equal(THRESHOLDS.cashDiscrepancy, 500)
    assert.equal(FOOD_COST_BANDS.warn, 0.33)
    assert.equal(FOOD_COST_BANDS.critical, 0.40) // незаданное — из умолчания
    assert.equal(foodCostLevel(0.34), 'yellow')
    assert.deepEqual(setThresholds(DEFAULT_THRESHOLDS), [])
    assert.deepEqual(getThresholds(), before)
    assert.deepEqual(getThresholds(), DEFAULT_THRESHOLDS)
  })

  it('неверный набор порогов отклоняется целиком, прежние значения остаются', () => {
    const before = getThresholds()
    const errors = setThresholds({ cashDiscrepancy: -1, foodCost: { target: 0.5, warn: 0.35, critical: 0.40 } })
    assert.equal(errors.length, 1) // сначала отдельные поля, порядок проверяется после
    assert.deepEqual(getThresholds(), before)
    assert.deepEqual(validateThresholds({ ...DEFAULT_THRESHOLDS, foodCost: { target: 0.5, warn: 0.35, critical: 0.40 } }), ['food cost: ориентир < жёлтая < красная'])
    assert.deepEqual(validateThresholds({ ...DEFAULT_THRESHOLDS, margin: { good: 0.1, warn: 0.15 } }), ['маржа: жёлтая граница ниже зелёной'])
    assert.deepEqual(validateThresholds({ ...DEFAULT_THRESHOLDS, payrollShareTarget: 0.4 }), ['доля ФОТ: ориентир ниже тревоги'])
    assert.deepEqual(validateThresholds({ ...DEFAULT_THRESHOLDS, payrollShareAlert: '35' }).length, 1) // 35 — не доля
    assert.deepEqual(validateThresholds(DEFAULT_THRESHOLDS), [])
  })

  it('список статей ФОТ — один на проект', () => {
    assert.equal(PAYROLL_CATEGORIES.length, 7)
    assert.ok(PAYROLL_CATEGORIES.every(c => c.startsWith('payroll_')))
    assert.equal(new Set(PAYROLL_CATEGORIES).size, PAYROLL_CATEGORIES.length)
  })
})

// TASK-016: до этого переключатели в «Настройках» ничего не сохраняли
describe('уведомления', () => {
  it('по умолчанию включены все известные типы', () => {
    setNotifications({})
    assert.deepEqual(getNotifications(), {
      cash_discrepancy: true, daily_report: true, bank_import: true,
    })
    for (const key of NOTIFICATION_KEYS) assert.equal(isNotificationEnabled(key), true)
  })

  it('выключенный тип не проходит проверку', () => {
    setNotifications({ cash_discrepancy: false })
    assert.equal(isNotificationEnabled('cash_discrepancy'), false)
    assert.equal(isNotificationEnabled('daily_report'), true)
    setNotifications({})
  })

  // В базе могут лежать ключи от старых версий: напоминание в 02:00 и
  // еженедельный food cost убраны, потому что выполнить их некому
  it('незнакомые ключи из базы не сохраняются', () => {
    const picked = pickKnownNotifications({
      cash_discrepancy: false, no_report_reminder: true, food_cost_alert: true, мусор: 1,
    })
    assert.deepEqual(Object.keys(picked).sort(), NOTIFICATION_KEYS.slice().sort())
    assert.equal(picked.cash_discrepancy, false)
  })

  it('нестроковые значения игнорируются, остаётся значение по умолчанию', () => {
    assert.equal(pickKnownNotifications({ daily_report: 'нет' }).daily_report, true)
    assert.equal(pickKnownNotifications(null).bank_import, true)
  })

  it('незнакомый тип считается включённым', () => {
    assert.equal(isNotificationEnabled('чего-то нового'), true)
  })
})

// TASK-019: названия заведения и юрлица в исходниках больше нет
describe('бренд заведения', () => {
  it('без настроек показывает нейтральное, а не чужое название', () => {
    setBranding({})
    assert.equal(appTitle(), 'Финансовый учёт')
    assert.equal(venueName(), '')
    assert.equal(documentTitle('Отчёт за 2026-09-05'), 'Отчёт за 2026-09-05')
    assert.equal(copyrightLine(2026), '© 2026')
  })

  it('подставляет заданные значения', () => {
    setBranding({ app_title: 'Мята Finance', restaurant_name: 'Мята Platinum 4YOU', company: 'ТОО RIM PARTNERS' })
    assert.equal(appTitle(), 'Мята Finance')
    assert.equal(documentTitle('Отчёт за 2026-09-05'), 'Мята Platinum 4YOU — Отчёт за 2026-09-05')
    assert.equal(copyrightLine(2026), '© 2026 ТОО RIM PARTNERS — Мята Platinum 4YOU')
  })

  it('пробелы и пустые строки не считаются значением', () => {
    setBranding({ app_title: '   ', restaurant_name: '', company: null })
    assert.equal(appTitle(), 'Финансовый учёт')
    assert.equal(venueName(), '')
    assert.deepEqual(Object.keys(getBranding()).sort(),
      ['app_title', 'company', 'currency', 'locale', 'logo_url', 'restaurant_name', 'timezone'])
  })

  // Год в копирайте был зашит как 2025 и устарел бы молча
  it('год в копирайте берётся текущий', () => {
    setBranding({ company: 'ТОО Тест' })
    assert.ok(copyrightLine().startsWith(`© ${new Date().getFullYear()}`))
    setBranding({})
  })
})

// TASK-020: символ валюты был вписан строкой в 153 местах
describe('валюта, локаль и часовой пояс', () => {
  it('по умолчанию тенге и русская локаль', () => {
    setBranding({})
    assert.equal(currencyCode(), 'KZT')
    assert.equal(currencySymbol(), '₸')
    assert.equal(locale(), 'ru-RU')
    assert.equal(decimalSeparator(), ',')
    assert.equal(timezone(), undefined)
  })

  it('валюта и локаль берутся из настроек', () => {
    setBranding({ currency: 'USD', locale: 'en-US', timezone: 'Asia/Almaty' })
    assert.equal(currencySymbol(), '$')
    assert.equal(decimalSeparator(), '.')
    assert.equal(timezone(), 'Asia/Almaty')
  })

  it('валюта без общепринятого знака показывается кодом', () => {
    setBranding({ currency: 'UZS' })
    assert.equal(currencySymbol(), 'UZS')
    setBranding({})
  })
})
