import { apiRequest } from './client';
import { User, Notification, UserRole } from '../types';


export interface LoginParams {
  email: string;
  password: string;
  role?: UserRole;
}

export interface RegisterParams {
  email: string;
  password: string;
  name: string;
  phone?: string;
  role: UserRole;
  // Student specific
  roll_number?: string;
  department?: string;
  year?: string;
  boarding_stop_id?: string;
  boarding_stop_name?: string;
  // Driver specific
  license_number?: string;
  years_of_experience?: number;
  emergency_contact?: string;
  // Manager specific
  employee_id?: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
  message?: string;
}

export const authApi = {
  login: (params: LoginParams) =>
    apiRequest<AuthResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  register: (params: RegisterParams) =>
    apiRequest<AuthResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(params),
    }),


  syncFirebase: () =>
    apiRequest<AuthResponse>('/api/auth/sync-firebase', {
      method: 'POST',
    }),

  getMe: () =>
    apiRequest<User>('/api/me'),

  getNotifications: () =>
    apiRequest<Notification[]>('/api/me/notifications'),

  markNotificationRead: (id: string) =>
    apiRequest<{ id: string; is_read: boolean; read_at: string }>(`/api/me/notifications/${id}/read`, {
      method: 'PATCH',
    }),
};
