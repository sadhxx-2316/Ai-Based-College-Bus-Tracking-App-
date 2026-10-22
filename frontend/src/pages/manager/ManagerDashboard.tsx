import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  DashboardMetrics,
  Bus,
  Route,
  Stop,
  Assignment,
  DriverApplication
} from '../../types';
import { managerApi } from '../../api/manager';
import { busesApi, stopsApi } from '../../api/buses';
import { routesApi, RoutePreviewResponse } from '../../api/routes';
import { assignmentsApi } from '../../api/assignments';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { useWebSocket } from '../../context/WebSocketContext';
import {
  Shield,
  Bus as BusIcon,
  MapPin,
  Calendar,
  Users,
  Plus,
  RefreshCw,
  Check,
  X,
  ChevronUp,
  ChevronDown,
  Trash2,
  CheckCircle2,
  Navigation,
  ArrowRight,
  Search
} from 'lucide-react';

export const ManagerDashboard: React.FC = () => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'overview' | 'buses' | 'routes' | 'assignments' | 'drivers'>('overview');
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [buses, setBuses] = useState<Bus[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [driverApps, setDriverApps] = useState<DriverApplication[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states for modals
  const [showAddBusModal, setShowAddBusModal] = useState(false);
  const [newBusNumber, setNewBusNumber] = useState('');
  const [newBusReg, setNewBusReg] = useState('');
  const [newBusCap, setNewBusCap] = useState(45);

  // Database Stops & Route Builder state
  const [dbStops, setDbStops] = useState<Stop[]>([]);
  const [newRouteName, setNewRouteName] = useState('');
  const [newRouteDesc, setNewRouteDesc] = useState('');
  const [targetBusId, setTargetBusId] = useState('');
  const [builderStops, setBuilderStops] = useState<Stop[]>([]);
  const [stopNameInput, setStopNameInput] = useState('');
  const [stopAddressInput, setStopAddressInput] = useState('');
  const [stopLatInput, setStopLatInput] = useState('');
  const [stopLonInput, setStopLonInput] = useState('');
  const [stopFilterQuery, setStopFilterQuery] = useState('');
  const [stopSuccessMsg, setStopSuccessMsg] = useState<string | null>(null);
  const [previewRoute, setPreviewRoute] = useState<RoutePreviewResponse | null>(null);
  const [routePreviewing, setRoutePreviewing] = useState(false);

  // Assignment form state
  const [assignBusId, setAssignBusId] = useState('');
  const [assignDriverId, setAssignDriverId] = useState('');
  const [assignRouteId, setAssignRouteId] = useState('');
  const [assignDate, setAssignDate] = useState(new Date().toISOString().split('T')[0]);
  const [assignTime, setAssignTime] = useState('08:30');

  const { addListener } = useWebSocket();

  // Load all operational data
  const loadData = async () => {
    try {
      setLoading(true);
      const [m, b, r, asgn, apps, allStops] = await Promise.all([
        managerApi.getDashboardMetrics(),
        busesApi.listBuses(),
        routesApi.listRoutes(),
        assignmentsApi.listAssignments(),
        managerApi.listDriverApplications(),
        stopsApi.listStops(),
      ]);
      setMetrics(m);
      setBuses(b);
      setRoutes(r);
      setAssignments(asgn);
      setDriverApps(apps);
      setDbStops(allStops);

      if (b.length > 0 && !assignBusId) setAssignBusId(b[0].id);
      if (b.length > 0 && !targetBusId) setTargetBusId(b[0].id);
      if (r.length > 0 && !assignRouteId) setAssignRouteId(r[0].id);
    } catch (err) {
      console.warn('Error loading manager dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Check if coming back from Google Map Stop Selector
    const justAdded = sessionStorage.getItem('just_added_stop_name');
    if (justAdded) {
      setStopSuccessMsg(`Stop "${justAdded}" was created via Google Map and saved to database!`);
      sessionStorage.removeItem('just_added_stop_name');
      setActiveTab('routes');
    }

    const pickedLat = sessionStorage.getItem('picked_lat');
    const pickedLng = sessionStorage.getItem('picked_lng');
    const pickedName = sessionStorage.getItem('picked_name');
    const pickedAddr = sessionStorage.getItem('picked_address');

    if (pickedLat && pickedLng) {
      setStopLatInput(pickedLat);
      setStopLonInput(pickedLng);
      if (pickedName) setStopNameInput(pickedName);
      if (pickedAddr) setStopAddressInput(pickedAddr);
      setStopSuccessMsg(`Coordinates captured from Google Map: Lat ${parseFloat(pickedLat).toFixed(4)}, Lng ${parseFloat(pickedLng).toFixed(4)}`);
      sessionStorage.removeItem('picked_lat');
      sessionStorage.removeItem('picked_lng');
      sessionStorage.removeItem('picked_name');
      sessionStorage.removeItem('picked_address');
      setActiveTab('routes');
    }

    // Listen to real-time events
    const unsub = addListener('*', () => {
      // Refresh metrics on any fleet event
      managerApi.getDashboardMetrics().then(setMetrics).catch(() => null);
    });

    return () => unsub();
  }, [addListener]);

  // Handlers for Bus CRUD
  const handleCreateBus = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await busesApi.createBus({
        bus_number: newBusNumber,
        registration_number: newBusReg || undefined,
        capacity: Number(newBusCap),
      });
      setShowAddBusModal(false);
      setNewBusNumber('');
      setNewBusReg('');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error creating bus');
    }
  };

  const handleToggleBusStatus = async (bus: Bus) => {
    const nextStatus = bus.operational_status === 'active' ? 'maintenance' : 'active';
    try {
      await busesApi.updateStatus(bus.id, nextStatus);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error updating bus status');
    }
  };

  // Handlers for Stop & Route Architect
  const handleSaveStopToDB = async () => {
    if (!stopNameInput.trim() || !stopLatInput || !stopLonInput) {
      alert('Please provide stop name and click on the map to set coordinates.');
      return;
    }
    const lat = parseFloat(stopLatInput);
    const lon = parseFloat(stopLonInput);
    if (isNaN(lat) || isNaN(lon)) {
      alert('Invalid latitude or longitude numbers');
      return;
    }

    try {
      const stop = await stopsApi.createStop({
        name: stopNameInput.trim(),
        latitude: lat,
        longitude: lon,
        address: stopAddressInput.trim() || undefined,
      });
      setDbStops((prev) => [...prev, stop]);
      setStopSuccessMsg(`Stop "${stop.name}" saved to database! Available for routes and student boarding selection.`);
      setStopNameInput('');
      setStopAddressInput('');
      setStopLatInput('');
      setStopLonInput('');
      setTimeout(() => setStopSuccessMsg(null), 5000);
    } catch (err: any) {
      alert(err.message || 'Error saving stop to database');
    }
  };

  const handleDeleteStop = async (stopId: string, stopName: string) => {
    if (!window.confirm(`Are you sure you want to delete stop "${stopName}" from database? This cannot be undone.`)) {
      return;
    }
    try {
      await stopsApi.deleteStop(stopId);
      setDbStops((prev) => prev.filter((s) => s.id !== stopId));
      setBuilderStops((prev) => prev.filter((s) => s.id !== stopId));
      alert(`Stop "${stopName}" deleted successfully from database.`);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error deleting stop');
    }
  };

  const handleAddStopToRoute = (stop: Stop) => {
    setBuilderStops((prev) => [...prev, stop]);
    setPreviewRoute(null);
  };

  const handleMoveStop = (index: number, direction: 'up' | 'down') => {
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= builderStops.length) return;
    const copy = [...builderStops];
    const [moved] = copy.splice(index, 1);
    copy.splice(target, 0, moved);
    setBuilderStops(copy);
    setPreviewRoute(null);
  };

  const handleRemoveStop = (index: number) => {
    setBuilderStops((prev) => prev.filter((_, i) => i !== index));
    setPreviewRoute(null);
  };

  const handlePreviewRoadRoute = async () => {
    if (builderStops.length < 2) {
      alert('At least 2 stops are required to calculate a road route');
      return;
    }
    setRoutePreviewing(true);
    try {
      const res = await routesApi.previewRoute(builderStops.map((s) => s.id));
      setPreviewRoute(res);
    } catch (err: any) {
      alert(err.message || 'Error calculating road route');
    } finally {
      setRoutePreviewing(false);
    }
  };

  const handleSaveRoute = async () => {
    if (!newRouteName.trim() || builderStops.length < 2) {
      alert('Please provide route name and at least 2 stops.');
      return;
    }
    try {
      const created = await routesApi.createRoute({
        route_name: newRouteName,
        description: newRouteDesc,
        ordered_stop_ids: builderStops.map((s) => s.id),
        route_geometry: previewRoute?.route_geometry,
        distance_meters: previewRoute?.distance_meters,
        estimated_travel_seconds: previewRoute?.estimated_travel_seconds,
      });
      alert('Route successfully saved to MongoDB database.');
      const savedName = newRouteName;
      setNewRouteName('');
      setNewRouteDesc('');
      setBuilderStops([]);
      setPreviewRoute(null);
      await loadData();
      if (created && created.id) {
        setAssignRouteId(created.id);
        if (targetBusId) {
          setAssignBusId(targetBusId);
        }
        if (window.confirm(`Route "${savedName}" saved! Would you like to assign a driver and bus to this route now?`)) {
          setActiveTab('assignments');
        }
      }
    } catch (err: any) {
      alert(err.message || 'Failed to save route');
    }
  };

  const handleDeleteRoute = async (routeId: string, routeName: string) => {
    if (!window.confirm(`Are you sure you want to delete route "${routeName}" from database? This cannot be undone.`)) {
      return;
    }
    try {
      await routesApi.deleteRoute(routeId);
      setRoutes((prev) => prev.filter((r) => r.id !== routeId));
      alert(`Route "${routeName}" deleted successfully from database.`);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error deleting route');
    }
  };

  // Handlers for Assignments
  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignBusId || !assignDriverId || !assignRouteId) {
      alert('Please select Bus, Driver, and Route.');
      return;
    }
    try {
      await assignmentsApi.createAssignment({
        bus_id: assignBusId,
        driver_id: assignDriverId,
        route_id: assignRouteId,
        service_date: assignDate,
        scheduled_departure: assignTime,
      });
      alert('Assignment created successfully and notified to driver.');
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Error creating assignment');
    }
  };

  // Handlers for Driver Applications
  const handleApproveDriver = async (appId: string) => {
    const notes = prompt('Enter review notes (optional):') || undefined;
    try {
      await managerApi.approveDriverApplication(appId, notes);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to approve driver');
    }
  };

  const handleRejectDriver = async (appId: string) => {
    const notes = prompt('Enter rejection reason:') || undefined;
    try {
      await managerApi.rejectDriverApplication(appId, notes);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to reject driver');
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* Manager Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded-full">
            College Transport Manager
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">Fleet Operations Console</h1>
        </div>

        <button
          onClick={loadData}
          className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-purple-600' : ''}`} />
          Refresh Fleet Data
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto gap-2 pb-1 border-b border-slate-200">
        {[
          { id: 'overview', label: 'Overview', icon: <Shield className="w-4 h-4" /> },
          { id: 'buses', label: 'Buses', icon: <BusIcon className="w-4 h-4" /> },
          { id: 'routes', label: 'Route Builder', icon: <MapPin className="w-4 h-4" /> },
          { id: 'assignments', label: 'Assignments', icon: <Calendar className="w-4 h-4" /> },
          { id: 'drivers', label: 'Drivers', icon: <Users className="w-4 h-4" /> },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
              activeTab === tab.id
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Pending Driver Alert Banner */}
          {driverApps.filter((d) => d.application_status === 'pending').length > 0 && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-amber-900 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 rounded-xl text-amber-700">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-xs font-bold">Action Required: Driver Review</h4>
                  <p className="text-xs text-amber-800">
                    {driverApps.filter((d) => d.application_status === 'pending').length} driver application(s) pending approval. Drivers cannot sign in or operate trips until approved.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('drivers')}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors self-start sm:self-auto shadow-xs whitespace-nowrap"
              >
                Review Applications
              </button>
            </div>
          )}

          {/* Summary Metric Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-400 font-medium">Total Registered Buses</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{buses.length}</div>
              <span className="text-[11px] text-emerald-600 font-medium">
                {buses.filter((b) => b.operational_status === 'active').length} active in fleet
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-400 font-medium">College Routes</span>
              <div className="text-2xl font-extrabold text-indigo-600 mt-1">{routes.length}</div>
              <span className="text-[11px] text-slate-500">{dbStops.length} official stops in DB</span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-400 font-medium">Approved Drivers</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">
                {driverApps.filter((d) => d.application_status === 'approved').length}
              </div>
              <span className="text-[11px] text-amber-600 font-medium">
                {driverApps.filter((d) => d.application_status === 'pending').length} pending review
              </span>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs text-slate-400 font-medium">Scheduled Assignments</span>
              <div className="text-2xl font-extrabold text-slate-900 mt-1">{assignments.length}</div>
              <span className="text-[11px] text-slate-500">
                {assignments.filter((a) => a.assignment_status === 'accepted').length} confirmed
              </span>
            </div>
          </div>

          {/* Operational Quick Management Hub */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div
              onClick={() => setActiveTab('buses')}
              className="p-5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer transition-all hover:shadow-xs group"
            >
              <div className="p-2.5 bg-indigo-50 text-indigo-600 rounded-xl w-fit group-hover:scale-110 transition-transform">
                <BusIcon className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">Manage Buses</h4>
              <p className="text-xs text-slate-500 mt-1">
                Register new college buses, set capacity and maintenance status.
              </p>
              <div className="mt-3 text-xs font-bold text-indigo-600 flex items-center gap-1">
                View Buses <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => setActiveTab('routes')}
              className="p-5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer transition-all hover:shadow-xs group"
            >
              <div className="p-2.5 bg-purple-50 text-purple-600 rounded-xl w-fit group-hover:scale-110 transition-transform">
                <MapPin className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">Route Builder</h4>
              <p className="text-xs text-slate-500 mt-1">
                Pick stops on Google Map, reorder stops, and generate road-following routes.
              </p>
              <div className="mt-3 text-xs font-bold text-purple-600 flex items-center gap-1">
                Build Route <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => setActiveTab('drivers')}
              className="p-5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer transition-all hover:shadow-xs group"
            >
              <div className="p-2.5 bg-amber-50 text-amber-600 rounded-xl w-fit group-hover:scale-110 transition-transform">
                <Users className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">Drivers Section</h4>
              <p className="text-xs text-slate-500 mt-1">
                Approve pending driver applications and manage approved roster.
              </p>
              <div className="mt-3 text-xs font-bold text-amber-600 flex items-center gap-1">
                Review Drivers <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => setActiveTab('assignments')}
              className="p-5 bg-white hover:bg-slate-50 border border-slate-200 rounded-2xl cursor-pointer transition-all hover:shadow-xs group"
            >
              <div className="p-2.5 bg-emerald-50 text-emerald-600 rounded-xl w-fit group-hover:scale-110 transition-transform">
                <Calendar className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-slate-900 mt-3">Assign Trips</h4>
              <p className="text-xs text-slate-500 mt-1">
                Allocate approved drivers to routes and buses for scheduled service.
              </p>
              <div className="mt-3 text-xs font-bold text-emerald-600 flex items-center gap-1">
                Create Assignment <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: BUSES */}
      {activeTab === 'buses' && (
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">College Fleet Buses</h3>
            <button
              onClick={() => setShowAddBusModal(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 text-white rounded-xl text-xs font-semibold hover:bg-indigo-700 transition-colors shadow-xs"
            >
              <Plus className="w-4 h-4" />
              Add Bus
            </button>
          </div>

          {buses.length === 0 ? (
            <EmptyState
              title="No buses registered yet"
              description="Register your college's first bus using the Add Bus button above."
              icon={<BusIcon className="w-8 h-8 text-slate-400" />}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-400 uppercase tracking-wider font-semibold">
                    <th className="py-3 px-3">Bus Number</th>
                    <th className="py-3 px-3">Registration</th>
                    <th className="py-3 px-3">Capacity</th>
                    <th className="py-3 px-3">Status</th>
                    <th className="py-3 px-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {buses.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3 px-3 font-bold text-slate-900">{b.bus_number}</td>
                      <td className="py-3 px-3 text-slate-600">{b.registration_number || 'N/A'}</td>
                      <td className="py-3 px-3 text-slate-600">{b.capacity} seats</td>
                      <td className="py-3 px-3">
                        <Badge variant={b.operational_status === 'active' ? 'success' : 'warning'}>
                          {b.operational_status.toUpperCase()}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 text-right">
                        <button
                          onClick={() => handleToggleBusStatus(b)}
                          className="px-2.5 py-1 text-[11px] font-semibold border border-slate-300 rounded-lg hover:bg-slate-100 transition-colors"
                        >
                          {b.operational_status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Add Bus Modal */}
          {showAddBusModal && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
              <form onSubmit={handleCreateBus} className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4">
                <h3 className="text-base font-bold text-slate-900">Add New College Bus</h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bus Number / Designation</label>
                  <input
                    type="text"
                    required
                    value={newBusNumber}
                    onChange={(e) => setNewBusNumber(e.target.value)}
                    placeholder="e.g. BUS-04"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Vehicle License / Reg Plate</label>
                  <input
                    type="text"
                    value={newBusReg}
                    onChange={(e) => setNewBusReg(e.target.value)}
                    placeholder="e.g. KA-01-F-2026"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Seating Capacity</label>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    required
                    value={newBusCap}
                    onChange={(e) => setNewBusCap(Number(e.target.value))}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowAddBusModal(false)}
                    className="flex-1 py-2 text-xs font-semibold text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 shadow-xs"
                  >
                    Save Bus
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: STOPS & ROUTE ARCHITECT */}
      {activeTab === 'routes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* COLUMN 1: STOPS MANAGEMENT */}
            <div className="space-y-6">
              {/* SUB-SECTION 1: CREATE STOPS USING GOOGLE MAP */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-indigo-600" />
                      1. Create Stop Using Interactive Map
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Touch the button below to open the map in full screen on the next page, search places (e.g. Madurai, Tambaram), and capture coordinates.
                    </p>
                  </div>
                  <span className="text-[11px] bg-indigo-50 text-indigo-700 font-bold px-2.5 py-1 rounded-full border border-indigo-100">
                    {dbStops.length} Saved in DB
                  </span>
                </div>

                {stopSuccessMsg && (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    <span>{stopSuccessMsg}</span>
                  </div>
                )}

                {/* Next Page Map Button */}
                <div className="p-4 bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 rounded-xl border border-indigo-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-xs">
                  <div>
                    <div className="font-bold text-xs text-indigo-950 flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-indigo-600" />
                      Dedicated Interactive Map Stop Selector
                    </div>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      Opens high-resolution map to search places, browse routes, and click to capture latitude & longitude.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate('/manager/create-stop-map')}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <span>🗺️ Open Map in Next Page to Pick Stop</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-3 pt-1">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Stop Name</label>
                    <input
                      type="text"
                      value={stopNameInput}
                      onChange={(e) => setStopNameInput(e.target.value)}
                      placeholder="e.g. Mepco Schlenk College Main Gate / Sivakasi Bus Stand"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Address / Landmark (Optional)</label>
                    <input
                      type="text"
                      value={stopAddressInput}
                      onChange={(e) => setStopAddressInput(e.target.value)}
                      placeholder="e.g. Mepco Nagar, Sivakasi-Virudhunagar Highway (SH-42)"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Latitude</label>
                      <input
                        type="number"
                        step="any"
                        value={stopLatInput}
                        onChange={(e) => setStopLatInput(e.target.value)}
                        placeholder="Captured from map"
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Longitude</label>
                      <input
                        type="number"
                        step="any"
                        value={stopLonInput}
                        onChange={(e) => setStopLonInput(e.target.value)}
                        placeholder="Captured from map"
                        className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono"
                      />
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={handleSaveStopToDB}
                    className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    Save Stop to Database (Available for Routes & Students)
                  </button>
                </div>
              </div>

              {/* SUB-SECTION 2: AVAILABLE DATABASE STOPS */}
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-emerald-600" />
                      Available Database Stops ({dbStops.length})
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Stops available for routes and student boarding selection.
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    Delete or add to route sequence
                  </span>
                </div>

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Filter stops by name or address..."
                    value={stopFilterQuery}
                    onChange={(e) => setStopFilterQuery(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs"
                  />
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>

                <div className="max-h-72 overflow-y-auto space-y-1.5 pr-1">
                  {dbStops.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl">
                      No stops saved yet. Click "Open Google Map in Next Page" above to pick and save stops.
                    </div>
                  ) : (
                    dbStops
                      .filter((s) => s.name.toLowerCase().includes(stopFilterQuery.toLowerCase()) || (s.address && s.address.toLowerCase().includes(stopFilterQuery.toLowerCase())))
                      .map((stop) => (
                        <div
                          key={stop.id}
                          className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-slate-300 transition-colors"
                        >
                          <div className="truncate pr-2">
                            <span className="font-bold text-slate-900">{stop.name}</span>
                            {stop.address && <span className="text-[10px] text-slate-500 block truncate">{stop.address}</span>}
                            <span className="text-[10px] text-slate-400 font-mono">
                              {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleAddStopToRoute(stop)}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-[11px] shrink-0 transition-colors"
                            >
                              + Add to Route
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteStop(stop.id, stop.name)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                              title={`Delete stop "${stop.name}" from database`}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              </div>
            </div>

            {/* COLUMN 2: BUILD ROUTE FOR A BUS USING DATABASE STOPS */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <BusIcon className="w-4 h-4 text-indigo-600" />
                  2. Build Route for a Bus Using Database Stops
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Select a college bus and connect saved database stops into an ordered road route.
                </p>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Assign to College Bus</label>
                  <select
                    value={targetBusId}
                    onChange={(e) => setTargetBusId(e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  >
                    {buses.length === 0 ? (
                      <option value="">No buses registered yet</option>
                    ) : (
                      buses.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.bus_number} ({b.capacity} seats) - {b.registration_number || 'No plate'} [{b.operational_status}]
                        </option>
                      ))
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Route Name</label>
                  <input
                    type="text"
                    value={newRouteName}
                    onChange={(e) => setNewRouteName(e.target.value)}
                    placeholder="e.g. Route 10A: Tambaram to College Campus"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Description (Optional)</label>
                  <input
                    type="text"
                    value={newRouteDesc}
                    onChange={(e) => setNewRouteDesc(e.target.value)}
                    placeholder="e.g. Morning express corridor via GST Road"
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                  />
                </div>

                {/* Ordered Route Sequence */}
                <div className="border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700">
                      Ordered Stops Sequence ({builderStops.length})
                    </span>
                    {builderStops.length >= 2 && (
                      <button
                        type="button"
                        onClick={handlePreviewRoadRoute}
                        disabled={routePreviewing}
                        className="text-xs text-indigo-600 font-bold hover:underline"
                      >
                        {routePreviewing ? 'Calculating...' : 'Preview Road Route & Travel Time'}
                      </button>
                    )}
                  </div>

                  {previewRoute && (
                    <div className="text-xs text-indigo-700 bg-indigo-50 p-2.5 rounded-xl border border-indigo-200 flex items-center justify-between">
                      <span>Distance: <strong>{(previewRoute.distance_meters / 1000).toFixed(2)} km</strong></span>
                      <span>Est. Travel Time: <strong>{Math.round(previewRoute.estimated_travel_seconds / 60)} mins</strong></span>
                      <span className="text-[10px] bg-indigo-100 text-indigo-800 font-bold px-2 py-0.5 rounded-md">
                        Road Geometry Ready
                      </span>
                    </div>
                  )}

                  {builderStops.length === 0 ? (
                    <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl">
                      Add at least 2 stops from the Available Database Stops on the left (Origin & Destination)
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                      {builderStops.map((stop, i) => (
                        <div key={stop.id + i} className="p-2 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                          <div className="flex items-center gap-2 truncate">
                            <span className="w-5 h-5 bg-indigo-600 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">
                              {i + 1}
                            </span>
                            <span className="truncate font-medium text-slate-800">{stop.name}</span>
                            {i === 0 && <span className="text-[9px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded-sm">Origin</span>}
                            {i === builderStops.length - 1 && <span className="text-[9px] bg-rose-100 text-rose-800 font-bold px-1.5 py-0.5 rounded-sm">Destination</span>}
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button onClick={() => handleMoveStop(i, 'up')} disabled={i === 0} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20">
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleMoveStop(i, 'down')} disabled={i === builderStops.length - 1} className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20">
                              <ChevronDown className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleRemoveStop(i)} className="p-1 text-slate-400 hover:text-rose-600">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleSaveRoute}
                  disabled={builderStops.length < 2 || !newRouteName.trim()}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs disabled:opacity-40 cursor-pointer"
                >
                  Save & Publish Route to Database
                </button>
              </div>
            </div>
          </div>

          {/* SUB-SECTION 3: APPROVED COLLEGE ROUTES & 1-CLICK ASSIGNMENT & DELETE */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Navigation className="w-4 h-4 text-indigo-600" />
                  Approved College Routes ({routes.length})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Official college routes created with road geometry and stops. Assign directly to buses and drivers, or delete obsolete routes.
                </p>
              </div>
              <span className="text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                {routes.length} Active Routes
              </span>
            </div>

            {routes.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-400 bg-slate-50 rounded-xl">
                No approved routes created yet. Build a route using stops above.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {routes.map((r) => (
                  <div key={r.id} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl space-y-2.5 flex flex-col justify-between">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-bold text-slate-900 text-sm">{r.route_name}</div>
                        <Badge variant={r.route_status === 'active' ? 'success' : 'neutral'}>
                          {r.route_status?.toUpperCase() || 'ACTIVE'}
                        </Badge>
                      </div>
                      {r.description && <div className="text-xs text-slate-500 line-clamp-2">{r.description}</div>}

                      <div className="text-[11px] text-slate-600 flex items-center gap-3">
                        <span>Stops: <strong>{r.stops?.length ?? 0}</strong></span>
                        {r.distance_meters && (
                          <span>Distance: <strong>{(r.distance_meters / 1000).toFixed(1)} km</strong></span>
                        )}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => handleDeleteRoute(r.id, r.route_name)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-lg text-xs border border-rose-200 transition-colors cursor-pointer"
                        title={`Delete route "${r.route_name}" from database`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setAssignRouteId(r.id);
                          setActiveTab('assignments');
                        }}
                        className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-colors shadow-2xs cursor-pointer"
                      >
                        <span>Assign to Bus & Driver</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: ASSIGNMENTS */}
      {activeTab === 'assignments' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <form onSubmit={handleCreateAssignment} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-base font-bold text-slate-900">Create Driver Assignment</h3>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Bus</label>
              <select
                value={assignBusId}
                onChange={(e) => setAssignBusId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
              >
                {buses.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.bus_number} ({b.capacity} seats - {b.operational_status})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Approved Driver</label>
              <select
                value={assignDriverId}
                onChange={(e) => setAssignDriverId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
              >
                <option value="">-- Choose Driver --</option>
                {driverApps.filter((d) => d.application_status === 'approved').map((d) => (
                  <option key={d.user_id} value={d.user_id}>
                    {d.user_name || d.user_email} (Exp: {d.years_of_experience} yrs)
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Select Route</label>
              <select
                value={assignRouteId}
                onChange={(e) => setAssignRouteId(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
              >
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.route_name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Service Date</label>
                <input
                  type="date"
                  required
                  value={assignDate}
                  onChange={(e) => setAssignDate(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Departure Time</label>
                <input
                  type="time"
                  required
                  value={assignTime}
                  onChange={(e) => setAssignTime(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
            >
              Assign Bus & Driver
            </button>
          </form>

          {/* Assignments List */}
          <div className="lg:col-span-2 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-3">
            <h3 className="text-base font-bold text-slate-900">Current Assignments</h3>
            {assignments.length === 0 ? (
              <EmptyState
                title="No Assignments Created"
                description="Use the assignment form to allocate approved drivers and buses to college routes."
                icon={<Calendar className="w-8 h-8 text-slate-400" />}
              />
            ) : (
              <div className="space-y-2">
                {assignments.map((a) => (
                  <div key={a.id} className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs">
                    <div>
                      <div className="font-bold text-slate-900">
                        {a.bus?.bus_number ? `Bus ${a.bus.bus_number}` : 'Bus'} • {a.route?.route_name || 'Route'}
                      </div>
                      <div className="text-slate-500 mt-0.5">
                        Driver: <strong>{a.driver_name}</strong> • Date: {a.service_date} at {a.scheduled_departure}
                      </div>
                    </div>
                    <Badge variant={a.assignment_status === 'accepted' ? 'success' : a.assignment_status === 'pending' ? 'warning' : 'danger'}>
                      {a.assignment_status.toUpperCase()}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: DRIVERS SECTION */}
      {activeTab === 'drivers' && (
        <div className="space-y-6">
          {/* Top Section: Pending Driver Applications */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-amber-600" />
                  Pending Driver Applications
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800">
                    {driverApps.filter((d) => d.application_status === 'pending').length}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Review new driver registrations. Drivers cannot log in or start trips until you approve their application.
                </p>
              </div>
            </div>

            {driverApps.filter((d) => d.application_status === 'pending').length === 0 ? (
              <EmptyState
                title="No Pending Driver Applications"
                description="All driver onboarding applications have been reviewed. New sign-ups will appear here."
                icon={<CheckCircle2 className="w-8 h-8 text-emerald-500" />}
              />
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {driverApps
                  .filter((d) => d.application_status === 'pending')
                  .map((app) => (
                    <div
                      key={app.id}
                      className="p-4 bg-amber-50/50 border border-amber-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-4"
                    >
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-sm text-slate-900">
                            {app.user_name || 'Driver Applicant'}
                          </span>
                          <Badge variant="warning">Awaiting Review</Badge>
                          <span className="text-[11px] text-slate-400">
                            Applied: {new Date(app.created_at).toLocaleDateString()}
                          </span>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 text-xs text-slate-600 pt-1">
                          <div>
                            <span className="text-slate-400">Email:</span>{' '}
                            <strong className="text-slate-800">{app.user_email || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Phone:</span>{' '}
                            <strong className="text-slate-800">{app.user_phone || '—'}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">License No:</span>{' '}
                            <strong className="text-indigo-700 font-mono">{app.license_number}</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Experience:</span>{' '}
                            <strong className="text-slate-800">{app.years_of_experience} Years</strong>
                          </div>
                          <div>
                            <span className="text-slate-400">Emergency Contact:</span>{' '}
                            <strong className="text-slate-800">{app.emergency_contact}</strong>
                          </div>
                          {app.notes && (
                            <div className="sm:col-span-2">
                              <span className="text-slate-400">Notes:</span>{' '}
                              <span className="italic text-slate-700">{app.notes}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-amber-200">
                        <button
                          onClick={() => handleApproveDriver(app.id)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
                        >
                          <Check className="w-4 h-4" />
                          Approve Driver
                        </button>
                        <button
                          onClick={() => handleRejectDriver(app.id)}
                          className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
                        >
                          <X className="w-4 h-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>

          {/* Bottom Section: Approved College Drivers */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Approved College Drivers
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800">
                    {driverApps.filter((d) => d.application_status === 'approved').length}
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Verified college drivers authorized to sign in, operate college buses, and accept trip assignments.
                </p>
              </div>
            </div>

            {driverApps.filter((d) => d.application_status === 'approved').length === 0 ? (
              <EmptyState
                title="No Approved Drivers Yet"
                description="Approved drivers will be listed here. You can assign them to buses and routes."
                icon={<Users className="w-8 h-8 text-slate-400" />}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {driverApps
                  .filter((d) => d.application_status === 'approved')
                  .map((driver) => (
                    <div
                      key={driver.id}
                      className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3 hover:border-slate-300 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                            {driver.user_name || driver.user_email}
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          </div>
                          <span className="text-[11px] text-slate-500 font-mono">
                            License: {driver.license_number}
                          </span>
                        </div>
                        <Badge variant="success">Verified & Active</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs text-slate-600 bg-white p-3 rounded-lg border border-slate-100">
                        <div>
                          <span className="text-slate-400">Experience:</span>{' '}
                          <strong>{driver.years_of_experience} Years</strong>
                        </div>
                        <div>
                          <span className="text-slate-400">Emergency:</span>{' '}
                          <strong>{driver.emergency_contact}</strong>
                        </div>
                        <div className="col-span-2">
                          <span className="text-slate-400">Email:</span>{' '}
                          <strong className="text-slate-800">{driver.user_email || '—'}</strong>
                        </div>
                        {driver.user_phone && (
                          <div className="col-span-2">
                            <span className="text-slate-400">Phone:</span>{' '}
                            <strong className="text-slate-800">{driver.user_phone}</strong>
                          </div>
                        )}
                      </div>

                      <div className="pt-1 flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">
                          {driver.reviewed_at
                            ? `Approved on ${new Date(driver.reviewed_at).toLocaleDateString()}`
                            : 'Approved'}
                        </span>
                        <button
                          onClick={() => {
                            setAssignDriverId(driver.user_id);
                            setActiveTab('assignments');
                          }}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition-colors"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          Assign to Bus & Route
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
