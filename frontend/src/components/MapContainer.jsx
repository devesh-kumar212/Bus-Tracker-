import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Globe, Locate } from 'lucide-react';

export default function MapContainer({
  stops = [],
  buses = [],
  activeRouteStops = [],
  selectedBusId = null,
  onStopClick = null,
  onBusClick = null,
  center = [26.4601, 74.6441], // Default Ajmer
  zoom = 13,
  routePolyline = null
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const markersRef = useRef({ stops: {}, buses: {}, polyline: null, startMarker: null, endMarker: null });
  const [isSatellite, setIsSatellite] = useState(false);
  const [isTracking, setIsTracking] = useState(false);
  const watchIdRef = useRef(null);
  const userMarkerRef = useRef(null);

  // 1. Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create Leaflet map instance
    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: false
    });

    // Default to Street (OpenStreetMap) tile layer
    const initialLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    tileLayerRef.current = initialLayer;
    mapRef.current = map;

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // 1b. Handle dynamic Tile Layer swapping (Street vs Satellite)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Remove current layer
    if (tileLayerRef.current) {
      tileLayerRef.current.remove();
    }

    // Set new layer based on toggle state
    let newLayer;
    if (isSatellite) {
      // Esri World Imagery (Satellite)
      newLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        maxZoom: 19
      });
    } else {
      // OpenStreetMap standard street map
      newLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      });
    }

    newLayer.addTo(map);
    tileLayerRef.current = newLayer;
  }, [isSatellite]);

  // 2. Draw Stops and Polyline when activeRouteStops or stops change
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Clear old stops markers
    Object.values(markersRef.current.stops).forEach(marker => marker.remove());
    markersRef.current.stops = {};

    // Clear old polyline
    if (markersRef.current.polyline) {
      markersRef.current.polyline.remove();
      markersRef.current.polyline = null;
    }

    // Clear old start/end markers
    if (markersRef.current.startMarker) {
      markersRef.current.startMarker.remove();
      markersRef.current.startMarker = null;
    }
    if (markersRef.current.endMarker) {
      markersRef.current.endMarker.remove();
      markersRef.current.endMarker = null;
    }

    const stopsToRender = activeRouteStops.length > 0 ? activeRouteStops : stops;

    // Render new stops
    stopsToRender.forEach(stop => {
      // Create custom divIcon for stop
      const stopIcon = L.divIcon({
        className: 'custom-stop-icon',
        html: `
          <div class="flex items-center justify-center">
            <div class="w-4 h-4 bg-slate-900 border-2 border-indigo-400 rounded-full shadow-lg flex items-center justify-center hover:scale-125 transition-transform duration-200">
              <div class="w-1.5 h-1.5 bg-indigo-400 rounded-full"></div>
            </div>
            ${activeRouteStops.length > 0 ? `
              <span class="absolute left-6 whitespace-nowrap bg-slate-900/90 text-indigo-300 text-xs font-semibold px-2 py-0.5 rounded-md border border-slate-700/60 shadow-md">
                ${stop.stop_order}. ${stop.stop_name}
              </span>
            ` : ''}
          </div>
        `,
        iconSize: [16, 16],
        iconAnchor: [8, 8]
      });

      const marker = L.marker([stop.latitude, stop.longitude], { icon: stopIcon })
        .addTo(map);
      
      // Bind basic popup
      marker.bindPopup(`
        <div class="text-slate-100 font-sans p-1">
          <h3 class="font-bold text-sm text-indigo-300">${stop.stop_name}</h3>
          <p class="text-xs text-slate-400 mt-1">Coordinates: ${stop.latitude.toFixed(4)}, ${stop.longitude.toFixed(4)}</p>
          ${stop.eta_minutes !== undefined && stop.eta_minutes > 0 ? `
            <div class="mt-2 text-xs font-semibold bg-indigo-950/50 text-indigo-300 border border-indigo-500/30 px-2 py-1 rounded">
              ETA: ${stop.eta_minutes} min
            </div>
          ` : ''}
        </div>
      `);

      if (onStopClick) {
        marker.on('click', () => onStopClick(stop));
      }

      markersRef.current.stops[stop.id] = marker;
    });

    // Draw custom route polyline if supplied
    if (routePolyline && routePolyline.length > 1) {
      const polyline = L.polyline(routePolyline, {
        color: '#06b6d4', // Neon Cyan for live route path
        weight: 6,
        opacity: 0.9,
        lineJoin: 'round',
      }).addTo(map);

      markersRef.current.polyline = polyline;

      // Start Marker
      const startPoint = routePolyline[0];
      const startIcon = L.divIcon({
        className: 'custom-start-marker',
        html: `<div class="w-5 h-5 bg-indigo-600 border-2 border-white rounded-full flex items-center justify-center text-[10px] text-white font-black shadow-lg">S</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      markersRef.current.startMarker = L.marker(startPoint, { icon: startIcon }).addTo(map)
        .bindPopup('<div class="text-xs font-semibold font-sans text-slate-100">Start Stop / Location</div>');

      // End Marker
      const endPoint = routePolyline[routePolyline.length - 1];
      const endIcon = L.divIcon({
        className: 'custom-end-marker',
        html: `<div class="w-5 h-5 bg-rose-500 border-2 border-white rounded-full flex items-center justify-center text-[10px] text-white font-black shadow-lg">D</div>`,
        iconSize: [20, 20],
        iconAnchor: [10, 10]
      });
      markersRef.current.endMarker = L.marker(endPoint, { icon: endIcon }).addTo(map)
        .bindPopup('<div class="text-xs font-semibold font-sans text-slate-100">Destination Stop</div>');

      // Fit bounds
      const bounds = L.latLngBounds(routePolyline);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
    else if (stopsToRender.length > 0) {
      // Fit to all stops if no specific route is active
      const latlngs = stopsToRender.map(s => [s.latitude, s.longitude]);
      const bounds = L.latLngBounds(latlngs);
      map.fitBounds(bounds, { padding: [50, 50] });
    }

  }, [stops, activeRouteStops, routePolyline]);

  // 3. Draw/Update Active Buses (Only render ONLINE active buses)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    // Filter to ONLY online/active tracking buses
    const activeBuses = buses.filter(b => Boolean(b.is_tracking) || b.status_code === 'LIVE' || b.status === 'active');

    // Clear old buses that are no longer active/online
    Object.entries(markersRef.current.buses).forEach(([id, marker]) => {
      if (!activeBuses.find(b => (b.trip_id || b.driver_id || b.id)?.toString() === id)) {
        marker.remove();
        delete markersRef.current.buses[id];
      }
    });

    // Add or update active online buses
    activeBuses.forEach(bus => {
      const busId = bus.trip_id || bus.driver_id || bus.id;
      if (!busId || bus.latitude === null || bus.longitude === null) return;
      const busIdStr = busId.toString();

      const isSelected = selectedBusId && selectedBusId.toString() === busIdStr;

      // DivIcon for Bus with pulsing effect
      const busIcon = L.divIcon({
        className: 'custom-bus-icon',
        html: `
          <div class="relative flex items-center justify-center">
            <!-- Pulsing background ring -->
            <div class="absolute w-10 h-10 bg-violet-500/30 rounded-full bus-pulse-active"></div>
            <!-- Main Bus Badge -->
            <div class="relative w-8 h-8 flex items-center justify-center bg-violet-600 border-2 ${isSelected ? 'border-amber-400 scale-110 shadow-amber-500/50' : 'border-white'} rounded-full shadow-xl z-10 hover:scale-115 transition-transform duration-150">
              <span class="text-sm">🚌</span>
            </div>
            <!-- Bus Tag -->
            <div class="absolute top-8 whitespace-nowrap bg-violet-950 text-white text-[10px] font-bold px-1.5 py-0.5 rounded border border-violet-700 shadow shadow-violet-950/80 z-20">
              ${bus.bus_number}
            </div>
          </div>
        `,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });

      if (markersRef.current.buses[busIdStr]) {
        // Update position
        markersRef.current.buses[busIdStr].setLatLng([bus.latitude, bus.longitude]);
        markersRef.current.buses[busIdStr].setIcon(busIcon);
      } else {
        // Create new marker
        const marker = L.marker([bus.latitude, bus.longitude], { icon: busIcon })
          .addTo(map);

        marker.bindPopup(`
          <div class="text-slate-100 font-sans p-1">
            <div class="flex items-center gap-1.5">
              <span class="text-xs font-semibold px-1.5 py-0.5 rounded bg-violet-900 text-violet-300">BUS</span>
              <span class="font-bold text-sm text-gray-200">${bus.bus_number}</span>
            </div>
            <h4 class="font-semibold text-xs text-indigo-300 mt-2">${bus.route_name || bus.route || 'Active Route'}</h4>
            <div class="mt-2 flex flex-col gap-1 text-[11px] text-slate-400 border-t border-slate-700/50 pt-2">
              <div>Lat: ${bus.latitude.toFixed(5)}</div>
              <div>Lng: ${bus.longitude.toFixed(5)}</div>
              ${bus.last_update || bus.updated_at ? `<div class="text-[10px] italic text-slate-500 mt-1">Updated: ${new Date(bus.last_update || bus.updated_at).toLocaleTimeString()}</div>` : ''}
            </div>
          </div>
        `);

        if (onBusClick) {
          marker.on('click', () => onBusClick(bus));
        }

        markersRef.current.buses[busIdStr] = marker;
      }

      // If this bus is selected and changes position, center map on it
      if (isSelected) {
        map.setView([bus.latitude, bus.longitude], map.getZoom(), { animate: true });
      }
    });

  }, [buses, selectedBusId]);

  const toggleTracking = () => {
    const map = mapRef.current;
    if (!map) return;

    if (isTracking) {
      // Turn off tracking
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (userMarkerRef.current) {
        userMarkerRef.current.remove();
        userMarkerRef.current = null;
      }
      setIsTracking(false);
    } else {
      // Turn on tracking
      if (!navigator.geolocation) {
        alert("Geolocation is not supported by your browser");
        return;
      }

      setIsTracking(true);
      let isFirstPosition = true;

      watchIdRef.current = navigator.geolocation.watchPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          
          // User position custom icon (pulsing blue dot)
          const userIcon = L.divIcon({
            className: 'custom-user-icon',
            html: `
              <div class="relative flex items-center justify-center">
                <!-- Outer pulsing ring -->
                <div class="absolute w-8 h-8 bg-blue-500/40 rounded-full animate-ping"></div>
                <!-- Inner blue core -->
                <div class="relative w-4 h-4 bg-blue-600 border-2 border-white rounded-full shadow-lg z-10"></div>
              </div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16]
          });

          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([latitude, longitude]);
          } else {
            userMarkerRef.current = L.marker([latitude, longitude], { icon: userIcon })
              .addTo(map)
              .bindPopup('<div class="text-slate-100 font-sans p-1 font-semibold text-xs text-center">You are here</div>');
          }

          if (isFirstPosition) {
            map.setView([latitude, longitude], 15, { animate: true });
            isFirstPosition = false;
          }
        },
        (error) => {
          console.error("Error obtaining location", error);
          let errorMsg = "Unable to retrieve your location.";
          if (error.code === error.PERMISSION_DENIED) {
            errorMsg = "Location access denied. Please enable location permissions.";
          }
          alert(errorMsg);
          
          // Stop tracking
          if (watchIdRef.current !== null) {
            navigator.geolocation.clearWatch(watchIdRef.current);
            watchIdRef.current = null;
          }
          if (userMarkerRef.current) {
            userMarkerRef.current.remove();
            userMarkerRef.current = null;
          }
          setIsTracking(false);
        },
        {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 0
        }
      );
    }
  };

  return (
    <div className="relative w-full h-full overflow-hidden border border-slate-800 rounded-xl shadow-inner bg-slate-900">
      {/* Floating Controls Overlay */}
      <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
        {/* Layer Switcher Button */}
        <button
          type="button"
          onClick={() => setIsSatellite(!isSatellite)}
          className="flex items-center gap-1.5 px-3 py-2 bg-slate-900/90 border border-slate-800 hover:bg-slate-800 text-slate-300 hover:text-white rounded-xl text-xs font-bold shadow-2xl backdrop-blur transition-all cursor-pointer"
        >
          <Globe className={`w-3.5 h-3.5 ${isSatellite ? 'text-blue-400' : 'text-slate-500'}`} />
          <span>{isSatellite ? 'Street Map' : 'Satellite View'}</span>
        </button>

        {/* Live Location Button */}
        <button
          type="button"
          onClick={toggleTracking}
          className={`flex items-center gap-1.5 px-3 py-2 bg-slate-900/90 border hover:bg-slate-800 hover:text-white rounded-xl text-xs font-bold shadow-2xl backdrop-blur transition-all cursor-pointer ${
            isTracking ? 'border-blue-500 text-blue-400' : 'border-slate-800 text-slate-300'
          }`}
        >
          <Locate className={`w-3.5 h-3.5 ${isTracking ? 'animate-pulse text-blue-400' : 'text-slate-500'}`} />
          <span>{isTracking ? 'Tracking Live' : 'Locate Me'}</span>
        </button>
      </div>

      <div ref={mapContainerRef} className="w-full h-full" />
    </div>
  );
}
