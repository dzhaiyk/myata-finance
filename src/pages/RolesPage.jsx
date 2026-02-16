import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ALL_PERMISSIONS, useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Save, Shield, Check, X } from 'lucide-react'

const DEFAULT_ROLES = [
  { name: 'Админ', description: 'Полный доступ ко всему', is_system: true },
  { name: 'Учредитель', description: 'Просмотр всех финансов и отчётов', is_system: true },
  { name: 'Управляющий', description: 'Управление ежедневными операциями', is_system: true },
  { name: 'Менеджер', description: 'Создание ежедневных отчётов', is_system: true },
]

export default function RolesPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('roles.manage')

  const [roles, setRoles] = useState(DEFAULT_ROLES.map((r, i) => ({ id: i + 1, ...r })))
  const [permsMatrix, setPermsMatrix] = useState(() => {
    const m = {}
    // Default permissions
    const defaults = {
      'Админ': Object.keys(ALL_PERMISSIONS).reduce((a, k) => ({ ...a, [k]: true }), {}),
      'Учредитель': {
        'daily_report.view': true, 'pnl.view': true, 'cashflow.view': true, 'dashboard.view': true,
        'dashboard.kpi': true, 'bank_import.view': true, 'users.view': true, 'roles.view': true, 'settings.view': true,
      },
      'Управляющий': {
        'daily_report.view': true, 'daily_report.create': true, 'daily_report.edit': true,
        'pnl.view': true, 'cashflow.view': true, 'dashboard.view': true, 'dashboard.kpi': true,
        'bank_import.view': true, 'bank_import.upload': true, 'bank_import.categorize': true,
      },
      'Менеджер': {
        'daily_report.view': true, 'daily_report.create': true, 'dashboard.view': true,
      },
    }
    roles.forEach(r => { m[r.id] = defaults[r.name] || {} })
    return m
  })

  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')
  const [saving, setSaving] = useState(false)

  const togglePerm = (roleId, permKey) => {
    if (!canManage) return
    const role = roles.find(r => r.id === roleId)
    if (role?.name === 'Админ') return // Can't modify admin
    setPermsMatrix(prev => ({
      ...prev,
      [roleId]: { ...prev[roleId], [permKey]: !prev[roleId]?.[permKey] }
    }))
  }

  const addRole = () => {
    if (!newRoleName.trim()) return
    const newId = Math.max(...roles.map(r => r.id)) + 1
    setRoles(prev => [...prev, { id: newId, name: newRoleName, description: newRoleDesc, is_system: false }])
    setPermsMatrix(prev => ({ ...prev, [newId]: {} }))
    setNewRoleName('')
    setNewRoleDesc('')
  }

  const removeRole = (roleId) => {
    const role = roles.find(r => r.id === roleId)
    if (role?.is_system) return
    if (!confirm(`Удалить роль "${role.name}"?`)) return
    setRoles(prev => prev.filter(r => r.id !== roleId))
    setPermsMatrix(prev => { const m = { ...prev }; delete m[roleId]; return m })
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      // Save to Supabase
      for (const role of roles) {
        const { data, error } = await supabase.from('roles').upsert({
          id: role.id, name: role.name, description: role.description, is_system: role.is_system,
        }, { onConflict: 'id' })
        if (error) throw error

        // Save permissions
        const perms = Object.entries(permsMatrix[role.id] || {}).map(([key, allowed]) => ({
          role_id: role.id, permission_key: key, allowed,
        }))
        if (perms.length) {
          await supabase.from('permissions').upsert(perms, { onConflict: 'role_id,permission_key' })
        }
      }
      alert('✅ Роли и права сохранены')
    } catch (e) {
      alert('Ошибка: ' + e.message)
    }
    setSaving(false)
  }

  // Group permissions by category
  const permGroups = {}
  Object.entries(ALL_PERMISSIONS).forEach(([key, label]) => {
    const group = key.split('.')[0]
    if (!permGroups[group]) permGroups[group] = []
    permGroups[group].push({ key, label })
  })

  const groupNames = {
    daily_report: 'Ежедневный отчёт', pnl: 'P&L', cashflow: 'Cash Flow', dashboard: 'Dashboard',
    bank_import: 'Импорт выписки', users: 'Пользователи', roles: 'Роли', settings: 'Настройки', telegram: 'Telegram',
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Роли и права</h1>
          <p className="text-sm text-slate-500 mt-0.5">Управление ролями и разрешениями пользователей</p>
        </div>
        {canManage && (
          <button onClick={handleSave} disabled={saving} className="btn-primary text-sm flex items-center gap-2">
            <Save className="w-4 h-4" />{saving ? 'Сохранение...' : 'Сохранить'}
          </button>
        )}
      </div>

      {/* Add Role */}
      {canManage && (
        <div className="card border-brand-500/20">
          <div className="text-sm font-semibold text-brand-400 mb-3">Добавить новую роль</div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Название роли" className="input text-sm flex-1" />
            <input value={newRoleDesc} onChange={e => setNewRoleDesc(e.target.value)} placeholder="Описание" className="input text-sm flex-1" />
            <button onClick={addRole} disabled={!newRoleName.trim()} className="btn-primary text-sm flex items-center gap-2">
              <Plus className="w-4 h-4" /> Добавить
            </button>
          </div>
        </div>
      )}

      {/* Permissions Matrix */}
      <div className="card overflow-x-auto p-0">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr>
              <th className="table-header text-left w-56 sticky left-0 bg-slate-900 z-10">Разрешение</th>
              {roles.map(role => (
                <th key={role.id} className="table-header text-center">
                  <div className="flex flex-col items-center gap-1">
                    <div className="flex items-center gap-1.5">
                      <Shield className="w-3.5 h-3.5" />
                      <span>{role.name}</span>
                    </div>
                    {!role.is_system && canManage && (
                      <button onClick={() => removeRole(role.id)} className="text-[10px] text-red-500 hover:text-red-400">удалить</button>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Object.entries(permGroups).map(([group, perms]) => (
              <>
                <tr key={`g-${group}`}>
                  <td colSpan={roles.length + 1} className="px-4 py-2 bg-slate-900/80 text-xs font-bold text-slate-500 uppercase tracking-wider border-t border-slate-800">
                    {groupNames[group] || group}
                  </td>
                </tr>
                {perms.map(perm => (
                  <tr key={perm.key} className="hover:bg-slate-800/30">
                    <td className="px-4 py-2.5 border-t border-slate-800/50 sticky left-0 bg-slate-850 z-10">
                      <div className="text-xs text-slate-300">{perm.label}</div>
                      <div className="text-[10px] text-slate-600 font-mono">{perm.key}</div>
                    </td>
                    {roles.map(role => {
                      const isAdmin = role.name === 'Админ'
                      const allowed = isAdmin || permsMatrix[role.id]?.[perm.key]
                      return (
                        <td key={role.id} className="border-t border-slate-800/50 text-center">
                          <button
                            onClick={() => togglePerm(role.id, perm.key)}
                            disabled={!canManage || isAdmin}
                            className={cn(
                              'w-8 h-8 rounded-lg inline-flex items-center justify-center transition-all',
                              allowed ? 'bg-brand-600/20 text-brand-400' : 'bg-slate-800 text-slate-600 hover:bg-slate-700',
                              isAdmin && 'opacity-60 cursor-not-allowed'
                            )}
                          >
                            {allowed ? <Check className="w-4 h-4" /> : <X className="w-3.5 h-3.5" />}
                          </button>
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
