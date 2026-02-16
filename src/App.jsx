import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAuthStore } from '@/lib/store'
import Layout from '@/components/Layout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import DailyReportPage from '@/pages/DailyReportPage'
import PnLPage from '@/pages/PnLPage'
import CashFlowPage from '@/pages/CashFlowPage'
import BankImportPage from '@/pages/BankImportPage'
import UsersPage from '@/pages/UsersPage'
import RolesPage from '@/pages/RolesPage'
import SettingsPage from '@/pages/SettingsPage'
import StaffPage from '@/pages/StaffPage'
import PayrollPage from '@/pages/PayrollPage'
import SuppliersPage from '@/pages/SuppliersPage'

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

export default function App() {
  const { initialize } = useAuthStore()

  useEffect(() => {
    initialize()
  }, [])

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="/dashboard" />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="daily-report" element={<DailyReportPage />} />
          <Route path="pnl" element={<PnLPage />} />
          <Route path="cashflow" element={<CashFlowPage />} />
          <Route path="bank-import" element={<BankImportPage />} />
          <Route path="staff" element={<StaffPage />} />
          <Route path="suppliers" element={<SuppliersPage />} />
          <Route path="payroll" element={<PayrollPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="roles" element={<RolesPage />} />
          <Route path="settings" element={<SettingsPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
