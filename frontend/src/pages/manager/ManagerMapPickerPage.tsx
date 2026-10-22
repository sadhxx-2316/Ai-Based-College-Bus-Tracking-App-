import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { stopsApi } from '../../api/buses';
import { GoogleMapView } from '../../components/GoogleMapView';
import {
  ArrowLeft,
  MapPin,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Compass,
  Search,
  Navigation
} from 'lucide-react';

export const ManagerMapPickerPage: React.FC = () => {
  const navigate = useNavigate();
  const [stopName, setStopName] = useState('');
  const [stopAddress, setStopAddress] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleMapClick = (c: { lat: number; lng: number }) => {
    setCoords(c);
    setError(null);
  };

  const handlePlaceSelect = (place: { name: string; address: string; lat: number; lng: number }) => {
    setStopName(place.name);
    setStopAddress(place.address);
    setCoords({ lat: place.lat, lng: place.lng });
    setError(null);
  };

  const handleSaveStop = async () => {
    if (!coords) {
      setError('Please click on the Google Map or search an address to mark a location pin.');
      return;
    }
    if (!stopName.trim()) {
      setError('Please enter a name for this bus stop (e.g. Tambaram Railway Station).');
      return;
    }

    try {
      setSaving(true);
      setError(null);
      await stopsApi.createStop({
        name: stopName.trim(),
        latitude: coords.lat,
        longitude: coords.lng,
        address: stopAddress.trim() || undefined,
      });

      // Save confirmation state for manager dashboard
      sessionStorage.setItem('just_added_stop_name', stopName.trim());
      navigate('/manager');
    } catch (err: any) {
      setError(err.message || 'Failed to save stop to database');
    } finally {
      setSaving(false);
    }
  };

  const handleUseLocationAndReturn = () => {
    if (!coords) {
      setError('Please mark a location on the map first.');
      return;
    }
    sessionStorage.setItem('picked_lat', coords.lat.toString());
    sessionStorage.setItem('picked_lng', coords.lng.toString());
    if (stopName) sessionStorage.setItem('picked_name', stopName);
    if (stopAddress) sessionStorage.setItem('picked_address', stopAddress);
    navigate('/manager');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-5">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/manager')}
            className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to Route Builder</span>
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <MapPin className="w-5 h-5 text-indigo-600" />
              Interactive Map Stop Selector
            </h1>
            <p className="text-xs text-slate-500">
              Click anywhere on the map or search an address to capture coordinates for college bus stops.
            </p>
          </div>
        </div>

        {coords && (
          <div className="flex items-center gap-2 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-xl font-medium">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Marked: <strong>{coords.lat.toFixed(6)}, {coords.lng.toFixed(6)}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Main Stop Marking Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Coordinates & Stop Details Form */}
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div>
            <h2 className="text-sm font-bold text-slate-900">Stop Information</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Review location data captured from the Google Map and save it to the database.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Regional Presets (Mepco, Sivakasi, Virudhunagar) */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2">
            <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1">
              <span>⚡</span>
              <span>Quick Landmark Presets (1-Click Fill):</span>
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { name: 'Mepco Schlenk Engineering College - Main Gate', address: 'Mepco Nagar, Sivakasi-Virudhunagar Highway (SH-42)', lat: 9.52554, lng: 77.85408, label: '🎓 Mepco Main Gate' },
                { name: 'Mepco Schlenk College - Campus Bus Bay', address: 'Campus Bus Bay, Mepco Nagar, SH-42', lat: 9.52650, lng: 77.85520, label: '🎓 Mepco Bus Bay' },
                { name: 'Sivakasi Central Bus Stand', address: 'Central Bus Stand, Sivakasi Town', lat: 9.45320, lng: 77.79740, label: '🏙️ Sivakasi Bus Stand' },
                { name: 'Thiruthangal Junction Stop', address: 'SH-42 Highway, Thiruthangal, Sivakasi', lat: 9.48150, lng: 77.81180, label: '🚏 Thiruthangal' },
                { name: 'Virudhunagar Old Bus Stand', address: 'Town Centre, Virudhunagar', lat: 9.58550, lng: 77.95720, label: '🏛️ Virudhunagar Bus Stand' },
                { name: 'Virudhunagar Railway Junction', address: 'Railway Feeder Road, Virudhunagar', lat: 9.58020, lng: 77.96200, label: '🚉 Virudhunagar Station' },
                { name: 'Sulakkarai / District Collectorate Complex', address: 'Master Plan Complex, Sulakkarai, Virudhunagar', lat: 9.57400, lng: 77.93800, label: '🏢 Collectorate' },
              ].map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => {
                    setStopName(p.name);
                    setStopAddress(p.address);
                    setCoords({ lat: p.lat, lng: p.lng });
                    setError(null);
                  }}
                  className="px-2.5 py-1 text-[10px] font-bold rounded-lg bg-white border border-slate-200 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 transition-colors shadow-2xs cursor-pointer"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Stop Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={stopName}
                onChange={(e) => setStopName(e.target.value)}
                placeholder="e.g. Mepco Schlenk College Main Gate / Sivakasi Bus Stand"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Address / Landmark (Optional)
              </label>
              <input
                type="text"
                value={stopAddress}
                onChange={(e) => setStopAddress(e.target.value)}
                placeholder="e.g. Mepco Nagar, SH-42 State Highway"
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Latitude</label>
                <input
                  type="text"
                  readOnly
                  value={coords ? coords.lat.toFixed(6) : ''}
                  placeholder="Click on map"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-700"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Longitude</label>
                <input
                  type="text"
                  readOnly
                  value={coords ? coords.lng.toFixed(6) : ''}
                  placeholder="Click on map"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-300 rounded-xl font-mono text-slate-700"
                />
              </div>
            </div>

            <div className="pt-2 space-y-2">
              <button
                type="button"
                onClick={handleSaveStop}
                disabled={saving || !coords}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>{saving ? 'Saving to Database...' : 'Save Stop & Return to Route Builder'}</span>
              </button>

              <button
                type="button"
                onClick={handleUseLocationAndReturn}
                disabled={!coords}
                className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-40 cursor-pointer"
              >
                <span>Use Location Coordinates & Return</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right 2 Cols: Map for Selecting Stops */}
        <div className="lg:col-span-2 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs space-y-2">
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-bold text-slate-800">
              Interactive Map Pinning & Place Search
            </span>
            <span className="text-[11px] text-indigo-600 font-medium">
              Click map to mark pin
            </span>
          </div>

          <GoogleMapView
            showSearch={true}
            onMapClick={handleMapClick}
            onPlaceSelect={handlePlaceSelect}
            highlightedCoords={coords}
            className="h-[560px] w-full rounded-xl overflow-hidden border border-slate-200"
          />
        </div>
      </div>
    </div>
  );
};
