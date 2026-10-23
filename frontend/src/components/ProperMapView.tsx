import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Stop, LiveLocation } from '../types';
import {
  Search,
  MapPin,
  AlertTriangle,
  Compass,
  Navigation,
  Loader2,
  Layers,
  CheckCircle2,
  Box,
  Focus,
  RefreshCw
} from 'lucide-react';

export interface MapViewProps {
  stops?: Stop[];
  routeGeometry?: string; // Encoded polyline
  liveLocation?: LiveLocation | null;
  selectedStopId?: string;
  targetStopId?: string;
  showStraightApproachLine?: boolean;
  onStopSelect?: (stop: Stop) => void;
  onMapClick?: (coords: { lat: number; lng: number }) => void;
  className?: string;
  interactive?: boolean;
  showSearch?: boolean; // Geocoding search bar for Manager
  onPlaceSelect?: (place: { name: string; address: string; lat: number; lng: number }) => void;
  highlightedCoords?: { lat: number; lng: number } | null;
}

// 1. Map Tile Styles (100% Free, Zero-Configuration, No API Key, No Watermark)
const STYLES: Record<string, { name: string; style: maplibregl.StyleSpecification }> = {
  osm: {
    name: 'OpenStreetMap Standard (Crisp & Free)',
    style: {
      version: 8,
      sources: {
        'osm-tiles': {
          type: 'raster',
          tiles: [
            'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
            'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
          ],
          tileSize: 256,
          attribution: '&copy; OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'osm-tiles-layer',
          type: 'raster',
          source: 'osm-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
  esriStreet: {
    name: 'Esri World Street (Clean Road Map)',
    style: {
      version: 8,
      sources: {
        'esri-street-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '&copy; Esri &copy; OpenStreetMap contributors',
        },
      },
      layers: [
        {
          id: 'esri-street-layer',
          type: 'raster',
          source: 'esri-street-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
  satellite: {
    name: 'Satellite Aerial (Esri High-Res)',
    style: {
      version: 8,
      sources: {
        'satellite-tiles': {
          type: 'raster',
          tiles: [
            'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
          ],
          tileSize: 256,
          attribution: '&copy; Esri, Maxar, Earthstar Geographics',
        },
      },
      layers: [
        {
          id: 'satellite-tiles-layer',
          type: 'raster',
          source: 'satellite-tiles',
          minzoom: 0,
          maxzoom: 19,
        },
      ],
    },
  },
};

// Polyline decoder utility
function decodePolylineJs(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push([lng / 1e5, lat / 1e5]);
  }

  return points;
}

// Haversine distance in meters
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

// Directional road bearing angle (degrees)
function calculateBearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const dLon = toRad(lon2 - lon1);
  const y = Math.sin(dLon) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
  const brng = toDeg(Math.atan2(y, x));
  return (brng + 360) % 360;
}

// Small College Bus SVG with realistic details (headlights, tires, rooftop AC, windshield, reflections, tail lights, and floating speed HUD)
function buildSmallBusSvg(busNumber: string, speed: number, isStale: boolean, heading: number): string {
  const speedLabel = speed > 0 ? `${speed.toFixed(1)} km/h` : 'Stationary';
  const isMoving = speed > 2;

  return `
    <div class="relative flex flex-col items-center select-none group cursor-pointer" style="perspective: 1000px; transform: translate3d(0,0,0);">
      <!-- Floating Holographic HUD Badge -->
      <div class="mb-2 px-2.5 py-1 bg-slate-900/95 text-white text-[11px] font-bold rounded-full shadow-2xl border border-blue-400/60 backdrop-blur-md flex items-center gap-1.5 whitespace-nowrap transform -translate-y-1 group-hover:scale-105 transition-all">
        <span class="w-2.5 h-2.5 rounded-full ${isStale ? 'bg-amber-400' : 'bg-emerald-400'} ${isMoving ? 'animate-ping' : ''} shrink-0"></span>
        <span class="tracking-wide text-white font-extrabold">BUS ${busNumber}</span>
        <span class="${isMoving ? 'bg-emerald-600' : 'bg-blue-600'} text-white px-2 py-0.5 rounded-full text-[10px] font-mono font-bold shadow-xs">
          ⚡ ${speedLabel}
        </span>
      </div>

      <!-- Small Bus Vehicle Oriented to Road Heading -->
      <div class="relative transition-transform duration-500 ease-out" style="transform: rotate(${heading}deg); transform-origin: 50% 50%;">
        <!-- Real-time Headlight Road Illumination Beam (shining onto the blue road path) -->
        <div class="absolute -top-16 left-1/2 -translate-x-1/2 w-20 h-20 pointer-events-none opacity-85"
             style="background: radial-gradient(ellipse at bottom, rgba(254, 240, 138, 0.75) 0%, rgba(254, 240, 138, 0.2) 55%, rgba(254, 240, 138, 0) 80%); filter: blur(2px);">
        </div>

        <!-- Realistic SVG Small College Bus -->
        <svg width="44" height="74" viewBox="0 0 44 74" fill="none" xmlns="http://www.w3.org/2000/svg" class="drop-shadow-2xl">
          <!-- Drop Shadow underneath chassis -->
          <ellipse cx="22" cy="40" rx="18" ry="32" fill="rgba(0,0,0,0.4)" />

          <!-- 4 Rubber Tires on left & right -->
          <!-- Front Left Tire -->
          <rect x="0" y="14" width="4" height="11" rx="2" fill="#0f172a" stroke="#334155" stroke-width="0.8" />
          <!-- Front Right Tire -->
          <rect x="40" y="14" width="4" height="11" rx="2" fill="#0f172a" stroke="#334155" stroke-width="0.8" />
          <!-- Rear Left Tire -->
          <rect x="0" y="50" width="4" height="11" rx="2" fill="#0f172a" stroke="#334155" stroke-width="0.8" />
          <!-- Rear Right Tire -->
          <rect x="40" y="50" width="4" height="11" rx="2" fill="#0f172a" stroke="#334155" stroke-width="0.8" />

          <!-- Main Bus Body Chassis (Vibrant College Yellow) -->
          <rect x="3" y="6" width="38" height="62" rx="7" fill="url(#bus_yellow_gradient)" stroke="#d97706" stroke-width="1.2" />

          <!-- Front Bumper & Grill -->
          <rect x="8" y="5" width="28" height="3" rx="1.5" fill="#334155" />
          <!-- Dual LED Projector Headlights -->
          <rect x="6" y="7" width="5" height="3" rx="1" fill="#fef08a" stroke="#ffffff" stroke-width="0.6" />
          <rect x="33" y="7" width="5" height="3" rx="1" fill="#fef08a" stroke="#ffffff" stroke-width="0.6" />

          <!-- Front Curved Windshield (Deep Blue-Black with sky reflection) -->
          <path d="M 6 12 Q 22 9 38 12 L 37 22 Q 22 20 7 22 Z" fill="#0f172a" stroke="#1e293b" stroke-width="0.8" />
          <!-- Windshield Glare Reflection -->
          <path d="M 9 13 Q 22 11 35 13 L 34 16 Q 22 14 10 16 Z" fill="rgba(125, 211, 252, 0.55)" />

          <!-- Side Passenger Windows Left -->
          <rect x="4.5" y="24" width="2" height="7" rx="0.8" fill="#1e293b" />
          <rect x="4.5" y="33" width="2" height="7" rx="0.8" fill="#1e293b" />
          <rect x="4.5" y="42" width="2" height="7" rx="0.8" fill="#1e293b" />
          <rect x="4.5" y="51" width="2" height="7" rx="0.8" fill="#1e293b" />

          <!-- Side Passenger Windows Right -->
          <rect x="37.5" y="24" width="2" height="7" rx="0.8" fill="#1e293b" />
          <rect x="37.5" y="33" width="2" height="7" rx="0.8" fill="#1e293b" />
          <rect x="37.5" y="42" width="2" height="7" rx="0.8" fill="#1e293b" />
          <rect x="37.5" y="51" width="2" height="7" rx="0.8" fill="#1e293b" />

          <!-- Rooftop White/Silver Panel -->
          <rect x="10" y="24" width="24" height="36" rx="3" fill="#f8fafc" stroke="#cbd5e1" stroke-width="0.8" />
          <!-- AC Unit on Roof -->
          <rect x="13" y="28" width="18" height="10" rx="2" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.8" />
          <!-- AC Grilles -->
          <line x1="16" y1="31" x2="28" y2="31" stroke="#64748b" stroke-width="0.8" />
          <line x1="16" y1="34" x2="28" y2="34" stroke="#64748b" stroke-width="0.8" />

          <!-- "COLLEGE BUS" Roof Text -->
          <text x="22" y="47" font-size="5" font-weight="900" font-family="system-ui, -apple-system, sans-serif" fill="#b45309" text-anchor="middle" letter-spacing="0.5">COLLEGE</text>
          <text x="22" y="54" font-size="5" font-weight="900" font-family="system-ui, -apple-system, sans-serif" fill="#b45309" text-anchor="middle" letter-spacing="0.5">BUS</text>

          <!-- Rear Bumper & Ruby LED Tail Lights -->
          <rect x="7" y="65" width="30" height="3" rx="1.5" fill="#1e293b" />
          <rect x="6" y="64" width="5" height="3" rx="1" fill="#ef4444" stroke="#fca5a5" stroke-width="0.6" />
          <rect x="33" y="64" width="5" height="3" rx="1" fill="#ef4444" stroke="#fca5a5" stroke-width="0.6" />

          <!-- Color Gradients -->
          <defs>
            <linearGradient id="bus_yellow_gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stop-color="#fef08a" />
              <stop offset="25%" stop-color="#f59e0b" />
              <stop offset="85%" stop-color="#d97706" />
              <stop offset="100%" stop-color="#b45309" />
            </linearGradient>
          </defs>
        </svg>
      </div>
    </div>
  `;
}

const build3DBusHtml = buildSmallBusSvg;

export interface RegionLandmark {
  id: string;
  name: string;
  shortName: string;
  category: 'college' | 'city' | 'station' | 'stop' | 'government';
  lat: number;
  lng: number;
  address: string;
  desc: string;
  badgeColor: string;
  icon: string;
}

export const MEPCO_REGION_LANDMARKS: RegionLandmark[] = [
  {
    id: 'mepco-college',
    name: 'Mepco Schlenk Engineering College',
    shortName: 'Mepco Schlenk College',
    category: 'college',
    lat: 9.52554,
    lng: 77.85408,
    address: 'Mepco Nagar, Sivakasi - Virudhunagar Highway (SH-42), Tamil Nadu 626005',
    desc: 'Autonomous Engineering College Campus & Central Bus Terminal',
    badgeColor: '#4338ca', // Indigo
    icon: '🎓',
  },
  {
    id: 'sivakasi-city',
    name: 'Sivakasi Central Bus Stand',
    shortName: 'Sivakasi City',
    category: 'city',
    lat: 9.45320,
    lng: 77.79740,
    address: 'Central Bus Stand, Sivakasi, Tamil Nadu 626123',
    desc: 'Major Industrial & Commercial City Bus Terminal',
    badgeColor: '#0284c7', // Sky
    icon: '🏙️',
  },
  {
    id: 'virudhunagar-town',
    name: 'Virudhunagar Old Bus Stand',
    shortName: 'Virudhunagar Town',
    category: 'city',
    lat: 9.58550,
    lng: 77.95720,
    address: 'Old Bus Stand, Virudhunagar Town, Tamil Nadu 626001',
    desc: 'District Headquarters City Centre & Commercial Hub',
    badgeColor: '#7c3aed', // Purple
    icon: '🏛️',
  },
  {
    id: 'virudhunagar-railway',
    name: 'Virudhunagar Railway Junction',
    shortName: 'Virudhunagar Station',
    category: 'station',
    lat: 9.58020,
    lng: 77.96200,
    address: 'Railway Feeder Road, Virudhunagar, Tamil Nadu',
    desc: 'Southern Railway Junction connecting Madurai, Tenkasi & Tirunelveli',
    badgeColor: '#059669', // Emerald
    icon: '🚉',
  },
  {
    id: 'thiruthangal-stop',
    name: 'Thiruthangal Junction Stop',
    shortName: 'Thiruthangal',
    category: 'stop',
    lat: 9.48150,
    lng: 77.81180,
    address: 'SH-42 Highway, Thiruthangal, Sivakasi Taluk',
    desc: 'Key Passenger Boarding Point between Sivakasi and Mepco',
    badgeColor: '#d97706', // Amber
    icon: '🚏',
  },
  {
    id: 'collectorate-complex',
    name: 'Virudhunagar District Collectorate',
    shortName: 'Collectorate (Sulakkarai)',
    category: 'government',
    lat: 9.57400,
    lng: 77.93800,
    address: 'Master Plan Complex, Sulakkarai Medu, Virudhunagar',
    desc: 'Administrative Government Headquarters & Highway Junction',
    badgeColor: '#dc2626', // Red
    icon: '🏢',
  },
];

export const ProperMapView: React.FC<MapViewProps> = ({
  stops = [],
  routeGeometry,
  liveLocation,
  selectedStopId,
  targetStopId,
  showStraightApproachLine = true,
  onStopSelect,
  onMapClick,
  className = 'h-96 w-full rounded-2xl overflow-hidden',
  interactive = true,
  showSearch = false,
  onPlaceSelect,
  highlightedCoords,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [currentStyleKey, setCurrentStyleKey] = useState<string>('osm');
  const [showStyleMenu, setShowStyleMenu] = useState(false);
  const [is3DMode, setIs3DMode] = useState<boolean>(true);
  const [followBus, setFollowBus] = useState<boolean>(true);

  // Markers refs
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const busMarkerRef = useRef<maplibregl.Marker | null>(null);
  const approachMarkerRef = useRef<maplibregl.Marker | null>(null);
  const highlightMarkerRef = useRef<maplibregl.Marker | null>(null);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);
  const prevBusCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const busHeadingRef = useRef<number>(25);
  const currentAnimCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Place Search & Autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<any>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

  // Cleanup vehicle animation on unmount
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  // 1. Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current) return;

    // Default center: initial stop, or live bus, or Mepco Schlenk Engineering College (between Sivakasi & Virudhunagar)
    const initialCenter: [number, number] = stops.length > 0
      ? [stops[0].longitude, stops[0].latitude]
      : liveLocation
      ? [liveLocation.longitude, liveLocation.latitude]
      : [77.85408, 9.52554]; // Mepco Schlenk Engineering College, Tamil Nadu

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: STYLES[currentStyleKey].style,
      center: initialCenter,
      zoom: stops.length > 0 || liveLocation ? 14 : 12,
      pitch: is3DMode ? 55 : 0,
      bearing: is3DMode ? 15 : 0,
      interactive,
      attributionControl: false,
      maxPitch: 75,
    });

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    map.on('load', () => {
      setMapLoaded(true);
    });

    mapRef.current = map;

    return () => {
      map.remove();
      mapRef.current = null;
      setMapLoaded(false);
    };
  }, [interactive]);

  // Toggle 3D Perspective
  const toggle3DMode = () => {
    if (!mapRef.current) return;
    const nextMode = !is3DMode;
    setIs3DMode(nextMode);
    if (nextMode) {
      const heading = busHeadingRef.current || 20;
      mapRef.current.easeTo({ pitch: 58, bearing: heading, duration: 1000 });
    } else {
      mapRef.current.easeTo({ pitch: 0, bearing: 0, duration: 800 });
    }
  };

  // Re-center on Bus or Route
  const handleRecenter = () => {
    if (!mapRef.current) return;
    if (liveLocation && typeof liveLocation.latitude === 'number') {
      mapRef.current.easeTo({
        center: [liveLocation.longitude, liveLocation.latitude],
        zoom: Math.max(mapRef.current.getZoom(), 15),
        pitch: is3DMode ? 55 : 0,
        bearing: is3DMode ? busHeadingRef.current : 0,
        duration: 900,
      });
    } else if (stops.length > 0) {
      const bounds = new maplibregl.LngLatBounds();
      stops.forEach((s) => bounds.extend([s.longitude, s.latitude]));
      mapRef.current.fitBounds(bounds, { padding: 60, pitch: is3DMode ? 50 : 0 });
    }
  };

  // Smooth Camera Follow Bus
  useEffect(() => {
    if (followBus && liveLocation && mapRef.current && mapLoaded) {
      mapRef.current.easeTo({
        center: [liveLocation.longitude, liveLocation.latitude],
        pitch: is3DMode ? 55 : 0,
        bearing: is3DMode ? busHeadingRef.current : mapRef.current.getBearing(),
        duration: 1000,
      });
    }
  }, [liveLocation?.latitude, liveLocation?.longitude, followBus, is3DMode, mapLoaded]);

  // Handle style changes
  const handleChangeStyle = (key: string) => {
    if (!mapRef.current || key === currentStyleKey) return;
    setCurrentStyleKey(key);
    setShowStyleMenu(false);
    mapRef.current.setStyle(STYLES[key].style);
  };

  // 2. Handle map click listener (with reverse geocode for address)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const handleClick = async (e: maplibregl.MapMouseEvent) => {
      const lat = Number(e.lngLat.lat.toFixed(6));
      const lng = Number(e.lngLat.lng.toFixed(6));

      if (onMapClick) {
        onMapClick({ lat, lng });
      }

      // Proactively reverse geocode to give the user a real stop name & landmark
      if (onPlaceSelect) {
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`);
          if (res.ok) {
            const data = await res.json();
            const rawName = data.name || data.display_name?.split(',')[0] || `Stop at ${lat}, ${lng}`;
            const address = data.display_name || '';
            onPlaceSelect({
              name: rawName,
              address,
              lat,
              lng,
            });
            setSearchQuery(rawName);
          }
        } catch {
          // Ignore reverse geocode failures
        }
      }
    };

    map.on('click', handleClick);
    return () => {
      map.off('click', handleClick);
    };
  }, [onMapClick, onPlaceSelect]);

  // 3. Render Route Road Geometry and Straight Approach Line
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // A. Road Polyline Layer (Blue Path from Starting Stop to Ending Stop)
    let routeCoords = routeGeometry ? decodePolylineJs(routeGeometry) : [];
    if (routeCoords.length < 2 && stops.length >= 2) {
      // Connect all stops sequentially from start to end if encoded polyline is not available
      routeCoords = stops.map((s) => [s.longitude, s.latitude]);
    }

    const routeGeoJson: any = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: routeCoords,
      },
    };

    // Add or update road line
    if (map.getSource('route-line')) {
      (map.getSource('route-line') as maplibregl.GeoJSONSource).setData(routeGeoJson);
    } else {
      map.addSource('route-line', {
        type: 'geojson',
        data: routeGeoJson,
      });
    }

    // 1. Deep Navy Blue Casing / Outline for contrast against all map styles
    if (!map.getLayer('route-line-casing') && routeCoords.length > 0) {
      map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: 'route-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#172554', // Deep Navy Blue
          'line-width': 9,
          'line-opacity': 0.85,
        },
      });
    }

    // 2. Core Vibrant Royal Blue Road Line
    if (!map.getLayer('route-line-core') && routeCoords.length > 0) {
      map.addLayer({
        id: 'route-line-core',
        type: 'line',
        source: 'route-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#2563eb', // Royal Blue (User Requested Blue Road Path)
          'line-width': 6,
          'line-opacity': 0.98,
        },
      });
    }

    // 3. Center Glowing Sky Blue Pulse Line
    if (!map.getLayer('route-line-pulse') && routeCoords.length > 0) {
      map.addLayer({
        id: 'route-line-pulse',
        type: 'line',
        source: 'route-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#93c5fd', // Sky Blue Center Pulse
          'line-width': 2.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.95,
        },
      });
    }

    // B. Straight Approach Line from Live Bus to Selected/Target Stop
    const targetStop = stops.find((s) => s.id === (targetStopId || selectedStopId));
    const showApproach =
      showStraightApproachLine &&
      liveLocation &&
      targetStop &&
      typeof liveLocation.latitude === 'number' &&
      typeof liveLocation.longitude === 'number';

    const approachCoords: Array<[number, number]> = showApproach
      ? [
          [liveLocation!.longitude, liveLocation!.latitude],
          [targetStop!.longitude, targetStop!.latitude],
        ]
      : [];

    const approachGeoJson: any = {
      type: 'Feature',
      properties: {},
      geometry: {
        type: 'LineString',
        coordinates: approachCoords,
      },
    };

    if (map.getSource('approach-line')) {
      (map.getSource('approach-line') as maplibregl.GeoJSONSource).setData(approachGeoJson);
    } else if (approachCoords.length > 0) {
      map.addSource('approach-line', {
        type: 'geojson',
        data: approachGeoJson,
      });
      map.addLayer({
        id: 'approach-line-layer',
        type: 'line',
        source: 'approach-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#f59e0b',
          'line-width': 3.5,
          'line-dasharray': [2, 2],
          'line-opacity': 0.95,
        },
      });
    }

    // C. Midpoint Straight Distance Badge
    if (showApproach && targetStop) {
      const distMeters = calculateHaversineDistance(
        liveLocation!.latitude,
        liveLocation!.longitude,
        targetStop.latitude,
        targetStop.longitude
      );
      const distLabel =
        distMeters >= 1000 ? `${(distMeters / 1000).toFixed(1)} km direct` : `${Math.round(distMeters)} m direct`;

      const midLng = (liveLocation!.longitude + targetStop.longitude) / 2;
      const midLat = (liveLocation!.latitude + targetStop.latitude) / 2;

      if (!approachMarkerRef.current) {
        const el = document.createElement('div');
        el.className =
          'bg-slate-900/95 text-amber-300 font-bold text-[11px] px-2.5 py-1 rounded-lg border border-amber-400 shadow-lg backdrop-blur-xs flex items-center gap-1 cursor-default pointer-events-none transform -translate-x-1/2 -translate-y-1/2';
        el.innerHTML = `<span>📏</span><span>${distLabel}</span>`;
        approachMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([midLng, midLat])
          .addTo(map);
      } else {
        approachMarkerRef.current.setLngLat([midLng, midLat]);
        const el = approachMarkerRef.current.getElement();
        el.innerHTML = `<span>📏</span><span>${distLabel}</span>`;
      }
    } else if (approachMarkerRef.current) {
      approachMarkerRef.current.remove();
      approachMarkerRef.current = null;
    }
  }, [mapLoaded, currentStyleKey, routeGeometry, liveLocation, stops, targetStopId, selectedStopId, showStraightApproachLine]);

  // 4. Render Stop Markers & Live Bus Marker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear previous stop markers
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    const bounds = new maplibregl.LngLatBounds();

    stops.forEach((stop, index) => {
      const isOrigin = index === 0;
      const isDestination = index === stops.length - 1;
      const isSelected = stop.id === (targetStopId || selectedStopId);

      const el = document.createElement('div');
      el.className = 'group cursor-pointer flex flex-col items-center select-none';

      if (isOrigin) {
        // Clear Starting Stop indicator on the blue path
        el.innerHTML = `
          <div class="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-black px-2.5 py-1 rounded-full shadow-lg border-2 border-white uppercase tracking-wider transform transition-transform group-hover:scale-110">
            <span class="w-2 h-2 rounded-full bg-white animate-ping"></span>
            <span>START: ${stop.name}</span>
          </div>
          <div class="w-1.5 h-2 bg-emerald-700 rounded-b-full"></div>
        `;
      } else if (isDestination) {
        // Clear Ending Stop indicator on the blue path
        el.innerHTML = `
          <div class="flex items-center gap-1.5 bg-rose-600 hover:bg-rose-700 text-white text-[11px] font-black px-2.5 py-1 rounded-full shadow-lg border-2 border-white uppercase tracking-wider transform transition-transform group-hover:scale-110">
            <span>🏁</span>
            <span>END: ${stop.name}</span>
          </div>
          <div class="w-1.5 h-2 bg-rose-700 rounded-b-full"></div>
        `;
      } else {
        const circleColor = isSelected
          ? 'bg-blue-600 ring-4 ring-blue-300'
          : 'bg-indigo-600 ring-2 ring-white';

        el.innerHTML = `
          <div class="flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold shadow-md ${circleColor} transition-transform group-hover:scale-125">
            ${index + 1}
          </div>
          <div class="mt-1 bg-white/95 text-slate-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-xs border border-slate-200 whitespace-nowrap max-w-[130px] truncate">
            ${stop.name}
          </div>
        `;
      }

      el.addEventListener('click', () => {
        if (onStopSelect) onStopSelect(stop);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);

      stopMarkersRef.current.push(marker);
      bounds.extend([stop.longitude, stop.latitude]);
    });

    // 5. Render Live Small Bus Image Marker with Smooth Road Travel Motion
    if (liveLocation && typeof liveLocation.latitude === 'number' && typeof liveLocation.longitude === 'number') {
      const isStale = liveLocation.is_stale;
      const speed = liveLocation.speed_kmh ?? 0;
      const targetLat = liveLocation.latitude;
      const targetLng = liveLocation.longitude;

      if (!busMarkerRef.current) {
        // Initial placement
        currentAnimCoordsRef.current = { lat: targetLat, lng: targetLng };
        prevBusCoordsRef.current = { lat: targetLat, lng: targetLng };

        let initialHeading = 25;
        if (stops.length > 1) {
          initialHeading = calculateBearing(targetLat, targetLng, stops[1].latitude, stops[1].longitude);
        }
        busHeadingRef.current = initialHeading;

        const el = document.createElement('div');
        el.className = 'cursor-pointer z-30 transition-all select-none';
        el.innerHTML = buildSmallBusSvg(liveLocation.bus_number || '', speed, isStale, busHeadingRef.current);

        busMarkerRef.current = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([targetLng, targetLat])
          .addTo(map);

        bounds.extend([targetLng, targetLat]);
      } else {
        // Bus marker already exists: smoothly glide along the road to the new coordinates
        const fromLat = currentAnimCoordsRef.current?.lat ?? targetLat;
        const fromLng = currentAnimCoordsRef.current?.lng ?? targetLng;

        const moveDist = calculateHaversineDistance(fromLat, fromLng, targetLat, targetLng);

        if (moveDist >= 0.5) {
          // Calculate heading along the road path
          busHeadingRef.current = calculateBearing(fromLat, fromLng, targetLat, targetLng);

          if (animFrameRef.current) {
            cancelAnimationFrame(animFrameRef.current);
          }

          const durationMs = 1200; // Smooth 1.2s glide along the road
          const startTime = performance.now();

          const animateStep = (now: number) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / durationMs, 1);
            // Ease-out quad
            const ease = 1 - (1 - progress) * (1 - progress);

            const interpLng = fromLng + (targetLng - fromLng) * ease;
            const interpLat = fromLat + (targetLat - fromLat) * ease;

            currentAnimCoordsRef.current = { lat: interpLat, lng: interpLng };

            if (busMarkerRef.current) {
              busMarkerRef.current.setLngLat([interpLng, interpLat]);
              const el = busMarkerRef.current.getElement();
              el.innerHTML = buildSmallBusSvg(liveLocation.bus_number || '', speed, isStale, busHeadingRef.current);
            }

            if (progress < 1) {
              animFrameRef.current = requestAnimationFrame(animateStep);
            } else {
              animFrameRef.current = null;
            }
          };

          animFrameRef.current = requestAnimationFrame(animateStep);
        } else {
          // Stationary refresh
          const el = busMarkerRef.current.getElement();
          el.innerHTML = buildSmallBusSvg(liveLocation.bus_number || '', speed, isStale, busHeadingRef.current);
        }

        bounds.extend([targetLng, targetLat]);
      }
    } else if (busMarkerRef.current) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      busMarkerRef.current.remove();
      busMarkerRef.current = null;
    }

    // 6. Highlighted Selected/Pinned Coordinates
    if (highlightedCoords) {
      if (!highlightMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'flex flex-col items-center cursor-pointer z-20';
        el.innerHTML = `
          <div class="w-8 h-8 rounded-full bg-rose-600 text-white flex items-center justify-center font-bold text-sm shadow-xl border-2 border-white animate-bounce">
            📍
          </div>
          <div class="mt-0.5 bg-rose-600 text-white font-bold text-[9px] px-1.5 py-0.5 rounded-md shadow-md uppercase">
            Marked Pin
          </div>
        `;
        highlightMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([highlightedCoords.lng, highlightedCoords.lat])
          .addTo(map);
      } else {
        highlightMarkerRef.current.setLngLat([highlightedCoords.lng, highlightedCoords.lat]);
      }
      bounds.extend([highlightedCoords.lng, highlightedCoords.lat]);
    } else if (highlightMarkerRef.current) {
      highlightMarkerRef.current.remove();
      highlightMarkerRef.current = null;
    }

    // Auto-fit bounds if we have points
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 });
    }
  }, [mapLoaded, stops, targetStopId, selectedStopId, liveLocation, highlightedCoords, onStopSelect]);

  // 6.5. Render Regional City & College Landmarks (Mepco, Sivakasi, Virudhunagar)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;

    // Clear previous landmark markers
    landmarkMarkersRef.current.forEach((m) => m.remove());
    landmarkMarkersRef.current = [];

    MEPCO_REGION_LANDMARKS.forEach((lm) => {
      const el = document.createElement('div');
      el.className = 'group cursor-pointer flex flex-col items-center select-none transition-transform hover:scale-110 z-10';
      el.innerHTML = `
        <div class="flex items-center gap-1 bg-white/95 text-slate-900 px-2.5 py-1 rounded-full shadow-md border-2 border-slate-700/80 backdrop-blur-xs text-[10px] font-extrabold hover:border-indigo-600 hover:text-indigo-600 transition-colors">
          <span class="text-xs">${lm.icon}</span>
          <span class="whitespace-nowrap tracking-tight">${lm.shortName}</span>
        </div>
        <div class="w-1.5 h-1.5 bg-slate-800 rounded-full mt-0.5 shadow-xs"></div>
      `;

      const popupContent = document.createElement('div');
      popupContent.className = 'p-1.5 text-slate-800 text-xs min-w-[200px] font-sans';
      popupContent.innerHTML = `
        <div class="font-extrabold text-xs text-slate-900 flex items-center gap-1.5">
          <span>${lm.icon}</span>
          <span>${lm.name}</span>
        </div>
        <div class="text-[10px] font-medium text-indigo-600 mt-0.5">${lm.desc}</div>
        <div class="text-[10px] text-slate-500 mt-1 border-t border-slate-100 pt-1 leading-snug">${lm.address}</div>
        <div class="text-[9px] font-mono text-slate-400 mt-1">Lat: ${lm.lat.toFixed(5)}, Lng: ${lm.lng.toFixed(5)}</div>
      `;

      const btnSelect = document.createElement('button');
      btnSelect.type = 'button';
      btnSelect.className =
        'mt-2 w-full py-1.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] rounded-lg transition-colors cursor-pointer text-center';
      btnSelect.textContent = onPlaceSelect ? '📍 Select as Stop' : '🔍 Center Here';
      btnSelect.onclick = (e) => {
        e.stopPropagation();
        handleFlyToLandmark(lm);
      };
      popupContent.appendChild(btnSelect);

      const popup = new maplibregl.Popup({ offset: 12, closeButton: false }).setDOMContent(popupContent);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([lm.lng, lm.lat])
        .setPopup(popup)
        .addTo(map);

      landmarkMarkersRef.current.push(marker);
    });

    return () => {
      landmarkMarkersRef.current.forEach((m) => m.remove());
      landmarkMarkersRef.current = [];
    };
  }, [mapLoaded, onPlaceSelect]);

  const handleFlyToLandmark = (lm: RegionLandmark) => {
    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lm.lng, lm.lat], zoom: 14.5, duration: 1000 });
    }
    if (onPlaceSelect) {
      onPlaceSelect({
        name: lm.name,
        address: lm.address,
        lat: lm.lat,
        lng: lm.lng,
      });
    }
    if (onMapClick) {
      onMapClick({ lat: lm.lat, lng: lm.lng });
    }
    setSearchQuery(lm.shortName);
    setShowDropdown(false);
  };

  // 7. Place Search & Autocomplete
  const executeSearch = async (query: string) => {
    if (!query || query.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);

    // Instant local matches for Mepco, Sivakasi, Virudhunagar
    const lowerQuery = query.toLowerCase().trim();
    const localMatches = MEPCO_REGION_LANDMARKS.filter(
      (lm) =>
        lm.name.toLowerCase().includes(lowerQuery) ||
        lm.shortName.toLowerCase().includes(lowerQuery) ||
        lm.address.toLowerCase().includes(lowerQuery) ||
        lm.desc.toLowerCase().includes(lowerQuery)
    ).map((lm) => ({
      name: `${lm.icon} ${lm.name}`,
      display_name: `${lm.address} (${lm.desc})`,
      lat: lm.lat.toString(),
      lon: lm.lng.toString(),
      is_local: true,
    }));

    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=6&addressdetails=1`
      );
      if (res.ok) {
        const data = await res.json();
        setSearchResults([...localMatches, ...data]);
        setShowDropdown(true);
      } else {
        setSearchResults(localMatches);
        if (localMatches.length > 0) setShowDropdown(true);
      }
    } catch {
      setSearchResults(localMatches);
      if (localMatches.length > 0) setShowDropdown(true);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSearchChange = (value: string) => {
    setSearchQuery(value);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      executeSearch(value);
    }, 300);
  };

  const handleSelectPlace = (place: any) => {
    const lat = parseFloat(place.lat);
    const lng = parseFloat(place.lon);
    const name = place.name || place.display_name.split(',')[0] || 'Selected Place';
    const address = place.display_name;

    if (mapRef.current) {
      mapRef.current.flyTo({ center: [lng, lat], zoom: 15, duration: 1200 });
    }

    if (onPlaceSelect) {
      onPlaceSelect({ name, address, lat, lng });
    }

    if (onMapClick) {
      onMapClick({ lat, lng });
    }

    setShowDropdown(false);
    setSearchQuery(name);
  };

  return (
    <div className={`relative ${className}`}>
      {/* Search Input Box */}
      {showSearch && (
        <div className="absolute top-3 left-3 right-16 z-20 max-w-md">
          <div className="relative">
            <div className="flex items-center bg-white/95 rounded-xl border border-slate-300 shadow-md backdrop-blur-xs px-3.5 py-2.5 text-xs focus-within:ring-2 focus-within:ring-indigo-600 focus-within:border-transparent">
              <Search className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => handleSearchChange(e.target.value)}
                onFocus={() => (searchResults.length > 0 || searchQuery.length > 1) && executeSearch(searchQuery)}
                placeholder="Search places (e.g. Mepco, Sivakasi, Virudhunagar)..."
                className="w-full bg-transparent border-none outline-none text-slate-800 placeholder-slate-400 font-medium text-xs"
              />
              {isSearching && <Loader2 className="w-3.5 h-3.5 text-indigo-600 animate-spin shrink-0" />}
            </div>

            {/* Results Dropdown */}
            {showDropdown && searchResults.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden z-30 max-h-64 overflow-y-auto divide-y divide-slate-100">
                {searchResults.map((item, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectPlace(item)}
                    className={`w-full text-left px-3.5 py-2.5 text-xs hover:bg-indigo-50 flex items-start gap-2.5 transition-colors cursor-pointer ${
                      item.is_local ? 'bg-indigo-50/40' : ''
                    }`}
                  >
                    <MapPin className="w-4 h-4 text-indigo-600 mt-0.5 shrink-0" />
                    <div className="truncate">
                      <div className="font-bold text-slate-900 truncate">
                        {item.name || item.display_name.split(',')[0]}
                      </div>
                      <div className="text-[10px] text-slate-500 truncate">{item.display_name}</div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Map Interactive Toolbar: 3D Toggle, Follow Bus, Recenter, Style Selector */}
      <div className="absolute top-3 right-14 z-20 flex items-center gap-2">
        {/* 3D Mode Toggle */}
        <button
          type="button"
          onClick={toggle3DMode}
          className={`px-3 py-2 rounded-xl shadow-md border text-xs font-extrabold flex items-center gap-1.5 backdrop-blur-xs transition-all cursor-pointer ${
            is3DMode
              ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-600/30 ring-2 ring-indigo-300'
              : 'bg-white/95 hover:bg-white text-slate-700 border-slate-200'
          }`}
          title={is3DMode ? 'Switch to 2D Top-Down View' : 'Switch to 3D Realistic Vehicle View'}
        >
          <Box className="w-3.5 h-3.5" />
          <span>{is3DMode ? '3D Active' : '2D Map'}</span>
        </button>

        {/* Follow 3D Bus Lock */}
        {liveLocation && (
          <button
            type="button"
            onClick={() => setFollowBus((f) => !f)}
            className={`px-3 py-2 rounded-xl shadow-md border text-xs font-bold flex items-center gap-1.5 backdrop-blur-xs transition-all cursor-pointer ${
              followBus
                ? 'bg-emerald-600 text-white border-emerald-500 shadow-emerald-600/30'
                : 'bg-white/95 hover:bg-white text-slate-700 border-slate-200'
            }`}
            title={followBus ? 'Camera locked to 3D Bus' : 'Click to lock camera to 3D Bus'}
          >
            <Navigation className={`w-3.5 h-3.5 ${followBus ? 'animate-pulse text-white' : 'text-slate-500'}`} />
            <span className="hidden sm:inline">{followBus ? 'Chase Bus' : 'Free Cam'}</span>
          </button>
        )}

        {/* Recenter Camera */}
        <button
          type="button"
          onClick={handleRecenter}
          className="p-2 bg-white/95 hover:bg-white text-slate-700 rounded-xl shadow-md border border-slate-200 backdrop-blur-xs transition-colors cursor-pointer"
          title="Recenter on Live Bus or Route"
        >
          <Focus className="w-4 h-4 text-indigo-600" />
        </button>

        {/* Map Style Selector Button */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowStyleMenu((prev) => !prev)}
            className="p-2 bg-white/95 hover:bg-white text-slate-700 rounded-xl shadow-md border border-slate-200 backdrop-blur-xs transition-colors cursor-pointer"
            title="Change Map Style"
          >
            <Layers className="w-4 h-4 text-indigo-600" />
          </button>

          {showStyleMenu && (
            <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden py-1 z-30 text-xs">
              {Object.entries(STYLES).map(([key, item]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => handleChangeStyle(key)}
                  className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-indigo-50 transition-colors ${
                    currentStyleKey === key ? 'font-bold text-indigo-600 bg-indigo-50/50' : 'text-slate-700'
                  }`}
                >
                  <span>{item.name}</span>
                  {currentStyleKey === key && <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Actual Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full" />

      {/* Quick City & College Landmark Navigation Bar */}
      <div className="absolute bottom-3 right-3 z-10 flex items-center gap-1.5 overflow-x-auto max-w-[calc(100%-120px)] p-1 bg-white/95 backdrop-blur-md rounded-xl shadow-md border border-slate-200">
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-1 hidden md:inline">
          Quick Jump:
        </span>
        {MEPCO_REGION_LANDMARKS.map((lm) => (
          <button
            key={lm.id}
            type="button"
            onClick={() => handleFlyToLandmark(lm)}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-slate-50 hover:bg-indigo-50 hover:text-indigo-700 text-slate-700 border border-slate-200 hover:border-indigo-200 transition-all cursor-pointer whitespace-nowrap shadow-2xs active:scale-95"
            title={`${lm.name} - ${lm.address}`}
          >
            <span>{lm.icon}</span>
            <span>{lm.shortName}</span>
          </button>
        ))}
      </div>

      {/* Map Click Helper Badge */}
      {onMapClick && (
        <div className="absolute bottom-3 left-3 bg-slate-900/90 text-white text-[11px] font-semibold px-3 py-1.5 rounded-xl shadow-md backdrop-blur-xs flex items-center gap-1.5 z-10 pointer-events-none border border-slate-700">
          <span className="text-emerald-400">📍</span>
          <span>Click anywhere to mark stop coordinates</span>
        </div>
      )}

      {/* Stale GPS Signal Warning */}
      {liveLocation?.is_stale && (
        <div className="absolute top-3 left-3 bg-amber-500/95 text-white text-xs font-semibold px-3 py-1.5 rounded-xl shadow-md backdrop-blur-xs flex items-center gap-2 z-10 border border-amber-600">
          <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
          <span>
            GPS signal stale ({Math.round(liveLocation.stale_seconds)}s ago) - Waiting for driver phone update
          </span>
        </div>
      )}
    </div>
  );
};
