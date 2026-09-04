import { create } from 'zustand'
import { supabase } from './supabase'
import { loadCutoffHour } from './dates'
import { loadNotifications } from './telegram'

const SESSION_KEY = 'myata_session'

export const useAuthStore = create((set, get) => ({
  user: null,
  profile: null,
  permissions: {},
  loading: true,

  initialize: async () => {
    await loadCutoffHour()
    await loadNotifications()
    const saved = localStorage.getItem(SESSION_KEY)
    if (saved) {
      try {
        const { userId } = JSON.parse(saved)
        await get().loadProfile(userId)
      } catch { localStorage.removeItem(SESSION_KEY) }
    }
    set({ loading: false })
  },

  loadProfile: async (userId) => {
    const { data: user, error } = await supabase
      .from('app_users')
      .select('*')
      .eq('id', userId)
      .eq('is_active', true)
      .single()

    if (error || !user) {
      localStorage.removeItem(SESSION_KEY)
      set({ user: null, profile: null, permissions: {} })
      return
    }

    // Название роли — только для показа. Полные права даёт флаг is_superuser,
    // а не совпадение имени: переименование роли не должно снимать доступ
    // (ADR-0010, миграция 024).
    let roleName = null
    let isSuperuser = false
    if (user.role_id) {
      const { data: role } = await supabase.from('roles').select('name, is_superuser').eq('id', user.role_id).single()
      if (role) {
        roleName = role.name
        isSuperuser = role.is_superuser === true
      }
    }

    const perms = {}
    if (user.role_id) {
      const { data: permRows } = await supabase.from('permissions').select('permission_key, allowed').eq('role_id', user.role_id)
      if (permRows) permRows.forEach(p => { perms[p.permission_key] = p.allowed })
    }
    if (isSuperuser) {
      Object.keys(ALL_PERMISSIONS).forEach(k => { perms[k] = true })
    }

    await supabase.from('app_users').update({ last_login: new Date().toISOString() }).eq('id', user.id)

    set({
      user: { id: user.id },
      profile: { ...user, roles: { name: roleName, is_superuser: isSuperuser } },
      permissions: perms,
    })
  },

  hasPermission: (key) => {
    const { permissions, profile } = get()
    if (profile?.roles?.is_superuser) return true
    return permissions[key] === true
  },

  signIn: async (username, password) => {
    const { data, error } = await supabase
      .from('app_users')
      .select('id, password_hash, is_active')
      .eq('username', username.toLowerCase().trim())
      .single()

    if (error || !data) return { error: { message: 'Пользователь не найден' } }
    if (!data.is_active) return { error: { message: 'Аккаунт деактивирован' } }
    if (data.password_hash !== password) return { error: { message: 'Неверный пароль' } }

    localStorage.setItem(SESSION_KEY, JSON.stringify({ userId: data.id }))
    await get().loadProfile(data.id)
    return { error: null }
  },

  signOut: async () => {
    localStorage.removeItem(SESSION_KEY)
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
  'staff.view': 'Просмотр персонала',
  'staff.manage': 'Управление персоналом',
  'suppliers.view': 'Просмотр поставщиков',
  'suppliers.manage': 'Управление поставщиками',
  'accounts.manage': 'Счета: переводы и ручные операции',
  'payroll.view': 'Просмотр зарплат',
  'payroll.manage': 'Расчёт и выплата зарплат',
  'users.view': 'Просмотр пользователей',
  'users.manage': 'Управление пользователями',
  'roles.view': 'Просмотр ролей',
  'roles.manage': 'Управление ролями и правами',
  'investments.view': 'Просмотр инвестиций',
  'investments.edit': 'Добавление операций',
  'investments.manage': 'Управление учредителями',
  'settings.view': 'Просмотр настроек',
  'settings.edit': 'Редактирование настроек',
  'telegram.manage': 'Управление Telegram уведомлениями',
}
