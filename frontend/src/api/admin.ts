import { apiRequest } from './client';
import { User } from '../types';

export interface AdminDashboardData {
  students_count: number;
  drivers_count: number;
  managers_count: number;
  pending_managers: number;
  pending_drivers: number;
  total_buses: number;
  total_trips: number;
}

export const adminApi = {
  listManagers: (status?: string) => {
    const query = status ? `?status=${status}` : '';
    return apiRequest<User[]>(`/api/admin/managers${query}`);
  },

  approveManager: (managerId: string, notes?: string) =>
    apiRequest<User>(`/api/admin/managers/${managerId}/approve`, {
      method: 'POST',
      body: JSON.stringify({ action: 'approve', notes }),
    }),

  rejectManager: (managerId: string, notes?: string) =>
    apiRequest<User>(`/api/admin/managers/${managerId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ action: 'reject', notes }),
    }),

  getDashboard: () =>
    apiRequest<AdminDashboardData>('/api/admin/dashboard'),
};
