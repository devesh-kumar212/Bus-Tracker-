const ORS_API_KEY = import.meta.env.VITE_ORS_API_KEY;

/**
 * Fetches the road-aligned route path, distance, and duration between two coordinates using ORS API.
 * @param {Array} start - [lat, lng]
 * @param {Array} end - [lat, lng]
 * @returns {Promise<Object>} { coordinates: [[lat, lng], ...], distance: number (km), duration: number (mins) }
 */
export async function fetchORSRoute(start, end) {
  const [startLat, startLng] = start;
  const [endLat, endLng] = end;

  if (!ORS_API_KEY || ORS_API_KEY.trim() === "") {
    throw new Error("OpenRouteService API Key is missing. Please configure VITE_ORS_API_KEY in your .env file.");
  }

  const url = `https://api.openrouteservice.org/v2/directions/driving-car?api_key=${ORS_API_KEY}&start=${startLng},${startLat}&end=${endLng},${endLat}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData?.error?.message || `ORS API request failed with status ${response.status}`);
  }

  const data = await response.json();
  
  if (data.features && data.features[0]) {
    const route = data.features[0];
    // ORS returns [lng, lat], map to [lat, lng] for Leaflet
    const coordinates = route.geometry.coordinates.map(coord => [coord[1], coord[0]]);
    const distance = route.properties.summary.distance / 1000; // in km
    const duration = route.properties.summary.duration / 60; // in minutes
    
    return {
      coordinates,
      distance: parseFloat(distance.toFixed(2)),
      duration: Math.round(duration)
    };
  }
  
  throw new Error("No route geometries found in the OpenRouteService response.");
}
