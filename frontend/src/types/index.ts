export type UserRole = 'student' | 'driver' | 'bus_manager' | 'admin';
export type AccountStatus = 'active' | 'pending_review' | 'rejected' | 'suspended';
export type BusStatus = 'active' | 'maintenance' | 'inactive';
export type AssignmentStatus = 'pending' | 'accepted' | 'rejected' | 'cancelled';
export type TripStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface User {
  id: string;
  firebase_uid: string;
  email: string;
  name: string;
  phone?: string;
  role: UserRole;
  account_status: AccountStatus;
  employee_id?: string;
  department?: string;
  license_number?: string;
  roll_number?: string;
  year?: string;
  boarding_stop_id?: string;
  boarding_stop_name?: string;
  created_at: string;
  updated_at: string;
}

export interface Bus {
  id: string;
  bus_number: string;
  registration_number?: string;
  capacity: number;
  operational_status: BusStatus;
  created_at: string;
  updated_at: string;
}

export interface Stop {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  place_id?: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export interface Route {
  id: string;
  route_name: string;
  description?: string;
  origin_stop_id: string;
  destination_stop_id: string;
  ordered_stop_ids: string[];
  stops?: Stop[];
  route_geometry: string;
  distance_meters: number;
  estimated_travel_seconds: number;
  route_status: string;
  created_at: string;
  updated_at: string;
}

export interface DriverApplication {
  id: string;
  user_id: string;
  user_name?: string;
  user_email?: string;
  user_phone?: string;
  license_number: string;
  years_of_experience: number;
  emergency_contact: string;
  notes?: string;
  document_references?: string[];
  application_status: 'pending' | 'approved' | 'rejected';
  reviewed_by?: string;
  reviewed_at?: string;
  review_notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Assignment {
  id: string;
  bus_id: string;
  driver_id: string;
  route_id: string;
  service_date: string;
  scheduled_departure: string;
  scheduled_end?: string;
  assignment_status: AssignmentStatus;
  assigned_by?: string;
  assigned_at: string;
  responded_at?: string;
  cancellation_reason?: string;
  bus?: Bus;
  route?: Route;
  driver_name?: string;
  created_at: string;
  updated_at: string;
}

export interface LiveLocation {
  trip_id: string;
  bus_id: string;
  bus_number?: string;
  route_name?: string;
  latitude: number;
  longitude: number;
  accuracy_meters: number;
  speed_kmh?: number;
  recorded_at: string;
  received_at: string;
  sequence_number: number;
  is_stale: boolean;
  stale_seconds: number;
}

export interface StudentFleetBus {
  bus_id: string;
  bus_number: string;
  registration_number?: string;
  capacity: number;
  operational_status: string;
  route_id?: string;
  route_name?: string;
  route_description?: string;
  scheduled_departure?: string;
  service_date?: string;
  assignment_id?: string;
  driver_name?: string;
  trip_id?: string;
  trip_status: string;
  stops: Stop[];
  route_geometry?: string;
  distance_meters?: number;
  estimated_travel_seconds?: number;
  latest_location?: LiveLocation;
}

export interface Trip {
  id: string;
  assignment_id: string;
  bus_id: string;
  driver_id: string;
  route_id: string;
  trip_status: TripStatus;
  arrival_verification_status: boolean;
  arrival_verified_at?: string;
  started_at?: string;
  ended_at?: string;
  bus?: Bus;
  route?: Route;
  driver_name?: string;
  latest_location?: LiveLocation;
  created_at: string;
  updated_at: string;
}

export interface ETA {
  trip_id: string;
  stop_id: string;
  stop_name: string;
  eta_seconds?: number;
  eta_minutes?: number;
  estimated_arrival_time?: string;
  distance_remaining_meters?: number;
  is_bus_passed: boolean;
  is_stale: boolean;
  is_available: boolean;
  method: string;
  accuracy_note?: string;
}

export interface Notification {
  id: string;
  recipient_user_id: string;
  notification_type: string;
  title: string;
  message: string;
  related_entity_id?: string;
  is_read: boolean;
  created_at: string;
  read_at?: string;
}

export interface DashboardMetrics {
  total_buses: number;
  active_buses: number;
  available_buses: number;
  approved_drivers: number;
  pending_driver_applications: number;
  active_trips: number;
  pending_assignments: number;
  stale_or_unavailable_gps: number;
}

export interface TripAnalytics {
  total_trips_completed: number;
  average_trip_duration_minutes: number;
  on_time_departure_rate: number;
  stale_gps_incidents: number;
  speed_alerts: number;
}
