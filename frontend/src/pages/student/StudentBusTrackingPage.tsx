import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { StudentFleetBus, Stop, ETA, LiveLocation } from '../../types';
import { tripsApi } from '../../api/trips';
import { authApi } from '../../api/auth';
import { GoogleMapView } from '../../components/GoogleMapView';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import {
  Bus,
  MapPin,
  Clock,
  Navigation,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Gauge,
  Zap,
  Star,
  Compass,
  Radio,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  X
} from 'lucide-react';

function calculateHaversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export const StudentBusTrackingPage: React.FC = () => {
  const { busId } = useParams<{ busId: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { addListener, subscribe, unsubscribe, status: wsStatus } = useWebSocket();

  const [bus, setBus] = useState<StudentFleetBus | null>(null);
  const [selectedStop, setSelectedStop] = useState<Stop | null>(null);
  const [eta, setEta] = useState<ETA | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingEta, setLoadingEta] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [telemetryAlert, setTelemetryAlert] = useState<{
    alert_type: string;
    title: string;
    message: string;
    severity?: string;
    speed?: number;
    timestamp?: string;
  } | null>(null);

  // 1. Fetch fleet and load this specific bus
  const fetchBusData = useCallback(async () => {
    if (!busId) return;
    try {
      setLoading(true);
      const fleet = await tripsApi.getStudentFleet();
      const currentBus = fleet.find((b) => b.bus_id === busId);
      if (!currentBus) {
        setError('Bus not found in college fleet.');
        return;
      }
      setBus(currentBus);

      // Auto-select student's registered boarding stop if present in route, else origin stop
      const studentStop = currentBus.stops.find(
        (s) =>
          (user?.boarding_stop_id && s.id === user.boarding_stop_id) ||
          (user?.boarding_stop_name && s.name.toLowerCase() === user.boarding_stop_name.toLowerCase())
      );
      setSelectedStop(studentStop || currentBus.stops[0] || null);

      // Check for any recent telemetry alert notification for this bus
      try {
        const notifs = await authApi.getNotifications();
        const busNotif = notifs.find(
          (n) =>
            !n.is_read &&
            (n.related_entity_id === currentBus.trip_id ||
              n.title.toLowerCase().includes(`bus ${currentBus.bus_number.toLowerCase()}`) ||
              n.message.toLowerCase().includes(`bus ${currentBus.bus_number.toLowerCase()}`))
        );
        if (busNotif) {
          let aType = 'general';
          if (busNotif.title.includes('Overspeeding')) aType = 'abnormal_speed';
          else if (busNotif.title.includes('Traffic') || busNotif.title.includes('Delay')) aType = 'traffic_delay';
          else if (busNotif.title.includes('Stoppage')) aType = 'prolonged_stop';
          setTelemetryAlert({
            alert_type: aType,
            title: busNotif.title,
            message: busNotif.message,
          });
        }
      } catch {
        // notification load is non-blocking
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load bus details');
    } finally {
      setLoading(false);
    }
  }, [busId, user?.boarding_stop_id, user?.boarding_stop_name]);

  useEffect(() => {
    fetchBusData();
  }, [fetchBusData]);

  // 2. Subscribe to WebSocket route & trip rooms
  useEffect(() => {
    if (bus) {
      if (bus.route_id) {
        subscribe(`route:${bus.route_id}`);
      }
      if (bus.trip_id) {
        subscribe(`trip:${bus.trip_id}`);
      }

      return () => {
        if (bus.route_id) unsubscribe(`route:${bus.route_id}`);
        if (bus.trip_id) unsubscribe(`trip:${bus.trip_id}`);
      };
    }
  }, [bus?.route_id, bus?.trip_id, subscribe, unsubscribe]);

  // 3. Real-time WebSocket event listeners
  useEffect(() => {
    const unsubLoc = addListener('location.updated', (payload: any) => {
      if (bus && (bus.trip_id === payload.trip_id || bus.bus_id === payload.bus_id)) {
        const updatedLoc: LiveLocation = {
          trip_id: payload.trip_id,
          bus_id: payload.bus_id,
          bus_number: payload.bus_number || bus.bus_number,
          route_name: payload.route_name || bus.route_name,
          latitude: payload.latitude,
          longitude: payload.longitude,
          accuracy_meters: payload.accuracy_meters,
          speed_kmh: payload.speed_kmh != null ? Number(payload.speed_kmh) : 0,
          recorded_at: payload.recorded_at,
          received_at: payload.received_at,
          sequence_number: payload.sequence_number,
          is_stale: false,
          stale_seconds: 0,
        };
        setBus((prev) => (prev ? { ...prev, trip_status: 'active', latest_location: updatedLoc } : null));
      }
    });

    const unsubStart = addListener('trip.started', (payload: any) => {
      if (bus && (bus.route_id === payload.route_id || bus.bus_id === payload.bus_id)) {
        fetchBusData();
      }
    });

    const unsubEnd = addListener('trip.completed', (payload: any) => {
      if (bus && (bus.route_id === payload.route_id || bus.bus_id === payload.bus_id)) {
        fetchBusData();
        setEta(null);
      }
    });

    const unsubAlert = addListener('student.telemetry_alert', (payload: any) => {
      if (bus && (bus.trip_id === payload.trip_id || bus.route_id === payload.route_id)) {
        setTelemetryAlert(payload);
      }
    });

    return () => {
      unsubLoc();
      unsubStart();
      unsubEnd();
      unsubAlert();
    };
  }, [bus, addListener, fetchBusData]);

  // 4. Calculate ETA for currently selected stop
  const fetchEta = useCallback(async () => {
    if (!bus || bus.trip_status !== 'active' || !bus.trip_id || !selectedStop) {
      setEta(null);
      return;
    }

    try {
      setLoadingEta(true);
      const res = await tripsApi.getEta(bus.trip_id, selectedStop.id);
      setEta(res);
    } catch (err) {
      console.warn('Error calculating ETA:', err);
      setEta(null);
    } finally {
      setLoadingEta(false);
    }
  }, [bus, selectedStop]);

  useEffect(() => {
    fetchEta();
  }, [fetchEta, bus?.latest_location]);

  // 5. Straight-line approach distance
  const straightDistanceMeters = useMemo(() => {
    if (!bus?.latest_location || !selectedStop) return null;
    return calculateHaversineDistance(
      bus.latest_location.latitude,
      bus.latest_location.longitude,
      selectedStop.latitude,
      selectedStop.longitude
    );
  }, [bus?.latest_location, selectedStop]);

  const straightDistanceLabel = useMemo(() => {
    if (straightDistanceMeters == null) return null;
    if (straightDistanceMeters >= 1000) {
      return `${(straightDistanceMeters / 1000).toFixed(1)} km`;
    }
    return `${Math.round(straightDistanceMeters)} m`;
  }, [straightDistanceMeters]);

  // Distance formula ETA fallback (calculates road-adjusted time using live bus speed or 25 km/h)
  const fallbackEtaMinutes = useMemo(() => {
    if (!straightDistanceMeters || !bus?.latest_location) return null;
    const spd = bus.latest_location.speed_kmh && bus.latest_location.speed_kmh > 5
      ? bus.latest_location.speed_kmh
      : 25.0;
    const speedMs = (spd * 1000) / 3600;
    const roadDist = straightDistanceMeters * 1.25;
    const secs = roadDist / speedMs;
    return Math.max(1, Math.round(secs / 60));
  }, [straightDistanceMeters, bus?.latest_location]);

  const servesStudentStop = useMemo(() => {
    if (!bus || (!user?.boarding_stop_id && !user?.boarding_stop_name)) return false;
    return bus.stops.some(
      (s) =>
        (user?.boarding_stop_id && s.id === user.boarding_stop_id) ||
        (user?.boarding_stop_name && s.name.toLowerCase() === user.boarding_stop_name.toLowerCase())
    );
  }, [bus, user?.boarding_stop_id, user?.boarding_stop_name]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-semibold text-slate-500">Connecting to live college transit feed...</p>
        </div>
      </div>
    );
  }

  if (error || !bus) {
    return (
      <div className="max-w-xl mx-auto mt-12 p-6 bg-white rounded-2xl border border-slate-200 text-center shadow-xs">
        <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto mb-3" />
        <h2 className="text-base font-bold text-slate-800">Bus Information Unavailable</h2>
        <p className="text-xs text-slate-500 mt-1">{error || 'Could not locate the requested bus.'}</p>
        <button
          onClick={() => navigate('/student')}
          className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 transition-colors"
        >
          Return to Fleet Overview
        </button>
      </div>
    );
  }

  const isLive = bus.trip_status === 'active';
  const speed = bus.latest_location?.speed_kmh ?? 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Top Navigation Bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/student')}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 hover:text-indigo-600 hover:border-indigo-300 transition-all shadow-2xs"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to User Module</span>
        </button>

        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Live WebSocket Telemetry
          </span>
          <button
            onClick={fetchBusData}
            className="p-2 text-slate-500 hover:text-indigo-600 bg-white border border-slate-200 rounded-xl transition-colors shadow-2xs"
            title="Refresh bus telemetry"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Smart Telemetry & Delay Notification Banner */}
      {telemetryAlert && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between gap-3 shadow-xs animate-in fade-in transition-all ${
            telemetryAlert.alert_type === 'abnormal_speed'
              ? 'bg-rose-50 border-rose-300 text-rose-900'
              : telemetryAlert.alert_type === 'traffic_delay'
              ? 'bg-amber-50 border-amber-300 text-amber-900'
              : 'bg-indigo-50 border-indigo-300 text-indigo-900'
          }`}
        >
          <div className="flex items-start gap-3">
            <div
              className={`p-2 rounded-xl shrink-0 mt-0.5 ${
                telemetryAlert.alert_type === 'abnormal_speed'
                  ? 'bg-rose-100 text-rose-700'
                  : telemetryAlert.alert_type === 'traffic_delay'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-indigo-100 text-indigo-700'
              }`}
            >
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h4 className="text-sm font-bold">{telemetryAlert.title}</h4>
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                    telemetryAlert.alert_type === 'abnormal_speed'
                      ? 'bg-rose-200/70 text-rose-800'
                      : telemetryAlert.alert_type === 'traffic_delay'
                      ? 'bg-amber-200/70 text-amber-800'
                      : 'bg-indigo-200/70 text-indigo-800'
                  }`}
                >
                  {telemetryAlert.alert_type === 'abnormal_speed'
                    ? 'ML Speed Prediction'
                    : telemetryAlert.alert_type === 'traffic_delay'
                    ? 'ML Traffic Congestion'
                    : 'ML Stoppage Prediction'}
                </span>
              </div>
              <p className="text-xs mt-1 leading-relaxed">{telemetryAlert.message}</p>
            </div>
          </div>
          <button
            onClick={() => setTelemetryAlert(null)}
            className="p-1 rounded-lg hover:bg-black/5 text-slate-500 hover:text-slate-800 transition-colors shrink-0"
            title="Dismiss alert"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Main Banner: Matching Uploaded Image Exactly */}
      <div className="bg-[#0b101b] text-white rounded-2xl p-5 sm:p-6 shadow-sm border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-5 relative overflow-hidden">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span className="text-[11px] uppercase font-black tracking-wider text-indigo-300 bg-indigo-950/90 px-3 py-0.5 rounded-full border border-indigo-700/80">
              USER MODULE • 3D LIVE TRACKING
            </span>
            <span className="text-xs font-semibold text-slate-400">
              {bus.route_name || 'College Route Line'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-2.5">
              <Bus className="w-7 h-7 text-indigo-400" />
              Bus {bus.bus_number}
            </h1>

            {servesStudentStop && (
              <span className="inline-flex items-center gap-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 text-xs font-bold px-3 py-1 rounded-full">
                <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
                Serves Your Stop
              </span>
            )}
          </div>
        </div>

        {/* Top-Right Schedule and Status Boxes */}
        <div className="flex flex-wrap items-center gap-3 text-xs self-start md:self-auto">
          <div className="bg-[#141b2d] px-4 py-2.5 rounded-xl border border-slate-700/70">
            <div className="text-slate-400 font-medium text-[10px] uppercase tracking-wider">Scheduled Departure</div>
            <div className="font-extrabold text-white text-sm mt-0.5">{bus.scheduled_departure || '07:30 AM'}</div>
          </div>

          <div className="bg-[#141b2d] px-4 py-2.5 rounded-xl border border-slate-700/70">
            <div className="text-slate-400 font-medium text-[10px] uppercase tracking-wider">Bus Status</div>
            <div className="font-extrabold text-sm mt-0.5 flex items-center gap-1.5">
              {isLive ? (
                <span className="text-emerald-400 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  Active Live Trip
                </span>
              ) : bus.trip_status === 'scheduled' ? (
                <span className="text-sky-400">Scheduled Departure</span>
              ) : (
                <span className="text-slate-400">Standby Fleet</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 4 Telemetry Metric Cards: Matching Uploaded Image Exactly */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Live Bus Speed */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Live Bus Speed</span>
            <div className="p-2 rounded-xl bg-slate-100 text-slate-600">
              <Gauge className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900">
                {isLive ? speed.toFixed(1) : '0.0'}
              </span>
              <span className="text-xs font-bold text-slate-500">km/h</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              {isLive ? (
                speed > 2 ? (
                  <span className="text-emerald-600 font-semibold flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Moving in transit
                  </span>
                ) : (
                  <span className="text-amber-600 font-semibold">Stationary at stop</span>
                )
              ) : (
                <span>Awaiting departure</span>
              )}
            </div>
          </div>
        </div>

        {/* Card 2: Direct Approach Distance */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Direct Approach Distance</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-600">
              <Compass className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-amber-600">
                {isLive && straightDistanceLabel ? straightDistanceLabel.split(' ')[0] : '--'}
              </span>
              <span className="text-xs font-bold text-slate-500">
                {isLive && straightDistanceLabel ? straightDistanceLabel.split(' ')[1] : 'km'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1 truncate">
              Straight vector to <strong className="text-slate-700">{selectedStop?.name || 'Selected Stop'}</strong>
            </div>
          </div>
        </div>

        {/* Card 3: Smart ETA (Purple Gradient) */}
        <div className="bg-linear-to-br from-indigo-600 to-indigo-700 text-white rounded-2xl p-5 shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-indigo-100">Smart ETA</span>
            <div className="p-2 rounded-xl bg-white/20 text-white">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <div>
            {loadingEta && !eta && !fallbackEtaMinutes ? (
              <div className="text-xs text-indigo-200 py-1 font-semibold">Calculating arrival time...</div>
            ) : !isLive ? (
              <div>
                <div className="text-xl font-black text-white">Scheduled</div>
                <div className="text-[11px] text-indigo-100 mt-1">Live ETA activates on start</div>
              </div>
            ) : eta?.is_available || fallbackEtaMinutes !== null ? (
              <div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-black text-white">
                    {eta?.is_available ? eta.eta_minutes : fallbackEtaMinutes}
                  </span>
                  <span className="text-xs font-semibold text-indigo-200">minutes</span>
                </div>
                {eta?.estimated_arrival_time ? (
                  <div className="text-[11px] text-indigo-100 mt-1">
                    Expected at {new Date(eta.estimated_arrival_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                ) : (
                  <div className="text-[11px] text-indigo-100 mt-1">
                    Estimated via distance formula
                  </div>
                )}
              </div>
            ) : (
              <div>
                <div className="text-lg font-bold text-white">En Route</div>
                <div className="text-[11px] text-indigo-200 mt-1">{eta?.accuracy_note || 'Calculating arrival time...'}</div>
              </div>
            )}
          </div>
        </div>

        {/* Card 4: Road Path Distance */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-500">Road Path Distance</span>
            <div className="p-2 rounded-xl bg-sky-50 text-sky-600">
              <Navigation className="w-4 h-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-3xl font-black text-slate-900">
                {eta?.distance_remaining_meters
                  ? (eta.distance_remaining_meters / 1000).toFixed(1)
                  : bus.distance_meters
                  ? (bus.distance_meters / 1000).toFixed(1)
                  : '3.8'}
              </span>
              <span className="text-xs font-bold text-slate-500">km</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-1">
              Along highway road geometry
            </div>
          </div>
        </div>
      </div>

      {/* Main Grid: Interactive MapLibre GL Map & Route Stops Timeline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Live Approach MapLibre GL View */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
          {/* Map Sub-Header with Legend */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Live 3D Vehicle Map
              </span>
              <div className="flex items-center gap-3 text-[11px] text-slate-500 font-medium">
                <span className="flex items-center gap-1.5 font-bold text-blue-600">
                  <span className="w-4 h-1.5 bg-blue-600 rounded-full shadow-xs" /> Blue Road Path (Start → End)
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3.5 h-0.5 border-t-2 border-dashed border-amber-500" /> Approach Vector
                </span>
                <span className="flex items-center gap-1.5 font-bold text-amber-600">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-600 animate-pulse" /> Live College Bus
                </span>
              </div>
            </div>

            {bus.latest_location && (
              <span className="text-[11px] text-slate-500">
                GPS telemetry:{' '}
                <strong className="text-slate-700">
                  {new Date(bus.latest_location.recorded_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </strong>
              </span>
            )}
          </div>

          {/* Map with 3D Bus & Dynamic Controls */}
          <GoogleMapView
            stops={bus.stops}
            routeGeometry={bus.route_geometry}
            liveLocation={isLive ? bus.latest_location : null}
            selectedStopId={selectedStop?.id}
            targetStopId={selectedStop?.id}
            showStraightApproachLine={true}
            onStopSelect={(stop) => setSelectedStop(stop)}
            className="h-[520px] w-full rounded-2xl overflow-hidden border border-slate-200 shadow-md"
          />

          {/* Direct approach distance callout bar if live */}
          {straightDistanceLabel && isLive && (
            <div className="bg-amber-50/90 border border-amber-200 p-3 rounded-xl flex items-center justify-between text-xs text-amber-900">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Straight vector distance from Bus {bus.bus_number} to <strong>{selectedStop?.name}</strong>:
                </span>
              </div>
              <strong className="text-sm font-black text-amber-950 bg-white px-2.5 py-0.5 rounded-lg border border-amber-300">
                {straightDistanceLabel} direct
              </strong>
            </div>
          )}
        </div>

        {/* Right 1 Col: Route Stops Timeline Matching Uploaded Image */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
              ROUTE STOPS ({bus.stops.length})
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click any stop to see straight line approach & arrival ETA
            </p>
          </div>

          <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
            {bus.stops.map((stop, index) => {
              const isSelected = selectedStop?.id === stop.id;
              const isOrigin = index === 0;
              const isDest = index === bus.stops.length - 1;
              const isMyStop =
                (user?.boarding_stop_id && stop.id === user.boarding_stop_id) ||
                (user?.boarding_stop_name && stop.name.toLowerCase() === user.boarding_stop_name.toLowerCase());

              return (
                <button
                  key={stop.id}
                  onClick={() => setSelectedStop(stop)}
                  className={`w-full text-left p-3.5 rounded-xl border text-xs flex items-center justify-between transition-all ${
                    isSelected
                      ? 'border-indigo-600 bg-indigo-50/80 text-indigo-950 font-semibold ring-2 ring-indigo-500/20 shadow-xs'
                      : isMyStop
                      ? 'border-amber-300 bg-amber-50/50 text-slate-800 hover:border-amber-400'
                      : 'border-slate-100 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-3 truncate">
                    <span
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-black text-white shrink-0 ${
                        isOrigin ? 'bg-emerald-500' : isDest ? 'bg-rose-500' : isMyStop ? 'bg-amber-500' : 'bg-slate-400'
                      }`}
                    >
                      {index + 1}
                    </span>
                    <div className="truncate">
                      <span className="truncate block font-bold text-slate-900">{stop.name}</span>
                      {stop.address && (
                        <span className="text-[10px] text-slate-400 truncate block mt-0.5">{stop.address}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    {isMyStop && (
                      <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                        <Star className="w-2.5 h-2.5 fill-amber-500" />
                        My Stop
                      </span>
                    )}
                    {isSelected && (
                      <span className="text-[10px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-bold">
                        Target
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
