const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const http = require('node:http');
const jwt = require('jsonwebtoken');

test('driver approvals require an admin and a complete bus/route assignment', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackmybus-admin-'));
  process.env.TRACKMYBUS_DB_PATH = path.join(tempDir, 'admin-test.sqlite');
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  const dbModule = require('../db');
  const { JWT_SECRET } = require('../routes/auth');
  const adminRouter = require('../routes/admin');
  await dbModule.initDb();
  const db = await dbModule.getDb();
  const driver = await db.run(
    "INSERT INTO users (name, username, password, role, is_approved) VALUES ('Test Driver', 'test-driver@example.test', 'test', 'driver', 0)"
  );
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/admin/pending-drivers/${driver.lastID}/approve`;
  const adminToken = jwt.sign({ id: 1, username: 'admin@example.test', role: 'admin' }, JWT_SECRET);
  const driverToken = jwt.sign({ id: driver.lastID, username: 'test-driver@example.test', role: 'driver' }, JWT_SECRET);

  try {
    assert.equal((await fetch(url, { method: 'POST' })).status, 401);
    assert.equal((await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${driverToken}` } })).status, 403);
    const missingAssignment = await fetch(url, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' }, body: '{}'
    });
    assert.equal(missingAssignment.status, 400);
    const approved = await fetch(url, {
      method: 'POST', headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ busNumber: 'BUS-7', route: 'College to Bus Stand' })
    });
    assert.equal(approved.status, 200);
    assert.equal((await approved.json()).success, true);
    const row = await db.get('SELECT is_approved, bus_number, assigned_route FROM users WHERE id = ?', [driver.lastID]);
    assert.deepEqual(row, { is_approved: 1, bus_number: 'BUS-7', assigned_route: 'College to Bus Stand' });
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.close();
    delete process.env.TRACKMYBUS_DB_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
