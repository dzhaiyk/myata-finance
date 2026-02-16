import React, { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { ALL_PERMISSIONS, useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Save, Shield, Check, X } from 'lucide-react'

export default function RolesPage() {
  const { hasPermission } = useAuthStore()
  const canManage = hasPermission('roles.manage')

  const [roles, setRoles] = useState([])
  const [permsMatrix, setPermsMatrix] = useState({})
  const [loading, setLoading] = useState(true)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleDesc, setNewRoleDesc] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadRoles() }, [])

  const loadRoles = async () => {
    setLoading(true)
    const { data: rolesData } = await supabase.from('roles').select('*').order('id')
    const { data: permsData } = await supabase.from('permissions').select('*')

    const r = rolesData || []
    setRoles(r)

    // Build permissions matrix from DB
    const m = {}
    r.forEach(role => { m[role.id] = {} })
    if (permsData) {
      permsData.forEach(p => {
        if (m[p.role_id]) m[p.role_id][p.permission_key] = p.allowed
      })
    }
    // Admin always has all
    const adminRole = r.find(x => x.name === 'Админ')
    if (adminRole) {
      Object.keys(ALL_PERMISSIONS).forEach(k => { m[adminRole.id] = { ...m[adminRole.id], [k]: true } })
    }
    setPermsMatrix(m)
    setLoading(false)
  }

  const togglePerm = (roleId, permKey) => {
    if (!canManage) return
    const role = roles.find(r => r.id === roleId)
    if (role?.name === 'Админ') return
    setPermsMatrix(prev => ({
      ...prev,
      [roleId]: { ...prev[roleId], [permKey]: !prev[roleId]?.[permKey] }
    }))
  }

  const addRole = async () => {
    if (!newRoleName.trim()) return
    const { data, error } = await supabase.from('roles').insert({
      name: newRoleName.trim(),
      description: newRoleDesc.trim() || null,
      is_system: false,
    }).select().single()
    if (error) return alert('Ошибка: ' + error.message)
    setNewRoleName('')
    setNewRoleDesc('')
    loadRoles()
  }

  const removeRole = async (roleId) => {
    const role = roles.find(r => r.id === roleId)
    if (role?.is_system) return alert('Системную роль нельзя удалить')
    if (!confirm(`Удалить роль "${role?.name}"?`)) return
    await supabase.from('permissions').delete().eq('role_id', roleId)
    await supabase.from('roles').delete().eq('id', roleId)
    loadRoles()
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      for (const role of roles) {
        if (role.name === 'Админ') continue // Skip admin
        const perms = Object.entries(permsMatrix[role.id] || {})
        // Delete old and insert new
        await supabase.from('permissions').delete().eq('role_id', role.id)
        const rows = perms.filter(([_, v]) => v).map(([key]) => ({
          role_id: role.id, permission_key: key, allowed: true,
        }))
        if (rows.length > 0) {
          const { error } = await supabase.from('permissions').insert(rows)
          if (error) throw error
        }
      }
      alert('✅ Права сохранены')
    } catch (e) { alert('Ошибка: ' + e.message) }
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
    bank_import: 'Импорт выписки', staff: 'Персонал', suppliers: 'Поставщики', payroll: 'Зарплата',
    users: 'Пользователи', roles: 'Роли', settings: 'Настройки', telegram: 'Telegram',
  }

  if (loading) return <div className="text-center text-slate-500 py-20">Загрузка...</div>

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold tracking-tight">Роли и права</h1>
          <p className="text-sm text-slate-500 mt-0.5">{roles.length} ролей в системе</p>
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
          <div className="text-sm font-semibold text-brand-400 mb-3">Добавить роль</div>
          <div className="flex flex-col sm:flex-row gap-3">
            <input value={newRoleName} onChange={e => setNewRoleName(e.target.value)} placeholder="Название" className="input text-sm flex-1" />
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
              <React.Fragment key={`g-${group}`}>
                <tr>
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
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
