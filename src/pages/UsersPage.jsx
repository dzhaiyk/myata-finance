import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { UserPlus, Trash2, Edit3, Check, X, Eye, EyeOff } from 'lucide-react'

const ROLES = ['Админ', 'Учредитель', 'Управляющий', 'Менеджер']

export default function UsersPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('users.manage')
  const [users, setUsers] = useState([])
  const [roles, setRoles] = useState([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editId, setEditId] = useState(null)
  const [showPasswords, setShowPasswords] = useState({})

  // New user form
  const [form, setForm] = useState({ username: '', password: '', full_name: '', role_id: 4 })

  const loadUsers = async () => {
    const { data } = await supabase.from('app_users').select('*').order('created_at')
    const { data: rolesData } = await supabase.from('roles').select('*').order('id')
    setUsers(data || [])
    setRoles(rolesData || [])
    setLoading(false)
  }

  useEffect(() => { loadUsers() }, [])

  const handleAdd = async () => {
    if (!form.username || !form.password || !form.full_name) return alert('Заполните все поля')
    if (form.username.length < 3) return alert('Логин минимум 3 символа')
    
    const { error } = await supabase.from('app_users').insert({
      username: form.username.toLowerCase().trim(),
      password_hash: form.password,
      full_name: form.full_name,
      role_id: form.role_id,
    })
    if (error) {
      if (error.code === '23505') return alert('Логин уже занят')
      return alert('Ошибка: ' + error.message)
    }
    setForm({ username: '', password: '', full_name: '', role_id: 4 })
    setShowAdd(false)
    loadUsers()
  }

  const handleToggleActive = async (user) => {
    await supabase.from('app_users').update({ is_active: !user.is_active }).eq('id', user.id)
    loadUsers()
  }

  const handleDelete = async (user) => {
    if (!confirm(`Удалить пользователя "${user.full_name}"?`)) return
    await supabase.from('app_users').delete().eq('id', user.id)
    loadUsers()
  }

  const handleUpdateRole = async (userId, roleId) => {
    await supabase.from('app_users').update({ role_id: roleId }).eq('id', userId)
    loadUsers()
  }

  const handleResetPassword = async (userId, newPw) => {
    if (!newPw) return
    await supabase.from('app_users').update({ password_hash: newPw }).eq('id', userId)
    alert('Пароль обновлён')
    loadUsers()
  }

  const roleBadge = (roleId) => {
    const role = roles.find(r => r.id === roleId)
    const name = role?.name || '?'
    const colors = {
      'Админ': 'bg-red-500/15 text-red-400',
      'Учредитель': 'bg-purple-500/15 text-purple-400',
      'Управляющий': 'bg-blue-500/15 text-blue-400',
      'Менеджер': 'bg-green-500/15 text-green-400',
    }
    return <span className={cn('badge', colors[name] || 'badge-blue')}>{name}</span>
  }

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Пользователи</h1>
          <p className="text-sm text-slate-500 mt-0.5">{users.length} пользователей в системе</p>
        </div>
        {canManage && (
          <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-sm flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Добавить
          </button>
        )}
      </div>

      {/* Add User Form */}
      {showAdd && canManage && (
        <div className="card border-brand-500/30 space-y-4">
          <div className="text-sm font-semibold text-brand-400">Новый пользователь</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div>
              <label className="label">Имя</label>
              <input value={form.full_name} onChange={e => setForm(f => ({...f, full_name: e.target.value}))} placeholder="Алия" className="input text-sm w-full" />
            </div>
            <div>
              <label className="label">Логин (≥3 символа)</label>
              <input value={form.username} onChange={e => setForm(f => ({...f, username: e.target.value}))} placeholder="ali" className="input text-sm w-full" />
            </div>
            <div>
              <label className="label">Пароль</label>
              <input value={form.password} onChange={e => setForm(f => ({...f, password: e.target.value}))} placeholder="1234" className="input text-sm w-full" />
            </div>
            <div>
              <label className="label">Роль</label>
              <select value={form.role_id} onChange={e => setForm(f => ({...f, role_id: Number(e.target.value)}))} className="input text-sm w-full">
                {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={handleAdd} className="btn-primary text-sm">Создать</button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header text-left">Имя</th>
              <th className="table-header text-left">Логин</th>
              <th className="table-header text-center">Пароль</th>
              <th className="table-header text-center">Роль</th>
              <th className="table-header text-center">Статус</th>
              <th className="table-header text-right">Последний вход</th>
              {canManage && <th className="table-header text-center">Действия</th>}
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-800/30">
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-mint-600 flex items-center justify-center text-xs font-bold text-white">
                      {u.full_name?.[0] || '?'}
                    </div>
                    <span className="font-medium">{u.full_name}</span>
                  </div>
                </td>
                <td className="table-cell font-mono text-xs text-slate-400">{u.username}</td>
                <td className="table-cell text-center">
                  {canManage ? (
                    <div className="flex items-center justify-center gap-1">
                      <span className="font-mono text-xs text-slate-500">
                        {showPasswords[u.id] ? u.password_hash : '••••'}
                      </span>
                      <button onClick={() => setShowPasswords(p => ({...p, [u.id]: !p[u.id]}))}
                        className="text-slate-600 hover:text-slate-400">
                        {showPasswords[u.id] ? <EyeOff className="w-3 h-3"/> : <Eye className="w-3 h-3"/>}
                      </button>
                    </div>
                  ) : '••••'}
                </td>
                <td className="table-cell text-center">
                  {canManage ? (
                    <select value={u.role_id} onChange={e => handleUpdateRole(u.id, Number(e.target.value))}
                      className="input text-xs py-1 px-2">
                      {roles.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                  ) : roleBadge(u.role_id)}
                </td>
                <td className="table-cell text-center">
                  <button onClick={() => canManage && handleToggleActive(u)} 
                    className={cn('badge cursor-pointer', u.is_active ? 'badge-green' : 'badge-red')}>
                    {u.is_active ? 'Активен' : 'Неактивен'}
                  </button>
                </td>
                <td className="table-cell text-right text-xs text-slate-500">
                  {u.last_login ? new Date(u.last_login).toLocaleDateString('ru-RU') : 'Никогда'}
                </td>
                {canManage && (
                  <td className="table-cell text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => {
                        const pw = prompt('Новый пароль:', '')
                        if (pw) handleResetPassword(u.id, pw)
                      }} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-blue-400" title="Сменить пароль">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(u)}
                        className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-500 hover:text-red-400" title="Удалить">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
