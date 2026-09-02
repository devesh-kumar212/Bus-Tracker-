import { useState, useEffect } from 'react';
import { getDriverLocation, subscribeToDriverLocationUpdates } from '../services/locationService';
import { fetchORSRoute } from '../services/orsService';

/**
 * React custom hook to continuously track a driver's location and calculate the road-aligned route to a destination.
 * @param {string|number} tripId 
 * @param {Array} destinationCoords - [lat, lng]
 * @returns {Object} { driverLocation, routePolyline, distance, duration, loading, error }
 */
export function useRouteTracking(tripId, destinationCoords) {
  const [driverLocation, setDriverLocation] = useState(null);
  const [routePolyline, setRoutePolyline] = useState([]);
  const [distance, setDistance] = useState(null);
  const [duration, setDuration] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!tripId || !destinationCoords || destinationCoords.length !== 2) {
      setDriverLocation(null);
      setRoutePolyline([]);
      setDistance(null);
      setDuration(null);
      return;
    }

    let isMounted = true;

    // Helper function to update path geometry and metrics
    const updateRoute = async (busCoords) => {
      try {
        const routeData = await fetchORSRoute(busCoords, destinationCoords);
        if (isMounted) {
          setRoutePolyline(routeData.coordinates);
          setDistance(`${routeData.distance} km`);
          setDuration(`${routeData.duration} mins`);
          setError(null);
        }
      } catch (err) {
        console.error("useRouteTracking calculation error:", err);
        if (isMounted) {
          setError(`ORS routing calculation failed: ${err.message}`);
          
          // OSRM Fallback to prevent breaking map rendering in development
          try {
            console.log("Attempting OSRM fallback...");
            const [startLat, startLng] = busCoords;
            const [endLat, endLng] = destinationCoords;
            const response = await fetch(
              `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson`
            );
            if (response.ok) {
              const data = await response.json();
              if (data.routes && data.routes[0]) {
                const route = data.routes[0];
                const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
                const distanceKm = route.distance / 1000;
                const durationMins = route.duration / 60;
                if (isMounted) {
                  setRoutePolyline(coordinates);
                  setDistance(`${parseFloat(distanceKm.toFixed(2))} km`);
                  setDuration(`${Math.round(durationMins)} mins`);
                  setError(null);
                }
                return;
              }
            }
          } catch (fallbackErr) {
            console.error("OSRM fallback failed:", fallbackErr);
          }
          
          // If fallback fails, draw a straight line
          if (isMounted) {
            setRoutePolyline([busCoords, destinationCoords]);
            setDistance("N/A");
            setDuration("N/A");
          }
        }
      }
    };

    // Load initial driver position
    const loadInitialPosition = async () => {
      setLoading(true);
      try {
        const data = await getDriverLocation(tripId);
        if (data && isMounted) {
          const initialCoords = { lat: data.latitude, lng: data.longitude };
          setDriverLocation(initialCoords);
          await updateRoute([data.latitude, data.longitude]);
        }
      } catch (err) {
        console.error("useRouteTracking load error:", err);
        if (isMounted) {
          setError(`Failed to retrieve driver start coordinates: ${err.message}`);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadInitialPosition();

    // Subscribe to driver live location updates from Supabase
    const unsubscribe = subscribeToDriverLocationUpdates(tripId, (newLocation) => {
      if (!isMounted) return;
      
      const updatedCoords = { lat: newLocation.latitude, lng: newLocation.longitude };
      setDriverLocation(updatedCoords);
      updateRoute([newLocation.latitude, newLocation.longitude]);
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [tripId, destinationCoords]);

  return { driverLocation, routePolyline, distance, duration, loading, error };
}
