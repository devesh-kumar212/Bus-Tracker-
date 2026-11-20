const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { getDb } = require('../db');
const { authenticateToken } = require('./auth');


function requireAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin permission required' });
  }
}


router.use(authenticateToken);
router.use(requireAdmin);

router.get('/buses', async (req, res) => {
  try {
    const db = await getDb();
    const buses = await db.all('SELECT * FROM buses ORDER BY bus_number');
    res.json(buses);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});
router.post('/buses', async (req, res) => {
  const { bus_number, capacity, status } = req.body;
  if (!bus_number || !capacity) {
    return res.status(400).json({ error: 'Bus number and capacity are required' });
  }
  try {
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO buses (bus_number, capacity, status) VALUES (?, ?, ?)',
      [bus_number, capacity, status || 'inactive']
    );
    const newBus = await db.get('SELECT * FROM buses WHERE id = ?', [result.lastID]);
    res.status(201).json(newBus);
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Bus number already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

router.put('/buses/:id', async (req, res) => {
  const { bus_number, capacity, status } = req.body;
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run(
      'UPDATE buses SET bus_number = ?, capacity = ?, status = ? WHERE id = ?',
      [bus_number, capacity, status, id]
    );
    const updatedBus = await db.get('SELECT * FROM buses WHERE id = ?', [id]);
    res.json(updatedBus);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/buses/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('DELETE FROM buses WHERE id = ?', [id]);
    res.json({ success: true, message: 'Bus deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/drivers', async (req, res) => {
  try {
    const db = await getDb();
    const drivers = await db.all('SELECT id, name, username, mobile, license_number, created_at FROM users WHERE role = "driver" ORDER BY name');
    res.json(drivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Register new driver
router.post('/drivers', async (req, res) => {
  const { name, username, password } = req.body;
  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username, and password are required' });
  }
  try {
    const db = await getDb();
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);
    const result = await db.run(
      'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, "driver")',
      [name, username, hashedPassword]
    );
    res.status(201).json({
      id: result.lastID,
      name,
      username,
      role: 'driver'
    });
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Username already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete a driver
router.delete('/drivers/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('DELETE FROM users WHERE id = ? AND role = "driver"', [id]);
    res.json({ success: true, message: 'Driver deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==================== ROUTES & STOPS ENDPOINTS ====================

// List all routes with stops
router.get('/routes', async (req, res) => {
  try {
    const db = await getDb();
    const routesList = await db.all('SELECT * FROM routes ORDER BY id DESC');
    
    // Fetch stops for each route
    for (let r of routesList) {
      r.stops = await db.all(`
        SELECT s.*, rs.stop_order
        FROM stops s
        JOIN route_stops rs ON s.id = rs.stop_id
        WHERE rs.route_id = ?
        ORDER BY rs.stop_order ASC
      `, [r.id]);
    }
    res.json(routesList);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a new route
router.post('/routes', async (req, res) => {
  const { route_name, description, stops } = req.body; // stops is optional list of stop ids
  if (!route_name) {
    return res.status(400).json({ error: 'Route name is required' });
  }
  try {
    const db = await getDb();
    await db.run('BEGIN TRANSACTION');
    
    const result = await db.run(
      'INSERT INTO routes (route_name, description) VALUES (?, ?)',
      [route_name, description || '']
    );
    const routeId = result.lastID;

    // If initial stops provided
    if (stops && Array.isArray(stops)) {
      for (let i = 0; i < stops.length; i++) {
        await db.run(
          'INSERT INTO route_stops (route_id, stop_id, stop_order) VALUES (?, ?, ?)',
          [routeId, stops[i], i + 1]
        );
      }
    }

    await db.run('COMMIT');
    
    // Fetch and return the newly created route with its stops
    const finalRoute = await db.get('SELECT * FROM routes WHERE id = ?', [routeId]);
    finalRoute.stops = await db.all(`
      SELECT s.*, rs.stop_order
      FROM stops s
      JOIN route_stops rs ON s.id = rs.stop_id
      WHERE rs.route_id = ?
      ORDER BY rs.stop_order ASC
    `, [routeId]);
    
    res.status(201).json(finalRoute);
  } catch (error) {
    try { await db.run('ROLLBACK'); } catch (_) {}
    if (error.message.includes('UNIQUE constraint failed')) {
      return res.status(400).json({ error: 'Route name already exists' });
    }
    res.status(500).json({ error: error.message });
  }
});

// Delete a route
router.delete('/routes/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('DELETE FROM routes WHERE id = ?', [id]);
    res.json({ success: true, message: 'Route deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all stops (standalone)
router.get('/stops', async (req, res) => {
  try {
    const db = await getDb();
    const stops = await db.all('SELECT * FROM stops ORDER BY stop_name');
    res.json(stops);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create a standalone stop
router.post('/stops', async (req, res) => {
  const { stop_name, latitude, longitude } = req.body;
  if (!stop_name || latitude === undefined || longitude === undefined) {
    return res.status(400).json({ error: 'Stop name, latitude, and longitude are required' });
  }
  try {
    const db = await getDb();
    const result = await db.run(
      'INSERT INTO stops (stop_name, latitude, longitude) VALUES (?, ?, ?)',
      [stop_name, latitude, longitude]
    );
    const newStop = await db.get('SELECT * FROM stops WHERE id = ?', [result.lastID]);
    res.status(201).json(newStop);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List all complaints
router.get('/complaints', async (req, res) => {
  try {
    const db = await getDb();
    const complaints = await db.all('SELECT * FROM complaints ORDER BY created_at DESC');
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Mark complaint as resolved
router.put('/complaints/:id/resolve', async (req, res) => {
  const { id } = req.params;
  try {
    const db = await getDb();
    await db.run('UPDATE complaints SET status = "resolved" WHERE id = ?', [id]);
    const updated = await db.get('SELECT * FROM complaints WHERE id = ?', [id]);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// List currently active trips
router.get('/active-trips', async (req, res) => {
  try {
    const db = await getDb();
    const activeTrips = await db.all(`
      SELECT t.id as trip_id, t.status, t.current_latitude, t.current_longitude, t.last_update,
             b.bus_number, u.name as driver_name, r.route_name
      FROM trips t
      JOIN buses b ON t.bus_id = b.id
      JOIN users u ON t.driver_id = u.id
      JOIN routes r ON t.route_id = r.id
      WHERE t.status = 'active'
    `);
    res.json(activeTrips);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/pending-drivers', async (req, res) => {
  try {
    const db = await getDb();
    const pendingDrivers = await db.all("SELECT id, name, username, bus_number, assigned_route, mobile, license_number, created_at FROM users WHERE role = 'driver' AND is_approved = 0 ORDER BY created_at DESC");
    res.json(pendingDrivers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});


router.post('/pending-drivers/:id/approve', async (req, res) => {
  const { id } = req.params;
  const email = (req.body?.email || req.query?.email || req.body?.username || '').trim().toLowerCase();
  const busNumber = String(req.body?.busNumber || req.body?.bus_number || '').trim().toUpperCase();
  const assignedRoute = String(req.body?.route || req.body?.assigned_route || '').trim();
  if (!busNumber || !assignedRoute) {
    return res.status(400).json({ error: 'Assign both a bus number and route before approving this driver.' });
  }
  try {
    const db = await getDb();
    let user = await db.get(
      "SELECT id FROM users WHERE (id = ? OR LOWER(username) = LOWER(?) OR (LOWER(username) = LOWER(?) AND ? != '')) AND role = 'driver'",
      [id, id, email, email]
    );
    if (!user) {
      return res.status(404).json({ error: 'Pending driver registration request not found.' });
    }
    await db.run("UPDATE users SET is_approved = 1, bus_number = ?, assigned_route = ? WHERE id = ?", [busNumber, assignedRoute, user.id]);
    res.json({ success: true, assignmentSaved: true, message: 'Driver registration request approved successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete('/pending-drivers/:id/reject', async (req, res) => {
  const { id } = req.params;
  const email = (req.body?.email || req.query?.email || req.body?.username || '').trim().toLowerCase();
  try {
    const db = await getDb();
    let user = await db.get(
      "SELECT id FROM users WHERE (id = ? OR LOWER(username) = LOWER(?) OR (LOWER(username) = LOWER(?) AND ? != '')) AND role = 'driver'",
      [id, id, email, email]
    );
    if (!user) {
      return res.status(404).json({ error: 'Pending driver registration request not found.' });
    }
    await db.run("DELETE FROM users WHERE id = ?", [user.id]);
    res.json({ success: true, message: 'Driver registration request rejected/deleted.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
