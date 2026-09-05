import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { permForPath, firstAllowedPath, canOpenPath } from '../routeAccess.js'

const NAV = [
  { to: '/dashboard', perm: 'dashboard.view' },
  { to: '/pnl', perm: 'pnl.view' },
  { divider: true },
  { to: '/settings', perm: 'settings.view' },
]
const has = (granted) => (key) => granted.includes(key)

describe('BR-ACS-004 — маршруты закрыты теми же правами, что и меню', () => {
  it('право пути берётся из меню; чужой путь не ограничен', () => {
    assert.equal(permForPath(NAV, '/pnl'), 'pnl.view')
    assert.equal(permForPath(NAV, '/nowhere'), null)
    assert.equal(canOpenPath(NAV, '/pnl', has(['pnl.view'])), true)
    assert.equal(canOpenPath(NAV, '/pnl', has(['dashboard.view'])), false)
    assert.equal(canOpenPath(NAV, '/nowhere', has([])), true)
  })

  it('без права — на первую доступную страницу, без прав вовсе — null', () => {
    assert.equal(firstAllowedPath(NAV, has(['settings.view'])), '/settings')
    assert.equal(firstAllowedPath(NAV, has(['pnl.view', 'dashboard.view'])), '/dashboard')
    assert.equal(firstAllowedPath(NAV, has([])), null)
  })
})
