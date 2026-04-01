import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

const TYPE_OPTIONS = [
  { value: 'investment', label: 'Внесение' },
  { value: 'dividend', label: 'Дивиденды' },
  { value: 'share_purchase', label: 'Покупка доли' },
  { value: 'share_sale', label: 'Продажа доли' },
]

const today = () => new Date().toISOString().slice(0, 10)

export default function TransactionModal({ open, onClose, onSave, investors, editTx }) {
  const [form, setForm] = useState({
    transaction_date: today(),
    investor_id: '',
    type: 'investment',
    amount: '',
    notes: '',
  })

  useEffect(() => {
    if (editTx) {
      setForm({
        transaction_date: editTx.transaction_date || today(),
        investor_id: editTx.investor_id || '',
        type: editTx.type || 'investment',
        amount: editTx.amount != null ? String(editTx.amount).replace('.', ',') : '',
        notes: editTx.notes || '',
      })
    } else {
      setForm({
        transaction_date: today(),
        investor_id: investors?.find(i => i.status === 'active')?.id || '',
        type: 'investment',
        amount: '',
        notes: '',
      })
    }
  }, [editTx, open])

  if (!open) return null

  const activeInvestors = (investors || []).filter(i => i.status === 'active')

  const handleAmountChange = (e) => {
    const val = e.target.value.replace(/[^0-9.,]/g, '').replace('.', ',')
    setForm(f => ({ ...f, amount: val }))
  }

  const handleSave = () => {
    const amount = Number(String(form.amount).replace(',', '.'))
    if (!form.investor_id || !amount) return
    onSave({
      investor_id: form.investor_id,
      transaction_date: form.transaction_date,
      type: form.type,
      amount,
      notes: form.notes,
    })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="card w-full max-w-lg space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">
            {editTx ? 'Редактировать транзакцию' : 'Новая транзакция'}
          </h2>
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
              value={form.transaction_date}
              onChange={e => setForm(f => ({ ...f, transaction_date: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Учредитель</label>
            <select
              className="input w-full"
              value={form.investor_id}
              onChange={e => setForm(f => ({ ...f, investor_id: e.target.value }))}
            >
              <option value="">Выберите учредителя</option>
              {activeInvestors.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.full_name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Тип операции</label>
            <select
              className="input w-full"
              value={form.type}
              onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
            >
              {TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Сумма, ₸</label>
            <input
              type="text"
              className="input w-full"
              placeholder="0"
              value={form.amount}
              onChange={handleAmountChange}
            />
          </div>

          <div>
            <label className="block text-sm text-slate-400 mb-1">Примечание</label>
            <input
              type="text"
              className="input w-full"
              placeholder="Необязательно"
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
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
