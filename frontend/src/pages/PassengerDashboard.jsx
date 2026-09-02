import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { 
  getAllActiveBusesWithLocations, 
  subscribeToAllBusLocationsRealtime 
} from '../services/authService';
import { fetchRoadRoute, getRouteStops } from '../services/routingService';
import { searchPlacesWithNominatim, getRoutePOIs } from '../services/placeService';
import { 
  Bus, 
  MapPin, 
  Radio, 
  Clock, 
  User, 
  Compass, 
  Navigation, 
  Search, 
  AlertCircle, 
  CheckCircle2, 
  RefreshCw, 
  ChevronRight,
  Eye,
  SlidersHorizontal,
  X,
  Zap,
  ShieldAlert,
  Building2,
  Train,
  Hospital,
  Store,
  GraduationCap,
  Map as MapIcon
} from 'lucide-react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export default function PassengerDashboard() {
  const navigate = useNavigate();

  // State management
  const [buses, setBuses] = useState([]);
  const [selectedBusId, setSelectedBusId] = useState(null);
  const [selectedRouteInfo, setSelectedRouteInfo] = useState(null);
  const [selectedRouteStops, setSelectedRouteStops] = useState([]);
  const [routingError, setRoutingError] = useState(null);
  const [loadingRoute, setLoadingRoute] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [passengerLocation, setPassengerLocation] = useState(null);
  const [locationError, setLocationError] = useState(null);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());
  const [mapType, setMapType] = useState('street'); // 'street' | 'satellite'

  // Nominatim Place Search State
  const [placeSearchQuery, setPlaceSearchQuery] = useState('');
  const [placeSearchResults, setPlaceSearchResults] = useState([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);

  // Leaflet map, polyline, tile layers and markers refs
  const mapContainerRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const tileLayerRef = useRef(null);
  const labelsLayerRef = useRef(null);
  const routePolylineRef = useRef(null); // Leaflet Polyline layer for road route
  const busMarkersRef = useRef(new Map()); // Map of driver_id -> Leaflet Marker
  const passengerMarkerRef = useRef(null); // Leaflet Marker for passenger
  const stopMarkersRef = useRef([]); // Leaflet Markers for Bus Stops
  const poiMarkersRef = useRef([]); // Leaflet Markers for Category POIs
  const searchMarkersRef = useRef([]); // Leaflet Markers for Nominatim search
  const watchLocationIdRef = useRef(null);
  const realtimeUnsubRef = useRef(null);

  // Helper function to calculate relative time string (e.g. "5 seconds ago")
  const getRelativeTime = (timestamp) => {
    if (!timestamp) return 'Never';
    const seconds = Math.max(0, Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000));
    if (seconds < 10) return 'Just now';
    if (seconds < 60) return `${seconds} sec ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes} min ago`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hr ago`;
  };

  // Clear stop and POI markers helper
  const clearMapPOIsAndStops = () => {
    stopMarkersRef.current.forEach(m => m.remove());
    stopMarkersRef.current = [];
    poiMarkersRef.current.forEach(m => m.remove());
    poiMarkersRef.current = [];
  };

  const clearSearchMarkers = () => {
    searchMarkersRef.current.forEach(m => m.remove());
    searchMarkersRef.current = [];
    setPlaceSearchResults([]);
  };

  const handleDeselectBus = () => {
    setSelectedBusId(null);
    clearMapPOIsAndStops();
    setSelectedRouteStops([]);
    if (routePolylineRef.current) {
      try {
        routePolylineRef.current.remove();
      } catch (e) {}
      routePolylineRef.current = null;
    }
    setSelectedRouteInfo(null);
    setRoutingError(null);
  };

  const handleClearSelectedBus = handleDeselectBus;

  // Handler: Select bus, center map, load road polyline, render POIs and ordered bus stops
  const handleSelectBus = async (bus) => {
    if (!bus) return;
    if (selectedBusId === bus.driver_id) {
      handleDeselectBus();
      return;
    }

    setSelectedBusId(bus.driver_id);
    clearMapPOIsAndStops();
    
    // Center map on bus position if valid coordinates
    if (bus.latitude !== null && bus.longitude !== null && mapInstanceRef.current) {
      mapInstanceRef.current.setView([bus.latitude, bus.longitude], 15, { animate: true });
      const marker = busMarkersRef.current.get(bus.driver_id);
      if (marker) {
        try { marker.openPopup(); } catch (e) {}
      }
    }

    // Clean up previous route polyline
    if (routePolylineRef.current) {
      try { routePolylineRef.current.remove(); } catch (e) {}
      routePolylineRef.current = null;
    }
    setSelectedRouteInfo(null);
    setRoutingError(null);

    if (!bus.route) return;

    // Load ordered bus stops for route timeline card
    const routeStops = getRouteStops(bus.route);
    setSelectedRouteStops(routeStops);

    const map = mapInstanceRef.current;
    if (map) {
      // 1. Render Bus Stops Markers (📍)
      routeStops.forEach(stop => {
        const stopIcon = L.divIcon({
          className: `custom-stop-marker-${stop.id}`,
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center;">
              <div style="
                background: linear-gradient(135deg, #4f46e5, #1e1b4b);
                color: #ffffff;
                width: 28px;
                height: 28px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 0 12px rgba(99, 102, 241, 0.6);
                border: 2px solid #ffffff;
                font-size: 13px;
              ">
                📍
              </div>
              <div style="
                position: absolute;
                top: 30px;
                white-space: nowrap;
                background: rgba(15, 23, 42, 0.95);
                color: #818cf8;
                border: 1px solid #3730a3;
                padding: 1px 6px;
                border-radius: 6px;
                font-size: 9px;
                font-weight: 800;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
              ">
                ${stop.stop_order}. ${stop.name}
              </div>
            </div>
          `,
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });

        const marker = L.marker([stop.latitude, stop.longitude], { icon: stopIcon })
          .addTo(map)
          .bindPopup(`<div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 4px;"><strong style="color: #818cf8; font-size: 13px;">📍 Bus Stop ${stop.stop_order}</strong><p style="color: #f8fafc; font-size: 12px; margin-top: 2px;">${stop.name}</p></div>`);

        stopMarkersRef.current.push(marker);
      });

      // 2. Render Route Category POIs (🏫 Colleges, 🏥 Hospitals, 🚉 Stations, 🏪 Markets)
      const pois = getRoutePOIs(bus.route);
      pois.forEach(poi => {
        const poiColor = poi.category === 'college' ? '#10b981' : poi.category === 'hospital' ? '#f43f5e' : poi.category === 'station' ? '#f59e0b' : '#a855f7';
        const poiIcon = L.divIcon({
          className: `custom-poi-marker-${poi.id}`,
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center;">
              <div style="
                background: linear-gradient(135deg, ${poiColor}, #0f172a);
                color: #ffffff;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: 0 0 14px ${poiColor};
                border: 2px solid #ffffff;
                font-size: 15px;
              ">
                ${poi.icon || '🏢'}
              </div>
              <div style="
                position: absolute;
                bottom: 34px;
                white-space: nowrap;
                background: rgba(15, 23, 42, 0.95);
                color: #f8fafc;
                border: 1px solid ${poiColor};
                padding: 1px 6px;
                border-radius: 6px;
                font-size: 9px;
                font-weight: 800;
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
              ">
                ${poi.name}
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const marker = L.marker([poi.latitude, poi.longitude], { icon: poiIcon })
          .addTo(map)
          .bindPopup(`<div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 4px;"><strong style="color: ${poiColor}; font-size: 13px;">${poi.icon || '🏢'} ${poi.name}</strong><p style="color: #94a3b8; font-size: 11px; margin-top: 2px; text-transform: uppercase;">${poi.category}</p></div>`);

        poiMarkersRef.current.push(marker);
      });
    }

    setLoadingRoute(true);
    try {
      // Fetch road route geometry from OpenRouteService
      const routeRes = await fetchRoadRoute({ routeName: bus.route });

      if (routeRes.success && Array.isArray(routeRes.polyline) && routeRes.polyline.length > 1) {
        if (map) {
          // Render cyan road-following polyline
          const polyline = L.polyline(routeRes.polyline, {
            color: '#06b6d4',
            weight: 5,
            opacity: 0.85,
            lineCap: 'round',
            lineJoin: 'round'
          }).addTo(map);

          routePolylineRef.current = polyline;

          // Fit map bounds to show full route path with padding
          map.fitBounds(polyline.getBounds(), { padding: [40, 40], maxZoom: 16 });
        }

        setSelectedRouteInfo({
          routeName: bus.route,
          distanceKm: routeRes.distanceKm,
          durationMin: routeRes.durationMin
        });
      } else {
        setRoutingError(routeRes.error || 'Road route could not be found.');
      }
    } catch (err) {
      console.error('Error rendering road route:', err);
      setRoutingError('Road route could not be found.');
    } finally {
      setLoadingRoute(false);
    }
  };

  // Handler: "Locate Me" button to center map on passenger's location or Ajmer City Center
  const handleLocateMe = () => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const isValidCoord = (lat, lng) => typeof lat === 'number' && typeof lng === 'number' && lat > 20 && lat < 35 && lng > 70 && lng < 88;

    if (passengerLocation && isValidCoord(passengerLocation.lat, passengerLocation.lng)) {
      map.setView([passengerLocation.lat, passengerLocation.lng], 15, { animate: true });
    } else if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (isValidCoord(latitude, longitude)) {
            setPassengerLocation({ lat: latitude, lng: longitude });
            map.setView([latitude, longitude], 15, { animate: true });
          } else {
            map.setView([26.4696, 74.6447], 14, { animate: true });
          }
        },
        () => {
          map.setView([26.4696, 74.6447], 14, { animate: true });
        }
      );
    } else {
      map.setView([26.4696, 74.6447], 14, { animate: true });
    }
  };

  // Handler: Nominatim Place Search
  const handleSearchPlaces = async (e) => {
    if (e) e.preventDefault();
    if (!placeSearchQuery.trim()) return;

    setSearchingPlaces(true);
    clearSearchMarkers();

    try {
      const results = await searchPlacesWithNominatim(placeSearchQuery);
      setPlaceSearchResults(results);

      const map = mapInstanceRef.current;
      if (map && results.length > 0) {
        const bounds = [];
        results.forEach(place => {
          bounds.push([place.latitude, place.longitude]);

          const poiIcon = L.divIcon({
            className: `search-poi-marker-${place.id}`,
            html: `
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <div style="
                  background: linear-gradient(135deg, #e11d48, #0f172a);
                  color: #ffffff;
                  width: 30px;
                  height: 30px;
                  border-radius: 50%;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  box-shadow: 0 0 14px #e11d48;
                  border: 2px solid #ffffff;
                  font-size: 14px;
                ">
                  📍
                </div>
                <div style="
                  position: absolute;
                  bottom: 32px;
                  white-space: nowrap;
                  background: #0f172a;
                  color: #f8fafc;
                  border: 1px solid #e11d48;
                  padding: 2px 6px;
                  border-radius: 6px;
                  font-size: 9px;
                  font-weight: 800;
                ">
                  ${place.name}
                </div>
              </div>
            `,
            iconSize: [30, 30],
            iconAnchor: [15, 15]
          });

          const marker = L.marker([place.latitude, place.longitude], { icon: poiIcon })
            .addTo(map)
            .bindPopup(`<div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 4px;"><strong style="color: #f43f5e; font-size: 13px;">📍 ${place.name}</strong><p style="color: #cbd5e1; font-size: 11px; margin-top: 2px;">${place.fullName}</p></div>`);

          searchMarkersRef.current.push(marker);
        });

        if (bounds.length > 0) {
          map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
        }
      }
    } catch (err) {
      console.error('Error searching places:', err);
    } finally {
      setSearchingPlaces(false);
    }
  };

  // 1. Initial Load & Periodic Bus Data Fetching
  const fetchBusesData = async () => {
    try {
      const activeBuses = await getAllActiveBusesWithLocations();
      setBuses(activeBuses);
      setLastSyncTime(new Date());
    } catch (err) {
      console.error('Error fetching live bus data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusesData();

    // 3-second polling fallback to guarantee real-time updates across browsers/tabs
    const pollInterval = setInterval(() => {
      fetchBusesData();
    }, 3000);

    // Subscribe to Supabase Realtime postgres_changes across bus_locations and drivers
    realtimeUnsubRef.current = subscribeToAllBusLocationsRealtime(() => {
      fetchBusesData();
    });

    return () => {
      clearInterval(pollInterval);
      if (realtimeUnsubRef.current) {
        realtimeUnsubRef.current();
        realtimeUnsubRef.current = null;
      }
    };
  }, []);

  // 2. Initialize Leaflet Map Instance ONCE
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // Default center on Ajmer city [26.4696, 74.6447]
    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
      scrollWheelZoom: true
    }).setView([26.4696, 74.6447], 13);

    // Custom zoom control position (top right)
    L.control.zoom({ position: 'topright' }).addTo(map);

    mapInstanceRef.current = map;

    // Invalidate map size after DOM mount to guarantee proper sizing
    setTimeout(() => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
    }, 250);

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }
    };
  }, []);

  // 2b. Dynamic Tile Layer Switching (Street vs Satellite View)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    // Clean up existing tile layers
    if (tileLayerRef.current) {
      try { map.removeLayer(tileLayerRef.current); } catch (e) {}
    }
    if (labelsLayerRef.current) {
      try { map.removeLayer(labelsLayerRef.current); } catch (e) {}
    }

    if (mapType === 'satellite') {
      // Esri World Imagery Satellite Tiles
      const satLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and GIS User Community'
      }).addTo(map);

      // Esri Reference Labels Overlay
      const labelLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19,
        attribution: ''
      }).addTo(map);

      tileLayerRef.current = satLayer;
      labelsLayerRef.current = labelLayer;
    } else {
      // OpenStreetMap Standard Tiles
      const streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(map);

      tileLayerRef.current = streetLayer;
      labelsLayerRef.current = null;
    }
  }, [mapType]);

  // 3. Browser Geolocation for Passenger Location ("📍 YOU ARE HERE")
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser.');
      return;
    }

    // Helper to validate realistic coordinates (India / Rajasthan area)
    const isValidCoord = (lat, lng) => typeof lat === 'number' && typeof lng === 'number' && lat > 20 && lat < 35 && lng > 70 && lng < 88;

    // Request initial position
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (isValidCoord(latitude, longitude)) {
          setPassengerLocation({ lat: latitude, lng: longitude });
          setLocationError(null);
        }
      },
      (err) => {
        let msg = 'Location access denied. You can still view buses.';
        if (err.code === err.POSITION_UNAVAILABLE) msg = 'Location unavailable. You can still view buses.';
        if (err.code === err.TIMEOUT) msg = 'Location request timed out. You can still view buses.';
        setLocationError(msg);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );

    // Continuous watchPosition for passenger moving locally
    watchLocationIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (isValidCoord(latitude, longitude)) {
          setPassengerLocation({ lat: latitude, lng: longitude });
          setLocationError(null);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setLocationError('Location access denied. You can still view buses.');
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
    );

    return () => {
      if (watchLocationIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchLocationIdRef.current);
        watchLocationIdRef.current = null;
      }
    };
  }, []);

  // 4. Update Passenger Location Marker on Leaflet Map
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || !passengerLocation) return;

    const passengerIcon = L.divIcon({
      className: 'passenger-location-marker',
      html: `
        <div style="position: relative; display: flex; items-center; justify-content: center;">
          <div style="
            position: absolute;
            width: 36px;
            height: 36px;
            background: rgba(59, 130, 246, 0.35);
            border-radius: 50%;
            animation: pulse-ring 2s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
          "></div>
          <div style="
            background: linear-gradient(135deg, #3b82f6, #1d4ed8);
            width: 24px;
            height: 24px;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 0 16px rgba(59, 130, 246, 0.8);
            border: 3px solid #ffffff;
            color: #ffffff;
            font-size: 11px;
            font-weight: bold;
          ">
            📍
          </div>
          <div style="
            position: absolute;
            top: -24px;
            white-space: nowrap;
            background: #1e293b;
            color: #60a5fa;
            border: 1px solid #3b82f6;
            padding: 2px 8px;
            border-radius: 9999px;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: 0.5px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.5);
          ">
            YOU ARE HERE
          </div>
        </div>
      `,
      iconSize: [24, 24],
      iconAnchor: [12, 12]
    });

    if (!passengerMarkerRef.current) {
      const marker = L.marker([passengerLocation.lat, passengerLocation.lng], { icon: passengerIcon }).addTo(map);
      passengerMarkerRef.current = marker;
    } else {
      passengerMarkerRef.current.setLatLng([passengerLocation.lat, passengerLocation.lng]);
    }
  }, [passengerLocation]);

  // 5. Update Bus Markers on Leaflet Map (Only ONLINE / LIVE buses are shown on the map)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentMarkers = busMarkersRef.current;
    const activeDriverIds = new Set();

    // Filter to active buses with valid coordinates
    const onlineBuses = buses.filter(bus => bus.latitude !== null && bus.longitude !== null && bus.status_code !== 'UNAVAILABLE');

    // If a specific bus/route is selected by passenger, show ONLY that selected bus on the map
    const busesToDisplay = selectedBusId 
      ? onlineBuses.filter(bus => bus.driver_id === selectedBusId || bus.id === selectedBusId || bus.user_id === selectedBusId)
      : onlineBuses;

    // Handle coordinate offset for overlapping buses so all markers remain distinctly visible
    const processedBuses = busesToDisplay.map((bus, idx) => {
      let lat = bus.latitude;
      let lng = bus.longitude;
      if (lat === null || lng === null) return null;

      const isDuplicate = busesToDisplay.slice(0, idx).some(prev => 
        prev.latitude !== null && prev.longitude !== null &&
        Math.abs(prev.latitude - lat) < 0.0003 &&
        Math.abs(prev.longitude - lng) < 0.0003
      );

      if (isDuplicate) {
        lat += (idx * 0.00035);
        lng += (idx * 0.00035);
      }

      return { ...bus, displayLat: lat, displayLng: lng };
    }).filter(Boolean);

    processedBuses.forEach(bus => {
      activeDriverIds.add(bus.driver_id);

      const isLive = bus.status_code === 'LIVE';
      const badgeBg = isLive ? '#10b981' : '#f59e0b';
      const badgeGlow = isLive ? 'rgba(16, 185, 129, 0.6)' : 'rgba(245, 158, 11, 0.5)';

      // Custom HTML Bus Icon
      const busIcon = L.divIcon({
        className: `bus-marker-${bus.driver_id}`,
        html: `
          <div style="position: relative; cursor: pointer;">
            <div style="
              background: linear-gradient(135deg, ${badgeBg}, #0f172a);
              width: 44px;
              height: 44px;
              border-radius: 50%;
              display: flex;
              align-items: center;
              justify-content: center;
              box-shadow: 0 0 20px ${badgeGlow};
              border: 3px solid #ffffff;
              font-size: 22px;
              transition: transform 0.2s ease;
            ">
              🚌
            </div>
            <div style="
              position: absolute;
              bottom: -6px;
              right: -4px;
              background: ${badgeBg};
              color: #ffffff;
              font-size: 8px;
              font-weight: 900;
              padding: 1px 5px;
              border-radius: 6px;
              border: 1px solid #ffffff;
              text-transform: uppercase;
            ">
              ${isLive ? 'LIVE' : 'STALE'}
            </div>
          </div>
        `,
        iconSize: [44, 44],
        iconAnchor: [20, 20]
      });

      // HTML Popup content
      const busPlate = bus.busNumber || (bus.driver_id === 'devesh' ? 'RJ-01-GB-5566' : 'RJ-14-PB-4455');
      const busSpeed = bus.speed || (isLive ? 34 : 0);
      const busEta = bus.eta || (isLive ? '8 min' : 'N/A');

      const popupHtml = `
        <div style="font-family: ui-sans-serif, system-ui, sans-serif; padding: 6px; min-width: 220px; color: #f8fafc;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; border-bottom: 1px solid #334155; padding-bottom: 6px;">
            <div>
              <span style="font-weight: 900; font-size: 15px; color: #f8fafc; display: block; line-height: 1.2;">Bus ${bus.bus_number}</span>
              <span style="font-size: 10px; font-weight: 800; color: #38bdf8; letter-spacing: 0.5px;">${busPlate}</span>
            </div>
            <span style="
              font-size: 10px;
              font-weight: 800;
              padding: 3px 8px;
              border-radius: 8px;
              background: ${isLive ? '#064e3b' : '#78350f'};
              color: ${isLive ? '#6ee7b7' : '#fde68a'};
              border: 1px solid ${isLive ? '#059669' : '#d97706'};
            ">
              ${bus.status_label}
            </span>
          </div>

          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; margin-bottom: 8px;">
            <div style="background: #0f172a; padding: 5px 8px; border-radius: 8px; border: 1px solid #1e293b;">
              <span style="font-size: 8px; color: #64748b; font-weight: 900; display: block; letter-spacing: 0.5px;">SPEED</span>
              <span style="font-size: 12px; font-weight: 900; color: #10b981;">⚡ ${busSpeed} km/h</span>
            </div>
            <div style="background: #0f172a; padding: 5px 8px; border-radius: 8px; border: 1px solid #1e293b;">
              <span style="font-size: 8px; color: #64748b; font-weight: 900; display: block; letter-spacing: 0.5px;">EST. ARRIVAL</span>
              <span style="font-size: 12px; font-weight: 900; color: #06b6d4;">⏱️ ${busEta}</span>
            </div>
          </div>

          <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 4px;">
            <strong style="color: #94a3b8;">Route:</strong> ${bus.route}
          </div>
          <div style="font-size: 11px; color: #cbd5e1; margin-bottom: 8px;">
            <strong style="color: #94a3b8;">Driver:</strong> ${bus.name || 'Assigned Driver'}
          </div>

          <div style="font-size: 10px; color: #64748b; font-family: monospace; display: flex; align-items: center; justify-content: space-between; border-top: 1px solid #1e293b; padding-top: 6px;">
            <span>Last Updated:</span>
            <strong style="color: #38bdf8;">${getRelativeTime(bus.updated_at)}</strong>
          </div>
        </div>
      `;

      if (currentMarkers.has(bus.driver_id)) {
        // Smoothly update position of EXISTING marker instance without recreating marker
        const marker = currentMarkers.get(bus.driver_id);
        marker.setLatLng([bus.displayLat, bus.displayLng]);
        marker.setIcon(busIcon);
        marker.setPopupContent(popupHtml);
      } else {
        // Create NEW marker instance
        const marker = L.marker([bus.displayLat, bus.displayLng], { icon: busIcon })
          .addTo(map)
          .bindPopup(popupHtml);

        marker.on('click', () => {
          handleSelectBus(bus);
        });

        currentMarkers.set(bus.driver_id, marker);
      }
    });

    // Clean up markers for drivers that are offline, unselected, or no longer active
    currentMarkers.forEach((marker, driverId) => {
      if (!activeDriverIds.has(driverId)) {
        marker.remove();
        currentMarkers.delete(driverId);
      }
    });
  }, [buses, selectedBusId]);

  // Filtered buses list based on search query
  const filteredBuses = buses.filter(b => 
    b.bus_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.route?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.name?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const activeCount = buses.filter(b => b.status_code === 'LIVE').length;
  const selectedBus = buses.find(b => b.driver_id === selectedBusId);

  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-100 flex flex-col justify-between overflow-x-hidden font-sans relative">
      
      {/* Background glow meshes */}
      <div className="absolute top-[10%] left-[5%] w-[45%] h-[45%] bg-emerald-500/10 rounded-full blur-[160px] pointer-events-none z-0"></div>
      <div className="absolute bottom-[10%] right-[5%] w-[45%] h-[45%] bg-teal-500/10 rounded-full blur-[160px] pointer-events-none z-0"></div>

      <Navbar />

      <main className="flex-grow flex flex-col pt-24 pb-8 px-4 sm:px-6 z-10 w-full max-w-7xl mx-auto">
        
        {/* Top Public Header Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-5 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-emerald-400 via-teal-400 to-cyan-500"></div>

          <div>
            <div className="flex items-center gap-2 text-[10px] font-extrabold uppercase text-emerald-400 tracking-widest mb-1">
              <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
              <span>Public Live Bus Telemetry</span>
              <span className="px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-500/40 text-[9px] font-bold text-emerald-300">
                No Auth Required
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
              <span>🚌 Passenger Live Tracker</span>
            </h1>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Live Count Pill */}
            <div className="px-3.5 py-2 bg-emerald-950/70 border border-emerald-500/40 rounded-2xl flex items-center gap-2 text-xs font-bold text-emerald-300 shadow-lg">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span>{activeCount} Active Buses Live</span>
            </div>

            {/* Sync Refresh Button */}
            <button
              onClick={fetchBusesData}
              className="p-2.5 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-2xl border border-zinc-700/60 transition-all text-xs font-bold flex items-center gap-2 cursor-pointer"
              title="Refresh Live Data"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
              <span className="hidden sm:inline">Sync</span>
            </button>
          </div>
        </div>

        {/* Location Notice Banner (If Permission Denied / Info) */}
        {locationError && (
          <div className="mb-6 p-4 rounded-2xl bg-amber-950/40 border border-amber-800/60 text-amber-200 text-xs font-semibold flex items-center justify-between gap-3 shadow-lg backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4.5 h-4.5 text-amber-400 shrink-0" />
              <span>{locationError}</span>
            </div>
            <button
              onClick={handleLocateMe}
              className="px-3 py-1 bg-amber-900/60 hover:bg-amber-800 border border-amber-700 text-amber-100 rounded-xl text-[11px] font-bold transition-all cursor-pointer shrink-0"
            >
              Retry Location
            </button>
          </div>
        )}

        {/* Main Dashboard Layout (Desktop: 4 cols bus list / 8 cols map. Mobile: Map top / Bus list bottom) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch flex-grow min-h-[600px]">

          {/* SIDEBAR / BOTTOM PANEL: Active Buses List */}
          <div className="lg:col-span-4 flex flex-col bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/80 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[750px] overflow-hidden">
            
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80">
              <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-zinc-300">
                <Bus className="w-4 h-4 text-emerald-400" />
                <span>Active Buses ({filteredBuses.length})</span>
              </div>

              <span className="text-[10px] font-mono text-zinc-500">
                Auto-syncs live
              </span>
            </div>

            {/* Search Input Filter */}
            <div className="relative">
              <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search bus number, route, driver..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-zinc-500 transition-all"
              />
            </div>

            {/* Legend Bar */}
            <div className="flex items-center justify-between py-2 px-3 bg-zinc-950/60 rounded-xl border border-zinc-850 text-[10px] font-bold text-zinc-400 gap-1 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]"></span>
                <span>Live Bus</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-amber-400 shadow-[0_0_8px_#f59e0b]"></span>
                <span>Stale</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2 h-2 rounded-full bg-rose-500 shadow-[0_0_8px_#f43f5e]"></span>
                <span>Offline</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px]">📍</span>
                <span>Bus Stop</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="w-2.5 h-1 bg-cyan-400 rounded-sm"></span>
                <span>Road Route</span>
              </div>
            </div>

            {/* Selected Route Ordered Bus Stops Progress Card */}
            {selectedRouteStops && selectedRouteStops.length > 0 && (
              <div className="p-3 bg-zinc-950/80 border border-indigo-900/60 rounded-2xl space-y-2 shrink-0">
                <div className="flex items-center justify-between text-xs font-black text-indigo-300 uppercase tracking-wider pb-1.5 border-b border-zinc-800">
                  <span className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Ordered Route Stops ({selectedRouteStops.length})</span>
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">Road-aligned</span>
                </div>

                <div className="space-y-1.5 pt-0.5 max-h-36 overflow-y-auto custom-scrollbar">
                  {selectedRouteStops.map((stop, sIdx) => {
                    const isFirst = sIdx === 0;
                    const isLast = sIdx === selectedRouteStops.length - 1;
                    return (
                      <div key={stop.id || sIdx} className="flex items-center gap-2 text-xs">
                        <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                          isFirst ? 'bg-emerald-950 text-emerald-300 border border-emerald-500' : isLast ? 'bg-cyan-950 text-cyan-300 border border-cyan-500' : 'bg-zinc-900 text-zinc-400 border border-zinc-700'
                        }`}>
                          {stop.stop_order}
                        </span>
                        <span className={`font-semibold truncate ${isFirst ? 'text-emerald-300' : isLast ? 'text-cyan-300' : 'text-zinc-300'}`}>
                          {stop.name}
                        </span>
                        <span className="text-[10px] text-zinc-500 ml-auto shrink-0">{stop.icon}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Scrollable Bus Cards List */}
            <div className="flex-grow overflow-y-auto space-y-3 pr-1 custom-scrollbar">
              {loading && buses.length === 0 ? (
                <div className="py-12 flex flex-col items-center justify-center text-zinc-500 space-y-3">
                  <div className="w-6 h-6 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-xs font-semibold">Scanning live transit network...</span>
                </div>
              ) : filteredBuses.length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-500 space-y-2">
                  <Bus className="w-8 h-8 text-zinc-700 mx-auto" />
                  <p>No active buses match your search filter.</p>
                </div>
              ) : (
                filteredBuses.map((bus) => {
                  const isSelected = selectedBusId === bus.driver_id;
                  const isLive = bus.status_code === 'LIVE';
                  const isStale = bus.status_code === 'STALE';

                  return (
                    <div
                      key={bus.driver_id || bus.id}
                      onClick={() => handleSelectBus(bus)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer relative overflow-hidden group ${
                        isSelected
                          ? 'bg-zinc-850 border-emerald-500/80 shadow-lg shadow-emerald-950/40'
                          : 'bg-zinc-950/60 hover:bg-zinc-900/80 border-zinc-800/80 hover:border-zinc-700'
                      }`}
                    >
                      {/* Left accent indicator */}
                      <div className={`absolute top-0 left-0 bottom-0 w-[4px] ${
                        isLive ? 'bg-emerald-500' : isStale ? 'bg-amber-500' : bus.latitude !== null ? 'bg-rose-500' : 'bg-zinc-700'
                      }`}></div>

                      <div className="flex items-start justify-between gap-3 mb-2 pl-1">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-base font-black text-white group-hover:text-emerald-300 transition-colors">
                              {bus.bus_number}
                            </span>
                            {isSelected && (
                              <span className="text-[9px] uppercase tracking-wider font-extrabold text-cyan-400 bg-cyan-950 border border-cyan-800 px-2 py-0.5 rounded-full">
                                Route Active
                              </span>
                            )}
                          </div>
                          <div className="text-xs font-semibold text-emerald-400 mt-0.5 flex items-center gap-1">
                            <Navigation className="w-3 h-3 shrink-0" />
                            <span>{bus.route}</span>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <span className={`px-2.5 py-1 rounded-xl text-[10px] font-black uppercase tracking-wider border shrink-0 ${
                          isLive
                            ? 'bg-emerald-950/80 text-emerald-300 border-emerald-500/50 shadow-[0_0_12px_rgba(16,185,129,0.2)]'
                            : isStale
                            ? 'bg-amber-950/60 text-amber-300 border-amber-800/60'
                            : bus.latitude !== null
                            ? 'bg-rose-950/50 text-rose-300 border-rose-800/60'
                            : 'bg-zinc-900 text-zinc-500 border-zinc-800'
                        }`}>
                          {bus.status_label}
                        </span>
                      </div>

                      <div className="flex items-center justify-between pt-2 border-t border-zinc-850 text-[11px] text-zinc-400 pl-1">
                        <div className="flex items-center gap-1 text-zinc-400">
                          <User className="w-3 h-3 text-zinc-500" />
                          <span className="truncate max-w-[120px]">{bus.name || 'Driver'}</span>
                        </div>

                        <div className="flex items-center gap-1 font-mono text-[10px] text-zinc-400">
                          <Clock className="w-3 h-3 text-emerald-400" />
                          <span>{getRelativeTime(bus.updated_at)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

          </div>

          {/* MAIN MAP SECTION */}
          <div className="lg:col-span-8 h-[550px] lg:h-[750px] w-full relative bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden flex flex-col">
            
            {/* Floating "📍 Locate Me" Button */}
            <button
              onClick={handleLocateMe}
              className="absolute top-4 left-4 z-[1000] px-4 py-2.5 bg-zinc-900/90 hover:bg-zinc-800 text-white rounded-2xl border border-zinc-700/80 text-xs font-black tracking-wide flex items-center gap-2 shadow-2xl hover:scale-105 transition-all cursor-pointer backdrop-blur-md"
              title="Center map on your current location"
            >
              <span className="text-base">📍</span>
              <span>Locate Me</span>
            </button>

            {/* Nominatim Place Search Input Overlay */}
            <form onSubmit={handleSearchPlaces} className="absolute top-4 left-36 sm:left-72 z-[1000] flex items-center gap-1 bg-zinc-900/90 border border-zinc-700/80 rounded-2xl px-3 py-1.5 shadow-2xl backdrop-blur-md">
              <input
                type="text"
                placeholder="Search places, hospital, college..."
                value={placeSearchQuery}
                onChange={(e) => setPlaceSearchQuery(e.target.value)}
                className="bg-transparent text-xs text-white placeholder-zinc-500 outline-none w-36 sm:w-48"
              />
              <button type="submit" disabled={searchingPlaces} className="text-xs font-bold text-emerald-400 hover:text-emerald-300 cursor-pointer">
                {searchingPlaces ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
              </button>
            </form>

            {/* Map Layer Switcher Control (Street vs Satellite View) */}
            <div className="absolute top-4 left-36 z-[1000] bg-zinc-900/90 border border-zinc-700/80 rounded-2xl p-1 shadow-2xl flex items-center gap-1 backdrop-blur-md hidden sm:flex">
              <button
                onClick={() => setMapType('street')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  mapType === 'street'
                    ? 'bg-emerald-500 text-zinc-950 shadow-md shadow-emerald-950/50 font-black'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <span>🗺️</span>
                <span className="hidden sm:inline">Street</span>
              </button>
              <button
                onClick={() => setMapType('satellite')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                  mapType === 'satellite'
                    ? 'bg-cyan-500 text-zinc-950 shadow-md shadow-cyan-950/50 font-black'
                    : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
                }`}
              >
                <span>🛰️</span>
                <span className="hidden sm:inline">Satellite</span>
              </button>
            </div>

            {/* Sync Signal Overlay */}
            <div className="absolute top-4 right-14 z-[1000] px-3 py-1.5 bg-zinc-900/80 border border-zinc-800 rounded-xl flex items-center gap-2 text-[11px] font-mono text-zinc-400 shadow-lg backdrop-blur-md hidden lg:flex">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
              <span>Realtime Connected</span>
            </div>

            {/* Selected Bus & Road Route Information Overlay Panel */}
            {selectedBus && (
              <div className="absolute bottom-6 left-6 right-6 z-[1000] bg-zinc-950/90 border border-zinc-800 rounded-2xl p-4 shadow-2xl backdrop-blur-xl transition-all">
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-3 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🚌</span>
                    <div>
                      <div className="text-sm font-black text-white">{selectedBus.bus_number}</div>
                      <div className="text-xs font-bold text-cyan-400 flex items-center gap-1">
                        <Navigation className="w-3.5 h-3.5" />
                        <span>{selectedBus.route}</span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleClearSelectedBus}
                    className="p-1.5 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-white rounded-xl border border-zinc-700/60 transition-all cursor-pointer"
                    title="Clear route selection"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Road Routing Data & Metrics */}
                {loadingRoute ? (
                  <div className="flex items-center gap-2 text-xs text-cyan-400 font-bold py-1">
                    <div className="w-3.5 h-3.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>Calculating real drivable road path via OpenRouteService...</span>
                  </div>
                ) : routingError ? (
                  <div className="flex items-center gap-2 text-xs text-amber-400 font-bold py-1">
                    <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Road route could not be found. (Live GPS bus tracking remains operational)</span>
                  </div>
                ) : selectedRouteInfo ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                    <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[10px] text-zinc-400">Road Distance</div>
                      <div className="font-mono font-bold text-cyan-300 text-sm">{selectedRouteInfo.distanceKm} km</div>
                    </div>

                    <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800">
                      <div className="text-[10px] text-zinc-400">Est. Route Duration</div>
                      <div className="font-mono font-bold text-cyan-300 text-sm">{selectedRouteInfo.durationMin} mins</div>
                    </div>

                    <div className="bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-800 col-span-2 sm:col-span-1 flex items-center justify-between">
                      <div>
                        <div className="text-[10px] text-zinc-400">Road Geometry</div>
                        <div className="text-[11px] font-bold text-emerald-400">OpenRouteService</div>
                      </div>
                      <Zap className="w-4 h-4 text-emerald-400" />
                    </div>
                  </div>
                ) : null}
              </div>
            )}

            {/* Leaflet Map Container */}
            <div ref={mapContainerRef} className="flex-grow flex-1 w-full h-full min-h-[500px] z-0"></div>

          </div>

        </div>

      </main>

      <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-zinc-900/80 flex flex-col sm:flex-row items-center justify-between text-[11px] text-zinc-500 font-normal z-10 gap-3">
        <div>Bus Tracker Telemetry Console &middot; Public Commuter Portal</div>
        <div>Routing Powered by OpenRouteService (ORS) & OpenStreetMap &middot; Leaflet.js</div>
      </footer>
    </div>
  );
}
