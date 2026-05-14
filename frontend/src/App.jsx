import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, RoleRoute } from './routes/guards';
import AppLayout from './layouts/AppLayout';
import AuthLayout from './layouts/AuthLayout';

import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import EmployeeList from './pages/EmployeeList';
import EmployeeDetail from './pages/EmployeeDetail';
import Interventions from './pages/Interventions';
import PulseInsights from './pages/PulseInsights';
import Settings from './pages/Settings';
import Notifications from './pages/Notifications';
import ManagerDashboard from './pages/ManagerDashboard';
import { EmployeePortal, PulseSurvey } from './pages/EmployeePortal';
import EmployeeTasks from './pages/EmployeeTasks';
import PulseQuestionsAdmin from './pages/PulseQuestionsAdmin';
import SuperAdminOrgs from './pages/SuperAdminOrgs';
import ProductivityDashboard from './pages/ProductivityDashboard';
import ProductivityDetail from './pages/ProductivityDetail';
import Reports from './pages/Reports';
import ROIDashboard from './pages/ROIDashboard';
import Leaderboard from './pages/Leaderboard';
import Alerts from './pages/Alerts';
import MyProductivity from './pages/MyProductivity';
import EmployeeActivity from './pages/EmployeeActivity';
import EmployeeActivityList from './pages/EmployeeActivityList';

import { useAuthStore } from './store/authStore';

function RoleHome() {
  const role = useAuthStore((s) => s.user?.role);
  if (role === 'SUPER_ADMIN') return <Navigate to="/super/organizations" replace />;
  if (role === 'EMPLOYEE')    return <Navigate to="/portal" replace />;
  if (role === 'MANAGER')     return <Navigate to="/manager" replace />;
  return <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<AuthLayout />}>
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
      </Route>

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/" element={<RoleHome />} />

          {/* Org / HR Admin */}
          <Route element={<RoleRoute allow={['ORG_ADMIN', 'HR_ADMIN']} />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/pulse" element={<PulseInsights />} />
            <Route path="/pulse/questions" element={<PulseQuestionsAdmin />} />
            <Route path="/settings" element={<Settings />} />
          </Route>

          {/* Org / HR / Manager */}
          <Route element={<RoleRoute allow={['ORG_ADMIN', 'HR_ADMIN', 'MANAGER']} />}>
            <Route path="/employees" element={<EmployeeList />} />
            <Route path="/employees/:id" element={<EmployeeDetail />} />
            <Route path="/employees/:id/productivity" element={<ProductivityDetail />} />
            <Route path="/interventions" element={<Interventions />} />
            <Route path="/productivity" element={<ProductivityDashboard />} />
            <Route path="/leaderboard" element={<Leaderboard />} />
            <Route path="/alerts" element={<Alerts />} />
            <Route path="/reports" element={<Reports />} />
          </Route>

          {/* Org / HR only */}
          <Route element={<RoleRoute allow={['ORG_ADMIN', 'HR_ADMIN']} />}>
            <Route path="/roi" element={<ROIDashboard />} />
            <Route path="/employee-activity" element={<EmployeeActivityList />} />
            <Route path="/employee-activity/:id" element={<EmployeeActivity />} />
          </Route>

          {/* Manager */}
          <Route element={<RoleRoute allow={['MANAGER']} />}>
            <Route path="/manager" element={<ManagerDashboard />} />
          </Route>

          {/* Employee */}
          <Route element={<RoleRoute allow={['EMPLOYEE']} />}>
            <Route path="/portal" element={<EmployeePortal />} />
            <Route path="/portal/productivity" element={<MyProductivity />} />
            <Route path="/portal/pulse" element={<PulseSurvey />} />
            <Route path="/portal/tasks" element={<EmployeeTasks />} />
          </Route>

          {/* Super admin */}
          <Route element={<RoleRoute allow={['SUPER_ADMIN']} />}>
            <Route path="/super/organizations" element={<SuperAdminOrgs />} />
          </Route>

          {/* Notifications - everyone */}
          <Route path="/notifications" element={<Notifications />} />
        </Route>
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
