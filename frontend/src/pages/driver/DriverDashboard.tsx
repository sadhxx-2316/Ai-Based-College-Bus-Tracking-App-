import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Assignment, Trip } from '../../types';
import { assignmentsApi } from '../../api/assignments';
import { tripsApi, ArrivalCheckResponse } from '../../api/trips';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import {
  Car,
  MapPin,
  Clock,
  Compass,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Play,
  Square,
  Radio,
  RefreshCw,
  Info,
  Gauge,
  Zap,
  ShieldAlert
} from 'lucide-react';

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const DriverDashboard: React.FC = () => {
  const { user } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [currentAssignment, setCurrentAssignment] = useState<Assignment | null>(null);
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [arrivalResult, setArrivalResult] = useState<ArrivalCheckResponse | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [trackingActive, setTrackingActive] = useState(false);
  const [lastSentTime, setLastSentTime] = useState<string | null>(null);
  const [pointsSentCount, setPointsSentCount] = useState(0);
  const [latestAccuracy, setLatestAccuracy] = useState<number | null>(null);
  const [latestCoords, setLatestCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [anomalyWarning, setAnomalyWarning] = useState<string | null>(null);
  const [showEndModal, setShowEndModal] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const intervalIdRef = useRef<any>(null);
  const sequenceNumRef = useRef(1);
  const [liveSpeed, setLiveSpeed] = useState<number>(0);
  const [distanceMovedDelta, setDistanceMovedDelta] = useState<number>(0);
  const [lastSendReason, setLastSendReason] = useState<string>('Standby');
  const lastSentCoordsRef = useRef<{ lat: number; lng: number; time: number } | null>(null);
  const latestPositionRef = useRef<{ lat: number; lng: number; accuracy: number; speed: number | null } | null>(null);
  const wakeLockRef = useRef<any>(null);
  const isSendingRef = useRef<boolean>(false);
  const { addListener } = useWebSocket();

  // 1. Fetch driver assignments
  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await assignmentsApi.listDriverAssignments();
      setAssignments(data);

      // Select active or pending assignment for today
      const active = data.find((a) => a.assignment_status === 'accepted' || a.assignment_status === 'pending');
      setCurrentAssignment(active || data[0] || null);

      if (active && active.assignment_status === 'accepted') {
        const trip = await tripsApi.getTrip(active.id).catch(() => null);
        if (trip) {
          setActiveTrip(trip);
          if (trip.trip_status === 'active') {
            setTrackingActive(true);
          }
        }
      }
    } catch (err: any) {
      console.warn('Error loading driver assignments:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAssignments();

    // Listen for new assignment notifications in real time
    const unsub = addListener('assignment.created', () => {
      fetchAssignments();
    });

    return () => {
      unsub();
    };
  }, [fetchAssignments, addListener]);

  // 2. Respond to assignment (Accept / Reject)
  const handleAccept = async () => {
    if (!currentAssignment) return;
    setActionLoading(true);
    try {
      const updated = await assignmentsApi.acceptAssignment(currentAssignment.id);
      setCurrentAssignment(updated);
      await fetchAssignments();
    } catch (err: any) {
      alert(err.message || 'Failed to accept assignment');
    } finally {
      setActionLoading(false);
    }
  };

  const handleReject = async () => {
    if (!currentAssignment) return;
    const reason = prompt('Please enter reason for declining this assignment:');
    if (reason === null) return;

    setActionLoading(true);
    try {
      const updated = await assignmentsApi.rejectAssignment(currentAssignment.id, reason);
      setCurrentAssignment(updated);
      await fetchAssignments();
    } catch (err: any) {
      alert(err.message || 'Failed to reject assignment');
    } finally {
      setActionLoading(false);
    }
  };

  // 3. Starting-Point Arrival Verification using Phone GPS
  const handleCheckArrival = () => {
    if (!currentAssignment) return;

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported by your mobile browser.');
      return;
    }

    setActionLoading(true);
    setGpsError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await tripsApi.checkArrival(currentAssignment.id, {
            latitude: pos.coords.latitude,
            longitude: pos.coords.longitude,
            accuracy_meters: pos.coords.accuracy,
          });
          setArrivalResult(res);
        } catch (err: any) {
          setGpsError(err.message || 'Arrival verification failed on server.');
        } finally {
          setActionLoading(false);
        }
      },
      (err) => {
        setActionLoading(false);
        setGpsError(`GPS permission denied or unavailable (${err.message}). Please ensure Location Services are enabled.`);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  // 3b. Simulate Starting-Point Arrival (Useful for indoor testing or simulation)
  const handleSimulateArrival = async () => {
    if (!currentAssignment) return;
    setActionLoading(true);
    setGpsError(null);
    try {
      const originStop = currentAssignment.route?.stops?.find(
        (s) => s.id === currentAssignment.route?.origin_stop_id
      ) || currentAssignment.route?.stops?.[0];

      const lat = originStop?.latitude || 9.52554;
      const lon = originStop?.longitude || 77.85408;

      const res = await tripsApi.checkArrival(currentAssignment.id, {
        latitude: lat,
        longitude: lon,
        accuracy_meters: 10.0,
      });
      setArrivalResult(res);
    } catch (err: any) {
      setGpsError(err.message || 'Simulation verification failed on server.');
    } finally {
      setActionLoading(false);
    }
  };

  // Screen Wake Lock & Notification Helpers
  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) {
        wakeLockRef.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.warn('Screen wake lock not acquired:', err);
    }
  };

  const releaseWakeLock = () => {
    try {
      if (wakeLockRef.current) {
        wakeLockRef.current.release();
        wakeLockRef.current = null;
      }
    } catch (err) {
      console.warn('Screen wake lock release error:', err);
    }
  };

  // 4. Start Trip
  const handleStartTrip = async () => {
    if (!currentAssignment) return;
    setActionLoading(true);
    setGpsError(null);

    // Request mobile notification permission
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        await Notification.requestPermission();
      } catch (e) {
        console.warn('Notification permission error:', e);
      }
    }

    try {
      await tripsApi.startTrip(currentAssignment.id);
      setTrackingActive(true);
      await requestWakeLock();
      await fetchAssignments();
    } catch (err: any) {
      setGpsError(err.message || 'Could not start trip.');
    } finally {
      setActionLoading(false);
    }
  };

  // Centralized GPS Location Dispatcher (5s periodic OR 10m displacement)
  const sendLocationUpdate = useCallback(
    async (latitude: number, longitude: number, accuracy: number, rawSpeed: number | null, reason: string) => {
      if (!activeTrip || activeTrip.trip_status !== 'active') return;
      if (isSendingRef.current) return;
      isSendingRef.current = true;

      const now = Date.now();
      let calculatedSpeedKmh = 0;

      // Calculate speed based on device sensor or distance delta
      if (rawSpeed != null && rawSpeed > 0) {
        calculatedSpeedKmh = Number((rawSpeed * 3.6).toFixed(1));
      } else if (lastSentCoordsRef.current) {
        const dist = haversineMeters(lastSentCoordsRef.current.lat, lastSentCoordsRef.current.lng, latitude, longitude);
        const dt = (now - lastSentCoordsRef.current.time) / 1000;
        if (dt > 0) {
          calculatedSpeedKmh = Number(((dist / dt) * 3.6).toFixed(1));
        }
        setDistanceMovedDelta(Math.round(dist));
      }

      setLiveSpeed(calculatedSpeedKmh);
      setLatestCoords({ lat: latitude, lng: longitude });
      setLatestAccuracy(accuracy);
      setLastSendReason(reason);

      try {
        const res = await tripsApi.submitLocation(activeTrip.id, {
          latitude,
          longitude,
          accuracy_meters: accuracy,
          speed_kmh: calculatedSpeedKmh,
          recorded_at: new Date(now).toISOString(),
          sequence_number: sequenceNumRef.current++,
        });

        lastSentCoordsRef.current = { lat: latitude, lng: longitude, time: now };
        setPointsSentCount((c) => c + 1);
        setLastSentTime(new Date(now).toLocaleTimeString());

        if (res.is_anomaly && res.warning) {
          setAnomalyWarning(res.warning);
        } else {
          setAnomalyWarning(null);
        }
      } catch (err: any) {
        console.warn('GPS location push error:', err);
      } finally {
        isSendingRef.current = false;
      }
    },
    [activeTrip]
  );

  // 5. GPS Live Location Broadcaster & Background Protection
  useEffect(() => {
    if (!trackingActive || !activeTrip || activeTrip.trip_status !== 'active') {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalIdRef.current !== null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      releaseWakeLock();
      return;
    }

    if (!navigator.geolocation) {
      setGpsError('Geolocation is not supported on this device/browser.');
      return;
    }

    requestWakeLock();

    // Prevent accidental closing / leaving the page while trip is active
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'Trip is currently active! Exiting will pause live bus tracking for students.';
      return e.returnValue;
    };

    // Show persistent notification if driver switches away or screen dims
    const handleVisibilityChange = () => {
      if (document.hidden && trackingActive) {
        if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
          try {
            new Notification('🚌 College Bus Trip Active', {
              body: 'Real-time GPS tracking is active. Keep this app open for continuous student updates.',
              icon: '/favicon.ico',
              tag: 'college-bus-trip-active'
            });
          } catch (e) {
            console.warn('Notification prompt error:', e);
          }
        }
      } else if (!document.hidden && trackingActive) {
        requestWakeLock();
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Initial immediate position query
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed } = pos.coords;
        latestPositionRef.current = { lat: latitude, lng: longitude, accuracy, speed };
        sendLocationUpdate(latitude, longitude, accuracy, speed, 'Initial Departure GPS');
      },
      (err) => console.warn('Initial GPS query warning:', err),
      { enableHighAccuracy: true, timeout: 8000 }
    );

    // Watch position: Trigger immediately when bus travels >= 10m
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude, accuracy, speed } = pos.coords;
        latestPositionRef.current = { lat: latitude, lng: longitude, accuracy, speed };

        if (lastSentCoordsRef.current) {
          const distMoved = haversineMeters(
            lastSentCoordsRef.current.lat,
            lastSentCoordsRef.current.lng,
            latitude,
            longitude
          );
          if (distMoved >= 10.0) {
            sendLocationUpdate(latitude, longitude, accuracy, speed, `Traveled ≥ 10m (${Math.round(distMoved)}m)`);
          }
        } else {
          sendLocationUpdate(latitude, longitude, accuracy, speed, 'GPS Fixed');
        }
      },
      (err) => {
        console.warn('GPS watch error:', err);
        setGpsError(`GPS error: ${err.message}`);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 3000,
        timeout: 10000,
      }
    );

    // Periodic Interval: Guarantee location broadcast every 5 seconds
    intervalIdRef.current = setInterval(() => {
      const now = Date.now();
      const elapsedMs = lastSentCoordsRef.current ? now - lastSentCoordsRef.current.time : 999999;

      if (elapsedMs >= 4500) {
        if (latestPositionRef.current) {
          sendLocationUpdate(
            latestPositionRef.current.lat,
            latestPositionRef.current.lng,
            latestPositionRef.current.accuracy,
            latestPositionRef.current.speed,
            '5-Second Periodic Broadcast'
          );
        } else {
          navigator.geolocation.getCurrentPosition(
            (pos) => {
              const { latitude, longitude, accuracy, speed } = pos.coords;
              latestPositionRef.current = { lat: latitude, lng: longitude, accuracy, speed };
              sendLocationUpdate(latitude, longitude, accuracy, speed, '5-Second Periodic Query');
            },
            (err) => console.warn('5s periodic query failed:', err),
            { enableHighAccuracy: true, timeout: 6000 }
          );
        }
      }
    }, 5000);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalIdRef.current !== null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      releaseWakeLock();
    };
  }, [trackingActive, activeTrip, sendLocationUpdate]);

  // 6. End Trip
  const handleEndTrip = async () => {
    if (!activeTrip) return;
    setActionLoading(true);

    try {
      await tripsApi.endTrip(activeTrip.id);
      setTrackingActive(false);
      setShowEndModal(false);
      lastSentCoordsRef.current = null;
      latestPositionRef.current = null;
      setLiveSpeed(0);
      setDistanceMovedDelta(0);
      releaseWakeLock();

      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (intervalIdRef.current !== null) {
        clearInterval(intervalIdRef.current);
        intervalIdRef.current = null;
      }
      await fetchAssignments();
    } catch (err: any) {
      alert(err.message || 'Could not end trip');
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-2">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500">Loading driver duty schedule...</p>
        </div>
      </div>
    );
  }

  if (!currentAssignment) {
    return (
      <div className="max-w-md mx-auto px-4 py-8">
        <EmptyState
          title="No Active Bus Assignments"
          description="You currently have no scheduled or pending bus assignments from the college transport manager."
          icon={<Car className="w-10 h-10 text-slate-400" />}
        />
      </div>
    );
  }

  return (
    <div className="max-w-xl mx-auto px-4 py-6 space-y-5">
      {/* Driver Header */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
            Driver Duty Console
          </span>
          <h1 className="text-xl font-bold text-slate-900 mt-1">{user?.name}</h1>
          <p className="text-xs text-slate-500">{user?.email}</p>
        </div>
        <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl">
          <Car className="w-6 h-6" />
        </div>
      </div>

      {/* Assignment Card */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800">Current Assignment</h2>
          <Badge
            variant={
              currentAssignment.assignment_status === 'accepted'
                ? 'success'
                : currentAssignment.assignment_status === 'pending'
                ? 'warning'
                : 'danger'
            }
          >
            {currentAssignment.assignment_status.toUpperCase()}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-0.5">Assigned Bus</span>
            <span className="font-bold text-slate-800 text-sm">
              {currentAssignment.bus?.bus_number ? `Bus ${currentAssignment.bus.bus_number}` : 'N/A'}
            </span>
          </div>

          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <span className="text-slate-400 block mb-0.5">Scheduled Departure</span>
            <span className="font-bold text-slate-800 text-sm">
              {currentAssignment.scheduled_departure}
            </span>
          </div>
        </div>

        <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-xs">
          <span className="text-slate-400 block mb-0.5">Route Designation</span>
          <span className="font-bold text-slate-900 text-sm">
            {currentAssignment.route?.route_name || 'Assigned Route'}
          </span>
          <span className="text-[11px] text-slate-500 block mt-1">
            Total Stops: {currentAssignment.route?.ordered_stop_ids?.length || 0}
          </span>
        </div>

        {/* Pending Assignment Actions: Accept / Reject */}
        {currentAssignment.assignment_status === 'pending' && (
          <div className="pt-2 flex items-center gap-3">
            <button
              onClick={handleAccept}
              disabled={actionLoading}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 text-white text-xs font-bold rounded-xl hover:bg-emerald-700 transition-colors shadow-xs disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Accept Assignment
            </button>
            <button
              onClick={handleReject}
              disabled={actionLoading}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              <XCircle className="w-4 h-4" />
              Decline
            </button>
          </div>
        )}
      </div>

      {/* Starting-Point Arrival Verification & Start Trip (Only once accepted) */}
      {currentAssignment.assignment_status === 'accepted' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <h2 className="text-sm font-bold text-slate-800">Trip Departure Verification</h2>
          <p className="text-xs text-slate-500 leading-relaxed">
            Arrive independently at the route's starting point. Press <strong>Verify Arrival</strong> to authenticate your GPS position before initiating the trip.
          </p>

          {gpsError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{gpsError}</span>
            </div>
          )}

          {arrivalResult && (
            <div
              className={`p-3.5 rounded-xl border text-xs leading-relaxed ${
                arrivalResult.verified
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-amber-50 border-amber-200 text-amber-800'
              }`}
            >
              <div className="font-bold flex items-center gap-1.5 mb-1">
                {arrivalResult.verified ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                {arrivalResult.verified ? 'Starting-Point Arrival Verified' : 'Arrival Check Failed'}
              </div>
              <p>{arrivalResult.message}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="space-y-3 pt-1">
            {!arrivalResult?.verified && !trackingActive && (
              <div className="space-y-2">
                <button
                  onClick={handleCheckArrival}
                  disabled={actionLoading}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-sm disabled:opacity-50"
                >
                  <Compass className="w-4 h-4" />
                  {actionLoading ? 'Querying Device GPS...' : 'Verify Starting-Point Arrival (Live GPS)'}
                </button>

                <button
                  type="button"
                  onClick={handleSimulateArrival}
                  disabled={actionLoading}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors border border-slate-200"
                >
                  <span>📍 Simulate Arrival at Route Start (Indoor / Test Mode)</span>
                </button>
              </div>
            )}

            {arrivalResult?.verified && !trackingActive && (
              <button
                onClick={handleStartTrip}
                disabled={actionLoading}
                className="w-full inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-emerald-600 text-white text-sm font-extrabold rounded-xl hover:bg-emerald-700 transition-colors shadow-md disabled:opacity-50"
              >
                <Play className="w-5 h-5 fill-current" />
                Start Trip & Begin GPS Broadcasting
              </button>
            )}
          </div>
        </div>
      )}

      {/* Active Trip Live GPS Broadcasting Console */}
      {trackingActive && (
        <div className="bg-slate-900 text-white p-5 rounded-2xl shadow-xl space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 bg-emerald-500 rounded-full animate-ping" />
              <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                Live GPS Broadcasting Active
              </span>
            </div>
            <Radio className="w-5 h-5 text-emerald-400 animate-pulse" />
          </div>

          {anomalyWarning && (
            <div className="p-3 bg-amber-500/20 border border-amber-500/50 text-amber-200 text-xs rounded-xl flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{anomalyWarning}</span>
            </div>
          )}

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
            {/* Speed Display */}
            <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span>Current Speed</span>
                <Gauge className="w-3.5 h-3.5 text-emerald-400" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-emerald-300">
                  {liveSpeed.toFixed(1)}
                </span>
                <span className="text-[10px] font-bold text-slate-400">km/h</span>
              </div>
              <span className="text-[10px] text-slate-400 mt-1">Calculated via GPS & 10m delta</span>
            </div>

            {/* GPS Accuracy */}
            <div className="bg-slate-800/90 p-3 rounded-xl border border-slate-700 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span>GPS Accuracy</span>
                <Compass className="w-3.5 h-3.5 text-indigo-400" />
              </div>
              <span className="font-bold text-white text-base">
                {latestAccuracy !== null ? `± ${Math.round(latestAccuracy)} m` : 'Acquiring...'}
              </span>
              <span className="text-[10px] text-slate-400 mt-1">Satellite signal strength</span>
            </div>

            {/* Updates Sent & Trigger */}
            <div className="col-span-2 sm:col-span-1 bg-slate-800/90 p-3 rounded-xl border border-slate-700 flex flex-col justify-between">
              <div className="flex items-center justify-between text-slate-400 mb-1">
                <span>Broadcasting</span>
                <Zap className="w-3.5 h-3.5 text-amber-400" />
              </div>
              <span className="font-bold text-white text-base">
                {pointsSentCount} sent
              </span>
              <span className="text-[10px] text-amber-300/90 mt-1 truncate" title={lastSendReason}>
                {lastSendReason}
              </span>
            </div>
          </div>

          <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-1 pt-1">
            <span>Last Sync: <strong className="text-slate-200">{lastSentTime || 'Now'}</strong></span>
            <span>Broadcast rule: <strong className="text-emerald-400">Every 5s or 10m traveled</strong></span>
          </div>

          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60 text-[11px] text-slate-300 flex items-start gap-2">
            <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
            <p>
              <strong>Screen Awake Lock active:</strong> Your phone screen will stay on automatically while this trip is active. If you switch tabs, a mobile notification will keep tracking running.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setShowEndModal(true)}
            className="w-full mt-2 inline-flex items-center justify-center gap-2 px-4 py-3.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl transition-colors shadow-lg"
          >
            <Square className="w-4 h-4 fill-current" />
            End Active Trip & Stop Broadcasting
          </button>
        </div>
      )}

      {/* Sticky Bottom Floating Action Bar for Mobile Drivers */}
      {(trackingActive || activeTrip?.trip_status === 'active') && (
        <div className="fixed bottom-4 left-4 right-4 max-w-xl mx-auto z-40">
          <div className="bg-slate-900/95 backdrop-blur-md text-white p-3 px-4 rounded-2xl shadow-2xl border border-rose-500/30 flex items-center justify-between gap-3 animate-in slide-in-from-bottom duration-300">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <span className="w-2.5 h-2.5 bg-rose-500 rounded-full animate-ping shrink-0" />
              <div className="text-xs truncate">
                <span className="font-bold text-white block">Trip Broadcasting Active</span>
                <span className="text-[10px] text-emerald-400 font-mono">
                  {liveSpeed > 0 ? `${liveSpeed} km/h` : 'Tracking live'} • 5s / 10m rule
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowEndModal(true)}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl transition-all shadow-md shrink-0 flex items-center gap-1.5"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              End Trip
            </button>
          </div>
        </div>
      )}

      {/* End Trip Confirmation Modal */}
      {showEndModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 text-center">
            <div className="p-3 bg-rose-50 text-rose-600 rounded-full w-12 h-12 flex items-center justify-center mx-auto mb-3">
              <Square className="w-6 h-6 fill-current" />
            </div>
            <h3 className="text-base font-bold text-slate-900">End this trip?</h3>
            <p className="text-xs text-slate-500 mt-1.5 leading-relaxed">
              This will stop live GPS location broadcasting for students and finalize the trip record in MongoDB.
            </p>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={() => setShowEndModal(false)}
                className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl hover:bg-slate-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEndTrip}
                disabled={actionLoading}
                className="flex-1 px-4 py-2.5 bg-rose-600 text-white text-xs font-bold rounded-xl hover:bg-rose-700 transition-colors shadow-xs"
              >
                {actionLoading ? 'Ending...' : 'Yes, End Trip'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
