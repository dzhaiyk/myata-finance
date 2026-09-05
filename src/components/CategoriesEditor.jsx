// Статьи P&L: справочник с подкатегориями, привязкой к отделу и шаблоном подписи.
// До TASK-027 статьями можно было управлять только SQL-ом (ADR-0011).
import { useEffect, useMemo, useState } from 'react'
import { departmentsFor, categoryLabel } from '@/lib/config'
import {
  CATEGORY_TYPES, categoryTree, parentOptions, validateCategory, newCategoryCode,
  loadCategories, saveCategory,
} from '@/lib/categoriesDict'
import { cn } from '@/lib/utils'
import { Save, Plus, ListTree, ChevronRight } from 'lucide-react'

const emptyRow = (list) => ({
  code: '', name: '', type: 'opex', pnl_group: '', parent_code: '',
  department: '', name_template: '', sort_order: (list.length + 1) * 10, is_active: true, _new: true,
})

export default function CategoriesEditor({ canEdit }) {
  const [list, setList] = useState([])
  const [editing, setEditing] = useState(null)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)

  const reload = async () => {
    setLoading(true)
    const { rows } = await loadCategories()
    setList(rows); setLoading(false)
  }
  useEffect(() => { reload() }, [])

  const tree = useMemo(() => categoryTree(list), [list])
  const groups = useMemo(() => {
    const byType = {}
    tree.forEach(c => { (byType[c.type] = byType[c.type] || []).push(c) })
    return byType
  }, [tree])
  const typeLabel = (t) => CATEGORY_TYPES.find(x => x.value === t)?.label || t

  const startEdit = (c) => setEditing({ ...c, parent_code: c.parent_code || '', department: c.department || '', name_template: c.name_template || '', pnl_group: c.pnl_group || '' })
  const patch = (k, v) => setEditing(e => ({ ...e, [k]: v }))

  const save = async () => {
    const row = { ...editing, name: String(editing.name || '').trim() }
    // код создаётся один раз из названия и дальше не меняется (правило 12)
    if (row._new) row.code = newCategoryCode(row.name, list)
    const errors = validateCategory(row, list)
    if (!row.code) errors.push('Из названия не вышло кода — добавьте латиницу или цифры')
    if (errors.length) { setStatus('❌ ' + errors.join('; ')); return }
    setStatus('Сохранение...')
    const { error } = await saveCategory(row)
    if (error) { setStatus('❌ ' + error.message); return }
    setStatus('✅ Сохранено')
    setEditing(null)
    await reload()
  }

  const Row = ({ c, child }) => (
    <button onClick={() => startEdit(c)} disabled={!canEdit && false}
      className={cn('w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-800/40', child && 'pl-8', !c.is_active && 'opacity-50')}>
      {child && <ChevronRight className="w-3 h-3 text-slate-600" />}
      <span className="text-sm flex-1">{categoryLabel(c)}</span>
      <span className="text-2xs font-mono text-slate-600">{c.code}</span>
      {c.pnl_group && <span className="badge text-2xs">{c.pnl_group}</span>}
    </button>
  )

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-500/20 flex items-center justify-center">
          <ListTree className="w-5 h-5 text-sky-400" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Статьи P&L</div>
          <div className="text-xs text-slate-500">Подстатья сворачивается в родителя; статья с отделом подписывается его названием</div>
        </div>
        {canEdit && !editing && (
          <button onClick={() => setEditing(emptyRow(list))} className="btn-secondary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Добавить
          </button>
        )}
      </div>

      {editing && (
        <div className="rounded-xl border border-brand-500/30 p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Название</label>
              <input value={editing.name} onChange={e => patch('name', e.target.value)} className="input w-full text-sm" disabled={!canEdit} /></div>
            <div><label className="label">Код</label>
              <div className="input w-full text-sm font-mono text-slate-500" title="Создаётся из названия и не меняется: на него ссылаются операции">
                {editing._new ? (newCategoryCode(editing.name, list) || '—') : editing.code}
              </div></div>
            <div><label className="label">Тип</label>
              <select value={editing.type} onChange={e => patch('type', e.target.value)} className="input w-full text-sm" disabled={!canEdit}>
                {CATEGORY_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select></div>
            <div><label className="label">Группа P&L</label>
              <input value={editing.pnl_group} onChange={e => patch('pnl_group', e.target.value)} className="input w-full text-sm font-mono" placeholder="utilities" disabled={!canEdit} /></div>
            <div><label className="label">Родительская статья</label>
              <select value={editing.parent_code} onChange={e => patch('parent_code', e.target.value)} className="input w-full text-sm" disabled={!canEdit}>
                <option value="">— верхний уровень —</option>
                {parentOptions(list, editing).map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select></div>
            <div><label className="label">Порядок</label>
              <input type="number" value={editing.sort_order} onChange={e => patch('sort_order', Number(e.target.value))} className="input w-full text-sm" disabled={!canEdit} /></div>
            <div><label className="label">Отдел</label>
              <select value={editing.department} onChange={e => patch('department', e.target.value)} className="input w-full text-sm" disabled={!canEdit}>
                <option value="">— без отдела —</option>
                {departmentsFor('supply').map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
              </select></div>
            <div><label className="label">Шаблон подписи</label>
              <input value={editing.name_template} onChange={e => patch('name_template', e.target.value)} className="input w-full text-sm" placeholder="ФОТ {department}" disabled={!canEdit} /></div>
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={editing.is_active !== false} onChange={() => patch('is_active', !editing.is_active)} className="accent-brand-500" disabled={!canEdit} />
            Активна
          </label>
          <div className="flex items-center gap-3">
            {canEdit && <button onClick={save} className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" /> Сохранить</button>}
            <button onClick={() => { setEditing(null); setStatus('') }} className="btn-secondary text-sm">Закрыть</button>
            {status && <span className="text-xs text-slate-400">{status}</span>}
          </div>
        </div>
      )}

      {loading ? <p className="text-xs text-slate-500">Загрузка...</p> : (
        <div className="space-y-4">
          {CATEGORY_TYPES.filter(t => groups[t.value]?.length).map(t => (
            <div key={t.value}>
              <div className="text-xs font-semibold text-slate-400 mb-1">{t.label}</div>
              <div className="space-y-0.5">
                {groups[t.value].map(c => (
                  <div key={c.code}>
                    <Row c={c} />
                    {c.children.map(ch => <Row key={ch.code} c={ch} child />)}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
