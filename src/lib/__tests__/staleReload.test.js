import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  isStaleChunkError, shouldAutoReload, handleStaleError, loadModule,
  registerStaleReloadHook, readLastReload,
} from '../staleReload.js'

const fakeStorage = () => {
  const map = new Map()
  return { getItem: (k) => (map.has(k) ? map.get(k) : null), setItem: (k, v) => map.set(k, v) }
}
const brokenStorage = () => ({
  getItem() { throw new Error('доступ к данным сайта запрещён') },
  setItem() { throw new Error('доступ к данным сайта запрещён') },
})

// Настоящее сообщение из отчёта владельца 05.09.2026
const REAL = new Error('Failed to fetch dynamically imported module: https://myata-finance.netlify.app/assets/iiko-B2_Sc6nB.js')

describe('устаревшая вкладка после деплоя', () => {
  it('узнаёт ошибку загрузки модуля в разных браузерах', () => {
    assert.equal(isStaleChunkError(REAL), true)
    assert.equal(isStaleChunkError(new Error('error loading dynamically imported module')), true)
    assert.equal(isStaleChunkError(new Error('Importing a module script failed.')), true)
    assert.equal(isStaleChunkError("Expected a JavaScript module script but the server responded with a MIME type of 'text/html'"), true)
    assert.equal(isStaleChunkError('is not a valid JavaScript MIME type'), true)
  })

  it('чужие ошибки не трогает', () => {
    assert.equal(isStaleChunkError(new Error('iiko: HTTP 401')), false)
    assert.equal(isStaleChunkError(new Error('Failed to fetch')), false)
    assert.equal(isStaleChunkError(null), false)
    assert.equal(isStaleChunkError(undefined), false)
  })

  it('вторая перезагрузка подряд не запускается — иначе вечный цикл', () => {
    assert.equal(shouldAutoReload(NaN, 1000), true)
    assert.equal(shouldAutoReload(1000, 1000 + 29999), false)
    assert.equal(shouldAutoReload(1000, 1000 + 30000), true)
  })

  it('перезагружает один раз, а повтор в те же секунды — нет', async () => {
    const storage = fakeStorage()
    let reloads = 0
    const reload = () => { reloads++ }
    assert.equal(await handleStaleError(REAL, { storage, now: 1_000_000, reload }), true)
    assert.equal(reloads, 1)
    assert.equal(await handleStaleError(REAL, { storage, now: 1_010_000, reload }), false)
    assert.equal(reloads, 1)
    assert.equal(await handleStaleError(REAL, { storage, now: 1_040_000, reload }), true)
    assert.equal(reloads, 2)
    assert.equal(readLastReload(storage), 1_040_000)
  })

  it('черновик сохраняется до перезагрузки, ошибка хука её не отменяет', async () => {
    const order = []
    const off1 = registerStaleReloadHook(async () => { order.push('черновик') })
    const off2 = registerStaleReloadHook(() => { throw new Error('сохранить не вышло') })
    await handleStaleError(REAL, { storage: fakeStorage(), now: 5_000_000, reload: () => order.push('перезагрузка') })
    assert.deepEqual(order, ['черновик', 'перезагрузка'])
    off1(); off2()
  })

  it('недоступное хранилище не мешает починить вкладку', async () => {
    let reloads = 0
    assert.equal(await handleStaleError(REAL, { storage: brokenStorage(), now: 1, reload: () => reloads++ }), true)
    assert.equal(reloads, 1)
  })

  it('loadModule возвращает модуль, а чужую ошибку пробрасывает без перезагрузки', async () => {
    assert.deepEqual(await loadModule(async () => ({ ok: 1 })), { ok: 1 })
    await assert.rejects(() => loadModule(async () => { throw new Error('iiko: HTTP 500') }), /HTTP 500/)
  })
})
