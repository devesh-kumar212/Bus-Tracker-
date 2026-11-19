const bcrypt = require('bcryptjs');
const { getDb, initDb } = require('./db');

const demoStops = [
  { name: 'Ajmer Bus Stand', latitude: 26.4696, longitude: 74.6447 },
  { name: 'Gandhinagar Ajmer', latitude: 26.4715, longitude: 74.6625 },
  { name: 'Government Engineering College Ajmer', latitude: 26.4536, longitude: 74.7083 },
  { name: 'Shreenagar Ajmer', latitude: 26.4346, longitude: 74.7810 }
];

async function ensureUser(db, { name, username, password, role }) {
  const existing = await db.get('SELECT id FROM users WHERE LOWER(username) = LOWER(?)', [username]);
  if (existing) return existing.id;
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await db.run(
    'INSERT INTO users (name, username, password, role, is_approved) VALUES (?, ?, ?, ?, ?)',
    [name, username.toLowerCase(), passwordHash, role, role === 'admin' ? 1 : 0]
  );
  return result.lastID;
}

async function seed() {
  if (process.env.NODE_ENV === 'production') throw new Error('Demo seeding is disabled in production.');
  if (process.env.SEED_DEMO_DATA !== 'true') {
    throw new Error('Set SEED_DEMO_DATA=true to add development fixtures. Existing records are preserved.');
  }
  if (!process.env.SEED_ADMIN_PASSWORD || !process.env.SEED_DRIVER_PASSWORD) {
    throw new Error('Set SEED_ADMIN_PASSWORD and SEED_DRIVER_PASSWORD before creating demo accounts.');
  }

  await initDb();
  const db = await getDb();
  const adminId = await ensureUser(db, {
    name: 'Transit Administrator', username: 'admin@example.test',
    password: process.env.SEED_ADMIN_PASSWORD, role: 'admin'
  });
  await ensureUser(db, { name: 'Demo Driver', username: 'driver@example.test', password: process.env.SEED_DRIVER_PASSWORD, role: 'driver' });

  const busNumbers = ['DEMO-01', 'DEMO-02', 'DEMO-03'];
  for (const [index, busNumber] of busNumbers.entries()) {
    await db.run('INSERT OR IGNORE INTO buses (bus_number, capacity, status) VALUES (?, ?, ?)', [busNumber, [40, 50, 35][index], 'inactive']);
  }

  const routeName = 'Ajmer Bus Stand to Shreenagar Ajmer';
  await db.run('INSERT OR IGNORE INTO routes (route_name, description) VALUES (?, ?)', [routeName, 'Development route fixture']);
  const route = await db.get('SELECT id FROM routes WHERE route_name = ?', [routeName]);
  const stopIds = [];
  for (const stop of demoStops) {
    let row = await db.get('SELECT id FROM stops WHERE stop_name = ?', [stop.name]);
    if (!row) {
      const result = await db.run('INSERT INTO stops (stop_name, latitude, longitude) VALUES (?, ?, ?)', [stop.name, stop.latitude, stop.longitude]);
      row = { id: result.lastID };
    }
    stopIds.push(row.id);
  }
  for (const [index, stopId] of stopIds.entries()) {
    await db.run('INSERT OR IGNORE INTO route_stops (route_id, stop_id, stop_order) VALUES (?, ?, ?)', [route.id, stopId, index + 1]);
  }

  console.log('Development fixtures are ready. Existing database records were preserved.');
  console.log(`Admin account: admin@example.test (id ${adminId}); credentials come from SEED_ADMIN_PASSWORD.`);
}

if (require.main === module) {
  seed().catch(error => {
    console.error('Seeding failed:', error.message);
    process.exit(1);
  });
}

module.exports = seed;
