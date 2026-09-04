import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { fetchAll, PAGE_SIZE } from '../fetchAll.js'

// Заглушка запроса Supabase: отдаёт срез массива, как это делает .range()
const fakeTable = (rows, calls = []) => () => ({
  range: async (from, to) => {
    calls.push([from, to])
    return { data: rows.slice(from, to + 1), error: null }
  },
})

describe('fetchAll — обход лимита в 1000 строк', () => {
  it('склеивает страницы и возвращает все строки', async () => {
    const rows = Array.from({ length: 2610 }, (_, i) => ({ id: i + 1 }))
    const calls = []
    const got = await fetchAll(fakeTable(rows, calls))
    assert.equal(got.length, 2610)
    assert.equal(got[0].id, 1)
    assert.equal(got[2609].id, 2610)
    assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]])
  })

  it('останавливается на неполной странице — лишнего запроса нет', async () => {
    const calls = []
    const got = await fetchAll(fakeTable(Array.from({ length: 300 }, (_, i) => ({ id: i })), calls))
    assert.equal(got.length, 300)
    assert.equal(calls.length, 1)
  })

  it('ровно одна полная страница требует второго запроса, чтобы убедиться в конце', async () => {
    const calls = []
    const got = await fetchAll(fakeTable(Array.from({ length: PAGE_SIZE }, (_, i) => ({ id: i })), calls))
    assert.equal(got.length, PAGE_SIZE)
    assert.equal(calls.length, 2)
  })

  it('пустая таблица — пустой массив', async () => {
    assert.deepEqual(await fetchAll(fakeTable([])), [])
  })

  it('ошибка запроса пробрасывается наружу', async () => {
    const failing = () => ({ range: async () => ({ data: null, error: new Error('permission denied') }) })
    await assert.rejects(() => fetchAll(failing), /permission denied/)
  })

  it('размер страницы настраивается', async () => {
    const calls = []
    const got = await fetchAll(fakeTable(Array.from({ length: 25 }, (_, i) => ({ id: i })), calls), { pageSize: 10 })
    assert.equal(got.length, 25)
    assert.equal(calls.length, 3)
  })
})
