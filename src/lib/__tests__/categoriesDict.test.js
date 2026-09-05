import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { categoryTree, parentOptions, validateCategory, newCategoryCode } from '../categoriesDict.js'

const L = [
  { code: 'util', name: 'Коммунальные', type: 'opex', sort_order: 2, is_active: true },
  { code: 'util_electric', name: 'Электричество', type: 'opex', parent_code: 'util', sort_order: 1 },
  { code: 'util_water', name: 'Вода', type: 'opex', parent_code: 'util', sort_order: 2 },
  { code: 'rent', name: 'Аренда', type: 'opex', sort_order: 1 },
  { code: 'lost', name: 'Сирота', type: 'opex', parent_code: 'нет_такой', sort_order: 9 },
  { code: 'tax', name: 'Налоги', type: 'below_ebitda', sort_order: 3 },
]

describe('дерево статей (TASK-027, один уровень)', () => {
  it('подстатьи собираются под родителя, порядок по sort_order', () => {
    const tree = categoryTree(L)
    assert.deepEqual(tree.map(c => c.code), ['rent', 'util', 'tax', 'lost'])
    assert.deepEqual(tree.find(c => c.code === 'util').children.map(c => c.code), ['util_electric', 'util_water'])
  })

  it('подстатья без родителя не теряется — поднимается наверх', () => {
    assert.ok(categoryTree(L).some(c => c.code === 'lost'))
  })

  it('родителем может быть только верхний уровень того же типа, не сама статья', () => {
    const opts = parentOptions(L, { code: 'util_water', type: 'opex' }).map(c => c.code)
    // «Сирота» числится подстатьёй, пусть и битой — родителем быть не может
    assert.deepEqual(opts, ['rent', 'util'])
    assert.ok(!parentOptions(L, { code: 'util', type: 'opex' }).some(c => c.code === 'util'))
  })
})

describe('проверка статьи перед сохранением', () => {
  it('корректная подстатья проходит', () => {
    assert.deepEqual(validateCategory({ code: 'util_gas', name: 'Газ', type: 'opex', parent_code: 'util' }, L), [])
  })

  it('второй уровень не принимается', () => {
    const errs = validateCategory({ code: 'x', name: 'X', type: 'opex', parent_code: 'util_electric' }, L)
    assert.ok(errs.some(e => e.includes('один уровень')))
  })

  it('статью с детьми нельзя вложить', () => {
    const errs = validateCategory({ code: 'util', name: 'Коммунальные', type: 'opex', parent_code: 'rent' }, L)
    assert.ok(errs.some(e => e.includes('есть подстатьи')))
  })

  it('сама себе, чужой тип, пустое название', () => {
    assert.ok(validateCategory({ code: 'rent', name: 'Аренда', type: 'opex', parent_code: 'rent' }, L).some(e => e.includes('самой себе')))
    assert.ok(validateCategory({ code: 'x', name: 'X', type: 'opex', parent_code: 'tax' }, L).some(e => e.includes('того же типа')))
    assert.ok(validateCategory({ code: 'x', name: '  ', type: 'opex' }, L).includes('Нужно название'))
  })
})

describe('код статьи', () => {
  it('из названия, с суффиксом при совпадении', () => {
    assert.equal(newCategoryCode('Аренда', L), 'arenda')
    assert.equal(newCategoryCode('Аренда', [...L, { code: 'arenda' }]), 'arenda_2')
  })
})
