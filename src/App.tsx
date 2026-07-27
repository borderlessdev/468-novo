import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { AuthProvider } from '@/contexts/AuthContext'
import { AppShell } from '@/components/layout/AppShell'
import {
  ProtectedRoute,
  PublicOnlyRoute,
} from '@/components/layout/ProtectedRoute'
import { LoginPage } from '@/pages/LoginPage'
import { RegisterPage } from '@/pages/RegisterPage'
import { ResetPasswordPage } from '@/pages/ResetPasswordPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { VisitDetailPage } from '@/pages/VisitDetailPage'
import { VisitsPage } from '@/pages/VisitsPage'
import { VisitorsPage } from '@/pages/VisitorsPage'
import { AgendaPage } from '@/pages/AgendaPage'
import { PlanningPage } from '@/pages/PlanningPage'
import { FinancePage } from '@/pages/FinancePage'
import { ReportsPage } from '@/pages/ReportsPage'
import { SettingsPage } from '@/pages/SettingsPage'

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<PublicOnlyRoute />}>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/cadastro" element={<RegisterPage />} />
            <Route path="/recuperar-senha" element={<ResetPasswordPage />} />
          </Route>

          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              <Route path="/" element={<DashboardPage />} />
              <Route path="/visitas" element={<VisitsPage />} />
              <Route path="/visitas/:id" element={<VisitDetailPage />} />
              <Route path="/agenda" element={<AgendaPage />} />
              <Route path="/visitantes" element={<VisitorsPage />} />
              <Route path="/planejamento" element={<PlanningPage />} />
              <Route path="/financeiro" element={<FinancePage />} />
              <Route path="/relatorios" element={<ReportsPage />} />
              <Route path="/configuracoes" element={<SettingsPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  )
}
