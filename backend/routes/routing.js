const express = require('express');
const router = express.Router();

// Memory cache for route geometry: key -> { polyline, distanceKm, durationMin, timestamp }
const routeCache = new Map();

// Helper to get ORS API Key from process environment
function getOrsApiKey() {
  return process.env.ORS_API_KEY || process.env.VITE_ORS_API_KEY || 'eyJvcmciOiI1YjNjZTM1OTc4NTExMTAwMDFjZjYyNDgiLCJpZCI6ImIzODNkNzE3N2FhZjQ2OTI5NTc2ZGE5ZDIyZDEyYzQ0IiwiaCI6Im11cm11cjY0In0=';
}

/**
 * POST /api/routes/directions
 * Body: { waypoints: [[lat, lng], [lat, lng], ...] }
 * Returns real road-following polyline coordinates and route summary from OpenRouteService
 */
router.post('/directions', async (req, res) => {
  const { waypoints } = req.body;

  if (!Array.isArray(waypoints) || waypoints.length < 2) {
    return res.status(400).json({ 
      success: false, 
      error: 'At least 2 waypoints [[lat, lng], ...] are required to calculate a road route.' 
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

  // Format coordinates for OpenRouteService: ORS expects [longitude, latitude]
  const orsCoordinates = waypoints.map(pt => [pt[1], pt[0]]);
  const apiKey = getOrsApiKey();

  try {
    const response = await fetch('https://api.openrouteservice.org/v2/directions/driving-car/geojson', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': apiKey
      },
      body: JSON.stringify({
        coordinates: orsCoordinates,
        elevation: false
      })
    });

    const data = await response.json();

    if (!response.ok || !data.features || !data.features[0]) {
      console.warn('OpenRouteService routing failed:', data.error || response.statusText);
      return res.status(422).json({
        success: false,
        error: 'Road route could not be found.'
      });
    }

    const feature = data.features[0];
    const geoCoordinates = feature.geometry.coordinates; // [[lng, lat], ...]
    const summary = feature.properties.summary || {};

    // Convert GeoJSON [lng, lat] back to Leaflet [lat, lng]
    const polylinePoints = geoCoordinates.map(coord => [coord[1], coord[0]]);
    const distanceKm = summary.distance ? parseFloat((summary.distance / 1000).toFixed(1)) : 0;
    const durationMin = summary.duration ? Math.round(summary.duration / 60) : 0;

    const resultPayload = {
      polyline: polylinePoints,
      distanceKm,
      durationMin,
      timestamp: Date.now()
    };

    // Store in server cache
    routeCache.set(cacheKey, resultPayload);

    res.json({ success: true, ...resultPayload, fromCache: false });

  } catch (err) {
    console.error('Error contacting OpenRouteService Directions API:', err);
    res.status(500).json({
      success: false,
      error: 'Road route could not be found.'
    });
  }
});

module.exports = router;
