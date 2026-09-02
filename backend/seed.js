const bcrypt = require('bcryptjs');
const { getDb, initDb } = require('./db');

async function seed() {
  console.log('Starting database seeding...');
  
  // Make sure tables exist
  await initDb();
  
  const db = await getDb();
  
  // Clear existing data (in order of dependencies)
  await db.run('DELETE FROM complaints');
  await db.run('DELETE FROM trip_logs');
  await db.run('DELETE FROM trips');
  await db.run('DELETE FROM route_stops');
  await db.run('DELETE FROM stops');
  await db.run('DELETE FROM routes');
  await db.run('DELETE FROM buses');
  await db.run('DELETE FROM users');
  
  console.log('Existing data cleared.');

  // 1. Create Users
  const salt = await bcrypt.genSalt(10);
  const adminPassword = await bcrypt.hash('9461616418', salt);
  const driverPassword = await bcrypt.hash('driver123', salt);

  const adminId = (await db.run(
    'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)',
    ['Chandan Panchal', 'chandanpanchal817@gmail.com', adminPassword, 'admin']
  )).lastID;

  const driver1Id = (await db.run(
    'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)',
    ['Aditya Yadav', 'driver1', driverPassword, 'driver']
  )).lastID;

  const driver2Id = (await db.run(
    'INSERT INTO users (name, username, password, role) VALUES (?, ?, ?, ?)',
    ['Nikhil Nayak', 'driver2', driverPassword, 'driver']
  )).lastID;

  console.log('Created Users:', { adminId, driver1Id, driver2Id });

  // 2. Create Buses
  const bus1Id = (await db.run(
    'INSERT INTO buses (bus_number, capacity, status) VALUES (?, ?, ?)',
    ['Green Bus (RJ-01-GB-5566)', 40, 'inactive' ]
  )).lastID;

  const bus2Id = (await db.run(
    'INSERT INTO buses (bus_number, capacity, status) VALUES (?, ?, ?)',
    ['RJ-14-PB-4455', 50, 'inactive']
  )).lastID;

  const bus3Id = (await db.run(
    'INSERT INTO buses (bus_number, capacity, status) VALUES (?, ?, ?)',
    ['RJ-01-TC-9988', 35, 'inactive']
  )).lastID;

  console.log('Created Buses:', { bus1Id, bus2Id, bus3Id });

  // 3. Create Routes
  const route1Id = (await db.run(
    'INSERT INTO routes (route_name, description) VALUES (?, ?)',
    ['Ajmer Bus Stand to Shreenagar Ajmer', 'Route starting from Central Bus Stand, heading via Gandhinagar to Shreenagar Ajmer']
  )).lastID;

  console.log('Created Routes:', { route1Id });

  // 4. Create Stops (Ajmer / Shreenagar area coordinates)
  // Ajmer Bus Stand: 26.4520, 74.6360
  // Gandhinagar Ajmer: 26.4715, 74.6625
  // Government Engineering College Ajmer: 26.4536, 74.7083
  // Shreenagar Ajmer: 26.4346, 74.7810

  const stops = [
    { name: 'Ajmer Bus Stand (Outside)', lat: 26.4696, lng: 74.6447 },
    { name: 'Gandhinagar Ajmer (Jain Mandir)', lat: 26.4715, lng: 74.6625 },
    { name: 'Government Engineering College Ajmer (GECA)', lat: 26.4536, lng: 74.7083 },
    { name: 'Shreenagar Ajmer', lat: 26.4346, lng: 74.7810 }
  ];

  const stopIds = {};
  for (const stop of stops) {
    const res = await db.run(
      'INSERT INTO stops (stop_name, latitude, longitude) VALUES (?, ?, ?)',
      [stop.name, stop.lat, stop.lng]
    );
    stopIds[stop.name] = res.lastID;
  }
  console.log('Created Stops:', stopIds);

  // 5. Connect Stops to Route (Ajmer Bus Stand to Shreenagar Ajmer)
  const route1Stops = [
    'Ajmer Bus Stand (Outside)',
    'Gandhinagar Ajmer (Jain Mandir)',
    'Government Engineering College Ajmer (GECA)',
    'Shreenagar Ajmer'
  ];
  for (let i = 0; i < route1Stops.length; i++) {
    await db.run(
      'INSERT INTO route_stops (route_id, stop_id, stop_order) VALUES (?, ?, ?)',
      [route1Id, stopIds[route1Stops[i]], i + 1]
    );
  }

  // 6. Insert a mock resolved & pending complaint
  await db.run(
    'INSERT INTO complaints (passenger_name, email, phone, bus_number, subject, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Devesh Kumar', 'devesh@example.com', '9876543210', 'RJ-01-TA-1122', 'Delay on Route 1', 'The bus was 20 minutes late at Vaishali Nagar stop yesterday.', 'pending']
  );
  await db.run(
    'INSERT INTO complaints (passenger_name, email, phone, bus_number, subject, description, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['Aditya Yadav', 'aditya@example.com', '9999888877', 'RJ-14-PB-4455', 'AC not working', 'The air conditioning in the bus was not functioning in this heat.', 'resolved']
  );

  console.log('Seeding completed successfully!');
}

if (require.main === module) {
  seed().catch(err => {
    console.error('Error seeding database:', err);
    process.exit(1);
  });
}

module.exports = seed;
