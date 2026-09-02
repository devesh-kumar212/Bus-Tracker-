import { useEffect, useRef } from 'react';
import L from 'leaflet';

/**
 * RouteLayer rendering component. Adds polyline routing path and pin markers.
 * @param {Object} props
 * @param {Object} props.map - Leaflet map instance (injected by MapView)
 * @param {Object|Array} props.startCoords - Start coordinates ({lat, lng} or [lat, lng])
 * @param {Object|Array} props.endCoords - End coordinates ({lat, lng} or [lat, lng])
 * @param {Array} props.routePolyline - Route coordinates list [[lat, lng], ...]
 */
export default function RouteLayer({ map, startCoords, endCoords, routePolyline }) {
  const polylineRef = useRef(null);
  const startMarkerRef = useRef(null);
  const endMarkerRef = useRef(null);

  useEffect(() => {
    if (!map) return;

    // Clear existing polyline
    if (polylineRef.current) {
      polylineRef.current.remove();
      polylineRef.current = null;
    }

    // Clear existing markers
    if (startMarkerRef.current) {
      startMarkerRef.current.remove();
      startMarkerRef.current = null;
    }
    if (endMarkerRef.current) {
      endMarkerRef.current.remove();
      endMarkerRef.current = null;
    }

    if (routePolyline && routePolyline.length > 1) {
      // 1. Draw route polyline
      const polyline = L.polyline(routePolyline, {
        color: '#22c55e', // Emerald green
        weight: 6,
        opacity: 0.9,
        lineJoin: 'round'
      }).addTo(map);
      polylineRef.current = polyline;

      // 2. Draw Start Marker (Pulsing Bus Marker)
      if (startCoords) {
        const startLatLng = Array.isArray(startCoords) ? startCoords : [startCoords.lat, startCoords.lng];
        
        const busIcon = L.divIcon({
          className: 'custom-bus-live-tracker',
          html: `
            <div class="relative flex items-center justify-center">
              <!-- Pulsing outer ring -->
              <div class="absolute w-8 h-8 bg-emerald-500/30 rounded-full animate-ping"></div>
              <!-- Bus Badge -->
              <div class="relative w-7 h-7 flex items-center justify-center bg-emerald-600 border-2 border-white rounded-full shadow-lg z-10 text-xs">
                🚌
              </div>
            </div>
          `,
          iconSize: [32, 32],
          iconAnchor: [16, 16]
        });

        const startMarker = L.marker(startLatLng, { icon: busIcon }).addTo(map);
        startMarker.bindPopup('<div class="text-xs font-semibold font-sans text-slate-100">Bus Live Location</div>');
        startMarkerRef.current = startMarker;
      }

      // 3. Draw End Marker (Destination Stop)
      if (endCoords) {
        const endLatLng = Array.isArray(endCoords) ? endCoords : [endCoords.lat, endCoords.lng];
        
        const destIcon = L.divIcon({
          className: 'custom-dest-pin-live',
          html: `
            <div class="w-6 h-6 bg-rose-500 border-2 border-white rounded-full flex items-center justify-center text-[10px] text-white font-black shadow-lg">
              D
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12]
        });

        const endMarker = L.marker(endLatLng, { icon: destIcon }).addTo(map);
        endMarker.bindPopup('<div class="text-xs font-semibold font-sans text-slate-100">Destination Point</div>');
        endMarkerRef.current = endMarker;
      }

      // 4. Center map to show the entire routing segment
      const bounds = L.latLngBounds(routePolyline);
      map.fitBounds(bounds, { padding: [50, 50] });
    }
  }, [map, startCoords, endCoords, routePolyline]);

  // Render nothing as this draws directly to the Leaflet map instance
  return null;
}
