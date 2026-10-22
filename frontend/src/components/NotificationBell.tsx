import React, { useState, useEffect } from 'react';
import { Bell, Check, Clock } from 'lucide-react';
import { Notification } from '../types';
import { authApi } from '../api/auth';
import { useWebSocket } from '../context/WebSocketContext';
import { useAuth } from '../context/AuthContext';

export const NotificationBell: React.FC = () => {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const { addListener } = useWebSocket();

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await authApi.getNotifications();
      // Ensure only notifications for the current user are stored
      if (user?.id) {
        setNotifications(data.filter((n) => !n.recipient_user_id || n.recipient_user_id === user.id));
      } else {
        setNotifications(data);
      }
    } catch (err) {
      console.warn('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();

    // Listen to real-time notification events
    const unsubscribe = addListener('notification.created', (newNotif: Notification) => {
      // Strictly filter to ensure notifications only display for their intended recipient
      if (user?.id && newNotif.recipient_user_id && newNotif.recipient_user_id !== user.id) {
        return;
      }
      setNotifications((prev) => {
        if (prev.some((n) => n.id === newNotif.id)) return prev;
        return [newNotif, ...prev];
      });
    });

    return () => {
      unsubscribe();
    };
  }, [addListener, user?.id]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const handleMarkAsRead = async (id: string) => {
    try {
      await authApi.markNotificationRead(id);
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true, read_at: new Date().toISOString() } : n))
      );
    } catch (err) {
      console.warn('Error marking notification as read:', err);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors"
        aria-label="View notifications"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute top-1 right-1 flex items-center justify-center w-4 h-4 text-[10px] font-bold text-white bg-rose-600 rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <h4 className="text-sm font-semibold text-slate-800">Notifications</h4>
            {unreadCount > 0 && (
              <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                {unreadCount} unread
              </span>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
            {loading && notifications.length === 0 ? (
              <div className="p-4 text-center text-xs text-slate-400">Loading...</div>
            ) : notifications.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">No notifications yet.</div>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`p-3 text-xs flex items-start justify-between gap-2 transition-colors ${
                    n.is_read ? 'bg-white text-slate-600' : 'bg-indigo-50/40 text-slate-900 font-medium'
                  }`}
                >
                  <div className="flex-1 pr-2">
                    <p className="font-semibold text-slate-800">{n.title}</p>
                    <p className="text-slate-600 mt-0.5 leading-relaxed">{n.message}</p>
                    <span className="inline-flex items-center gap-1 text-[10px] text-slate-400 mt-1">
                      <Clock className="w-3 h-3" />
                      {new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  {!n.is_read && (
                    <button
                      onClick={() => handleMarkAsRead(n.id)}
                      className="p-1 text-slate-400 hover:text-emerald-600 rounded-md hover:bg-emerald-50 transition-colors"
                      title="Mark as read"
                    >
                      <Check className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
