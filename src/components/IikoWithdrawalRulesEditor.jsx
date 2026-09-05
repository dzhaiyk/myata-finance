// Справочник «Изъятия iiko»: по каким словам в комментарии изъятия платёж
// попадает в секцию расходов отчёта смены (BR-SHF-021). Порядок важен —
// первое совпавшее правило побеждает.
import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, ArrowUp, ArrowDown } from 'lucide-react'
import { loadWithdrawalRules, saveWithdrawalRules, EMPTY_RULE } from '@/lib/iikoWithdrawalRules'

const SECTIONS = [
  { key: 'suppliers_kitchen', label: 'Закуп кухни' },
  { key: 'suppliers_bar', label: 'Закуп бара' },
  { key: 'tobacco', label: 'Закуп кальяна' },
  { key: 'payroll', label: 'Авансы персоналу' },
  { key: 'other', label: 'Прочие расходы' },
  { key: 'cash_withdrawals', label: 'Изъятия из кассы' },
]

export default function IikoWithdrawalRulesEditor({ canEdit }) {
  const [rules, setRules] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState('')

  useEffect(() => { loadWithdrawalRules().then(r => { setRules(r.length ? r : []); setLoading(false) }) }, [])

  const patch = (i, k, v) => setRules(prev => prev.map((r, idx) => (idx === i ? { ...r, [k]: v } : r)))
  const move = (i, d) => setRules(prev => {
    const j = i + d; if (j < 0 || j >= prev.length) return prev
    const next = [...prev]; [next[i], next[j]] = [next[j], next[i]]; return next
  })

  const save = async () => {
    setSaving(true); setMsg('')
    const { error } = await saveWithdrawalRules(rules)
    setMsg(error ? `Ошибка: ${error.message}` : 'Сохранено')
    setSaving(false)
  }

  if (loading) return <div className="card text-sm text-slate-500">Загрузка…</div>

  return (
    <div className="card space-y-3">
      <div>
        <h3 className="font-display font-bold">Изъятия из кассы iiko → секции отчёта</h3>
        <p className="text-xs text-slate-500 mt-1">
          Слова через «|» ищутся в комментарии изъятия без учёта регистра. Первое совпавшее правило побеждает.
          Что не совпало ни с одним — попадает в «Прочие расходы» с пометкой и не теряется.
          «Строка» — под каким именем показать сумму (для фиксированных строк вроде «Табак» — точно как в отчёте).
        </p>
      </div>
      <div className="space-y-2">
        {rules.map((r, i) => (
          <div key={i} className="grid grid-cols-12 gap-2 items-center">
            <input value={r.pattern} disabled={!canEdit} placeholder="закуп кухня|мясо|овощи"
              className="input col-span-5 text-sm" onChange={e => patch(i, 'pattern', e.target.value)} />
            <select value={r.section} disabled={!canEdit} className="input col-span-3 text-sm" onChange={e => patch(i, 'section', e.target.value)}>
              {SECTIONS.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            <input value={r.name || ''} disabled={!canEdit} placeholder="строка (необязательно)"
              className="input col-span-3 text-sm" onChange={e => patch(i, 'name', e.target.value)} />
            {canEdit && (
              <div className="col-span-1 flex gap-1 justify-end">
                <button onClick={() => move(i, -1)} className="text-slate-500 hover:text-slate-300" title="Выше"><ArrowUp className="w-3.5 h-3.5" /></button>
                <button onClick={() => move(i, 1)} className="text-slate-500 hover:text-slate-300" title="Ниже"><ArrowDown className="w-3.5 h-3.5" /></button>
                <button onClick={() => setRules(prev => prev.filter((_, idx) => idx !== i))} className="text-red-400 hover:text-red-300" title="Удалить"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            )}
          </div>
        ))}
        {!rules.length && <p className="text-sm text-slate-500">Правил нет — все изъятия из iiko пойдут в «Прочие расходы».</p>}
      </div>
      {canEdit && (
        <div className="flex items-center gap-3">
          <button onClick={() => setRules(prev => [...prev, EMPTY_RULE()])} className="btn-secondary text-sm flex items-center gap-1"><Plus className="w-4 h-4" /> Правило</button>
          <button onClick={save} disabled={saving} className="btn-primary text-sm flex items-center gap-1"><Save className="w-4 h-4" /> {saving ? 'Сохраняю…' : 'Сохранить'}</button>
          {msg && <span className="text-xs text-slate-400">{msg}</span>}
        </div>
      )}
    </div>
  )
}
