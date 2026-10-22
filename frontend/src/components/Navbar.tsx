import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bus, LogOut, Radio, UserCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useWebSocket } from '../context/WebSocketContext';
import { NotificationBell } from './NotificationBell';
import { Badge } from './Badge';

export const Navbar: React.FC = () => {
  const { user, logout } = useAuth();
  const { status: wsStatus } = useWebSocket();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleLabel = {
    student: 'Student',
    driver: 'Bus Driver',
    bus_manager: 'Transport Manager',
    admin: 'Super Admin',
  }[user?.role || 'student'] || 'User';

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 text-indigo-600 hover:text-indigo-700 font-bold text-lg">
          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
            <Bus className="w-5 h-5" />
          </div>
          <span className="tracking-tight text-slate-900 hidden sm:inline">
            College <span className="text-indigo-600">Bus Tracking</span>
          </span>
        </Link>

        {/* Right Section */}
        {user ? (
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Live WebSocket Status Indicator */}
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
              <span
                className={`w-2 h-2 rounded-full ${
                  wsStatus === 'connected'
                    ? 'bg-emerald-500 animate-pulse'
                    : wsStatus === 'connecting' || wsStatus === 'reconnecting'
                    ? 'bg-amber-500 animate-ping'
                    : 'bg-rose-400'
                }`}
              />
              <span className="capitalize">{wsStatus}</span>
            </div>

            {/* Notification Bell */}
            <NotificationBell />

            {/* User Profile Info */}
            <div className="flex items-center gap-2 pl-2 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-800 leading-tight">{user.name}</div>
                <div className="text-[10px] text-slate-500">{roleLabel}</div>
              </div>
              <Badge variant="info" className="hidden lg:inline-flex">
                {roleLabel}
              </Badge>
              <button
                onClick={handleLogout}
                className="p-2 text-slate-500 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                title="Sign Out"
                aria-label="Sign Out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <Link
            to="/login"
            className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition-colors shadow-xs"
          >
            Sign In
          </Link>
        )}
      </div>
    </header>
  );
};
