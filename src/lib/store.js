import { create } from 'zustand'
import { supabase } from './supabase'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  permissions: {},
  loading: true,

  initialize: async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      await get().loadProfile(session.user)
    }
    set({ loading: false })

    supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        await get().loadProfile(session.user)
      } else {
        set({ user: null, profile: null, permissions: {} })
      }
    })
  },

  loadProfile: async (user) => {
    let { data: profile, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    if (error || !profile) {
      set({ user, profile: { id: user.id, full_name: user.email, roles: { name: 'Менеджер' } }, permissions: {} })
      return
    }

    let roleName = 'Менеджер'
    if (profile.role_id) {
      const { data: role } = await supabase.from('roles').select('name').eq('id', profile.role_id).single()
      if (role) roleName = role.name
    }

    const perms = {}
    if (profile.role_id) {
      const { data: permRows } = await supabase.from('permissions').select('permission_key, allowed').eq('role_id', profile.role_id)
      if (permRows) permRows.forEach(p => { perms[p.permission_key] = p.allowed })
    }

    if (roleName === 'Админ') {
      Object.keys(ALL_PERMISSIONS).forEach(k => { perms[k] = true })
    }

    set({ user, profile: { ...profile, roles: { name: roleName } }, permissions: perms })
  },

  hasPermission: (key) => {
    const { permissions, profile } = get()
    if (profile?.roles?.name === 'Админ') return true
    return permissions[key] === true
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error }
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, profile: null, permissions: {} })
  },
}))

export const ALL_PERMISSIONS = {
  'daily_report.view': 'Просмотр ежедневных отчётов',
  'daily_report.create': 'Создание ежедневных отчётов',
  'daily_report.edit': 'Редактирование отчётов',
  'pnl.view': 'Просмотр P&L',
  'pnl.edit': 'Редактирование P&L',
  'cashflow.view': 'Просмотр Cash Flow',
  'cashflow.edit': 'Редактирование Cash Flow',
  'bank_import.view': 'Просмотр импорта выписки',
  'bank_import.upload': 'Загрузка банковской выписки',
  'bank_import.categorize': 'Категоризация транзакций',
  'dashboard.view': 'Просмотр Dashboard',
  'dashboard.kpi': 'Просмотр KPI и маржи',
  'users.view': 'Просмотр пользователей',
  'users.manage': 'Управление пользователями',
  'roles.view': 'Просмотр ролей',
  'roles.manage': 'Управление ролями и правами',
  'settings.view': 'Просмотр настроек',
  'settings.edit': 'Редактирование настроек',
  'telegram.manage': 'Управление Telegram уведомлениями',
}
