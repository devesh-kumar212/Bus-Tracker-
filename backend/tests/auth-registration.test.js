const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const http = require('node:http');
const bcrypt = require('bcryptjs');

test('driver signup requires a Supabase verified session and approved drivers can log in by mobile', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackmybus-auth-'));
  process.env.TRACKMYBUS_DB_PATH = path.join(tempDir, 'auth-test.sqlite');
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  const dbModule = require('../db');
  const authRouter = require('../routes/auth').router;
  await dbModule.initDb();
  const db = await dbModule.getDb();
  const passwordHash = await bcrypt.hash('StrongPass9', 10);
  await db.run(`INSERT INTO users
    (name, username, password, role, is_approved, bus_number, assigned_route, mobile, license_number)
    VALUES ('Phone Driver', 'phone-driver@example.test', ?, 'driver', 1, 'BUS-9', 'College to Stand', '+919876543210', 'DL12345')`, [passwordHash]);
  const app = express();
  app.use(express.json());
  app.use('/api/auth', authRouter);
  const server = http.createServer(app);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/api/auth`;

  try {
    const noOtpSimulation = await fetch(`${baseUrl}/send-otp`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'person@example.test' })
    });
    assert.equal(noOtpSimulation.status, 404, 'the backend no longer issues simulated OTPs');

    const unverifiedSignup = await fetch(`${baseUrl}/driver-signup`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New Driver', username: 'new@example.test', password: 'StrongPass9', mobile: '+919876543211', licenseNumber: 'DL55555', busNumber: 'BUS-1', route: 'Town Route' })
    });
    assert.equal(unverifiedSignup.status, 401);

    const login = await fetch(`${baseUrl}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '+91 98765 43210', password: 'StrongPass9' })
    });
    assert.equal(login.status, 200);
    const payload = await login.json();
    assert.equal(payload.user.username, 'phone-driver@example.test');
    assert.equal(payload.user.role, 'driver');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await db.close();
    delete process.env.TRACKMYBUS_DB_PATH;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
