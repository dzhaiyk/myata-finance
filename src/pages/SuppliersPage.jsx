import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Edit3, Package } from 'lucide-react'

const CATEGORIES = ['Кухня', 'Бар', 'Кальян', 'Хозтовары', 'Прочее']

export default function SuppliersPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('suppliers.manage')
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState(null)
  const [form, setForm] = useState({ name: '', category: 'Кухня', contact: '' })
  const [filterCat, setFilterCat] = useState('all')

  const load = async () => {
    setLoading(true)
    const { data } = await supabase.from('suppliers').select('*').order('category, name')
    setSuppliers(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const resetForm = () => { setShowForm(false); setEditId(null); setForm({ name: '', category: 'Кухня', contact: '' }) }

  const save = async () => {
    if (!form.name.trim()) return alert('Введите название')
    const payload = { name: form.name.trim(), category: form.category, contact: form.contact || null, is_active: form.is_active !== false }
    if (editId) {
      await supabase.from('suppliers').update(payload).eq('id', editId)
    } else {
      await supabase.from('suppliers').insert(payload)
    }
    resetForm()
    load()
  }

  const remove = async (id) => {
    if (!confirm('Удалить поставщика?')) return
    await supabase.from('suppliers').delete().eq('id', id)
    load()
  }

  const toggleActive = async (s) => {
    await supabase.from('suppliers').update({ is_active: !s.is_active }).eq('id', s.id)
    load()
  }

  const filtered = filterCat === 'all' ? suppliers : suppliers.filter(s => s.category === filterCat)
  const catCounts = {}
  suppliers.forEach(s => { catCounts[s.category] = (catCounts[s.category] || 0) + 1 })

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Поставщики</h1>
          <p className="text-sm text-slate-500 mt-0.5">{suppliers.length} поставщиков в справочнике</p>
        </div>
        {canManage && (
          <button onClick={() => { resetForm(); setShowForm(true) }} className="btn-primary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Добавить
          </button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 flex-wrap">
        <button onClick={() => setFilterCat('all')}
          className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filterCat === 'all' ? 'bg-brand-600/20 text-brand-400' : 'text-slate-500 hover:text-slate-300')}>
          Все ({suppliers.length})
        </button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setFilterCat(c)}
            className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-colors', filterCat === c ? 'bg-brand-600/20 text-brand-400' : 'text-slate-500 hover:text-slate-300')}>
            {c} ({catCounts[c] || 0})
          </button>
        ))}
      </div>

      {/* Add/Edit Form */}
      {showForm && canManage && (
        <div className="card border-brand-500/30 space-y-4">
          <div className="text-sm font-semibold text-brand-400">{editId ? 'Редактировать' : 'Новый поставщик'}</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="label">Название *</label>
              <input value={form.name} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="input text-sm w-full" placeholder="ТОО Арай" /></div>
            <div><label className="label">Категория</label>
              <select value={form.category} onChange={e => setForm(f => ({...f, category: e.target.value}))} className="input text-sm w-full">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className="label">Контакт</label>
              <input value={form.contact || ''} onChange={e => setForm(f => ({...f, contact: e.target.value}))} className="input text-sm w-full" placeholder="+7... / email" /></div>
          </div>
          <div className="flex gap-2">
            <button onClick={save} className="btn-primary text-sm">{editId ? 'Сохранить' : 'Добавить'}</button>
            <button onClick={resetForm} className="btn-secondary text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead><tr>
            <th className="table-header text-left">Поставщик</th>
            <th className="table-header text-left">Категория</th>
            <th className="table-header text-left">Контакт</th>
            <th className="table-header text-center">Статус</th>
            {canManage && <th className="table-header text-center w-20"></th>}
          </tr></thead>
          <tbody>
            {filtered.map(s => (
              <tr key={s.id} className={cn('hover:bg-slate-800/30', !s.is_active && 'opacity-50')}>
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-orange-500/15 flex items-center justify-center">
                      <Package className="w-4 h-4 text-orange-400" />
                    </div>
                    <span className="font-medium">{s.name}</span>
                  </div>
                </td>
                <td className="table-cell">
                  <span className={cn('badge', {
                    'badge-green': s.category === 'Кухня',
                    'badge-blue': s.category === 'Бар',
                    'badge-yellow': s.category === 'Кальян',
                    'bg-purple-500/15 text-purple-400': s.category === 'Хозтовары',
                  }[s.category] || 'badge-blue')}>{s.category}</span>
                </td>
                <td className="table-cell text-xs text-slate-400">{s.contact || '—'}</td>
                <td className="table-cell text-center">
                  <button onClick={() => canManage && toggleActive(s)}
                    className={cn('badge cursor-pointer', s.is_active ? 'badge-green' : 'badge-red')}>
                    {s.is_active ? 'Активен' : 'Неактивен'}
                  </button>
                </td>
                {canManage && (
                  <td className="table-cell text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => { setEditId(s.id); setForm({ ...s }); setShowForm(true) }}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-blue-400">
                        <Edit3 className="w-3.5 h-3.5" /></button>
                      <button onClick={() => remove(s.id)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-red-400">
                        <Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan="5" className="table-cell text-center text-slate-500 py-8">Нет поставщиков</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  )
}
