const API_HOST = typeof window !== 'undefined'
  ? `${window.location.protocol}//${window.location.hostname}:5000`
  : 'http://localhost:5000';

// Client-side in-memory route cache: key -> { polyline, distanceKm, durationMin, routeName }
const clientRouteCache = new Map();

/**
 * Precise Registry of Ajmer locations matched directly from user's map telemetry
 * Format: [latitude, longitude]
 */
export const KNOWN_LOCATIONS = {
  'geca': [26.4388, 74.6995], // Govt Engineering College Ajmer (Badlya, NH48/NH448)
  'college': [26.4388, 74.6995],
  'engineering college': [26.4388, 74.6995],
  'gweca': [26.3985, 74.6390], // Govt Women Engineering College Ajmer (Makhupura / Nasirabad Rd)
  'women college': [26.3985, 74.6390],
  'bus stand': [26.4696, 74.6447], // Ajmer Central Bus Stand
  'busstand': [26.4696, 74.6447],
  'pushkar': [26.4880, 74.5510], // Pushkar Town
  'market': [26.4550, 74.6340], // City Market
  'station': [26.4520, 74.6360], // Railway Station
  'gandhinagar': [26.4715, 74.6625],
  'shreenagar': [26.4346, 74.7810],
  'srinagar': [26.4346, 74.7810],
  'vaishali nagar': [26.4780, 74.6280]
};

/**
 * Precise Waypoint Registry for predefined city & highway routes
 * Follows actual Ajmer Bypass (NH448) & highway corridors from user map image
 * Coordinates order: [latitude, longitude]
 */
export const KNOWN_ROUTE_WAYPOINTS = {
  // GECA to GWECA (Direct Ajmer Bypass NH 448 / NH 58 past Sedariya & Makhupura)
  'geca to gweca': [
    [26.4388, 74.6995], // GECA (Badlya / NH 448)
    [26.4180, 74.6680], // Ajmer Bypass (NH 448 / Sedariya)
    [26.3985, 74.6390]  // GWECA (Makhupura / Nasirabad Rd)
  ],
  'gweca to geca': [
    [26.3985, 74.6390], // GWECA (Makhupura / Nasirabad Rd)
    [26.4180, 74.6680], // Ajmer Bypass (NH 448 / Sedariya)
    [26.4388, 74.6995]  // GECA (Badlya / NH 448)
  ],

  // Bus Stand to Pushkar (Exact Google Maps selected route via Vaishali Nagar & Pushkar Road Ghati Pass)
  'bus stand to pushkar': [
    [26.4696, 74.6447], // Ajmer Central Bus Stand
    [26.4780, 74.6390], // Regional College / Shastri Nagar Circle
    [26.4850, 74.6250], // Vaishali Nagar / Pushkar Road Junction
    [26.4860, 74.5950], // Pushkar Road Ghati Pass
    [26.4880, 74.5510]  // Pushkar Bus Stand
  ],
  'ajmer bus stand to pushkar': [
    [26.4696, 74.6447], // Ajmer Central Bus Stand
    [26.4780, 74.6390], // Regional College / Shastri Nagar Circle
    [26.4850, 74.6250], // Vaishali Nagar / Pushkar Road Junction
    [26.4860, 74.5950], // Pushkar Road Ghati Pass
    [26.4880, 74.5510]  // Pushkar Bus Stand
  ],
  'pushkar to bus stand': [
    [26.4880, 74.5510], // Pushkar Bus Stand
    [26.4860, 74.5950], // Pushkar Road Ghati Pass
    [26.4850, 74.6250], // Vaishali Nagar / Pushkar Road Junction
    [26.4780, 74.6390], // Regional College / Shastri Nagar Circle
    [26.4696, 74.6447]  // Ajmer Central Bus Stand
  ],
  'pushkar to ajmer bus stand': [
    [26.4880, 74.5510], // Pushkar Bus Stand
    [26.4860, 74.5950], // Pushkar Road Ghati Pass
    [26.4850, 74.6250], // Vaishali Nagar / Pushkar Road Junction
    [26.4780, 74.6390], // Regional College / Shastri Nagar Circle
    [26.4696, 74.6447]  // Ajmer Central Bus Stand
  ],

  // College to Bus Stand (Via Highway 48 Bypass)
  'college → bus stand': [
    [26.4696, 74.6447], // Ajmer Bus Stand
    [26.4715, 74.6625], // Gandhinagar Ajmer
    [26.4435, 74.6545], // Highway 48 Bypass Curve
    [26.4388, 74.6995]  // GECA College
  ],
  'college -> bus stand': [
    [26.4696, 74.6447],
    [26.4715, 74.6625],
    [26.4435, 74.6545],
    [26.4388, 74.6995]
  ],
  'college to bus stand': [
    [26.4696, 74.6447],
    [26.4715, 74.6625],
    [26.4435, 74.6545],
    [26.4388, 74.6995]
  ],
  'ajmer bus stand to shreenagar ajmer': [
    [26.4696, 74.6447], // Ajmer Bus Stand
    [26.4715, 74.6625], // Gandhinagar
    [26.4435, 74.6545], // Mountain Bypass
    [26.4388, 74.6995], // GECA
    [26.4346, 74.7810]  // Shreenagar
  ],
  'college → market': [
    [26.4388, 74.6995], // GECA
    [26.4435, 74.6545], // Main Road
    [26.4499, 74.6399]  // Market
  ]
};

/**
 * Ordered Bus Stops Registry for Predefined Routes
 */
export const PREDEFINED_BUS_STOPS = {
  'geca to gweca': [
    { id: 'stop_geca', name: 'Government Engineering College (GECA)', latitude: 26.4388, longitude: 74.6995, stop_order: 1, category: 'college', icon: '🏫' },
    { id: 'stop_sedariya', name: 'Sedariya NH448 Bypass', latitude: 26.4180, longitude: 74.6680, stop_order: 2, category: 'stop', icon: '📍' },
    { id: 'stop_gweca', name: 'Govt Women Engineering College (GWECA)', latitude: 26.3985, longitude: 74.6390, stop_order: 3, category: 'college', icon: '🏫' }
  ],
  'gweca to geca': [
    { id: 'stop_gweca', name: 'Govt Women Engineering College (GWECA)', latitude: 26.3985, longitude: 74.6390, stop_order: 1, category: 'college', icon: '🏫' },
    { id: 'stop_sedariya', name: 'Sedariya NH448 Bypass', latitude: 26.4180, longitude: 74.6680, stop_order: 2, category: 'stop', icon: '📍' },
    { id: 'stop_geca', name: 'Government Engineering College (GECA)', latitude: 26.4388, longitude: 74.6995, stop_order: 3, category: 'college', icon: '🏫' }
  ],
  'bus stand to pushkar': [
    { id: 'stop_busstand', name: 'Ajmer Central Bus Stand', latitude: 26.4696, longitude: 74.6447, stop_order: 1, category: 'stop', icon: '📍' },
    { id: 'stop_shastri', name: 'Regional College / Shastri Nagar', latitude: 26.4780, longitude: 74.6390, stop_order: 2, category: 'market', icon: '🏪' },
    { id: 'stop_vaishali', name: 'Vaishali Nagar Pushkar Rd Junction', latitude: 26.4850, longitude: 74.6250, stop_order: 3, category: 'stop', icon: '📍' },
    { id: 'stop_ghati', name: 'Pushkar Road Ghati Pass', latitude: 26.4860, longitude: 74.5950, stop_order: 4, category: 'poi', icon: '⛰️' },
    { id: 'stop_pushkar', name: 'Pushkar Bus Stand', latitude: 26.4880, longitude: 74.5510, stop_order: 5, category: 'stop', icon: '📍' }
  ],
  'pushkar to bus stand': [
    { id: 'stop_pushkar', name: 'Pushkar Bus Stand', latitude: 26.4880, longitude: 74.5510, stop_order: 1, category: 'stop', icon: '📍' },
    { id: 'stop_ghati', name: 'Pushkar Road Ghati Pass', latitude: 26.4860, longitude: 74.5950, stop_order: 2, category: 'poi', icon: '⛰️' },
    { id: 'stop_vaishali', name: 'Vaishali Nagar Pushkar Rd Junction', latitude: 26.4850, longitude: 74.6250, stop_order: 3, category: 'stop', icon: '📍' },
    { id: 'stop_shastri', name: 'Regional College / Shastri Nagar', latitude: 26.4780, longitude: 74.6390, stop_order: 4, category: 'market', icon: '🏪' },
    { id: 'stop_busstand', name: 'Ajmer Central Bus Stand', latitude: 26.4696, longitude: 74.6447, stop_order: 5, category: 'stop', icon: '📍' }
  ]
};

/**
 * Fetch ordered bus stops for a specific route name
 */
export function getRouteStops(routeName) {
  const norm = (routeName || '').trim().toLowerCase();
  if (PREDEFINED_BUS_STOPS[norm]) {
    return PREDEFINED_BUS_STOPS[norm];
  }
  if (norm.includes('pushkar')) {
    return PREDEFINED_BUS_STOPS['bus stand to pushkar'];
  }
  return PREDEFINED_BUS_STOPS['geca to gweca'];
}

/**
 * Automatically resolves coordinates from a route string (e.g., "GECA to GWECA" or "Bus Stand to Pushkar")
 */
function resolveWaypointsFromRouteString(routeName) {
  const norm = (routeName || '').trim().toLowerCase();
  
  if (KNOWN_ROUTE_WAYPOINTS[norm]) {
    return KNOWN_ROUTE_WAYPOINTS[norm];
  }

  // Parse delimiters: " to ", " -> ", " → ", " - "
  const parts = norm.split(/\s+(?:to|->|→|-)\s+/);
  if (parts.length >= 2) {
    const startToken = parts[0].trim();
    const endToken = parts[parts.length - 1].trim();

    let startCoord = null;
    let endCoord = null;

    Object.keys(KNOWN_LOCATIONS).forEach(key => {
      if (!startCoord && (startToken.includes(key) || key.includes(startToken))) {
        startCoord = KNOWN_LOCATIONS[key];
      }
      if (!endCoord && (endToken.includes(key) || key.includes(endToken))) {
        endCoord = KNOWN_LOCATIONS[key];
      }
    });

    if (startCoord && endCoord) {
      // If GECA to GWECA or GWECA to GECA, inject Ajmer Bypass NH 448 Sedariya waypoint
      if (norm.includes('geca') && norm.includes('gweca')) {
        return [startCoord, [26.4180, 74.6680], endCoord];
      }
      // If Bus Stand to Pushkar, inject Ghati Road waypoint
      if (norm.includes('pushkar')) {
        return [startCoord, [26.4850, 74.6050], endCoord];
      }
      return [startCoord, endCoord];
    }
  }

  // Default fallback to GECA -> GWECA highway route
  return KNOWN_ROUTE_WAYPOINTS['geca to gweca'];
}

/**
 * Fetch real-world road-following route from backend ORS proxy / OpenRouteService
 * @param {Object} params - { routeName, waypoints }
 * @returns {Promise<Object>} { success, polyline, distanceKm, durationMin, error }
 */
export async function fetchRoadRoute({ routeName, waypoints }) {
  const normName = (routeName || '').trim().toLowerCase();
  
  // Resolve waypoints array dynamically
  let routeWaypoints = waypoints;
  if (!Array.isArray(routeWaypoints) || routeWaypoints.length < 2) {
    routeWaypoints = resolveWaypointsFromRouteString(normName);
  }

  const cacheKey = `${normName}_${JSON.stringify(routeWaypoints)}`;
  if (clientRouteCache.has(cacheKey)) {
    return clientRouteCache.get(cacheKey);
  }

  try {
    // 1. Try fetching via Backend ORS Proxy endpoint
    const response = await fetch(`${API_HOST}/api/routes/directions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ waypoints: routeWaypoints })
    });

    const data = await response.json();

    if (response.ok && data.success && Array.isArray(data.polyline) && data.polyline.length > 0) {
      const payload = {
        success: true,
        polyline: data.polyline, // [[lat, lng], ...]
        distanceKm: data.distanceKm,
        durationMin: data.durationMin,
        routeName: routeName || 'Assigned Road Route'
      };
      clientRouteCache.set(cacheKey, payload);
      return payload;
    }
  } catch (err) {
    console.warn('Backend routing proxy notice:', err.message);
  }

  // 2. Direct OpenRouteService API Fallback
  try {
    const orsApiKey = import.meta.env.VITE_ORS_API_KEY || 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImIzODNkNzE3N2FhZjQ2OTI5NTc2ZGE5ZDIyZDEyYzQ0IiwiaCI6Im11cm11cjY0In0=';
    const orsCoordinates = routeWaypoints.map(pt => [pt[1], pt[0]]); // [lng, lat]

    const orsRes = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': orsApiKey
      },
      body: JSON.stringify({ coordinates: orsCoordinates })
    });

    const orsData = await orsRes.json();

    if (orsRes.ok && orsData.features && orsData.features[0]) {
      const feature = orsData.features[0];
      const geoCoords = feature.geometry.coordinates;
      const polylinePoints = geoCoords.map(coord => [coord[1], coord[0]]); // [lat, lng]
      const summary = feature.properties.summary || {};

      const payload = {
        success: true,
        polyline: polylinePoints,
        distanceKm: summary.distance ? parseFloat((summary.distance / 1000).toFixed(1)) : 0,
        durationMin: summary.duration ? Math.round(summary.duration / 60) : 0,
        routeName: routeName || 'Assigned Road Route'
      };
      clientRouteCache.set(cacheKey, payload);
      return payload;
    }
  } catch (directErr) {
    console.error('Direct ORS fetch notice:', directErr);
  }

  return {
    success: false,
    error: 'Road route could not be found.'
  };
}
