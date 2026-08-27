// Тесты на встроенном node:test (Node 22) — без внешних зависимостей.
// Запуск: npm test
import { describe, it, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  getBusinessDate, businessDateFromParts, formatLocalDate,
  setCutoffHour, getCutoffHour, yearsRange, DEFAULT_CUTOFF_HOUR,
} from '../dates.js'

// Все тесты передают cutoffHour явно либо восстанавливают кеш после setCutoffHour
afterEach(() => setCutoffHour(DEFAULT_CUTOFF_HOUR))

describe('formatLocalDate', () => {
  it('локальная дата без UTC-сдвига', () => {
    assert.equal(formatLocalDate(new Date(2026, 7, 27, 1, 30)), '2026-08-27')
    assert.equal(formatLocalDate(new Date(2026, 0, 1, 0, 0)), '2026-01-01')
  })
})

describe('getBusinessDate — операционный день (смена закрывается после полуночи)', () => {
  it('ночь до границы → предыдущая дата (отчёт в 02:30 = вчерашняя смена)', () => {
    assert.equal(getBusinessDate(new Date(2026, 7, 27, 2, 30), 6), '2026-08-26')
    assert.equal(getBusinessDate(new Date(2026, 7, 27, 5, 59), 6), '2026-08-26')
  })

  it('после границы → текущая дата', () => {
    assert.equal(getBusinessDate(new Date(2026, 7, 27, 6, 0), 6), '2026-08-27')
    assert.equal(getBusinessDate(new Date(2026, 7, 27, 23, 45), 6), '2026-08-27')
  })

  it('переход через 1-е число месяца', () => {
    assert.equal(getBusinessDate(new Date(2026, 2, 1, 1, 0), 6), '2026-02-28')
  })

  it('переход через Новый год', () => {
    assert.equal(getBusinessDate(new Date(2026, 0, 1, 3, 0), 6), '2025-12-31')
  })

  it('високосный февраль', () => {
    assert.equal(getBusinessDate(new Date(2024, 2, 1, 2, 0), 6), '2024-02-29')
  })

  it('cutoff 0 → перенос отключён', () => {
    assert.equal(getBusinessDate(new Date(2026, 7, 27, 0, 30), 0), '2026-08-27')
  })

  it('использует закешированную границу из настроек', () => {
    setCutoffHour(2)
    assert.equal(getCutoffHour(), 2)
    assert.equal(getBusinessDate(new Date(2026, 7, 27, 1, 30)), '2026-08-26')
    assert.equal(getBusinessDate(new Date(2026, 7, 27, 2, 30)), '2026-08-27')
  })

  it('setCutoffHour игнорирует мусор', () => {
    setCutoffHour('abc')
    assert.equal(getCutoffHour(), DEFAULT_CUTOFF_HOUR)
    setCutoffHour(99)
    assert.equal(getCutoffHour(), DEFAULT_CUTOFF_HOUR)
  })
})

describe('businessDateFromParts — ночные транзакции банковской выписки', () => {
  it('поздний вечер остаётся в своей дате', () => {
    assert.equal(businessDateFromParts('2026-01-30', 23, 6), '2026-01-30')
  })

  it('ночь до границы → предыдущая дата', () => {
    assert.equal(businessDateFromParts('2026-01-30', 1, 6), '2026-01-29')
    assert.equal(businessDateFromParts('2026-01-01', 0, 6), '2025-12-31')
  })

  it('невисокосный/високосный февраль', () => {
    assert.equal(businessDateFromParts('2026-03-01', 2, 6), '2026-02-28')
    assert.equal(businessDateFromParts('2024-03-01', 2, 6), '2024-02-29')
  })

  it('без времени (hour == null) дата не меняется', () => {
    assert.equal(businessDateFromParts('2026-01-30', null, 6), '2026-01-30')
  })
})

describe('yearsRange', () => {
  const current = new Date().getFullYear()

  it('от 2022 до текущего года включительно', () => {
    const years = yearsRange()
    assert.equal(years[0], 2022)
    assert.equal(years[years.length - 1], current)
  })

  it('extraForward добавляет годы вперёд', () => {
    const years = yearsRange(2024, 1)
    assert.equal(years[0], 2024)
    assert.equal(years[years.length - 1], current + 1)
  })
})
