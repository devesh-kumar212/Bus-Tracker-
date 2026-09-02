const { getDb, initDb } = require('./db');

async function clearAllUserData() {
  console.log('Starting deletion of all user data and sign up info...');
  
  await initDb();
  const db = await getDb();

  // Delete all complaints, trip logs, trips, and non-admin users
  await db.run('DELETE FROM complaints');
  await db.run('DELETE FROM trip_logs');
  await db.run('DELETE FROM trips');
  await db.run("DELETE FROM users WHERE role != 'admin'");
  
  console.log('✅ Successfully deleted all user info and signup records from SQLite database.');
}

clearAllUserData().catch(err => {
  console.error('Error deleting user data:', err);
  process.exit(1);
});
