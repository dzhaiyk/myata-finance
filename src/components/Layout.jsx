import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuthStore } from '@/lib/store'
import { LayoutDashboard, FileText, TrendingUp, Wallet, Upload, Users, Shield, Settings, LogOut, Menu, X, Leaf } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/dashboard', icon: LayoutDashboard, label: 'Dashboard', perm: 'dashboard.view' },
  { to: '/daily-report', icon: FileText, label: 'Отчёт дня', perm: 'daily_report.view' },
  { to: '/pnl', icon: TrendingUp, label: 'P&L', perm: 'pnl.view' },
  { to: '/cashflow', icon: Wallet, label: 'Cash Flow', perm: 'cashflow.view' },
  { to: '/bank-import', icon: Upload, label: 'Импорт выписки', perm: 'bank_import.view' },
  { divider: true },
  { to: '/users', icon: Users, label: 'Пользователи', perm: 'users.view' },
  { to: '/roles', icon: Shield, label: 'Роли и права', perm: 'roles.view' },
  { to: '/settings', icon: Settings, label: 'Настройки', perm: 'settings.view' },
]

export default function Layout() {
  const { profile, signOut, hasPermission } = useAuthStore()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login')
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay */}
      {open && <div className="fixed inset-0 bg-black/60 z-30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={cn(
        'fixed lg:static inset-y-0 left-0 z-40 w-64 bg-slate-900 border-r border-slate-800 flex flex-col transition-transform duration-300',
        open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      )}>
        {/* Logo */}
        <div className="px-5 py-5 flex items-center gap-3 border-b border-slate-800">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-mint-500 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="font-display font-bold text-sm tracking-tight">Мята Finance</div>
            <div className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Platinum 4YOU</div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {NAV.map((item, i) => {
            if (item.divider) return <div key={i} className="h-px bg-slate-800 my-3 mx-2" />
            if (item.perm && !hasPermission(item.perm)) return null
            const Icon = item.icon
            return (
              <NavLink
                key={item.to}
                to={item.to}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200',
                  isActive
                    ? 'bg-brand-600/15 text-brand-400 shadow-sm shadow-brand-500/5'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
                {item.label}
              </NavLink>
            )
          })}
        </nav>

        {/* User */}
        <div className="px-4 py-4 border-t border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-600 to-mint-600 flex items-center justify-center text-xs font-bold text-white">
              {profile?.full_name?.[0] || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{profile?.full_name || 'User'}</div>
              <div className="text-[11px] text-slate-500 truncate">{profile?.roles?.name || 'Role'}</div>
            </div>
            <button onClick={handleSignOut} className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-500 hover:text-red-400 transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile header */}
        <div className="lg:hidden flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-slate-900">
          <button onClick={() => setOpen(true)} className="p-1.5 rounded-lg hover:bg-slate-800">
            <Menu className="w-5 h-5" />
          </button>
          <div className="font-display font-bold text-sm">Мята Finance</div>
        </div>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
