import { apiRequest } from './client';
import { Trip, ETA, StudentFleetBus } from '../types';

export interface ArrivalCheckResponse {
  verified: boolean;
  distance_to_start_meters: number;
  threshold_meters: number;
  verified_at?: string;
  message: string;
}

export interface StartTripResponse {
  trip_id: string;
  assignment_id: string;
  trip_status: string;
  started_at: string;
  message: string;
}

export interface LocationSubmissionResponse {
  success: boolean;
  trip_id: string;
  sequence_number: number;
  received_at: string;
  is_anomaly: boolean;
  warning?: string;
}

export const tripsApi = {
  getTrip: (id: string) =>
    apiRequest<Trip>(`/api/trips/${id}`),

  getTripHistory: (id: string) =>
    apiRequest<Array<{ latitude: number; longitude: number; accuracy_meters: number; recorded_at: string }>>(
      `/api/trips/${id}/history`
    ),

  checkArrival: (assignmentId: string, data: { latitude: number; longitude: number; accuracy_meters: number }) =>
    apiRequest<ArrivalCheckResponse>(`/api/assignments/${assignmentId}/check-arrival`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  startTrip: (assignmentId: string) =>
    apiRequest<StartTripResponse>(`/api/assignments/${assignmentId}/start-trip`, {
      method: 'POST',
    }),

  submitLocation: (
    tripId: string,
    data: {
      latitude: number;
      longitude: number;
      accuracy_meters: number;
      speed_kmh?: number;
      recorded_at: string;
      sequence_number: number;
    }
  ) =>
    apiRequest<LocationSubmissionResponse>(`/api/trips/${tripId}/locations`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  endTrip: (tripId: string) =>
    apiRequest<{ trip_id: string; trip_status: string; ended_at: string; message: string }>(
      `/api/trips/${tripId}/end`,
      {
        method: 'POST',
      }
    ),

  getEta: (tripId: string, stopId: string) =>
    apiRequest<ETA>(`/api/trips/${tripId}/eta?stop_id=${stopId}`),

  getStudentRouteTrips: (routeId: string) =>
    apiRequest<Trip[]>(`/api/student/routes/${routeId}/trips`),

  getStudentFleet: () =>
    apiRequest<StudentFleetBus[]>('/api/student/fleet'),
};
