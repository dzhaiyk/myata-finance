import { useState } from 'react'
import { cn } from '@/lib/utils'
import { useAuthStore } from '@/lib/store'
import { supabase } from '@/lib/supabase'
import { Plus, UserPlus, MoreVertical, Shield } from 'lucide-react'

const DEMO_USERS = [
  { id: 1, full_name: 'Жайык', email: 'zhaiyk@myata.kz', role: 'Админ', status: 'active', last_seen: '2025-12-30' },
  { id: 2, full_name: 'Абу', email: 'abu@myata.kz', role: 'Учредитель', status: 'active', last_seen: '2025-12-29' },
  { id: 3, full_name: 'Әділет', email: 'adilet@myata.kz', role: 'Управляющий', status: 'active', last_seen: '2025-12-30' },
  { id: 4, full_name: 'Менеджер 1', email: 'manager1@myata.kz', role: 'Менеджер', status: 'active', last_seen: '2025-12-30' },
]

const ROLES = ['Админ', 'Учредитель', 'Управляющий', 'Менеджер']

export default function UsersPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('users.manage')
  const [users] = useState(DEMO_USERS)
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [inviteRole, setInviteRole] = useState('Менеджер')

  const handleInvite = async () => {
    if (!inviteEmail || !inviteName) return
    try {
      // In production: supabase.auth.admin.inviteUserByEmail(inviteEmail)
      alert(`Приглашение отправлено на ${inviteEmail}`)
      setShowInvite(false)
      setInviteEmail(''); setInviteName(''); setInviteRole('Менеджер')
    } catch (e) { alert('Ошибка: ' + e.message) }
  }

  const roleBadge = (role) => {
    const colors = {
      'Админ': 'bg-red-500/15 text-red-400',
      'Учредитель': 'bg-purple-500/15 text-purple-400',
      'Управляющий': 'bg-blue-500/15 text-blue-400',
      'Менеджер': 'bg-green-500/15 text-green-400',
    }
    return <span className={cn('badge', colors[role] || 'badge-blue')}>{role}</span>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Пользователи</h1>
          <p className="text-sm text-slate-500 mt-0.5">Управление доступом к системе</p>
        </div>
        {canManage && (
          <button onClick={() => setShowInvite(true)} className="btn-primary text-sm flex items-center gap-2">
            <UserPlus className="w-4 h-4" /> Пригласить
          </button>
        )}
      </div>

      {/* Invite Modal */}
      {showInvite && (
        <div className="card border-brand-500/30 space-y-4">
          <div className="text-sm font-semibold text-brand-400">Пригласить пользователя</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="Имя" className="input text-sm" />
            <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="Email" className="input text-sm" type="email" />
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="input text-sm">
              {ROLES.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={handleInvite} className="btn-primary text-sm">Отправить</button>
            <button onClick={() => setShowInvite(false)} className="btn-secondary text-sm">Отмена</button>
          </div>
        </div>
      )}

      {/* Users Table */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="table-header text-left">Пользователь</th>
              <th className="table-header text-left">Email</th>
              <th className="table-header text-center">Роль</th>
              <th className="table-header text-center">Статус</th>
              <th className="table-header text-right">Последний вход</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} className="hover:bg-slate-800/30">
                <td className="table-cell">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-mint-600 flex items-center justify-center text-xs font-bold text-white">
                      {u.full_name[0]}
                    </div>
                    <span className="font-medium">{u.full_name}</span>
                  </div>
                </td>
                <td className="table-cell text-slate-400 font-mono text-xs">{u.email}</td>
                <td className="table-cell text-center">{roleBadge(u.role)}</td>
                <td className="table-cell text-center">
                  <span className={cn('badge', u.status === 'active' ? 'badge-green' : 'badge-red')}>
                    {u.status === 'active' ? 'Активен' : 'Неактивен'}
                  </span>
                </td>
                <td className="table-cell text-right text-xs text-slate-500">{u.last_seen}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
