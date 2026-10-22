import { apiRequest } from './client';
import { Route, Stop } from '../types';

export interface RoutePreviewResponse {
  route_geometry: string;
  distance_meters: number;
  estimated_travel_seconds: number;
  stops: Stop[];
}

export const routesApi = {
  listRoutes: (status?: string) => {
    const query = status ? `?status=${status}` : '';
    return apiRequest<Route[]>(`/api/routes${query}`);
  },

  getRoute: (id: string) =>
    apiRequest<Route>(`/api/routes/${id}`),

  previewRoute: (orderedStopIds: string[]) =>
    apiRequest<RoutePreviewResponse>('/api/routes/preview', {
      method: 'POST',
      body: JSON.stringify({ ordered_stop_ids: orderedStopIds }),
    }),

  createRoute: (data: {
    route_name: string;
    description?: string;
    ordered_stop_ids: string[];
    route_geometry?: string;
    distance_meters?: number;
    estimated_travel_seconds?: number;
  }) =>
    apiRequest<Route>('/api/routes', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateRoute: (id: string, data: Partial<Route>) =>
    apiRequest<Route>(`/api/routes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteRoute: (id: string) =>
    apiRequest<{ message: string; route_id: string }>(`/api/routes/${id}`, {
      method: 'DELETE',
    }),
};
