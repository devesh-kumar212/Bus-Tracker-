const express = require('express');
const router = express.Router();
const { getDb, getOrGenerateRoutePolyline } = require('../db');

// Helper function to calculate distance using Haversine formula (returns meters)
function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = (lat1 * Math.PI) / 180;
  const phi2 = (lat2 * Math.PI) / 180;
  const deltaPhi = ((lat2 - lat1) * Math.PI) / 180;
  const deltaLambda = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

// 1. Get all routes
router.get('/routes', async (req, res) => {
  try {
    const db = await getDb();
    const routes = await db.all('SELECT * FROM routes ORDER BY route_name');
    const routesWithPolylines = [];
    for (let r of routes) {
      const polyline = await getOrGenerateRoutePolyline(r.id, db);
      const stops = await db.all(`
        SELECT s.id, s.stop_name AS name, s.latitude, s.longitude, rs.stop_order
        FROM stops s
        JOIN route_stops rs ON s.id = rs.stop_id
        WHERE rs.route_id = ?
        ORDER BY rs.stop_order ASC
      `, [r.id]);
      routesWithPolylines.push({
        ...r,
        polyline,
        stops
      });
    }
    res.json(routesWithPolylines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get stops of a specific route
router.get('/routes/:id/stops', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    const stops = await db.all(`
      SELECT s.*, rs.stop_order
      FROM stops s
      JOIN route_stops rs ON s.id = rs.stop_id
      WHERE rs.route_id = ?
      ORDER BY rs.stop_order ASC
    `, [id]);
    res.json(stops);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get all active trips
router.get('/active-trips', async (req, res) => {
  try {
    const db = await getDb();
    const activeTrips = await db.all(`
      SELECT t.id as trip_id, t.current_latitude, t.current_longitude, t.last_update,
             b.bus_number, r.id as route_id, r.route_name, u.name as driver_name
      FROM trips t
      JOIN buses b ON t.bus_id = b.id
      JOIN routes r ON t.route_id = r.id
      JOIN users u ON t.driver_id = u.id
      WHERE t.status = 'active'
    `);
    res.json(activeTrips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. File a complaint
router.post('/complaints', async (req, res) => {
  const { passenger_name, email, phone, bus_number, subject, description } = req.body;
  if (!passenger_name || !subject || !description) {
    return res.status(400).json({ error: 'Passenger name, subject, and description are required' });
  }
  try {
    const db = await getDb();
    await db.run(
      'INSERT INTO complaints (passenger_name, email, phone, bus_number, subject, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [passenger_name, email || null, phone || null, bus_number || null, subject, description, 'pending']
    );
    res.status(201).json({ success: true, message: 'Complaint registered successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 5. Calculate ETA for active trips on a route
router.get('/routes/:routeId/eta', async (req, res) => {
  const { routeId } = req.params;
  const AVERAGE_SPEED_KMPH = 25; // 25 km/h average speed in city traffic
  const AVERAGE_SPEED_MPS = (AVERAGE_SPEED_KMPH * 1000) / 3600; // ~6.94 meters per second

  try {
    const db = await getDb();
    
    // Get all stops on this route
    const stops = await db.all(`
      SELECT s.id, s.stop_name, s.latitude, s.longitude, rs.stop_order
      FROM stops s
      JOIN route_stops rs ON s.id = rs.stop_id
      WHERE rs.route_id = ?
      ORDER BY rs.stop_order ASC
    `, [routeId]);

    if (stops.length === 0) {
      return res.json({ trips: [] });
    }

    // Get active trips for this route
    const activeTrips = await db.all(`
      SELECT t.id as trip_id, t.current_latitude, t.current_longitude, b.bus_number
      FROM trips t
      JOIN buses b ON t.bus_id = b.id
      WHERE t.route_id = ? AND t.status = 'active'
    `, [routeId]);

    const resultTrips = [];

    for (const trip of activeTrips) {
      const busLat = trip.current_latitude;
      const busLng = trip.current_longitude;

      if (busLat === null || busLng === null) {
        continue;
      }

      // 1. Find the closest stop to the bus (to estimate progress)
      let minDistance = Infinity;
      let closestStopIndex = 0;

      for (let i = 0; i < stops.length; i++) {
        const dist = getHaversineDistance(busLat, busLng, stops[i].latitude, stops[i].longitude);
        if (dist < minDistance) {
          minDistance = dist;
          closestStopIndex = i;
        }
      }

      // 2. Calculate cumulative distance & ETA to all stops
      const stopETAs = [];
      let cumulativeDistance = 0;

      for (let i = 0; i < stops.length; i++) {
        const stop = stops[i];
        
        if (i < closestStopIndex) {
          // Bus is assumed to have passed these stops
          stopETAs.push({
            stop_id: stop.id,
            stop_name: stop.stop_name,
            stop_order: stop.stop_order,
            status: 'passed',
            distance_meters: 0,
            eta_minutes: 0
          });
        } else if (i === closestStopIndex) {
          // Bus is approaching or at the closest stop
          cumulativeDistance = minDistance;
          const etaSeconds = cumulativeDistance / AVERAGE_SPEED_MPS;
          const etaMinutes = Math.max(1, Math.round(etaSeconds / 60)); // minimum 1 min if close
          
          stopETAs.push({
            stop_id: stop.id,
            stop_name: stop.stop_name,
            stop_order: stop.stop_order,
            status: minDistance < 50 ? 'arrived' : 'approaching',
            distance_meters: Math.round(cumulativeDistance),
            eta_minutes: etaMinutes
          });
        } else {
          // Bus is heading to future stops, sum up the segments
          const prevStop = stops[i - 1];
          const segmentDist = getHaversineDistance(
            prevStop.latitude,
            prevStop.longitude,
            stop.latitude,
            stop.longitude
          );
          
          cumulativeDistance += segmentDist;
          const etaSeconds = cumulativeDistance / AVERAGE_SPEED_MPS;
          const etaMinutes = Math.round(etaSeconds / 60);

          stopETAs.push({
            stop_id: stop.id,
            stop_name: stop.stop_name,
            stop_order: stop.stop_order,
            status: 'upcoming',
            distance_meters: Math.round(cumulativeDistance),
            eta_minutes: etaMinutes
          });
        }
      }

      resultTrips.push({
        trip_id: trip.trip_id,
        bus_number: trip.bus_number,
        current_latitude: busLat,
        current_longitude: busLng,
        stop_etas: stopETAs
      });
    }

    res.json({ trips: resultTrips });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
