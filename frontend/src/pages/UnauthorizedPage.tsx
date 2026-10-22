import React from 'react';
import { Link } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const UnauthorizedPage: React.FC = () => {
  const { user } = useAuth();

  const homeRoute = {
    student: '/student',
    driver: '/driver',
    bus_manager: '/manager',
    admin: '/admin',
  }[user?.role || 'student'] || '/login';

  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center p-6 text-center">
      <div className="p-4 bg-rose-50 text-rose-600 rounded-2xl mb-4">
        <ShieldAlert className="w-10 h-10" />
      </div>
      <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
      <p className="text-sm text-slate-600 max-w-md mb-6 leading-relaxed">
        You do not have administrative permissions to view this resource. Your account role is{' '}
        <span className="font-semibold text-slate-800 uppercase">{user?.role}</span>.
      </p>
      <Link
        to={homeRoute}
        className="inline-flex items-center gap-2 px-4 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-xl hover:bg-indigo-700 transition-colors shadow-xs"
      >
        <ArrowLeft className="w-4 h-4" />
        Return to Authorized Dashboard
      </Link>
    </div>
  );
};
