import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { Stop, LiveLocation } from '../types';
import { Search, MapPin, AlertTriangle, Compass, Navigation, Loader2, Layers, CheckCircle2 } from 'lucide-react';

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

  // Markers refs
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const busMarkerRef = useRef<maplibregl.Marker | null>(null);
  const approachMarkerRef = useRef<maplibregl.Marker | null>(null);
  const highlightMarkerRef = useRef<maplibregl.Marker | null>(null);
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([]);

  // Place Search & Autocomplete
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<any>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const searchTimeoutRef = useRef<any>(null);

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
      zoom: stops.length > 0 || liveLocation ? 13 : 12,
      interactive,
      attributionControl: false,
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

    // A. Road Polyline Layer
    const routeCoords = routeGeometry ? decodePolylineJs(routeGeometry) : [];
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
    } else if (routeCoords.length > 0) {
      map.addSource('route-line', {
        type: 'geojson',
        data: routeGeoJson,
      });

      // Casing outline for high contrast
      map.addLayer({
        id: 'route-line-casing',
        type: 'line',
        source: 'route-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#1e1b4b',
          'line-width': 8,
          'line-opacity': 0.7,
        },
      });

      // Core indigo road line
      map.addLayer({
        id: 'route-line-core',
        type: 'line',
        source: 'route-line',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
          'line-color': '#4f46e5',
          'line-width': 5,
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
      el.className = 'group cursor-pointer flex flex-col items-center';

      const circleColor = isSelected
        ? 'bg-indigo-600 ring-4 ring-indigo-300'
        : isOrigin
        ? 'bg-emerald-500 ring-2 ring-white'
        : isDestination
        ? 'bg-rose-500 ring-2 ring-white'
        : 'bg-indigo-500 ring-2 ring-white';

      el.innerHTML = `
        <div class="flex items-center justify-center w-7 h-7 rounded-full text-white text-xs font-bold shadow-md ${circleColor} transition-transform hover:scale-125">
          ${index + 1}
        </div>
        <div class="mt-1 bg-white/95 text-slate-800 text-[10px] font-bold px-1.5 py-0.5 rounded-md shadow-xs border border-slate-200 whitespace-nowrap max-w-[120px] truncate">
          ${stop.name}
        </div>
      `;

      el.addEventListener('click', () => {
        if (onStopSelect) onStopSelect(stop);
      });

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([stop.longitude, stop.latitude])
        .addTo(map);

      stopMarkersRef.current.push(marker);
      bounds.extend([stop.longitude, stop.latitude]);
    });

    // 5. Render Live Bus Marker
    if (liveLocation && typeof liveLocation.latitude === 'number' && typeof liveLocation.longitude === 'number') {
      const isStale = liveLocation.is_stale;
      const speed = liveLocation.speed_kmh ?? 0;

      if (!busMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'relative flex flex-col items-center cursor-pointer';
        el.innerHTML = `
          <div class="relative flex items-center justify-center">
            <span class="absolute w-12 h-12 rounded-full ${isStale ? 'bg-amber-400' : 'bg-emerald-500'} opacity-35 animate-ping"></span>
            <div class="w-10 h-10 rounded-full ${isStale ? 'bg-amber-500' : 'bg-emerald-600'} text-white flex items-center justify-center shadow-xl border-2 border-white z-10">
              <svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M4 16c0 1.1.9 2 2 2h1v1a1 1 0 0 0 2 0v-1h6v1a1 1 0 0 0 2 0v-1h1c1.1 0 2-.9 2-2V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
              </svg>
            </div>
          </div>
          <div class="mt-1 bg-slate-900/95 text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full shadow-md flex items-center gap-1 border border-slate-700">
            <span>BUS ${liveLocation.bus_number || ''}</span>
            <span class="text-emerald-400 font-semibold">• ${speed.toFixed(1)} km/h</span>
          </div>
        `;

        busMarkerRef.current = new maplibregl.Marker({ element: el })
          .setLngLat([liveLocation.longitude, liveLocation.latitude])
          .addTo(map);
      } else {
        busMarkerRef.current.setLngLat([liveLocation.longitude, liveLocation.latitude]);
      }
      bounds.extend([liveLocation.longitude, liveLocation.latitude]);
    } else if (busMarkerRef.current) {
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

      {/* Map Style Selector Button */}
      <div className="absolute top-3 right-14 z-20">
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
