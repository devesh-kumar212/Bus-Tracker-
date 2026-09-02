/**
 * Place service for Nominatim place search and curated Route POIs
 */

// Memory cache for Nominatim search results
const placeSearchCache = new Map();

/**
 * Search places using OpenStreetMap Nominatim Geocoding API
 * @param {string} query 
 * @param {Array} viewbox - Optional [minLng, minLat, maxLng, maxLat]
 * @returns {Promise<Array>} List of place objects { name, lat, lng, category, type }
 */
export async function searchPlacesWithNominatim(query, viewbox = [74.50, 26.35, 74.85, 26.55]) {
  const normQuery = (query || '').trim();
  if (!normQuery || normQuery.length < 2) return [];

  const cacheKey = normQuery.toLowerCase();
  if (placeSearchCache.has(cacheKey)) {
    return placeSearchCache.get(cacheKey);
  }

  try {
    const viewboxStr = viewbox ? `&viewbox=${viewbox.join(',')}&bounded=1` : '';
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(normQuery)}&limit=8${viewboxStr}`;

    const response = await fetch(url, {
      headers: {
        'Accept-Language': 'en',
        'User-Agent': 'TrackMyBus Transit Web App'
      }
    });

    if (!response.ok) return [];

    const data = await response.json();
    const results = data.map(item => {
      const category = getCategoryFromOsmType(item.class, item.type, item.display_name);
      return {
        id: item.place_id,
        name: item.display_name.split(',')[0],
        fullName: item.display_name,
        latitude: parseFloat(item.lat),
        longitude: parseFloat(item.lon),
        category,
        osmClass: item.class,
        osmType: item.type
      };
    });

    placeSearchCache.set(cacheKey, results);
    return results;
  } catch (err) {
    console.warn('Nominatim geocoding search notice:', err.message);
    return [];
  }
}

/**
 * Helper to categorize OSM place class/type into application icons
 */
function getCategoryFromOsmType(osmClass, osmType, displayName) {
  const normName = (displayName || '').toLowerCase();

  if (osmType === 'hospital' || osmType === 'clinic' || normName.includes('hospital') || normName.includes('clinic')) {
    return 'hospital';
  }
  if (osmType === 'college' || osmType === 'university' || osmType === 'school' || normName.includes('college') || normName.includes('geca') || normName.includes('gweca') || normName.includes('school')) {
    return 'college';
  }
  if (osmType === 'railway' || osmType === 'station' || normName.includes('railway') || normName.includes('station')) {
    return 'station';
  }
  if (osmClass === 'shop' || osmType === 'marketplace' || normName.includes('market') || normName.includes('dmart') || normName.includes('bazaar')) {
    return 'market';
  }
  if (normName.includes('bus stand') || normName.includes('bus stop')) {
    return 'stop';
  }

  return 'poi';
}

/**
 * Curated POIs for specific routes (colleges, hospitals, stations, markets)
 * Ensures map displays relevant landmarks without flooding the canvas.
 */
export const ROUTE_POIS = {
  'geca to gweca': [
    { id: 'poi_geca', name: 'Govt Engineering College Ajmer (GECA)', category: 'college', latitude: 26.4388, longitude: 74.6995, icon: '🏫' },
    { id: 'poi_gweca', name: 'Govt Women Engineering College (GWECA)', category: 'college', latitude: 26.3985, longitude: 74.6390, icon: '🏫' },
    { id: 'poi_hospital_1', name: 'Jawaharlal Nehru Hospital Ajmer', category: 'hospital', latitude: 26.4635, longitude: 74.6375, icon: '🏥' },
    { id: 'poi_station_1', name: 'Ajmer Junction Railway Station', category: 'station', latitude: 26.4520, longitude: 74.6360, icon: '🚉' },
    { id: 'poi_market_1', name: 'Sedariya Highway Market', category: 'market', latitude: 26.4180, longitude: 74.6680, icon: '🏪' }
  ],
  'bus stand to pushkar': [
    { id: 'poi_busstand_1', name: 'Ajmer Central Bus Stand', category: 'stop', latitude: 26.4696, longitude: 74.6447, icon: '📍' },
    { id: 'poi_market_dmart', name: 'DMart Ajmer (Panchsheel Nagar)', category: 'market', latitude: 26.4850, longitude: 74.6250, icon: '🏪' },
    { id: 'poi_hospital_janana', name: 'Janana Hospital Ajmer', category: 'hospital', latitude: 26.4920, longitude: 74.6450, icon: '🏥' },
    { id: 'poi_pushkar_temple', name: 'Brahma Temple Pushkar', category: 'poi', latitude: 26.4895, longitude: 74.5505, icon: '🏛️' },
    { id: 'poi_pushkar_stand', name: 'Pushkar Bus Stand', category: 'stop', latitude: 26.4880, longitude: 74.5510, icon: '📍' }
  ]
};

/**
 * Fetch POIs relevant to a specific route
 */
export function getRoutePOIs(routeName) {
  const norm = (routeName || '').trim().toLowerCase();
  if (ROUTE_POIS[norm]) {
    return ROUTE_POIS[norm];
  }
  if (norm.includes('pushkar')) {
    return ROUTE_POIS['bus stand to pushkar'];
  }
  return ROUTE_POIS['geca to gweca'];
}
