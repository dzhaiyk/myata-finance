// Строки P&L: подписи, порядок, видимость и привязка статей — из базы (ADR-0011).
// Формулы расчётных строк живут в коде; здесь у них только подпись и порядок.
import { useEffect, useMemo, useState } from 'react'
import { getPnlLines, savePnlLine, loadPnlStructure } from '@/lib/pnlStructure'
import { loadCategories } from '@/lib/categoriesDict'
import { departmentsFor, codeFromName, categoryLabel } from '@/lib/config'
import { cn } from '@/lib/utils'
import { Save, Plus, TableProperties } from 'lucide-react'

const SECTION_LABEL = { revenue: 'Доходы', expenses: 'Расходы', result: 'Результат', ratio: 'Показатели' }
const KIND_LABEL = (l) => (l.calc ? 'расчёт' : l.source_kind === 'daily' ? 'отчёт смены' : l.source_kind === 'both' ? 'смена + банк' : 'банк')

export default function PnlLinesEditor({ canEdit }) {
  const [lines, setLines] = useState(() => getPnlLines())
  const [cats, setCats] = useState([])
  const [editing, setEditing] = useState(null)
  const [status, setStatus] = useState('')

  const reload = async () => { await loadPnlStructure(); setLines(getPnlLines()) }
  useEffect(() => { reload(); loadCategories().then(r => setCats(r.rows)) }, [])

  const groups = useMemo(() => lines.filter(l => l.calc === 'sum_children'), [lines])
  const patch = (k, v) => setEditing(e => ({ ...e, [k]: v }))

  const startNew = () => {
    const order = (Math.max(0, ...lines.map(l => l.sort_order || 0)) || 0) + 10
    setEditing({ _new: true, key: '', label: '', section: 'expenses', level: 3, source_kind: 'bank',
      category_code: '', parent_key: '', department: '', label_prefix: '', sort_order: order, is_active: true })
  }

  const save = async () => {
    const row = { ...editing, label: String(editing.label || '').trim() }
    const errors = []
    if (!row.label) errors.push('Нужна подпись')
    if (row._new) {
      // ключ создаётся один раз из подписи и дальше не меняется (правило 12)
      row.key = codeFromName(row.label, lines.map(l => l.key))
      if (!row.key) errors.push('Из подписи не вышло ключа — добавьте латиницу или цифры')
      if (!row.category_code) errors.push('Новой строке нужна статья — иначе ей неоткуда взять сумму')
      const parent = lines.find(l => l.key === row.parent_key)
      if (!parent) errors.push('Выберите группу, в которую входит строка')
      else { row.level = (parent.level || 0) + 1; row.section = parent.section }
    }
    if (errors.length) { setStatus('❌ ' + errors.join('; ')); return }
    setStatus('Сохранение...')
    const { error } = await savePnlLine(row)
    if (error) { setStatus('❌ ' + error.message); return }
    setStatus('✅ Сохранено'); setEditing(null); await reload()
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center">
          <TableProperties className="w-5 h-5 text-violet-400" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-semibold">Строки P&L</div>
          <div className="text-xs text-slate-500">Подпись, порядок, видимость и статья. Формулы итогов и долей — в коде, у них только подпись</div>
        </div>
        {canEdit && !editing && (
          <button onClick={startNew} className="btn-secondary text-sm flex items-center gap-2"><Plus className="w-4 h-4" /> Строка-статья</button>
        )}
      </div>

      {!lines.length && <p className="text-xs text-slate-500">Структура из базы не загружена — отчёт использует встроенную.</p>}

      {editing && (
        <div className="rounded-xl border border-brand-500/30 p-4 space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div><label className="label">Подпись</label>
              <input value={editing.label} onChange={e => patch('label', e.target.value)} className="input w-full text-sm" disabled={!canEdit} /></div>
            <div><label className="label">Ключ</label>
              <div className="input w-full text-sm font-mono text-slate-500" title="Создаётся из подписи и не меняется: по нему считаются итоги">
                {editing._new ? (codeFromName(editing.label, lines.map(l => l.key)) || '—') : editing.key}</div></div>
            {editing._new && (
              <div><label className="label">Группа</label>
                <select value={editing.parent_key} onChange={e => patch('parent_key', e.target.value)} className="input w-full text-sm" disabled={!canEdit}>
                  <option value="">— выберите —</option>
                  {groups.map(g => <option key={g.key} value={g.key}>{g.label}</option>)}
                </select></div>
            )}
            {!editing.calc && (
              <div><label className="label">Статья</label>
                <select value={editing.category_code || ''} onChange={e => patch('category_code', e.target.value)} className="input w-full text-sm" disabled={!canEdit}>
                  <option value="">— без статьи —</option>
                  {cats.map(c => <option key={c.code} value={c.code}>{categoryLabel(c)}</option>)}
                </select></div>
            )}
            <div><label className="label">Порядок</label>
              <input type="number" value={editing.sort_order} onChange={e => patch('sort_order', Number(e.target.value))} className="input w-full text-sm" disabled={!canEdit} /></div>
            {!editing.calc && (
              <>
                <div><label className="label">Отдел</label>
                  <select value={editing.department || ''} onChange={e => patch('department', e.target.value)} className="input w-full text-sm" disabled={!canEdit}>
                    <option value="">— без отдела —</option>
                    {departmentsFor('supply').map(d => <option key={d.code} value={d.code}>{d.name}</option>)}
                  </select></div>
                <div><label className="label">Префикс подписи</label>
                  <input value={editing.label_prefix || ''} onChange={e => patch('label_prefix', e.target.value)} className="input w-full text-sm" placeholder="ФОТ" disabled={!canEdit} /></div>
              </>
            )}
          </div>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={editing.is_active !== false} onChange={() => patch('is_active', !editing.is_active)} className="accent-brand-500" disabled={!canEdit} />
            Показывать в отчёте (скрытая строка остаётся в итогах)
          </label>
          <div className="flex items-center gap-3">
            {canEdit && <button onClick={save} className="btn-primary text-sm flex items-center gap-2"><Save className="w-4 h-4" /> Сохранить</button>}
            <button onClick={() => { setEditing(null); setStatus('') }} className="btn-secondary text-sm">Закрыть</button>
            {status && <span className="text-xs text-slate-400">{status}</span>}
          </div>
        </div>
      )}

      <div className="space-y-0.5">
        {lines.map(l => (
          <button key={l.key} onClick={() => setEditing({ ...l })}
            className={cn('w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800/40', !l.is_active && 'opacity-50')}
            style={{ paddingLeft: `${12 + (l.level || 0) * 16}px` }}>
            <span className={cn('text-sm flex-1', l.level === 0 && 'font-bold', l.calc === 'sum_children' && l.level > 0 && 'font-semibold')}>{l.label}</span>
            <span className="text-2xs text-slate-600">{SECTION_LABEL[l.section]}</span>
            <span className="badge text-2xs">{KIND_LABEL(l)}</span>
            {l.category_code && <span className="text-2xs font-mono text-slate-600">{l.category_code}</span>}
          </button>
        ))}
      </div>
    </div>
  )
}
