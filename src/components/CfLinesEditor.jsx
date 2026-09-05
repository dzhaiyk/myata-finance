// Строки Cash Flow: подпись, порядок, видимость — из базы (ADR-0011, TASK-029).
// Формулы итогов в коде; привязка статей к строкам показывается, правится позже.
import { useEffect, useState } from 'react'
import { getCfLines, cfBankGroups, saveCfLine, loadCfStructure } from '@/lib/cashflowStructure'
import { cn } from '@/lib/utils'
import { Save, Waves } from 'lucide-react'

const SECTION_LABEL = { operating: 'Операционная', investing: 'Инвестиционная', financing: 'Финансовая', total: 'Итог' }

export default function CfLinesEditor({ canEdit }) {
  const [lines, setLines] = useState(() => getCfLines())
  const [editing, setEditing] = useState(null)
  const [status, setStatus] = useState('')
  const reload = async () => { await loadCfStructure(); setLines(getCfLines()) }
  useEffect(() => { reload() }, [])
  const groups = cfBankGroups()
  const patch = (k, v) => setEditing(e => ({ ...e, [k]: v }))

  const save = async () => {
    const row = { ...editing, label: String(editing.label || '').trim() }
    if (!row.label) { setStatus('❌ Нужна подпись'); return }
    setStatus('Сохранение...')
    const { error } = await saveCfLine(row)
    if (error) { setStatus('❌ ' + error.message); return }
    setStatus('✅ Сохранено'); setEditing(null); await reload()
  }

  return (
    <div className="card space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-teal-500/20 flex items-center justify-center">
          <Waves className="w-5 h-5 text-teal-400" />
        </div>
        <div>
          <div className="text-sm font-semibold">Строки Cash Flow</div>
          <div className="text-xs text-slate-500">Подпись, порядок, видимость. Итоги разделов — формулы в коде; статьи под строкой показаны для справки</div>
        </div>
      </div>
      {!lines.length && <p className="text-xs text-slate-500">Структура из базы не загружена — отчёт использует встроенную.</p>}

      {editing && (
        <div className="rounded-xl border border-brand-500/30 p-4 space-y-3">
          <div className="grid sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2"><label className="label">Подпись</label>
              <input value={editing.label} onChange={e => patch('label', e.target.value)} className="input w-full text-sm" disabled={!canEdit} /></div>
            <div><label className="label">Порядок</label>
              <input type="number" value={editing.sort_order} onChange={e => patch('sort_order', Number(e.target.value))} className="input w-full text-sm" disabled={!canEdit} /></div>
          </div>
          <div className="text-xs text-slate-500">Ключ <span className="font-mono">{editing.key}</span> — не меняется, по нему считаются итоги</div>
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
          <div key={l.key}>
            <button onClick={() => setEditing({ ...l })}
              className={cn('w-full text-left flex items-center gap-2 px-3 py-1.5 rounded-lg hover:bg-slate-800/40', !l.is_active && 'opacity-50')}
              style={{ paddingLeft: `${12 + (l.level || 0) * 16}px` }}>
              <span className={cn('text-sm flex-1', l.level === 0 && 'font-bold', l.calc && l.level > 0 && 'font-semibold')}>{l.label}</span>
              <span className="text-2xs text-slate-600">{SECTION_LABEL[l.section]}</span>
              {l.calc && <span className="badge text-2xs">расчёт</span>}
            </button>
            {groups[l.key] && (
              <div className="text-2xs font-mono text-slate-600 pb-1" style={{ paddingLeft: `${28 + (l.level || 0) * 16}px` }}>
                {groups[l.key].join(', ')}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
