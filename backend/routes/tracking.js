const express = require('express');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');
const { JWT_SECRET } = require('./auth');

const router = express.Router();
const FRESH_MS = Number(process.env.TRACKING_FRESH_MS || 30000);
const DELAYED_MS = Number(process.env.TRACKING_DELAYED_MS || 90000);
const HEARTBEAT_EXPIRED_MS = Number(process.env.TRACKING_HEARTBEAT_EXPIRED_MS || 120000);
const supabaseSyncWarnings = new Set();

function bearerToken(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

async function authenticate(req, res, next) {
  const token = bearerToken(req);
  if (!token) return res.status(401).json({ error: 'Driver authentication is required.' });

  let localTokenRole = null;
  try {
    const claims = jwt.verify(token, JWT_SECRET);
    if (claims.role === 'driver') {
      req.driverIdentity = { id: String(claims.id), email: claims.username, name: claims.name, authType: 'sqlite' };
      return next();
    }
    localTokenRole = claims.role || null;
  } catch (_) {
    // Supabase access tokens are verified with Supabase Auth below.
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    if (localTokenRole) return res.status(403).json({ error: 'Driver access is required.' });
    return res.status(503).json({ error: 'Supabase token verification is not configured on the backend.' });
  }

  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return res.status(localTokenRole ? 403 : 401).json({
        error: localTokenRole ? 'Driver access is required.' : 'Driver session is invalid or expired.'
      });
    }
    const user = await response.json();
    req.driverIdentity = { id: String(user.id), email: user.email, name: user.user_metadata?.name, authType: 'supabase' };
    next();
  } catch (error) {
    console.error('Supabase session verification failed:', error.message);
    res.status(503).json({ error: 'Could not verify the driver session.' });
  }
}

async function getAssignment(identity, db, token) {
  const user = await db.get(
    "SELECT id, name, username, bus_number, assigned_route, is_approved FROM users WHERE role = 'driver' AND (CAST(id AS TEXT) = ? OR LOWER(username) = LOWER(?))",
    [identity.id, identity.email || '']
  );
  if (user) {
    if (user.is_approved !== 1) throw Object.assign(new Error('Driver account is not approved.'), { status: 403 });
    if (user.bus_number && user.assigned_route) {
      return { driverId: String(user.id), name: user.name, email: user.username, busNumber: user.bus_number, route: user.assigned_route };
    }
  }

  // Compatibility for Supabase drivers created before assignments were copied into SQLite.
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (identity.authType === 'supabase' && supabaseUrl && anonKey) {
    const query = new URLSearchParams({
      select: 'user_id,name,email,bus_number,route,approval_status',
      user_id: `eq.${identity.id}`
    });
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/drivers?${query}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (response.ok) {
      const records = await response.json();
      const record = records?.[0];
      if (record?.approval_status === 'approved' && record.bus_number && record.route) {
        return { driverId: identity.id, name: record.name, email: record.email, busNumber: record.bus_number, route: record.route };
      }
      if (record && record.approval_status !== 'approved') throw Object.assign(new Error('Driver account is not approved.'), { status: 403 });
    }
  }

  const activeTrip = user ? await db.get(`
    SELECT t.id AS trip_id, b.bus_number, r.route_name
    FROM trips t JOIN buses b ON b.id = t.bus_id JOIN routes r ON r.id = t.route_id
    WHERE t.driver_id = ? AND t.status = 'active'`, [user.id]) : null;
  if (activeTrip) {
    return { driverId: String(user.id), name: user.name, email: user.username, busNumber: activeTrip.bus_number, route: activeTrip.route_name };
  }
  throw Object.assign(new Error('No approved bus and route assignment was found for this driver.'), { status: 409 });
}

async function withDriver(req, res, action) {
  try {
    const db = await getDb();
    const assignment = await getAssignment(req.driverIdentity, db, bearerToken(req));
    await action(db, assignment, req.driverIdentity, bearerToken(req));
  } catch (error) {
    console.error('Driver tracking request failed:', error);
    res.status(error.status || 500).json({ error: error.status ? error.message : 'Unable to save tracking data.' });
  }
}

async function syncSupabase(identity, token, rpc, args = {}) {
  if (identity?.authType !== 'supabase') return;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return;
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/rest/v1/rpc/${rpc}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300);
      if (!supabaseSyncWarnings.has(rpc)) {
        supabaseSyncWarnings.add(rpc);
        console.warn(`Supabase tracking sync ${rpc} failed (${response.status}): ${detail}`);
      }
    }
  } catch (error) {
    if (!supabaseSyncWarnings.has(rpc)) {
      supabaseSyncWarnings.add(rpc);
      console.warn(`Supabase tracking sync ${rpc} failed: ${error.message}`);
    }
  }
}

function nowIso() {
  return new Date().toISOString();
}

router.post('/start', authenticate, (req, res) => withDriver(req, res, async (db, driver, identity, token) => {
  const now = nowIso();
  const current = await db.get('SELECT * FROM bus_locations WHERE driver_id = ?', [driver.driverId]);
  const sameBus = await db.get('SELECT * FROM bus_locations WHERE LOWER(bus_number) = LOWER(?)', [driver.busNumber]);
  if (sameBus && sameBus.driver_id !== driver.driverId && sameBus.tracking_status === 'ACTIVE' && Date.now() - Date.parse(sameBus.last_heartbeat_at || '') <= HEARTBEAT_EXPIRED_MS) {
    return res.status(409).json({ error: 'This bus is already being tracked by another driver.' });
  }
  if (sameBus && sameBus.driver_id !== driver.driverId) {
    await db.run('DELETE FROM bus_locations WHERE driver_id = ?', [sameBus.driver_id]);
  }
  await db.run(`
    INSERT INTO bus_locations (driver_id, bus_number, driver_name, driver_email, route, latitude, longitude, tracking_status, last_update, last_heartbeat_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?)
    ON CONFLICT(driver_id) DO UPDATE SET bus_number = excluded.bus_number, driver_name = excluded.driver_name,
      driver_email = excluded.driver_email, route = excluded.route, tracking_status = 'ACTIVE', last_heartbeat_at = excluded.last_heartbeat_at
  `, [driver.driverId, driver.busNumber, driver.name, driver.email, driver.route, current?.latitude ?? null, current?.longitude ?? null, current?.last_update ?? null, now]);
  await syncSupabase(identity, token, 'start_bus_tracking');
  const io = req.app.get('io');
  if (io) io.emit('bus_tracking_changed', { driver_id: driver.driverId, tracking_status: 'ACTIVE' });
  res.json({ success: true, tracking_status: 'ACTIVE', bus_number: driver.busNumber, route: driver.route });
}));

router.post('/location', authenticate, (req, res) => withDriver(req, res, async (db, driver, identity, token) => {
  const { latitude, longitude, accuracy, speed, heading } = req.body || {};
  const lat = Number(latitude);
  const lng = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return res.status(400).json({ error: 'Valid GPS latitude and longitude are required.' });
  }
  const current = await db.get('SELECT tracking_status, bus_number FROM bus_locations WHERE driver_id = ?', [driver.driverId]);
  if (!current || current.tracking_status !== 'ACTIVE') return res.status(409).json({ error: 'Start tracking before sending GPS locations.' });
  if (current.bus_number.toLowerCase() !== driver.busNumber.toLowerCase()) return res.status(409).json({ error: 'The driver bus assignment changed. Restart tracking.' });
  const updatedAt = nowIso();
  await db.run(`
    UPDATE bus_locations SET latitude = ?, longitude = ?, accuracy = ?, speed = ?, heading = ?,
      last_update = ?, last_heartbeat_at = ?, driver_name = ?, driver_email = ?, route = ?
    WHERE driver_id = ? AND tracking_status = 'ACTIVE'
  `, [lat, lng, Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
    Number.isFinite(Number(speed)) && Number(speed) >= 0 ? Number(speed) : null,
    Number.isFinite(Number(heading)) ? Number(heading) : null, updatedAt, updatedAt, driver.name, driver.email, driver.route, driver.driverId]);
  // Keep the legacy trip view in sync when this driver started a trip through /api/driver.
  await db.run(`
    UPDATE trips SET current_latitude = ?, current_longitude = ?, last_update = ?
    WHERE CAST(driver_id AS TEXT) = ? AND status = 'active'
  `, [lat, lng, updatedAt, driver.driverId]);
  await syncSupabase(identity, token, 'update_bus_location', {
    p_latitude: lat,
    p_longitude: lng,
    p_accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
    p_speed: Number.isFinite(Number(speed)) && Number(speed) >= 0 ? Number(speed) : null,
    p_heading: Number.isFinite(Number(heading)) ? Number(heading) : null
  });
  await db.run(`
    INSERT INTO trip_logs (trip_id, latitude, longitude)
    SELECT id, ?, ? FROM trips WHERE CAST(driver_id AS TEXT) = ? AND status = 'active'
  `, [lat, lng, driver.driverId]);
  const payload = { driver_id: driver.driverId, bus_number: driver.busNumber, driver_name: driver.name, route: driver.route,
    latitude: lat, longitude: lng, accuracy: Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
    speed: Number.isFinite(Number(speed)) ? Number(speed) : null, heading: Number.isFinite(Number(heading)) ? Number(heading) : null,
    tracking_status: 'ACTIVE', updated_at: updatedAt };
  const io = req.app.get('io');
  if (io) io.emit('location_changed', payload);
  res.json({ success: true, location: payload });
}));

router.post('/heartbeat', authenticate, (req, res) => withDriver(req, res, async (db, driver, identity, token) => {
  const updatedAt = nowIso();
  const result = await db.run("UPDATE bus_locations SET last_heartbeat_at = ? WHERE driver_id = ? AND tracking_status = 'ACTIVE'", [updatedAt, driver.driverId]);
  if (!result.changes) return res.status(409).json({ error: 'Tracking session is not active.' });
  await syncSupabase(identity, token, 'heartbeat_bus_tracking');
  res.json({ success: true, last_heartbeat_at: updatedAt });
}));

router.post('/stop', authenticate, (req, res) => withDriver(req, res, async (db, driver, identity, token) => {
  const updatedAt = nowIso();
  await db.run("UPDATE bus_locations SET tracking_status = 'INACTIVE', last_heartbeat_at = ? WHERE driver_id = ?", [updatedAt, driver.driverId]);
  await syncSupabase(identity, token, 'stop_bus_tracking');
  const io = req.app.get('io');
  if (io) io.emit('bus_tracking_changed', { driver_id: driver.driverId, tracking_status: 'INACTIVE' });
  res.json({ success: true, tracking_status: 'INACTIVE' });
}));

router.get('/me', authenticate, (req, res) => withDriver(req, res, async (db, driver) => {
  const record = await db.get('SELECT tracking_status, latitude, longitude, accuracy, speed, heading, last_update, last_heartbeat_at FROM bus_locations WHERE driver_id = ?', [driver.driverId]);
  res.json({ tracking_status: record?.tracking_status || 'INACTIVE', location: record || null });
}));

router.get('/active-buses', async (req, res) => {
  res.set('Cache-Control', 'no-store, private');
  try {
    const db = await getDb();
    const rows = await db.all('SELECT driver_id, bus_number, driver_name, route, latitude, longitude, accuracy, speed, heading, tracking_status, last_update, last_heartbeat_at FROM bus_locations ORDER BY bus_number');
    const now = Date.now();
    const buses = rows.map(bus => {
      const heartbeatAge = bus.last_heartbeat_at ? Math.max(0, now - Date.parse(bus.last_heartbeat_at)) : Infinity;
      const locationAge = bus.last_update ? Math.max(0, now - Date.parse(bus.last_update)) : Infinity;
      let status = 'OFFLINE';
      if (bus.tracking_status === 'ACTIVE' && heartbeatAge <= HEARTBEAT_EXPIRED_MS) {
        status = locationAge <= FRESH_MS ? 'LIVE' : locationAge <= DELAYED_MS ? 'DELAYED' : 'STALE';
      }
      return { ...bus, is_tracking: status !== 'OFFLINE', status_code: status,
        status_label: status === 'LIVE' ? 'LIVE' : status === 'DELAYED' ? 'DELAYED' : status === 'STALE' ? 'STALE' : 'OFFLINE' };
    });
    res.json(buses);
  } catch (error) {
    console.error('Public active bus query failed:', error);
    res.status(500).json({ error: 'Unable to load live bus locations.' });
  }
});

module.exports = router;
