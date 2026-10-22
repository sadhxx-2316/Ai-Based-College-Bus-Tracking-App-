import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { StudentFleetBus, LiveLocation } from '../../types';
import { tripsApi } from '../../api/trips';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { useAuth } from '../../context/AuthContext';
import { useWebSocket } from '../../context/WebSocketContext';
import {
  Bus,
  Clock,
  Users,
  RefreshCw,
  GraduationCap,
  Gauge,
  Star,
  ArrowRight,
  Search,
  X,
  Compass,
  MapPin,
  AlertCircle
} from 'lucide-react';

export const StudentDashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [fleet, setFleet] = useState<StudentFleetBus[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingFleet, setLoadingFleet] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { addListener } = useWebSocket();

  // 1. Fetch entire student fleet with routes, timing, and operational status
  const fetchFleet = useCallback(async () => {
    try {
      setLoadingFleet(true);
      const data = await tripsApi.getStudentFleet();
      setFleet(data);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load college buses');
    } finally {
      setLoadingFleet(false);
    }
  }, []);

  useEffect(() => {
    fetchFleet();
  }, [fetchFleet]);

  // 2. Real-time updates via WebSocket (live speed, trip start/completion)
  useEffect(() => {
    const unsubLoc = addListener('location.updated', (payload: any) => {
      setFleet((prev) =>
        prev.map((b) => {
          if (b.trip_id === payload.trip_id || b.bus_id === payload.bus_id) {
            const updatedLoc: LiveLocation = {
              trip_id: payload.trip_id,
              bus_id: payload.bus_id,
              bus_number: payload.bus_number || b.bus_number,
              route_name: payload.route_name || b.route_name,
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
            return {
              ...b,
              trip_status: 'active',
              latest_location: updatedLoc,
            };
          }
          return b;
        })
      );
    });

    const unsubStart = addListener('trip.started', () => {
      fetchFleet();
    });

    const unsubEnd = addListener('trip.completed', () => {
      fetchFleet();
    });

    return () => {
      unsubLoc();
      unsubStart();
      unsubEnd();
    };
  }, [addListener, fetchFleet]);

  // 3. Check if a bus route serves the student's registered residence/boarding stop
  const servesStudentStop = useCallback(
    (bus: StudentFleetBus) => {
      if (!user?.boarding_stop_id && !user?.boarding_stop_name) return false;
      return bus.stops.some(
        (s) =>
          (user?.boarding_stop_id && s.id === user.boarding_stop_id) ||
          (user?.boarding_stop_name && s.name.toLowerCase() === user.boarding_stop_name.toLowerCase())
      );
    },
    [user?.boarding_stop_id, user?.boarding_stop_name]
  );

  // 4. Filter buses based on the big search bar input
  const filteredFleet = useMemo(() => {
    if (!searchQuery.trim()) return fleet;
    const q = searchQuery.toLowerCase().trim();
    return fleet.filter((bus) => {
      const matchBusNumber = bus.bus_number.toLowerCase().includes(q);
      const matchRoute = (bus.route_name || '').toLowerCase().includes(q);
      const matchReg = (bus.registration_number || '').toLowerCase().includes(q);
      const matchDriver = (bus.driver_name || '').toLowerCase().includes(q);
      const matchStop = bus.stops.some(
        (s) => s.name.toLowerCase().includes(q) || (s.address && s.address.toLowerCase().includes(q))
      );
      return matchBusNumber || matchRoute || matchReg || matchDriver || matchStop;
    });
  }, [fleet, searchQuery]);

  // 5. Partition: Buses serving student's stop FIRST, followed by other buses
  const { myStopBuses, otherBuses } = useMemo(() => {
    const myStop: StudentFleetBus[] = [];
    const others: StudentFleetBus[] = [];
    filteredFleet.forEach((b) => {
      if (servesStudentStop(b)) {
        myStop.push(b);
      } else {
        others.push(b);
      }
    });
    return { myStopBuses: myStop, otherBuses: others };
  }, [filteredFleet, servesStudentStop]);

  if (loadingFleet && fleet.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-9 h-9 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs font-medium text-slate-500">Loading college buses, routes, and schedules...</p>
        </div>
      </div>
    );
  }

  if (fleet.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <EmptyState
          title="No College Buses Found"
          description="The college transport department has not registered any active buses or routes yet."
          icon={<Bus className="w-10 h-10 text-slate-400" />}
        />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* 1. Top Header & Refresh */}
      <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2.5">
            <Bus className="w-6 h-6 text-indigo-600" />
            College Bus Fleet & Schedule
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Search college buses below. Select any bus to view its live location and arrival ETA.
          </p>
        </div>

        <button
          onClick={fetchFleet}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors self-start md:self-auto cursor-pointer"
          title="Refresh fleet and schedules"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingFleet ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh Fleet</span>
        </button>
      </div>

      {/* 2. Student Info & Boarding Stop */}
      {user && (
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl">
              <GraduationCap className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-slate-900">{user.name}</span>
                {user.roll_number && (
                  <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md">
                    {user.roll_number}
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {[user.department, user.year ? `${user.year} Year` : null].filter(Boolean).join(' • ') || 'Student'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 bg-amber-50/80 border border-amber-200/80 px-4 py-2.5 rounded-xl text-xs">
            <Star className="w-4 h-4 text-amber-600 fill-amber-500 shrink-0" />
            <div>
              <span className="text-slate-600 font-medium">My Boarding Stop: </span>
              <strong className="text-amber-950 font-bold text-sm">
                {user.boarding_stop_name || 'Not configured'}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* 3. BIG SEARCH BAR TO SEARCH THE BUS */}
      <div className="space-y-2">
        <div className="relative flex items-center bg-white rounded-2xl border-2 border-indigo-200 hover:border-indigo-400 focus-within:border-indigo-600 focus-within:ring-4 focus-within:ring-indigo-100 shadow-sm transition-all">
          <Search className="w-5 h-5 text-indigo-600 absolute left-4.5 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search buses by Bus Number, Route Name, Registration, Driver, or Stop Name..."
            className="w-full py-4 pl-13 pr-12 text-sm sm:text-base font-medium text-slate-800 placeholder-slate-400 bg-transparent outline-none rounded-2xl"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 p-1.5 text-slate-400 hover:text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
              title="Clear search"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {searchQuery && (
          <div className="flex items-center justify-between px-2 text-xs text-slate-500">
            <span>
              Found <strong className="text-slate-800">{filteredFleet.length}</strong> matching buses for{' '}
              <strong className="text-slate-800">"{searchQuery}"</strong>
            </span>
            <button
              onClick={() => setSearchQuery('')}
              className="text-indigo-600 font-semibold hover:underline cursor-pointer"
            >
              Reset search
            </button>
          </div>
        )}
      </div>

      {/* 4. BUS CARDS SECTION */}
      {filteredFleet.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-2">
          <AlertCircle className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-sm font-bold text-slate-800">No Buses Match Your Search</h3>
          <p className="text-xs text-slate-500">
            No college bus matched "{searchQuery}". Try searching by route name, bus number, or stop.
          </p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-2 px-3.5 py-1.5 bg-indigo-600 text-white font-bold rounded-xl text-xs hover:bg-indigo-700 transition-colors"
          >
            Show All Buses
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Section 1: Buses Serving Student's Stop (Shown First) */}
          {myStopBuses.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-800 bg-amber-50/80 border border-amber-200 px-3.5 py-2 rounded-xl w-fit">
                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                <span>
                  Buses Serving Your Stop: {user?.boarding_stop_name || 'My Residence Stop'} (Priority)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {myStopBuses.map((bus) => {
                  const isLive = bus.trip_status === 'active';
                  const speed = bus.latest_location?.speed_kmh ?? 0;

                  return (
                    <div
                      key={bus.bus_id}
                      onClick={() => navigate(`/student/track/${bus.bus_id}`)}
                      className="cursor-pointer rounded-2xl p-5 border border-amber-200 bg-white hover:border-indigo-400 hover:shadow-md transition-all relative flex flex-col justify-between group"
                    >
                      <div>
                        {/* Bus Card Top Bar */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              <Bus className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-base font-bold text-slate-900">{bus.bus_number}</div>
                              <div className="text-xs text-slate-500">{bus.registration_number || 'College Bus'}</div>
                            </div>
                          </div>

                          {/* Status Badge */}
                          {isLive ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              Live on Route
                            </span>
                          ) : bus.trip_status === 'scheduled' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
                              <Clock className="w-3.5 h-3.5" />
                              Scheduled
                            </span>
                          ) : (
                            <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                              Standby
                            </span>
                          )}
                        </div>

                        {/* Route Name */}
                        <div className="text-sm font-bold text-slate-800 line-clamp-1 mb-2">
                          {bus.route_name || 'Assigned Route'}
                        </div>

                        {/* Timing and Driver */}
                        <div className="grid grid-cols-2 gap-2 my-2.5 text-xs bg-slate-50/90 p-3 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-slate-400 block font-medium text-[11px]">Scheduled Departure</span>
                            <strong className="text-slate-700 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3.5 h-3.5 text-indigo-500" />
                              {bus.scheduled_departure || '07:30 AM'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-medium text-[11px]">Driver</span>
                            <strong className="text-slate-700 flex items-center gap-1 mt-0.5 truncate">
                              <Users className="w-3.5 h-3.5 text-indigo-500" />
                              {bus.driver_name || 'Assigned Driver'}
                            </strong>
                          </div>
                        </div>

                        {/* Speed badge if active */}
                        {isLive && (
                          <div className="flex items-center justify-between text-xs bg-emerald-50/70 text-emerald-900 border border-emerald-200/80 px-3 py-1.5 rounded-lg mb-2.5">
                            <span className="flex items-center gap-1 font-semibold text-xs">
                              <Gauge className="w-3.5 h-3.5 text-emerald-600" />
                              Live Speed:
                            </span>
                            <strong className="font-bold">{speed.toFixed(1)} km/h</strong>
                          </div>
                        )}
                      </div>

                      {/* Card Action Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                        <span className="text-amber-700 font-semibold flex items-center gap-1 text-[11px]">
                          <Star className="w-3.5 h-3.5 fill-amber-500" />
                          Stops at your stop
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/student/track/${bus.bus_id}`);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-all shadow-xs text-xs cursor-pointer"
                        >
                          <span>Track Bus Live</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Section 2: Remaining College Buses (Shown After Student Stop Buses) */}
          {otherBuses.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
                <Bus className="w-4 h-4 text-slate-500" />
                <span>Other College Buses & Routes ({otherBuses.length})</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {otherBuses.map((bus) => {
                  const isLive = bus.trip_status === 'active';
                  const speed = bus.latest_location?.speed_kmh ?? 0;

                  return (
                    <div
                      key={bus.bus_id}
                      onClick={() => navigate(`/student/track/${bus.bus_id}`)}
                      className="cursor-pointer rounded-2xl p-5 border border-slate-200 bg-white hover:border-indigo-400 hover:shadow-md transition-all relative flex flex-col justify-between group"
                    >
                      <div>
                        {/* Bus Card Top Bar */}
                        <div className="flex items-start justify-between gap-2 mb-3">
                          <div className="flex items-center gap-2.5">
                            <div className="p-2.5 rounded-xl bg-slate-100 text-slate-700 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                              <Bus className="w-5 h-5" />
                            </div>
                            <div>
                              <div className="text-base font-bold text-slate-900">{bus.bus_number}</div>
                              <div className="text-xs text-slate-500">{bus.registration_number || 'College Bus'}</div>
                            </div>
                          </div>

                          {/* Status Badge */}
                          {isLive ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              Live on Route
                            </span>
                          ) : bus.trip_status === 'scheduled' ? (
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-sky-100 text-sky-800">
                              <Clock className="w-3.5 h-3.5" />
                              Scheduled
                            </span>
                          ) : (
                            <span className="text-xs font-medium bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                              Standby
                            </span>
                          )}
                        </div>

                        {/* Route Name */}
                        <div className="text-sm font-bold text-slate-800 line-clamp-1 mb-2">
                          {bus.route_name || 'College Route'}
                        </div>

                        {/* Timing and Driver */}
                        <div className="grid grid-cols-2 gap-2 my-2.5 text-xs bg-slate-50/90 p-3 rounded-xl border border-slate-100">
                          <div>
                            <span className="text-slate-400 block font-medium text-[11px]">Scheduled Departure</span>
                            <strong className="text-slate-700 flex items-center gap-1 mt-0.5">
                              <Clock className="w-3.5 h-3.5 text-indigo-500" />
                              {bus.scheduled_departure || '08:00 AM'}
                            </strong>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-medium text-[11px]">Driver</span>
                            <strong className="text-slate-700 flex items-center gap-1 mt-0.5 truncate">
                              <Users className="w-3.5 h-3.5 text-indigo-500" />
                              {bus.driver_name || 'Driver'}
                            </strong>
                          </div>
                        </div>

                        {/* Speed badge if active */}
                        {isLive && (
                          <div className="flex items-center justify-between text-xs bg-emerald-50/70 text-emerald-900 border border-emerald-200/80 px-3 py-1.5 rounded-lg mb-2.5">
                            <span className="flex items-center gap-1 font-semibold text-xs">
                              <Gauge className="w-3.5 h-3.5 text-emerald-600" />
                              Live Speed:
                            </span>
                            <strong className="font-bold">{speed.toFixed(1)} km/h</strong>
                          </div>
                        )}
                      </div>

                      {/* Card Action Footer */}
                      <div className="flex items-center justify-between pt-3 border-t border-slate-100 text-xs">
                        <span className="text-slate-500 font-medium text-[11px]">
                          {bus.stops.length} stops along route
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/student/track/${bus.bus_id}`);
                          }}
                          className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-900 hover:bg-indigo-600 text-white font-bold rounded-xl transition-all shadow-xs text-xs cursor-pointer"
                        >
                          <span>Track Bus Live</span>
                          <ArrowRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
