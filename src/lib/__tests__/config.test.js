import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { departmentCode, isCapexRow, CAPEX_ROW_LABEL, DEPARTMENT_CODES } from '../config.js'

describe('config — сопоставление названий со смыслом (ADR-0010)', () => {
  it('узнаёт текущие названия отделов', () => {
    assert.equal(departmentCode('Кухня'), 'kitchen')
    assert.equal(departmentCode('Бар'), 'bar')
    assert.equal(departmentCode('Кальян'), 'hookah')
  })

  it('не зависит от регистра и пробелов по краям', () => {
    assert.equal(departmentCode('  кухня '), 'kitchen')
    assert.equal(departmentCode('БАР'), 'bar')
  })

  it('неизвестное название возвращает null, а не молча чужой отдел', () => {
    assert.equal(departmentCode('Прочее'), null)
    assert.equal(departmentCode('Пекарня'), null)
    assert.equal(departmentCode(''), null)
    assert.equal(departmentCode(null), null)
    assert.equal(departmentCode(undefined), null)
  })

  it('коды отделов не пересекаются и покрывают все названия', () => {
    assert.deepEqual(DEPARTMENT_CODES, ['kitchen', 'bar', 'hookah'])
    const codes = DEPARTMENT_CODES.map(c => departmentCode({ kitchen: 'Кухня', bar: 'Бар', hookah: 'Кальян' }[c]))
    assert.deepEqual(codes, DEPARTMENT_CODES)
  })

  it('строка CapEx узнаётся по подписи из этого же модуля', () => {
    assert.equal(isCapexRow(CAPEX_ROW_LABEL), true)
    assert.equal(isCapexRow('аппараты'), true)
    assert.equal(isCapexRow('Табак'), false)
    assert.equal(isCapexRow(null), false)
  })
})
