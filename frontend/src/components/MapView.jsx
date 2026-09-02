import { useEffect, useRef, useState, Children, cloneElement, isValidElement } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

/**
 * Standard MapView container using Leaflet and OpenStreetMap tiles.
 * Clones and injects the active Leaflet map instance to child layers.
 * @param {Object} props
 * @param {Array} props.center - [lat, lng]
 * @param {number} props.zoom
 * @param {ReactNode} props.children
 */
export default function MapView({ center = [26.4601, 74.6441], zoom = 13, children }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Create Leaflet map instance
    const map = L.map(mapContainerRef.current, {
      center,
      zoom,
      zoomControl: true,
      attributionControl: false
    });

    // Add standard OpenStreetMap tiles
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    }).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, [center, zoom]);

  // Clone and inject Leaflet map instance to children layers
  const renderChildren = () => {
    if (!mapRef.current) return null;
    return Children.map(children, (child) => {
      if (isValidElement(child)) {
        return cloneElement(child, { map: mapRef.current });
      }
      return child;
    });
  };

  return (
    <div className="relative w-full h-full overflow-hidden border border-slate-800 rounded-xl shadow-inner bg-slate-900">
      <div ref={mapContainerRef} className="w-full h-full" />
      {mapReady && renderChildren()}
    </div>
  );
}
