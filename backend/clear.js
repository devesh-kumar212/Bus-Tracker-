const { getDb, initDb } = require('./db');

async function clearAllUserData() {
  if (process.env.NODE_ENV === 'production') throw new Error('The standalone clear utility is disabled in production.');
  if (process.env.CONFIRM_CLEAR_USER_DATA !== 'YES') {
    throw new Error('Set CONFIRM_CLEAR_USER_DATA=YES to remove non-admin accounts and their trip history.');
  }
  
  await initDb();
  const db = await getDb();

  // Clear tracking snapshots first, then dependent history and driver users.
  await db.run("DELETE FROM bus_locations WHERE driver_id IN (SELECT CAST(id AS TEXT) FROM users WHERE role != 'admin') OR driver_email IN (SELECT username FROM users WHERE role != 'admin')");
  await db.run('DELETE FROM complaints');
  await db.run("DELETE FROM trip_logs WHERE trip_id IN (SELECT id FROM trips WHERE driver_id IN (SELECT id FROM users WHERE role != 'admin'))");
  await db.run("DELETE FROM trips WHERE driver_id IN (SELECT id FROM users WHERE role != 'admin')");
  await db.run("DELETE FROM users WHERE role != 'admin'");
  
  console.log('✅ Successfully deleted all user info and signup records from SQLite database.');
}

clearAllUserData().catch(err => {
  console.error('Error deleting user data:', err);
  process.exit(1);
});
