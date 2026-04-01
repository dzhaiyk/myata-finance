import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { fmt, cn } from '@/lib/utils'

const today = () => new Date().toISOString().slice(0, 10)

export default function BulkOperationModal({ open, onClose, onSave, investors, mode }) {
  const activeInvestors = useMemo(
    () => (investors || []).filter(i => i.status === 'active'),
    [investors]
  )

  const [date, setDate] = useState(today())
  const [uniformAmount, setUniformAmount] = useState('')
  const [perPerson, setPerPerson] = useState(false)
  const [amounts, setAmounts] = useState({})
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (open) {
      setDate(today())
      setUniformAmount('')
      setPerPerson(false)
      setAmounts({})
      setNotes('')
    }
  }, [open])

  if (!open) return null

  const parseNum = (v) => Number(String(v).replace(',', '.')) || 0

  const handleUniformChange = (e) => {
    const val = e.target.value.replace(/[^0-9.,]/g, '').replace('.', ',')
    setUniformAmount(val)
  }

  const handlePersonAmount = (id, e) => {
    const val = e.target.value.replace(/[^0-9.,]/g, '').replace('.', ',')
    setAmounts(prev => ({ ...prev, [id]: val }))
  }

  const totalAmount = perPerson
    ? activeInvestors.reduce((sum, inv) => sum + parseNum(amounts[inv.id] || 0), 0)
    : parseNum(uniformAmount) * activeInvestors.length

  const handleSave = () => {
    const entries = activeInvestors.map(inv => ({
      investor_id: inv.id,
      amount: perPerson ? parseNum(amounts[inv.id] || 0) : parseNum(uniformAmount),
    })).filter(e => e.amount > 0)

    if (entries.length === 0) return
    onSave(entries)
  }

  const title = mode === 'dividend' ? 'Выплатить дивиденды' : 'Внести от всех учредителей'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Дата</label>
            <input
              type="date"
              className="input w-full"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="per-person"
              checked={perPerson}
              onChange={e => setPerPerson(e.target.checked)}
              className="rounded border-slate-600"
            />
            <label htmlFor="per-person" className="text-sm text-slate-300">
              Разные суммы
            </label>
          </div>

          {!perPerson ? (
            <div>
              <label className="block text-sm text-slate-400 mb-1">
                Сумма на каждого, ₸
              </label>
              <input
                type="text"
                className="input w-full"
                placeholder="0"
                value={uniformAmount}
                onChange={handleUniformChange}
              />
              <p className="text-xs text-slate-500 mt-1">
                Итого: {fmt(totalAmount)} ₸ ({activeInvestors.length} × сумма)
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeInvestors.map(inv => (
                <div key={inv.id} className="flex items-center gap-3">
                  <span className="text-sm text-slate-300 w-40 truncate">{inv.full_name}</span>
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="0"
                    value={amounts[inv.id] || ''}
                    onChange={e => handlePersonAmount(inv.id, e)}
                  />
                </div>
              ))}
              <p className="text-xs text-slate-500 mt-1">
                Итого: {fmt(totalAmount)} ₸
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm text-slate-400 mb-1">Примечание</label>
            <input
              type="text"
              className="input w-full"
              placeholder="Необязательно"
              value={notes}
              onChange={e => setNotes(e.target.value)}
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-secondary">Отмена</button>
          <button onClick={handleSave} className="btn-primary">Сохранить</button>
        </div>
      </div>
    </div>
  )
}
