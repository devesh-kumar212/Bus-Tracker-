const express = require('express');
const router = express.Router();
const { getDb, getOrGenerateRoutePolyline } = require('../db');
const { authenticateToken } = require('./auth');

// Middleware to verify driver role
function requireDriver(req, res, next) {
  if (req.user && req.user.role === 'driver') {
    next();
  } else {
    res.status(403).json({ error: 'Driver permission required' });
  }
}

// Apply authentication & driver authorization to all driver endpoints
router.use(authenticateToken);
router.use(requireDriver);

// 1. Get lists of buses for driver to select
router.get('/buses', async (req, res) => {
  try {
    const db = await getDb();
    // Allow drivers to pick from all buses
    const buses = await db.all('SELECT * FROM buses WHERE status != "maintenance" ORDER BY bus_number');
    res.json(buses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get lists of routes for driver to select
router.get('/routes', async (req, res) => {
  try {
    const db = await getDb();
    const routes = await db.all('SELECT * FROM routes ORDER BY route_name');
    const routesWithPolylines = [];
    for (let r of routes) {
      const polyline = await getOrGenerateRoutePolyline(r.id, db);
      routesWithPolylines.push({
        ...r,
        polyline
      });
    }
    res.json(routesWithPolylines);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get driver's current active trip (if any)
router.get('/active-trip', async (req, res) => {
  try {
    const db = await getDb();
    const activeTrip = await db.get(`
      SELECT t.*, b.bus_number, r.route_name
      FROM trips t
      JOIN buses b ON t.bus_id = b.id
      JOIN routes r ON t.route_id = r.id
      WHERE t.driver_id = ? AND t.status = 'active'
    `, [req.user.id]);
    
    if (activeTrip) {
      // Fetch stops along the route
      activeTrip.stops = await db.all(`
        SELECT s.*, rs.stop_order
        FROM stops s
        JOIN route_stops rs ON s.id = rs.stop_id
        WHERE rs.route_id = ?
        ORDER BY rs.stop_order ASC
      `, [activeTrip.route_id]);
      
      activeTrip.polyline = await getOrGenerateRoutePolyline(activeTrip.route_id, db);
      res.json(activeTrip);
    } else {
      res.json(null);
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Start a new trip
router.post('/start-trip', async (req, res) => {
  const { bus_id, route_id } = req.body;
  if (!bus_id || !route_id) {
    return res.status(400).json({ error: 'Bus ID and Route ID are required' });
  }

  try {
    const db = await getDb();
    
    // Check if driver already has an active trip
    const activeTrip = await db.get('SELECT id FROM trips WHERE driver_id = ? AND status = "active"', [req.user.id]);
    if (activeTrip) {
      return res.status(400).json({ error: 'You already have an active trip running.' });
    }

    // Start a transaction
    await db.run('BEGIN TRANSACTION');

    // Create the trip record
    const result = await db.run(`
      INSERT INTO trips (bus_id, driver_id, route_id, status, start_time, current_latitude, current_longitude, last_update)
      VALUES (?, ?, ?, 'active', datetime('now', 'localtime'), NULL, NULL, NULL)
    `, [bus_id, req.user.id, route_id]);

    const tripId = result.lastID;

    // Update bus status to active
    await db.run('UPDATE buses SET status = "active" WHERE id = ?', [bus_id]);

    await db.run('COMMIT');

    // Fetch complete trip details
    const tripDetails = await db.get(`
      SELECT t.*, b.bus_number, r.route_name
      FROM trips t
      JOIN buses b ON t.bus_id = b.id
      JOIN routes r ON t.route_id = r.id
      WHERE t.id = ?
    `, [tripId]);

    // Fetch stops
    tripDetails.stops = await db.all(`
      SELECT s.*, rs.stop_order
      FROM stops s
      JOIN route_stops rs ON s.id = rs.stop_id
      WHERE rs.route_id = ?
      ORDER BY rs.stop_order ASC
    `, [route_id]);

    tripDetails.polyline = await getOrGenerateRoutePolyline(route_id, db);
    res.status(201).json(tripDetails);
  } catch (error) {
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: error.message });
  }
});

// 5. End active trip
router.post('/end-trip', async (req, res) => {
  const { trip_id } = req.body;
  if (!trip_id) {
    return res.status(400).json({ error: 'Trip ID is required' });
  }

  try {
    const db = await getDb();
    const trip = await db.get('SELECT bus_id FROM trips WHERE id = ? AND driver_id = ? AND status = "active"', [trip_id, req.user.id]);
    
    if (!trip) {
      return res.status(404).json({ error: 'Active trip not found for this driver' });
    }

    await db.run('BEGIN TRANSACTION');

    // Complete the trip
    await db.run(`
      UPDATE trips 
      SET status = 'completed', end_time = datetime('now', 'localtime'), last_update = datetime('now', 'localtime') 
      WHERE id = ?
    `, [trip_id]);

    // Reset bus status to inactive
    await db.run('UPDATE buses SET status = "inactive" WHERE id = ?', [trip.bus_id]);

    await db.run('COMMIT');

    res.json({ success: true, message: 'Trip completed successfully' });
  } catch (error) {
    try { await db.run('ROLLBACK'); } catch (_) {}
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
