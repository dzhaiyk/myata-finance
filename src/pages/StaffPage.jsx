import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/lib/store'
import { cn, fmt } from '@/lib/utils'
import { Plus, Trash2, Edit3, Users, Briefcase } from 'lucide-react'

const DEPARTMENTS = ['Кухня', 'Бар', 'Кальян', 'Зал', 'Менеджмент', 'Прочее']

export default function StaffPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('staff.manage')
  const [tab, setTab] = useState('staff')
  const [staff, setStaff] = useState([])
  const [positions, setPositions] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({})
  const [editId, setEditId] = useState(null)

  const load = async () => {
    setLoading(true)
    const [s1, s2] = await Promise.all([
      supabase.from('staff').select('*').order('department, full_name'),
      supabase.from('positions').select('*').order('department, name'),
    ])
    setStaff(s1.data || [])
    setPositions(s2.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])
  const resetForm = () => { setShowForm(false); setEditId(null); setForm({}) }

  const saveStaff = async () => {
    if (!form.full_name?.trim()) return alert('Введите имя')
    const payload = {
      full_name: form.full_name, department: form.department || 'Кухня',
      position_id: form.position_id || null, phone: form.phone || null,
      daily_rate_override: form.daily_rate_override || null,
      sales_pct_override: form.sales_pct_override || null,
      is_active: form.is_active !== false,
    }
    if (editId) await supabase.from('staff').update(payload).eq('id', editId)
    else await supabase.from('staff').insert(payload)
    resetForm(); load()
  }

  const savePosition = async () => {
    if (!form.name?.trim()) return alert('Введите название')
    const payload = {
      name: form.name, department: form.department || 'Кухня',
      daily_rate: Number(form.daily_rate) || 0, sales_pct: Number(form.sales_pct) || 0,
      is_active: form.is_active !== false,
    }
    if (editId) await supabase.from('positions').update(payload).eq('id', editId)
    else await supabase.from('positions').insert(payload)
    resetForm(); load()
  }

  const deleteItem = async (table, id) => {
    if (!confirm('Удалить?')) return
    await supabase.from(table).delete().eq('id', id)
    load()
  }

  const tabs = [
    { key: 'staff', label: 'Сотрудники', icon: Users, count: staff.length },
    { key: 'positions', label: 'Должности', icon: Briefcase, count: positions.length },
  ]

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Персонал</h1>
          <p className="text-sm text-slate-500 mt-0.5">Сотрудники и должности</p>
        </div>
        {canManage && (
          <button onClick={() => { resetForm(); setShowForm(true); setForm(tab === 'staff' ? { department: 'Кухня' } : { department: 'Кухня' }) }}
            className="btn-primary text-sm flex items-center gap-2">
            <Plus className="w-4 h-4" /> Добавить
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 rounded-xl p-1">
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button key={t.key} onClick={() => { setTab(t.key); resetForm() }}
              className={cn('flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium flex-1 justify-center transition-all',
                tab === t.key ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300')}>
              <Icon className="w-4 h-4" /> {t.label}
              <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full', tab === t.key ? 'bg-brand-500/20 text-brand-400' : 'bg-slate-800 text-slate-500')}>{t.count}</span>
            </button>
          )
        })}
      </div>

      {/* Form */}
      {showForm && canManage && (
        <div className="card border-brand-500/30 space-y-4">
          <div className="text-sm font-semibold text-brand-400">{editId ? 'Редактировать' : 'Добавить'}</div>
          {tab === 'staff' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div><label className="label">Имя *</label>
                <input value={form.full_name || ''} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} className="input text-sm w-full" placeholder="Алия Ермекова" /></div>
              <div><label className="label">Отдел</label>
                <select value={form.department || 'Кухня'} onChange={e => setForm(f => ({...f, department: e.target.value}))} className="input text-sm w-full">
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></div>
              <div><label className="label">Должность</label>
                <select value={form.position_id || ''} onChange={e => setForm(f => ({...f, position_id: e.target.value ? Number(e.target.value) : null}))} className="input text-sm w-full">
                  <option value="">— Нет —</option>
                  {positions.filter(p => p.is_active).map(p => <option key={p.id} value={p.id}>{p.name} ({p.department})</option>)}</select></div>
              <div><label className="label">Телефон</label>
                <input value={form.phone || ''} onChange={e => setForm(f => ({...f, phone: e.target.value}))} className="input text-sm w-full" placeholder="+7..." /></div>
              <div><label className="label">Ставка/день (если отл. от должности)</label>
                <input type="number" value={form.daily_rate_override || ''} onChange={e => setForm(f => ({...f, daily_rate_override: e.target.value}))} className="input text-sm w-full" placeholder="Из должности" /></div>
              <div><label className="label">% от продаж (если отл.)</label>
                <input type="number" step="0.1" value={form.sales_pct_override || ''} onChange={e => setForm(f => ({...f, sales_pct_override: e.target.value}))} className="input text-sm w-full" placeholder="Из должности" /></div>
            </div>
          )}
          {tab === 'positions' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div><label className="label">Название *</label>
                <input value={form.name || ''} onChange={e => setForm(f => ({...f, name: e.target.value}))} className="input text-sm w-full" placeholder="Су-шеф" /></div>
              <div><label className="label">Отдел</label>
                <select value={form.department || 'Кухня'} onChange={e => setForm(f => ({...f, department: e.target.value}))} className="input text-sm w-full">
                  {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></div>
              <div><label className="label">Ставка/день (₸)</label>
                <input type="number" value={form.daily_rate || ''} onChange={e => setForm(f => ({...f, daily_rate: e.target.value}))} className="input text-sm w-full" placeholder="15000" /></div>
              <div><label className="label">% от продаж</label>
                <input type="number" step="0.1" value={form.sales_pct || ''} onChange={e => setForm(f => ({...f, sales_pct: e.target.value}))} className="input text-sm w-full" placeholder="0.5" /></div>
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => tab === 'staff' ? saveStaff() : savePosition()} className="btn-primary text-sm">{editId ? 'Сохранить' : 'Добавить'}</button>
            <button onClick={resetForm} className="btn-secondary text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* Tables */}
      <div className="card overflow-x-auto p-0">
        {tab === 'staff' && (
          <table className="w-full text-sm">
            <thead><tr>
              <th className="table-header text-left">Сотрудник</th>
              <th className="table-header text-left">Отдел</th>
              <th className="table-header text-left">Должность</th>
              <th className="table-header text-right">Ставка/день</th>
              <th className="table-header text-right">% продаж</th>
              <th className="table-header text-center">Статус</th>
              {canManage && <th className="table-header text-center w-20"></th>}
            </tr></thead>
            <tbody>
              {staff.map(s => {
                const pos = positions.find(p => p.id === s.position_id)
                const rate = s.daily_rate_override || pos?.daily_rate || 0
                const pct = s.sales_pct_override || pos?.sales_pct || 0
                return (
                  <tr key={s.id} className={cn('hover:bg-slate-800/30', !s.is_active && 'opacity-50')}>
                    <td className="table-cell font-medium">{s.full_name}</td>
                    <td className="table-cell text-slate-400">{s.department}</td>
                    <td className="table-cell text-slate-400">{pos?.name || '—'}</td>
                    <td className="table-cell text-right font-mono">{rate > 0 ? fmt(rate) + ' ₸' : '—'}</td>
                    <td className="table-cell text-right font-mono">{pct > 0 ? pct + '%' : '—'}</td>
                    <td className="table-cell text-center">
                      <span className={cn('badge', s.is_active ? 'badge-green' : 'badge-red')}>{s.is_active ? 'Активен' : 'Неактивен'}</span>
                    </td>
                    {canManage && (
                      <td className="table-cell text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => { setEditId(s.id); setForm({ ...s }); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-blue-400"><Edit3 className="w-3.5 h-3.5" /></button>
                          <button onClick={() => deleteItem('staff', s.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {staff.length === 0 && <tr><td colSpan="7" className="table-cell text-center text-slate-500 py-8">Нет сотрудников</td></tr>}
            </tbody>
          </table>
        )}
        {tab === 'positions' && (
          <table className="w-full text-sm">
            <thead><tr>
              <th className="table-header text-left">Должность</th>
              <th className="table-header text-left">Отдел</th>
              <th className="table-header text-right">Ставка/день</th>
              <th className="table-header text-right">% от продаж</th>
              <th className="table-header text-center">Статус</th>
              {canManage && <th className="table-header text-center w-20"></th>}
            </tr></thead>
            <tbody>
              {positions.map(p => (
                <tr key={p.id} className={cn('hover:bg-slate-800/30', !p.is_active && 'opacity-50')}>
                  <td className="table-cell font-medium">{p.name}</td>
                  <td className="table-cell text-slate-400">{p.department}</td>
                  <td className="table-cell text-right font-mono">{p.daily_rate > 0 ? fmt(p.daily_rate) + ' ₸' : '—'}</td>
                  <td className="table-cell text-right font-mono">{p.sales_pct > 0 ? p.sales_pct + '%' : '—'}</td>
                  <td className="table-cell text-center">
                    <span className={cn('badge', p.is_active ? 'badge-green' : 'badge-red')}>{p.is_active ? 'Активна' : 'Неактивна'}</span>
                  </td>
                  {canManage && (
                    <td className="table-cell text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button onClick={() => { setTab('positions'); setEditId(p.id); setForm({ ...p }); setShowForm(true) }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-blue-400"><Edit3 className="w-3.5 h-3.5" /></button>
                        <button onClick={() => deleteItem('positions', p.id)} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {positions.length === 0 && <tr><td colSpan="6" className="table-cell text-center text-slate-500 py-8">Нет должностей</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
