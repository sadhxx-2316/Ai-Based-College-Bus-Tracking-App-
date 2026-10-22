import { apiRequest } from './client';
import { Assignment } from '../types';

export const assignmentsApi = {
  listAssignments: (serviceDate?: string, status?: string) => {
    const params = new URLSearchParams();
    if (serviceDate) params.append('service_date', serviceDate);
    if (status) params.append('status', status);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<Assignment[]>(`/api/assignments${query}`);
  },

  listDriverAssignments: () =>
    apiRequest<Assignment[]>('/api/driver/assignments'),

  createAssignment: (data: {
    bus_id: string;
    driver_id: string;
    route_id: string;
    service_date: string;
    scheduled_departure: string;
    scheduled_end?: string;
  }) =>
    apiRequest<Assignment>('/api/assignments', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  acceptAssignment: (id: string) =>
    apiRequest<Assignment>(`/api/assignments/${id}/accept`, {
      method: 'POST',
    }),

  rejectAssignment: (id: string, reason?: string) =>
    apiRequest<Assignment>(`/api/assignments/${id}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),

  cancelAssignment: (id: string, reason?: string) =>
    apiRequest<Assignment>(`/api/assignments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    }),
};
