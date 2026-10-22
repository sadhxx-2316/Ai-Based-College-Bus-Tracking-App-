import React, { useState, useEffect } from 'react';
import { adminApi, AdminDashboardData } from '../../api/admin';
import { User } from '../../types';
import { Badge } from '../../components/Badge';
import { EmptyState } from '../../components/EmptyState';
import { useWebSocket } from '../../context/WebSocketContext';
import {
  ShieldCheck,
  Users,
  Bus as BusIcon,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Building2,
  Mail,
  Phone,
  Clock,
  IdCard,
  UserCheck,
  Radio,
  FileCheck2,
  Compass,
  ArrowRight
} from 'lucide-react';

export const AdminDashboard: React.FC = () => {
  const [metrics, setMetrics] = useState<AdminDashboardData | null>(null);
  const [managers, setManagers] = useState<User[]>([]);
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending_review' | 'active' | 'rejected'>('pending_review');
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);

  // Review modal state
  const [selectedManager, setSelectedManager] = useState<User | null>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewNotes, setReviewNotes] = useState('');
  const [showReviewModal, setShowReviewModal] = useState(false);

  // Alerts & notifications
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { addListener } = useWebSocket();

  const loadData = async () => {
    try {
      setLoading(true);
      setErrorMessage(null);
      const [dash, mgrs] = await Promise.all([
        adminApi.getDashboard(),
        adminApi.listManagers(),
      ]);
      setMetrics(dash);
      setManagers(mgrs);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to load administrator telemetry.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Listen for live manager applications
    const cleanup = addListener('manager_application.submitted', () => {
      loadData();
    });

    return cleanup;
  }, [addListener]);

  const openReviewModal = (manager: User, action: 'approve' | 'reject') => {
    setSelectedManager(manager);
    setReviewAction(action);
    setReviewNotes(action === 'approve' ? 'Approved by College System Administrator' : 'Application does not meet institutional requirements');
    setShowReviewModal(true);
  };

  const handleConfirmReview = async () => {
    if (!selectedManager) return;
    try {
      setProcessingId(selectedManager.id);
      if (reviewAction === 'approve') {
        await adminApi.approveManager(selectedManager.id, reviewNotes);
        setSuccessMessage(`Transport Manager "${selectedManager.name}" has been approved and activated.`);
      } else {
        await adminApi.rejectManager(selectedManager.id, reviewNotes);
        setSuccessMessage(`Transport Manager "${selectedManager.name}" application was rejected.`);
      }
      setShowReviewModal(false);
      setSelectedManager(null);
      await loadData();
    } catch (err: any) {
      setErrorMessage(err.message || `Failed to ${reviewAction} manager.`);
    } finally {
      setProcessingId(null);
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  };

  const filteredManagers = managers.filter((m) => {
    const matchesStatus =
      filterStatus === 'all' ? true : m.account_status === filterStatus;
    const matchesSearch =
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (m.employee_id && m.employee_id.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (m.department && m.department.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesStatus && matchesSearch;
  });

  const pendingCount = managers.filter((m) => m.account_status === 'pending_review').length;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl">
              <ShieldCheck className="w-6 h-6" />
            </span>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">Super Admin Governance</h1>
            <Badge variant="info">SYSTEM ROOT</Badge>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Authorize College Transport Managers, verify operational roles, and monitor full-campus transit telemetry.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadData}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors shadow-xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
            Refresh Data
          </button>
        </div>
      </div>

      {/* Action Banners */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl flex items-center gap-3 text-xs font-medium">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-2xl flex items-center gap-3 text-xs font-medium">
          <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {pendingCount > 0 && (
        <div className="p-4 bg-amber-50 border border-amber-300 text-amber-900 rounded-2xl flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="p-2 bg-amber-100 rounded-xl text-amber-700">
              <AlertCircle className="w-5 h-5" />
            </span>
            <div>
              <div className="text-xs font-bold uppercase tracking-wider text-amber-800">Verification Pending</div>
              <div className="text-sm font-semibold">
                {pendingCount} Transport Manager {pendingCount === 1 ? 'account is' : 'accounts are'} awaiting institutional verification.
              </div>
            </div>
          </div>
          <button
            onClick={() => setFilterStatus('pending_review')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-xl transition-colors shrink-0 shadow-xs"
          >
            Review Now
          </button>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Students */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Students</span>
            <Users className="w-4 h-4 text-sky-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">
              {metrics ? metrics.students_count : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Instant Active Access</div>
          </div>
        </div>

        {/* Transport Managers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Managers</span>
            <Building2 className="w-4 h-4 text-indigo-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">
              {metrics ? metrics.managers_count : '—'}
            </div>
            <div className="text-[11px] text-amber-600 font-semibold mt-0.5">
              {metrics?.pending_managers || 0} Pending Verification
            </div>
          </div>
        </div>

        {/* Bus Drivers */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Drivers</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">
              {metrics ? metrics.drivers_count : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              {metrics?.pending_drivers || 0} Awaiting Manager Review
            </div>
          </div>
        </div>

        {/* Total Buses */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Registered Buses</span>
            <BusIcon className="w-4 h-4 text-amber-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">
              {metrics ? metrics.total_buses : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">Campus Fleet</div>
          </div>
        </div>

        {/* Trip Records */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs flex flex-col justify-between col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-semibold">Recorded Trips</span>
            <Radio className="w-4 h-4 text-rose-600" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-black text-slate-900">
              {metrics ? metrics.total_trips : '—'}
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">All-time Logged</div>
          </div>
        </div>
      </div>

      {/* Role Verification Hierarchy Guide */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white p-6 rounded-3xl shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-5 h-5 text-indigo-400" />
          <h2 className="text-sm font-bold uppercase tracking-wider text-indigo-200">
            Campus Verification & Authorization Hierarchy
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
            <div className="font-bold text-amber-400 flex items-center gap-1.5 mb-1">
              <ShieldCheck className="w-4 h-4" /> 1. Super Admin
            </div>
            <div className="text-slate-300">
              Reviews & approves Transport Managers. Retains authoritative system oversight.
            </div>
          </div>
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
            <div className="font-bold text-indigo-300 flex items-center gap-1.5 mb-1">
              <Building2 className="w-4 h-4" /> 2. Transport Manager
            </div>
            <div className="text-slate-300">
              Verifies Drivers, creates routes/stops, assigns buses, and trains ETA prediction models.
            </div>
          </div>
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
            <div className="font-bold text-emerald-400 flex items-center gap-1.5 mb-1">
              <UserCheck className="w-4 h-4" /> 3. Bus Driver
            </div>
            <div className="text-slate-300">
              Accepts assignments, GPS-verifies arrival at route start, and broadcasts live trip coordinates.
            </div>
          </div>
          <div className="p-3 bg-white/5 border border-white/10 rounded-2xl">
            <div className="font-bold text-sky-300 flex items-center gap-1.5 mb-1">
              <Users className="w-4 h-4" /> 4. College Students
            </div>
            <div className="text-slate-300">
              Instantly view active buses, road geometries, accurate stop ETAs, and real-time transit alerts.
            </div>
          </div>
        </div>
      </div>

      {/* Transport Managers Management Section */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Controls bar */}
        <div className="p-5 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilterStatus('pending_review')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                filterStatus === 'pending_review'
                  ? 'bg-amber-100 text-amber-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Pending Approval ({pendingCount})
            </button>
            <button
              onClick={() => setFilterStatus('active')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                filterStatus === 'active'
                  ? 'bg-emerald-100 text-emerald-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Active Managers
            </button>
            <button
              onClick={() => setFilterStatus('all')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                filterStatus === 'all'
                  ? 'bg-indigo-100 text-indigo-900'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Records ({managers.length})
            </button>
          </div>

          <div className="w-full md:w-72">
            <input
              type="text"
              placeholder="Search by name, email, employee ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3.5 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Managers List */}
        {filteredManagers.length === 0 ? (
          <div className="p-10">
            <EmptyState
              title={
                filterStatus === 'pending_review'
                  ? 'No Pending Manager Applications'
                  : 'No Managers Found'
              }
              description={
                filterStatus === 'pending_review'
                  ? 'All Transport Manager accounts have been reviewed and approved.'
                  : 'No manager records match your active search filter.'
              }
              icon={<Building2 className="w-10 h-10 text-slate-300" />}
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredManagers.map((m) => (
              <div
                key={m.id}
                className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm text-slate-900">{m.name}</span>
                    <Badge
                      variant={
                        m.account_status === 'active'
                          ? 'success'
                          : m.account_status === 'pending_review'
                          ? 'warning'
                          : 'danger'
                      }
                    >
                      {m.account_status.toUpperCase()}
                    </Badge>
                    {m.employee_id && (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-mono">
                        <IdCard className="w-3 h-3" /> Emp ID: {m.employee_id}
                      </span>
                    )}
                    {m.department && (
                      <span className="inline-flex items-center gap-1 text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md">
                        <Building2 className="w-3 h-3" /> {m.department}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      {m.email}
                    </span>
                    {m.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5 text-slate-400" />
                        {m.phone}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      Registered: {new Date(m.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {m.account_status === 'pending_review' ? (
                    <>
                      <button
                        onClick={() => openReviewModal(m, 'approve')}
                        disabled={processingId === m.id}
                        className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors shadow-xs flex items-center gap-1.5"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => openReviewModal(m, 'reject')}
                        disabled={processingId === m.id}
                        className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </>
                  ) : m.account_status === 'active' ? (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-medium">
                      <CheckCircle2 className="w-4 h-4" /> Operational
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-medium">
                      <XCircle className="w-4 h-4" /> Not Authorized
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review Confirmation Modal */}
      {showReviewModal && selectedManager && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-5 animate-in fade-in zoom-in-95">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className={`p-2 rounded-xl ${
                    reviewAction === 'approve'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-rose-100 text-rose-700'
                  }`}
                >
                  {reviewAction === 'approve' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                </span>
                <h3 className="text-base font-bold text-slate-900">
                  {reviewAction === 'approve' ? 'Approve Transport Manager' : 'Reject Application'}
                </h3>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                {reviewAction === 'approve'
                  ? `Granting approval to ${selectedManager.name} (${selectedManager.email}) will unlock full route, fleet, and driver assignment permissions.`
                  : `Rejecting ${selectedManager.name} will prevent this account from accessing transport management features.`}
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Review Decision Notes
              </label>
              <textarea
                rows={3}
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Institutional note or reason for decision..."
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowReviewModal(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReview}
                disabled={processingId !== null}
                className={`px-4 py-2 text-xs font-bold text-white rounded-xl transition-colors shadow-xs ${
                  reviewAction === 'approve'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-rose-600 hover:bg-rose-700'
                }`}
              >
                {processingId !== null
                  ? 'Saving...'
                  : reviewAction === 'approve'
                  ? 'Confirm Approval'
                  : 'Confirm Rejection'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
