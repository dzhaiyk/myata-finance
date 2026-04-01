import { useState, useEffect, useMemo } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const today = () => new Date().toISOString().slice(0, 10)

export default function ShareTransferModal({ open, onClose, onSave, investors }) {
  const [fromId, setFromId] = useState('')
  const [toMode, setToMode] = useState('existing')
  const [toId, setToId] = useState('')
  const [toName, setToName] = useState('')
  const [amount, setAmount] = useState('')
  const [transferDate, setTransferDate] = useState(today())
  const [notes, setNotes] = useState('')

  const activeInvestors = useMemo(
    () => (investors || []).filter(i => i.status === 'active'),
    [investors]
  )

  const toOptions = useMemo(
    () => (investors || []).filter(i => i.id !== fromId),
    [investors, fromId]
  )

  useEffect(() => {
    if (open) {
      setFromId('')
      setToMode('existing')
      setToId('')
      setToName('')
      setAmount('')
      setTransferDate(today())
      setNotes('')
    }
  }, [open])

  if (!open) return null

  const handleAmountChange = (e) => {
    const val = e.target.value.replace(/[^0-9.,]/g, '').replace('.', ',')
    setAmount(val)
  }

  const handleSave = () => {
    const parsedAmount = Number(String(amount).replace(',', '.'))
    if (!fromId || !parsedAmount) return
    if (toMode === 'existing' && !toId) return
    if (toMode === 'new' && !toName.trim()) return

    onSave({
      from_id: fromId,
      to_id: toMode === 'existing' ? toId : null,
      to_name: toMode === 'new' ? toName.trim() : null,
      amount: parsedAmount,
      date: transferDate,
      notes,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Передача доли</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm text-slate-400 mb-1">От кого</label>
            <select
              className="input w-full"
              value={fromId}
              onChange={e => { setFromId(e.target.value); setToId('') }}
            >
              <option value="">Выберите учредителя</option>
              {activeInvestors.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-2">Кому</label>
            <div className="flex items-center gap-4 mb-2">
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name="to-mode"
                  checked={toMode === 'existing'}
                  onChange={() => setToMode('existing')}
                  className="accent-brand-500"
                />
                Существующий учредитель
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="radio"
                  name="to-mode"
                  checked={toMode === 'new'}
                  onChange={() => setToMode('new')}
                  className="accent-brand-500"
                />
                Новый учредитель
              </label>
            </div>

            {toMode === 'existing' ? (
              <select
                className="input w-full"
                value={toId}
                onChange={e => setToId(e.target.value)}
              >
                <option value="">Выберите учредителя</option>
                {toOptions.map(inv => (
                  <option key={inv.id} value={inv.id}>{inv.full_name}</option>
                ))}
              </select>
            ) : (
              <input
                type="text"
                className="input w-full"
                placeholder="ФИО нового учредителя"
                value={toName}
                onChange={e => setToName(e.target.value)}
              />
            )}
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Сумма покупки, ₸</label>
            <input
              type="text"
              className="input w-full"
              placeholder="0"
              value={amount}
              onChange={handleAmountChange}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Дата передачи</label>
            <input
              type="date"
              className="input w-full"
              value={transferDate}
              onChange={e => setTransferDate(e.target.value)}
            />
          </div>

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
