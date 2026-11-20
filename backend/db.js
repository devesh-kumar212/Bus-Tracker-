const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');

const dbPath = process.env.TRACKMYBUS_DB_PATH || path.resolve(__dirname, 'database.sqlite');

let db = null;

async function getDb() {
  if (db) return db;
  
  db = await open({
    filename: dbPath,
    driver: sqlite3.Database
  });

  // Enable foreign key support in SQLite
  await db.run('PRAGMA foreign_keys = ON;');
  
  return db;
}

async function initDb() {
  const connection = await getDb();
  
  // Read and run schema.sql to build tables
  const schemaPath = path.resolve(__dirname, 'schema.sql');
  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf8');
    await connection.exec(schema);
    console.log('Database schema loaded successfully.');
  } else {
    console.error('schema.sql not found at ' + schemaPath);
  }

  // Migrate existing SQLite installations without dropping driver data.
  for (const statement of [
    'ALTER TABLE users ADD COLUMN bus_number TEXT',
    'ALTER TABLE users ADD COLUMN assigned_route TEXT',
    'ALTER TABLE users ADD COLUMN mobile TEXT',
    'ALTER TABLE users ADD COLUMN license_number TEXT'
  ]) {
    try { await connection.exec(statement); } catch (error) {
      if (!String(error.message).includes('duplicate column name')) throw error;
    }
  }
}

async function getOrGenerateRoutePolyline(routeId, db) {
  // 1. Check if polyline already exists in database
  const route = await db.get('SELECT polyline FROM routes WHERE id = ?', [routeId]);
  if (route && route.polyline) {
    try {
      return JSON.parse(route.polyline);
    } catch (err) {
      console.error('Failed to parse stored polyline:', err);
    }
  }

  // 2. Fetch stops for this route
  const stops = await db.all(`
    SELECT s.latitude, s.longitude, s.stop_name
    FROM stops s
    JOIN route_stops rs ON s.id = rs.stop_id
    WHERE rs.route_id = ?
    ORDER BY rs.stop_order ASC
  `, [routeId]);

  if (stops.length < 2) {
    return [];
  }

  // 3. Construct coordinates for OSRM query
  // For the Ajmer/Srinagar route, inject the South-West bypass curve [26.4435, 74.6545]
  // to avoid crossing through the mountain range.
  const coordsList = [];
  for (let i = 0; i < stops.length; i++) {
    const stop = stops[i];
    coordsList.push({ lat: stop.latitude, lng: stop.longitude });
    
    // Inject bypass curve between Ajmer Bus Stand (index 0) and Gandhinagar (index 1) to avoid mountain detours
    if (i === 0 && stop.stop_name.includes('Bus Stand') && stops[i+1] && stops[i+1].stop_name.includes('Gandhinagar')) {
      coordsList.push({ lat: 26.4435, lng: 74.6545 });
    }
  }

  const query = coordsList.map(c => `${c.lng},${c.lat}`).join(';');
  const osrmUrl = `https://router.project-osrm.org/route/v1/driving/${query}?overview=full&geometries=geojson`;

  try {
    const response = await fetch(osrmUrl, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) return [];
    const data = await response.json();
    if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length) {
      // OSRM coordinates are in [lng, lat] format, convert to [lat, lng] for Leaflet
      const polylinePoints = data.routes[0].geometry.coordinates.map(coord => [coord[1], coord[0]]);
      
      // Store in SQLite database as a JSON string
      await db.run('UPDATE routes SET polyline = ? WHERE id = ?', [JSON.stringify(polylinePoints), routeId]);
      return polylinePoints;
    }
  } catch (err) {
    console.error('Error generating polyline from OSRM:', err);
  }

  // Do not draw straight stop-to-stop lines as if they were drivable roads.
  return [];
}

module.exports = {
  getDb,
  initDb,
  getOrGenerateRoutePolyline
};
