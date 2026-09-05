// Модуль «Справочники» — списки, на которые ссылаются операции и отчёты (ADR-0011).
// Одиночные значения заведения живут в «Настройках».
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuthStore } from '@/lib/store'
import { cn } from '@/lib/utils'
import DepartmentsSettings from '@/components/DepartmentsSettings'
import CategoriesEditor from '@/components/CategoriesEditor'
import { Package, HandCoins, Landmark, UserCheck, Shield, Upload } from 'lucide-react'

const TABS = [
  { key: 'departments', label: 'Отделы' },
  { key: 'categories', label: 'Статьи P&L' },
]

// Справочники со своими страницами: остаются на местах, отсюда — ссылки
const LINKS = [
  { to: '/suppliers', icon: Package, label: 'Поставщики', perm: 'suppliers.view' },
  { to: '/investments', icon: HandCoins, label: 'Учредители и доли', perm: 'investments.view' },
  { to: '/accounts', icon: Landmark, label: 'Счета', perm: 'dashboard.view' },
  { to: '/staff', icon: UserCheck, label: 'Персонал и должности', perm: 'staff.view' },
  { to: '/roles', icon: Shield, label: 'Роли и права', perm: 'roles.view' },
  { to: '/bank-import', icon: Upload, label: 'Правила категоризации', perm: 'bank_import.view' },
]

export default function DictionariesPage() {
  const { hasPermission } = useAuthStore()
  const canEdit = hasPermission('dictionaries.manage')
  const [tab, setTab] = useState('departments')

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-display font-bold tracking-tight">Справочники</h1>
        <p className="text-sm text-slate-500 mt-0.5">Отделы, статьи и всё, на что ссылаются операции</p>
      </div>

      <div className="flex gap-2">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn('px-3 py-1.5 rounded-lg text-sm font-medium transition-colors', tab === t.key ? 'bg-brand-600/20 text-brand-400' : 'text-slate-500 hover:text-slate-300')}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'departments' && <DepartmentsSettings canEdit={canEdit} />}
      {tab === 'categories' && <CategoriesEditor canEdit={canEdit} />}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {LINKS.filter(l => hasPermission(l.perm)).map(l => (
          <Link key={l.to} to={l.to} className="card-hover flex items-center gap-3">
            <l.icon className="w-5 h-5 text-slate-400" />
            <span className="text-sm">{l.label}</span>
          </Link>
        ))}
      </div>
    </div>
  )
}
