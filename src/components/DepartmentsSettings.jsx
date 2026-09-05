// Справочник отделов: добавить, переименовать, включить-выключить, указать склад iiko.
// До миграции 025 набор отделов был зашит в CHECK трёх таблиц (ADR-0010, TASK-018).
import { useState } from 'react'
import { getDepartments, codeFromName } from '@/lib/config'
import { saveDepartment } from '@/lib/departments'
import { Save, Plus, Layers } from 'lucide-react'
import { cn } from '@/lib/utils'

const USAGES = [
  { field: 'for_revenue', label: 'Выручка', hint: 'предлагается в отчёте смены' },
  { field: 'for_staff', label: 'Персонал', hint: 'предлагается у сотрудников и должностей' },
  { field: 'for_supply', label: 'Закуп', hint: 'предлагается у поставщиков' },
]

const emptyRow = (order) => ({
  code: '', name: '', for_revenue: true, for_staff: true, for_supply: true,
  iiko_store: '', sort_order: order, is_active: true,
})

export default function DepartmentsSettings({ canEdit }) {
  const [rows, setRows] = useState(() => getDepartments())
  const [status, setStatus] = useState({})

  const patch = (i, field, value) =>
    setRows(prev => prev.map((r, j) => (j === i ? { ...r, [field]: value } : r)))

  const save = async (i) => {
    const row = rows[i]
    const name = row.name.trim()
    if (!name) {
      setStatus(s => ({ ...s, [i]: '❌ Нужно название' }))
      return
    }
    // Код создаётся один раз из названия и дальше не меняется: на него ссылаются
    // отчёты, сотрудники и поставщики (ADR-0010).
    const code = row.code || codeFromName(name, rows.map(r => r.code).filter(Boolean))
    if (!code) {
      setStatus(s => ({ ...s, [i]: '❌ Из названия не вышло кода — добавьте латиницу или цифры' }))
      return
    }
    setStatus(s => ({ ...s, [i]: 'Сохранение...' }))
    const { error } = await saveDepartment({ ...row, code, name })
    setStatus(s => ({ ...s, [i]: error ? '❌ ' + error.message : '✅ Сохранено' }))
    if (!error) setRows(getDepartments())
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
          <Layers className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <div className="text-sm font-semibold">Отделы</div>
          <div className="text-xs text-slate-500">
            Общий справочник для выручки, персонала и закупа. Код создаётся из названия один раз и дальше не меняется — на него ссылаются отчёты, сотрудники и поставщики
          </div>
        </div>
      </div>

      {rows.length === 0 && (
        <p className="text-xs text-slate-500">Справочник пуст. Добавьте первый отдел — без него не заполнить выручку смены.</p>
      )}

      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={r.id || `new-${i}`} className={cn('rounded-xl border border-slate-800 p-3 space-y-3', !r.is_active && 'opacity-60')}>
            <div className="flex flex-wrap gap-3">
              <div className="flex-1 min-w-[140px]">
                <label className="label">Название</label>
                <input value={r.name} disabled={!canEdit} className="input w-full text-sm"
                  onChange={e => patch(i, 'name', e.target.value)} />
              </div>
              <div className="w-40">
                <label className="label">Код</label>
                <div className="input w-full text-sm font-mono text-slate-500" title="Создаётся из названия и не меняется: на него ссылаются отчёты">
                  {r.code || codeFromName(r.name, rows.map(x => x.code).filter(Boolean)) || '—'}
                </div>
              </div>
              <div className="w-48">
                <label className="label">Склад в iiko</label>
                <input value={r.iiko_store || ''} disabled={!canEdit} className="input w-full text-sm"
                  onChange={e => patch(i, 'iiko_store', e.target.value)} placeholder="необязательно" />
              </div>
              <div className="w-20">
                <label className="label">Порядок</label>
                <input type="number" value={r.sort_order} disabled={!canEdit} className="input w-full text-sm"
                  onChange={e => patch(i, 'sort_order', Number(e.target.value))} />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              {USAGES.map(u => (
                <label key={u.field} className="flex items-center gap-2 text-xs" title={u.hint}>
                  <input type="checkbox" checked={r[u.field] === true} disabled={!canEdit}
                    onChange={() => patch(i, u.field, !r[u.field])} className="accent-brand-500" />
                  {u.label}
                </label>
              ))}
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={r.is_active !== false} disabled={!canEdit}
                  onChange={() => patch(i, 'is_active', !r.is_active)} className="accent-brand-500" />
                Активен
              </label>
              {canEdit && (
                <button onClick={() => save(i)} className="btn-secondary text-xs flex items-center gap-1.5 ml-auto">
                  <Save className="w-3.5 h-3.5" /> Сохранить
                </button>
              )}
              {status[i] && <span className="text-xs text-slate-400">{status[i]}</span>}
            </div>
          </div>
        ))}
      </div>

      {canEdit && (
        <button onClick={() => setRows(prev => [...prev, emptyRow(prev.length + 1)])}
          className="btn-secondary text-sm flex items-center gap-2">
          <Plus className="w-4 h-4" /> Добавить отдел
        </button>
      )}

      <p className="text-xs text-slate-500">
        Название можно менять свободно — расчёты держатся на коде. Отключённый отдел
        перестаёт предлагаться в формах, но остаётся в старых отчётах.
        Склад заполняется, если выручка подтягивается из iiko: отдел определяется складом списания.
      </p>
    </div>
  )
}
