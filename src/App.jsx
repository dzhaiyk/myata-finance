import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store'
import Layout, { NAV } from '@/components/Layout'
import { canOpenPath, firstAllowedPath } from '@/lib/routeAccess'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import DailyReportPage from '@/pages/DailyReportPage'
import PnLPage from '@/pages/PnLPage'
import CashFlowPage from '@/pages/CashFlowPage'
import BankImportPage from '@/pages/BankImportPage'
import UsersPage from '@/pages/UsersPage'
import RolesPage from '@/pages/RolesPage'
import SettingsPage from '@/pages/SettingsPage'
import DictionariesPage from '@/pages/DictionariesPage'
import TimesheetPage from '@/pages/TimesheetPage'
import StaffPage from '@/pages/StaffPage'
import PayrollPage from '@/pages/PayrollPage'
import SuppliersPage from '@/pages/SuppliersPage'
import AccountsPage from '@/pages/AccountsPage'
import InvestmentsPage from '@/pages/InvestmentsPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import ControlPage from '@/pages/ControlPage'
import { appTitle, locale } from '@/lib/config'

function ProtectedRoute({ children }) {
  const { user, loading } = useAuthStore()
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  )
  if (!user) return <Navigate to="/login" />
  return children
}

// Маршрут закрыт тем же правом, что и пункт меню: без него — на первую
// доступную страницу; без единого права — сообщение (BR-ACS-004, TASK-007).
function RouteGuard({ children }) {
  const { hasPermission } = useAuthStore()
  const { pathname } = useLocation()
  if (canOpenPath(NAV, pathname, hasPermission)) return children
  const fallback = firstAllowedPath(NAV, hasPermission)
  if (fallback) return <Navigate to={fallback} replace />
  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-slate-500">
      У вашей роли нет доступа ни к одному разделу — обратитесь к администратору
    </div>
  )
}

function IndexRedirect() {
  const { hasPermission } = useAuthStore()
  return <Navigate to={firstAllowedPath(NAV, hasPermission) || '/dashboard'} replace />
}

export default function App() {
  const { initialize } = useAuthStore()
  const branding = useAuthStore(st => st.branding)

  useEffect(() => {
    initialize()
  }, [])

  // Заголовок вкладки — из настроек: в index.html названия заведения нет (ADR-0010)
  useEffect(() => {
    document.title = appTitle()
    // язык документа — из локали: в index.html он был жёстко «ru»
    document.documentElement.lang = String(locale()).split('-')[0]
  }, [branding])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><RouteGuard><Layout /></RouteGuard></ProtectedRoute>}>
          <Route index element={<IndexRedirect />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="daily-report" element={<DailyReportPage />} />
          <Route path="pnl" element={<PnLPage />} />
          <Route path="cashflow" element={<CashFlowPage />} />
          <Route path="bank-import" element={<BankImportPage />} />
          <Route path="accounts" element={<AccountsPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="timesheet" element={<TimesheetPage />} />
          <Route path="investments" element={<InvestmentsPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="control" element={<ControlPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="dictionaries" element={<DictionariesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
