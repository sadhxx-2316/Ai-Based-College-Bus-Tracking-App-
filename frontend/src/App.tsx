import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { WebSocketProvider } from './context/WebSocketContext';
import { Navbar } from './components/Navbar';
import { ProtectedRoute } from './components/ProtectedRoute';
import { LoginPage } from './pages/LoginPage';
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { StudentDashboard } from './pages/student/StudentDashboard';
import { StudentBusTrackingPage } from './pages/student/StudentBusTrackingPage';
import { DriverDashboard } from './pages/driver/DriverDashboard';
import { ManagerDashboard } from './pages/manager/ManagerDashboard';
import { ManagerMapPickerPage } from './pages/manager/ManagerMapPickerPage';
import { AdminDashboard } from './pages/admin/AdminDashboard';

const RoleBasedHomeRedirect: React.FC = () => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[80vh]">
        <div className="w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === 'admin') {
    return <Navigate to="/admin" replace />;
  }
  if (user.role === 'bus_manager') {
    return <Navigate to="/manager" replace />;
  }
  if (user.role === 'driver') {
    return <Navigate to="/driver" replace />;
  }
  return <Navigate to="/student" replace />;
};

export const AppContent: React.FC = () => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <Navbar />
      <main className="flex-1 pb-12">
        <Routes>
          <Route path="/" element={<RoleBasedHomeRedirect />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/unauthorized" element={<UnauthorizedPage />} />

          {/* User Module (College Transit & Live 3D Bus Tracking) */}
          <Route
            path="/user"
            element={
              <ProtectedRoute allowedRoles={['student', 'bus_manager']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/user/track/:busId"
            element={
              <ProtectedRoute allowedRoles={['student', 'bus_manager']}>
                <StudentBusTrackingPage />
              </ProtectedRoute>
            }
          />

          {/* Student Legacy Route Aliases */}
          <Route
            path="/student"
            element={
              <ProtectedRoute allowedRoles={['student', 'bus_manager']}>
                <StudentDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/student/track/:busId"
            element={
              <ProtectedRoute allowedRoles={['student', 'bus_manager']}>
                <StudentBusTrackingPage />
              </ProtectedRoute>
            }
          />

          {/* Driver Portal */}
          <Route
            path="/driver"
            element={
              <ProtectedRoute allowedRoles={['driver', 'bus_manager']}>
                <DriverDashboard />
              </ProtectedRoute>
            }
          />

          {/* Bus Manager Portal */}
          <Route
            path="/manager"
            element={
              <ProtectedRoute allowedRoles={['bus_manager']}>
                <ManagerDashboard />
              </ProtectedRoute>
            }
          />

          {/* Bus Manager Dedicated Google Map Stop Picker */}
          <Route
            path="/manager/create-stop-map"
            element={
              <ProtectedRoute allowedRoles={['bus_manager']}>
                <ManagerMapPickerPage />
              </ProtectedRoute>
            }
          />

          {/* Super Admin Portal */}
          <Route
            path="/admin"
            element={
              <ProtectedRoute allowedRoles={['admin']}>
                <AdminDashboard />
              </ProtectedRoute>
            }
          />

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
};

export function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <WebSocketProvider>
          <AppContent />
        </WebSocketProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
