import { apiRequest } from './client';
import { DashboardMetrics, TripAnalytics, Trip, DriverApplication } from '../types';

export const managerApi = {
  getDashboardMetrics: () =>
    apiRequest<DashboardMetrics>('/api/manager/dashboard'),

  listTrips: (params?: { route_id?: string; bus_id?: string; driver_id?: string; status?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.route_id) searchParams.append('route_id', params.route_id);
    if (params?.bus_id) searchParams.append('bus_id', params.bus_id);
    if (params?.driver_id) searchParams.append('driver_id', params.driver_id);
    if (params?.status) searchParams.append('status', params.status);
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return apiRequest<Trip[]>(`/api/manager/trips${query}`);
  },

  getAnalytics: () =>
    apiRequest<TripAnalytics>('/api/manager/analytics'),

  trainMLModel: () =>
    apiRequest<{ status: string; message: string; metrics: any }>('/api/manager/ml/train', {
      method: 'POST',
    }),

  listDriverApplications: (status?: string) => {
    const query = status ? `?status=${status}` : '';
    return apiRequest<DriverApplication[]>(`/api/manager/driver-applications${query}`);
  },

  approveDriverApplication: (id: string, notes?: string) =>
    apiRequest<DriverApplication>(`/api/manager/driver-applications/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ status: 'approved', review_notes: notes }),
    }),

  rejectDriverApplication: (id: string, notes?: string) =>
    apiRequest<DriverApplication>(`/api/manager/driver-applications/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ status: 'rejected', review_notes: notes }),
    }),
};
