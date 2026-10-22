import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Bus,
  Shield,
  User,
  Car,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  CheckCircle2,
  Lock,
  Mail,
  Phone,
  FileBadge,
  Clock,
  Briefcase,
  KeyRound,
  GraduationCap,
  MapPin,
  Search,
  Building,
  Server,
  Globe
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole, Stop } from '../types';
import { stopsApi } from '../api/buses';
import { getApiBaseUrl, setApiBaseUrl } from '../api/client';

export const BackendConnectionBanner: React.FC = () => {
  const currentUrl = getApiBaseUrl();
  const isRemote = typeof window !== 'undefined' && !['localhost', '127.0.0.1'].includes(window.location.hostname);
  const [isOpen, setIsOpen] = useState(!currentUrl && isRemote);
  const [inputUrl, setInputUrl] = useState(currentUrl);
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputUrl.trim().replace(/\/+$/, '');
    if (!clean) {
      setApiBaseUrl('');
      setFeedback({ type: 'success', text: 'Reset to default relative API routing.' });
      setTimeout(() => window.location.reload(), 800);
      return;
    }

    setTesting(true);
    setFeedback(null);
    try {
      const testEndpoint = `${clean}/api/health`;
      const res = await fetch(testEndpoint, { method: 'GET', signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        setApiBaseUrl(clean);
        setFeedback({ type: 'success', text: 'Connected to backend server successfully!' });
        setTimeout(() => window.location.reload(), 1000);
      } else {
        setFeedback({
          type: 'error',
          text: `Backend responded with HTTP ${res.status}. Please check your backend service status.`
        });
      }
    } catch {
      setFeedback({
        type: 'error',
        text: `Cannot reach backend at ${clean}. Make sure your Render service is Live and finished deploying.`
      });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="mb-4">
      {/* Status Bar */}
      <div className="flex items-center justify-between text-xs px-2 py-1.5 bg-white/80 backdrop-blur-xs border border-slate-200 rounded-xl shadow-2xs">
        <div className="flex items-center gap-1.5 text-slate-600 font-medium overflow-hidden">
          <Server className="w-3.5 h-3.5 shrink-0 text-slate-500" />
          <span className="shrink-0">Backend:</span>
          {currentUrl ? (
            <span className="text-emerald-700 font-mono font-semibold truncate max-w-[220px]" title={currentUrl}>
              {currentUrl}
            </span>
          ) : (
            <span className={isRemote ? 'text-amber-700 font-bold' : 'text-slate-400 font-mono'}>
              {isRemote ? '⚠️ URL Not Set (Vercel)' : 'http://localhost:8000'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline decoration-dotted shrink-0 ml-2"
        >
          {isOpen ? 'Close' : currentUrl ? 'Change' : 'Connect Backend'}
        </button>
      </div>

      {/* Expanded Config Form */}
      {isOpen && (
        <div className="mt-2 p-4 bg-white rounded-2xl border border-slate-200 shadow-lg text-xs animate-in fade-in duration-200">
          <div className="font-semibold text-slate-800 mb-1 flex items-center gap-1.5">
            <Globe className="w-4 h-4 text-indigo-600" />
            Backend API Connection
          </div>
          <p className="text-slate-500 text-[11px] mb-3 leading-relaxed">
            When deployed on Vercel, paste your live Render backend URL below (e.g.{' '}
            <code className="bg-slate-100 text-indigo-700 px-1 py-0.5 rounded font-mono">https://your-service.onrender.com</code>).
          </p>
          <form onSubmit={handleTestAndSave} className="flex flex-col gap-2">
            <div className="flex gap-2">
              <input
                type="url"
                required
                placeholder="https://your-backend.onrender.com"
                value={inputUrl}
                onChange={(e) => setInputUrl(e.target.value)}
                className="flex-1 px-3 py-1.5 border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
              />
              <button
                type="submit"
                disabled={testing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-3 py-1.5 rounded-lg text-xs transition-colors disabled:opacity-50 flex items-center gap-1 shrink-0"
              >
                {testing ? 'Testing...' : 'Save & Connect'}
              </button>
            </div>
            {currentUrl && (
              <button
                type="button"
                onClick={() => {
                  setApiBaseUrl('');
                  window.location.reload();
                }}
                className="text-[11px] text-slate-400 hover:text-rose-600 self-start underline"
              >
                Reset to default
              </button>
            )}
          </form>

          {feedback && (
            <div
              className={`mt-2.5 p-2.5 rounded-lg text-[11px] leading-tight ${
                feedback.type === 'success'
                  ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}
            >
              {feedback.text}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export const LoginPage: React.FC = () => {
  const { login, register, loading, error } = useAuth();
  const navigate = useNavigate();

  // Step 1: null (asking role); Step 2: role selected ('student' | 'driver' | 'bus_manager' | 'admin')
  const [selectedRole, setSelectedRole] = useState<UserRole | null>(null);
  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');

  // Sign In state
  const [signInEmail, setSignInEmail] = useState('');
  const [signInPassword, setSignInPassword] = useState('');

  // Sign Up common state
  const [signUpName, setSignUpName] = useState('');
  const [signUpEmail, setSignUpEmail] = useState('');
  const [signUpPhone, setSignUpPhone] = useState('');
  const [signUpPassword, setSignUpPassword] = useState('');

  // Student specific sign up
  const [studentRoll, setStudentRoll] = useState('');
  const [studentDept, setStudentDept] = useState('Computer Science & Engineering');
  const [studentYear, setStudentYear] = useState('1st Year');
  const [availableStops, setAvailableStops] = useState<Stop[]>([]);
  const [stopSearchQuery, setStopSearchQuery] = useState('');
  const [selectedResidenceStop, setSelectedResidenceStop] = useState<Stop | null>(null);
  const [loadingStops, setLoadingStops] = useState(false);
  const [showStopDropdown, setShowStopDropdown] = useState(false);

  // Driver specific sign up
  const [driverLicense, setDriverLicense] = useState('');
  const [driverExp, setDriverExp] = useState<number>(3);
  const [driverEmergency, setDriverEmergency] = useState('');

  // Manager specific sign up
  const [managerEmpId, setManagerEmpId] = useState('');
  const [managerDept, setManagerDept] = useState('Campus Transport Operations');

  // Load manager-created stops from DB for student residence stop selection
  useEffect(() => {
    if (selectedRole === 'student') {
      setLoadingStops(true);
      stopsApi.listStops()
        .then((data) => setAvailableStops(data))
        .catch((err) => console.warn('Could not load manager stops:', err))
        .finally(() => setLoadingStops(false));
    }
  }, [selectedRole]);

  // Filter manager stops based on search query
  const filteredStops = availableStops.filter((s) => {
    const q = stopSearchQuery.toLowerCase();
    return s.name.toLowerCase().includes(q) || (s.address && s.address.toLowerCase().includes(q));
  });

  // Feedback messages
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error' | 'pending'; text: string } | null>(null);

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role);
    setAuthMode('signin');
    setStatusMessage(null);

    // Pre-fill email hints
    if (role === 'bus_manager') {
      setSignInEmail('manager@college.edu');
      setSignInPassword('Manager@123');
    } else if (role === 'driver') {
      setSignInEmail('driver.kumar@college.edu');
      setSignInPassword('Driver@123');
    } else if (role === 'admin') {
      setSignInEmail('admin@college.edu');
      setSignInPassword('Admin@123');
    } else {
      setSignInEmail('student.ananya@college.edu');
      setSignInPassword('Student@123');
    }
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setStatusMessage(null);

    try {
      const loggedInUser = await login(signInEmail, signInPassword, selectedRole);
      if (loggedInUser.role === 'admin') {
        navigate('/admin');
      } else if (loggedInUser.role === 'bus_manager') {
        navigate('/manager');
      } else if (loggedInUser.role === 'driver') {
        navigate('/driver');
      } else {
        navigate('/student');
      }
    } catch (err: any) {
      const msg = err.message || 'Authentication failed';
      if (msg.includes('PENDING')) {
        setStatusMessage({ type: 'pending', text: msg });
      } else {
        setStatusMessage({ type: 'error', text: msg });
      }
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRole) return;
    setStatusMessage(null);

    try {
      const res = await register({
        email: signUpEmail,
        password: signUpPassword,
        name: signUpName,
        phone: signUpPhone || undefined,
        role: selectedRole,
        // Student specific fields
        roll_number: selectedRole === 'student' ? studentRoll : undefined,
        department: selectedRole === 'student' ? studentDept : selectedRole === 'bus_manager' ? managerDept : undefined,
        year: selectedRole === 'student' ? studentYear : undefined,
        boarding_stop_id: selectedRole === 'student' ? selectedResidenceStop?.id : undefined,
        boarding_stop_name: selectedRole === 'student' ? selectedResidenceStop?.name : undefined,
        // Driver specific fields
        license_number: selectedRole === 'driver' ? driverLicense : undefined,
        years_of_experience: selectedRole === 'driver' ? Number(driverExp) : undefined,
        emergency_contact: selectedRole === 'driver' ? driverEmergency : undefined,
        // Manager specific fields
        employee_id: selectedRole === 'bus_manager' ? managerEmpId : undefined,
      });

      if (selectedRole === 'student') {
        setStatusMessage({ type: 'success', text: 'Student account created successfully! Redirecting to student tracking dashboard...' });
        setTimeout(() => navigate('/student'), 1200);
      } else if (selectedRole === 'driver') {
        setStatusMessage({
          type: 'pending',
          text: 'Driver registration submitted! Your account is now PENDING verification and approval by the College Transport Manager. You will be able to log in once approved.'
        });
        setAuthMode('signin');
      } else if (selectedRole === 'bus_manager') {
        setStatusMessage({
          type: 'pending',
          text: 'Transport Manager registration submitted! Your account is now PENDING verification and approval by the System Administrator. You will be able to log in once approved.'
        });
        setAuthMode('signin');
      }
    } catch (err: any) {
      let msg = err.message || 'Registration failed.';
      if (msg === 'Failed to fetch' || msg.includes('NetworkError')) {
        msg = 'Unable to reach backend API. Please make sure the FastAPI server is running on http://127.0.0.1:8000.';
      }
      setStatusMessage({ type: 'error', text: msg });
    }
  };



  // ==========================================
  // STEP 1: INITIAL ROLE SELECTION SCREEN
  // ==========================================
  if (!selectedRole) {
    return (
      <div className="min-h-screen bg-linear-to-b from-slate-50 to-indigo-50/40 flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto w-full text-center space-y-4">
          <div className="max-w-md mx-auto w-full text-left">
            <BackendConnectionBanner />
          </div>
          <div className="inline-flex p-3 bg-indigo-600 text-white rounded-2xl shadow-lg shadow-indigo-600/30">
            <Bus className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              AI-Enabled College Bus Tracking
            </h1>
            <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-xl mx-auto">
              Please choose your college role to access live bus locations, smart ETA predictions, or transport operations.
            </p>
          </div>

          {/* Role Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 text-left">
            {/* Student Card */}
            <div
              onClick={() => handleRoleSelect('student')}
              className="group bg-white p-6 rounded-2xl border-2 border-slate-200 hover:border-indigo-600 shadow-xs hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center mb-4 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                  <User className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                  College Student
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  View scheduled bus routes, track buses in real-time with genuine GPS coordinates, and view AI-enabled arrival estimates.
                </p>
              </div>
              <div className="pt-6 flex items-center gap-1.5 text-xs font-bold text-indigo-600 group-hover:translate-x-1 transition-transform">
                <span>Continue as Student</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Driver Card */}
            <div
              onClick={() => handleRoleSelect('driver')}
              className="group bg-white p-6 rounded-2xl border-2 border-slate-200 hover:border-emerald-600 shadow-xs hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                  <Car className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-emerald-600 transition-colors">
                  Bus Driver
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Accept route assignments, verify physical arrival at the starting point, and stream live phone GPS tracking during duty trips.
                </p>
              </div>
              <div className="pt-6 flex items-center gap-1.5 text-xs font-bold text-emerald-600 group-hover:translate-x-1 transition-transform">
                <span>Continue as Driver</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>

            {/* Transport Manager Card */}
            <div
              onClick={() => handleRoleSelect('bus_manager')}
              className="group bg-white p-6 rounded-2xl border-2 border-slate-200 hover:border-purple-600 shadow-xs hover:shadow-xl transition-all cursor-pointer flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
                  <Shield className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-slate-900 group-hover:text-purple-600 transition-colors">
                  Transport Manager
                </h3>
                <p className="text-xs text-slate-500 mt-2 leading-relaxed">
                  Manage college fleet buses, create road routes via Google Maps, dispatch drivers, verify driver licenses, and monitor trips.
                </p>
              </div>
              <div className="pt-6 flex items-center gap-1.5 text-xs font-bold text-purple-600 group-hover:translate-x-1 transition-transform">
                <span>Continue as Manager</span>
                <ArrowRight className="w-4 h-4" />
              </div>
            </div>
          </div>

          {/* Dedicated Super Admin link */}
          <div className="pt-6">
            <button
              onClick={() => handleRoleSelect('admin')}
              className="inline-flex items-center gap-2 text-xs font-semibold text-slate-500 hover:text-indigo-600 bg-white/80 border border-slate-200 px-4 py-2 rounded-xl transition-colors hover:shadow-xs"
            >
              <KeyRound className="w-4 h-4" />
              College System Administrator Portal →
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // STEP 2: SIGN IN & SIGN UP PORTAL (ROLE SELECTED)
  // ==========================================
  const roleLabel = {
    student: 'Student Portal',
    driver: 'Driver Portal',
    bus_manager: 'Transport Manager Portal',
    admin: 'System Administrator Console'
  }[selectedRole];

  const roleThemeColor = {
    student: 'indigo',
    driver: 'emerald',
    bus_manager: 'purple',
    admin: 'slate'
  }[selectedRole];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto w-full">
        <BackendConnectionBanner />
        {/* Back Button & Role Header */}
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setSelectedRole(null)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 px-3 py-1.5 rounded-xl shadow-2xs hover:bg-slate-50 transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Change Role
          </button>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            {roleLabel}
          </span>
        </div>

        <div className="bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden">
          {/* Top Banner */}
          <div className="bg-slate-900 text-white p-5 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">{roleLabel}</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {authMode === 'signin' ? 'Sign in to access your dashboard' : 'Register a new account'}
              </p>
            </div>
            <div className="p-2.5 bg-slate-800 text-indigo-400 rounded-xl">
              {selectedRole === 'student' ? (
                <User className="w-5 h-5 text-indigo-400" />
              ) : selectedRole === 'driver' ? (
                <Car className="w-5 h-5 text-emerald-400" />
              ) : (
                <Shield className="w-5 h-5 text-purple-400" />
              )}
            </div>
          </div>

          {/* Sign In / Sign Up Tabs (Admin is Sign In only) */}
          {selectedRole !== 'admin' && (
            <div className="grid grid-cols-2 p-1.5 bg-slate-100 border-b border-slate-200">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signin');
                  setStatusMessage(null);
                }}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  authMode === 'signin'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('signup');
                  setStatusMessage(null);
                }}
                className={`py-2 text-xs font-bold rounded-xl transition-all ${
                  authMode === 'signup'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                Sign Up (Register)
              </button>
            </div>
          )}

          <div className="p-6">
            {/* Feedback / Status Alert */}
            {statusMessage && (
              <div
                className={`mb-5 p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
                  statusMessage.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : statusMessage.type === 'pending'
                    ? 'bg-amber-50 border-amber-200 text-amber-900'
                    : 'bg-rose-50 border-rose-200 text-rose-700'
                }`}
              >
                {statusMessage.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />}
                {statusMessage.type === 'pending' && <Clock className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                {statusMessage.type === 'error' && <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />}
                <span>{statusMessage.text}</span>
              </div>
            )}

            {/* TAB: SIGN IN FORM */}
            {authMode === 'signin' && (
              <form onSubmit={handleSignIn} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    College Email Address
                  </label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="email"
                      required
                      value={signInEmail}
                      onChange={(e) => setSignInEmail(e.target.value)}
                      placeholder="you@college.edu"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                    <input
                      type="password"
                      required
                      value={signInPassword}
                      onChange={(e) => setSignInPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-hidden"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors shadow-md disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>Sign In</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>


              </form>
            )}

            {/* TAB: SIGN UP (REGISTRATION) FORM */}
            {authMode === 'signup' && selectedRole !== 'admin' && (
              <form onSubmit={handleSignUp} className="space-y-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Full Legal Name</label>
                  <input
                    type="text"
                    required
                    value={signUpName}
                    onChange={(e) => setSignUpName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">College Email Address</label>
                  <input
                    type="email"
                    required
                    value={signUpEmail}
                    onChange={(e) => setSignUpEmail(e.target.value)}
                    placeholder="e.g. j.doe@college.edu"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    value={signUpPhone}
                    onChange={(e) => setSignUpPhone(e.target.value)}
                    placeholder="e.g. +91 98765 43210"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={signUpPassword}
                    onChange={(e) => setSignUpPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-600 focus:outline-hidden"
                  />
                </div>

                {/* Student-specific Academic & Residence Stop fields */}
                {selectedRole === 'student' && (
                  <div className="bg-sky-50/70 p-3.5 rounded-2xl border border-sky-100 space-y-3">
                    <span className="text-[11px] font-bold text-sky-900 flex items-center gap-1.5">
                      <GraduationCap className="w-3.5 h-3.5 text-sky-600" /> College Academic & Boarding Details
                    </span>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-700 mb-1">
                          Roll / Register No <span className="text-rose-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={studentRoll}
                          onChange={(e) => setStudentRoll(e.target.value)}
                          placeholder="e.g. 22CS104"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs uppercase"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-700 mb-1">Year of Study</label>
                        <select
                          value={studentYear}
                          onChange={(e) => setStudentYear(e.target.value)}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                        >
                          <option value="1st Year">1st Year</option>
                          <option value="2nd Year">2nd Year</option>
                          <option value="3rd Year">3rd Year</option>
                          <option value="4th Year">4th Year</option>
                          <option value="Post Graduate">Post Graduate</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-1">Department</label>
                      <select
                        value={studentDept}
                        onChange={(e) => setStudentDept(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      >
                        <option value="Computer Science & Engineering">Computer Science & Engineering</option>
                        <option value="Information Technology">Information Technology</option>
                        <option value="Artificial Intelligence & Data Science">Artificial Intelligence & Data Science</option>
                        <option value="Electronics & Communication">Electronics & Communication</option>
                        <option value="Electrical & Electronics">Electrical & Electronics</option>
                        <option value="Mechanical Engineering">Mechanical Engineering</option>
                        <option value="Civil Engineering">Civil Engineering</option>
                        <option value="Biotechnology">Biotechnology</option>
                        <option value="Management Studies (MBA)">Management Studies (MBA)</option>
                      </select>
                    </div>

                    {/* Residence Stop Selection with Live Search */}
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-[10px] font-semibold text-slate-700">
                          Residence / Boarding Stop <span className="text-slate-400 font-normal">(Pick your stop)</span>
                        </label>
                        {selectedResidenceStop && (
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedResidenceStop(null);
                              setStopSearchQuery('');
                            }}
                            className="text-[10px] text-indigo-600 font-bold hover:underline"
                          >
                            Change Stop
                          </button>
                        )}
                      </div>

                      {selectedResidenceStop ? (
                        <div className="p-2.5 bg-white border-2 border-emerald-500 rounded-xl flex items-center justify-between shadow-xs">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 bg-emerald-100 text-emerald-700 rounded-lg">
                              <MapPin className="w-4 h-4" />
                            </span>
                            <div>
                              <div className="text-xs font-bold text-slate-900">{selectedResidenceStop.name}</div>
                              <div className="text-[10px] text-slate-500">{selectedResidenceStop.address || 'College route stop'}</div>
                            </div>
                          </div>
                          <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2 py-0.5 rounded-full border border-emerald-200">
                            Selected
                          </span>
                        </div>
                      ) : (
                        <div className="relative">
                          <div className="relative">
                            <input
                              type="text"
                              value={stopSearchQuery}
                              onChange={(e) => {
                                setStopSearchQuery(e.target.value);
                                setShowStopDropdown(true);
                              }}
                              onFocus={() => setShowStopDropdown(true)}
                              placeholder="Search manager-created stops (e.g. Tambaram, Guindy, Central)..."
                              className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                            />
                            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                          </div>

                          {showStopDropdown && (
                            <div className="absolute z-30 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-44 overflow-y-auto divide-y divide-slate-100">
                              {loadingStops ? (
                                <div className="p-3 text-center text-xs text-slate-500">Loading manager stops...</div>
                              ) : filteredStops.length === 0 ? (
                                <div className="p-3 text-center text-xs text-slate-500">
                                  {availableStops.length === 0
                                    ? 'No stops created by manager yet. You can sign up now and link your stop later.'
                                    : 'No matching stops found. Try typing a different landmark.'}
                                </div>
                              ) : (
                                filteredStops.map((stop) => (
                                  <button
                                    key={stop.id}
                                    type="button"
                                    onClick={() => {
                                      setSelectedResidenceStop(stop);
                                      setShowStopDropdown(false);
                                    }}
                                    className="w-full p-2.5 text-left hover:bg-indigo-50/70 transition-colors flex items-center justify-between"
                                  >
                                    <div>
                                      <div className="text-xs font-semibold text-slate-900">{stop.name}</div>
                                      <div className="text-[10px] text-slate-500">{stop.address || 'College route stop'}</div>
                                    </div>
                                    <span className="text-[10px] text-indigo-600 font-bold">Select</span>
                                  </button>
                                ))
                              )}
                            </div>
                          )}
                          <p className="text-[10px] text-slate-500 mt-1 italic">
                            All stops created by the College Transport Manager appear here for you to select your residence stop.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Driver-specific fields */}
                {selectedRole === 'driver' && (
                  <div className="bg-emerald-50/60 p-3 rounded-xl border border-emerald-100 space-y-2.5">
                    <span className="text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                      <FileBadge className="w-3.5 h-3.5" /> Driver Verification Details
                    </span>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Commercial License Number</label>
                      <input
                        type="text"
                        required
                        value={driverLicense}
                        onChange={(e) => setDriverLicense(e.target.value)}
                        placeholder="e.g. DL-KA-04-2019..."
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Experience (Years)</label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={driverExp}
                          onChange={(e) => setDriverExp(Number(e.target.value))}
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Emergency Contact</label>
                        <input
                          type="tel"
                          value={driverEmergency}
                          onChange={(e) => setDriverEmergency(e.target.value)}
                          placeholder="Phone number"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                        />
                      </div>
                    </div>
                    <p className="text-[10px] text-emerald-700 italic">
                      * Transport Manager will verify your driving license prior to account approval.
                    </p>
                  </div>
                )}

                {/* Manager-specific fields */}
                {selectedRole === 'bus_manager' && (
                  <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-100 space-y-2.5">
                    <span className="text-[11px] font-bold text-purple-800 flex items-center gap-1.5">
                      <Briefcase className="w-3.5 h-3.5" /> Staff Credentials
                    </span>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">College Employee / Staff ID</label>
                      <input
                        type="text"
                        required
                        value={managerEmpId}
                        onChange={(e) => setManagerEmpId(e.target.value)}
                        placeholder="e.g. EMP-TM-2026"
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-700 mb-0.5">Department</label>
                      <input
                        type="text"
                        value={managerDept}
                        onChange={(e) => setManagerDept(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                      />
                    </div>
                    <p className="text-[10px] text-purple-700 italic">
                      * System Administrator will review and verify your Manager account before access is granted.
                    </p>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl transition-colors shadow-md disabled:opacity-50"
                >
                  {loading ? 'Submitting Registration...' : `Register as ${selectedRole === 'bus_manager' ? 'Manager' : selectedRole === 'driver' ? 'Driver' : 'Student'}`}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
