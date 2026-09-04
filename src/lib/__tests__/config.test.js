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
  foodCostLevel,
  isFoodCostAnomaly,
  marginLevel,
  PAYROLL_CATEGORIES,
  NOTIFICATION_KEYS,
  pickKnownNotifications,
  getNotifications,
  setNotifications,
  isNotificationEnabled,
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
      cashDiscrepancyFlag: 500,
      cashDiscrepancyAlert: 1000,
      accountBalanceTolerance: 100,
      ownerCashTolerance: 500000,
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
