import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { effectiveTheme, nextTheme, THEMES } from '../theme.js'

describe('тема оформления', () => {
  it('выбор пользователя важнее системной настройки', () => {
    assert.equal(effectiveTheme('light', false), 'light')
    assert.equal(effectiveTheme('dark', true), 'dark')
  })

  it('без выбора идём за системой', () => {
    assert.equal(effectiveTheme(null, true), 'light')
    assert.equal(effectiveTheme(null, false), 'dark')
    assert.equal(effectiveTheme('сломанное значение', true), 'light')
  })

  it('переключатель ходит между двумя темами', () => {
    assert.equal(nextTheme('light'), 'dark')
    assert.equal(nextTheme('dark'), 'light')
    assert.deepEqual(THEMES, ['dark', 'light'])
  })
})
