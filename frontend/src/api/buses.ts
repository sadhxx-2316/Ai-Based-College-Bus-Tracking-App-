import { apiRequest } from './client';
import { Bus, LiveLocation, Stop } from '../types';

export const busesApi = {
  listBuses: (status?: string, search?: string) => {
    const params = new URLSearchParams();
    if (status) params.append('status', status);
    if (search) params.append('search', search);
    const query = params.toString() ? `?${params.toString()}` : '';
    return apiRequest<Bus[]>(`/api/buses${query}`);
  },

  getBus: (id: string) =>
    apiRequest<Bus>(`/api/buses/${id}`),

  createBus: (data: { bus_number: string; capacity: number; registration_number?: string }) =>
    apiRequest<Bus>('/api/buses', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateBus: (id: string, data: Partial<Bus>) =>
    apiRequest<Bus>(`/api/buses/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  updateStatus: (id: string, status: string) =>
    apiRequest<Bus>(`/api/buses/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ operational_status: status }),
    }),

  getLiveLocation: (id: string) =>
    apiRequest<LiveLocation | null>(`/api/buses/${id}/live-location`),
};

export const stopsApi = {
  listStops: (search?: string) => {
    const query = search ? `?search=${encodeURIComponent(search)}` : '';
    return apiRequest<Stop[]>(`/api/stops${query}`);
  },

  createStop: (data: { name: string; latitude: number; longitude: number; address?: string; place_id?: string }) =>
    apiRequest<Stop>('/api/stops', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateStop: (id: string, data: Partial<Stop>) =>
    apiRequest<Stop>(`/api/stops/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteStop: (id: string) =>
    apiRequest<{ message: string; stop_id: string }>(`/api/stops/${id}`, {
      method: 'DELETE',
    }),
};
