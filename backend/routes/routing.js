const express = require('express');
const router = express.Router();

// Memory cache for road geometry: key -> { polyline, distanceKm, durationMin, source, timestamp }
const routeCache = new Map();

// Helper to get ORS API Key from process environment
function getOrsApiKey() {
  return process.env.ORS_API_KEY || null;
}

/**
 * POST /api/routes/directions
 * Body: { waypoints: [[lat, lng], [lat, lng], ...] }
 * Returns a road-following polyline from OpenRouteService, with OSRM fallback.
 */
router.post('/directions', async (req, res) => {
  const { waypoints } = req.body;

  if (!Array.isArray(waypoints) || waypoints.length < 2 || waypoints.length > 50 ||
      waypoints.some(point => !Array.isArray(point) || point.length < 2 ||
        !Number.isFinite(Number(point[0])) || !Number.isFinite(Number(point[1])) ||
        Math.abs(Number(point[0])) > 90 || Math.abs(Number(point[1])) > 180)) {
    return res.status(400).json({ 
      success: false, 
      error: 'Provide 2 to 50 valid [latitude, longitude] waypoints to calculate a road route.'
    });
  }

  // Generate cache key based on waypoints
  const cacheKey = JSON.stringify(waypoints);
  if (routeCache.has(cacheKey)) {
    const cached = routeCache.get(cacheKey);
    // Cache valid for 24 hours
    if (Date.now() - cached.timestamp < 24 * 60 * 60 * 1000) {
      return res.json({ success: true, ...cached, fromCache: true });
    }
  }

  try {
    // Try OpenRouteService first. Coordinates are [longitude, latitude].
    try {
      const orsApiKey = getOrsApiKey();
      if (!orsApiKey) throw new Error('ORS_API_KEY is not configured');
      const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': orsApiKey },
        body: JSON.stringify({ coordinates: waypoints.map(point => [Number(point[1]), Number(point[0])]), elevation: false }),
        signal: AbortSignal.timeout(12000)
      });
      const data = await response.json();
      if (response.ok && data.features?.[0]) {
        const feature = data.features[0];
        const summary = feature.properties.summary || {};
        const resultPayload = {
          polyline: feature.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
          distanceKm: summary.distance ? Number((summary.distance / 1000).toFixed(1)) : 0,
          durationMin: summary.duration ? Math.round(summary.duration / 60) : 0,
          source: 'OpenRouteService',
          timestamp: Date.now()
        };
        routeCache.set(cacheKey, resultPayload);
        return res.json({ success: true, ...resultPayload, fromCache: false });
      }
      console.warn('OpenRouteService routing failed; trying OSRM:', data.error || response.statusText);
    } catch (orsError) {
      console.warn('OpenRouteService unavailable; trying OSRM:', orsError.message);
    }

    // OSRM also returns a real drivable-road geometry; do not replace failures with straight lines.
    const osrmCoordinates = waypoints.map(point => `${Number(point[1])},${Number(point[0])}`).join(';');
    const osrmResponse = await fetch(`https://router.project-osrm.org/route/v1/driving/${osrmCoordinates}?overview=full&geometries=geojson&steps=false`, {
      signal: AbortSignal.timeout(12000)
    });
    const osrmData = await osrmResponse.json();
    if (!osrmResponse.ok || osrmData.code !== 'Ok' || !osrmData.routes?.[0]?.geometry?.coordinates?.length) {
      return res.status(422).json({ success: false, error: 'No drivable road route could be found between these stops.' });
    }

    const roadRoute = osrmData.routes[0];
    const resultPayload = {
      polyline: roadRoute.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
      distanceKm: Number((roadRoute.distance / 1000).toFixed(1)),
      durationMin: Math.round(roadRoute.duration / 60),
      source: 'OpenStreetMap OSRM',
      timestamp: Date.now()
    };
    routeCache.set(cacheKey, resultPayload);
    return res.json({ success: true, ...resultPayload, fromCache: false });

  } catch (err) {
    console.error('Road routing providers failed:', err);
    res.status(500).json({
      success: false,
      error: 'Road routing is temporarily unavailable. Try again shortly.'
    });
  }
});

module.exports = router;
