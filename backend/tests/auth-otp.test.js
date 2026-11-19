const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const http = require('node:http');

test('email OTP and one-time signup proof survive an API module restart', async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'trackmybus-otp-'));
  process.env.TRACKMYBUS_DB_PATH = path.join(tempDir, 'otp-test.sqlite');
  process.env.NODE_ENV = 'test';
  process.env.SMTP_HOST = '';
  process.env.SMTP_USER = '';
  process.env.SMTP_PASS = '';
  process.env.OTP_ALLOW_DEV_FALLBACK = 'true';
  require('dotenv').config({ path: path.resolve(__dirname, '../.env') });
  const dbModule = require('../db');
  await dbModule.initDb();

  const startServer = async () => {
    const { router } = require('../routes/auth');
    const app = express();
    app.use(express.json());
    app.use('/api/auth', router);
    const server = http.createServer(app);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    return { server, baseUrl: `http://127.0.0.1:${server.address().port}/api/auth` };
  };
  let running = await startServer();
  const call = async (endpoint, body) => {
    const response = await fetch(`${running.baseUrl}/${endpoint}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
    return { response, payload: await response.json() };
  };

  try {
    const sent = await call('send-otp', { email: 'otp-driver@example.test' });
    assert.equal(sent.response.status, 200);
    assert.equal(sent.payload.developmentFallback, true);

    const verified = await call('verify-otp', { email: 'OTP-DRIVER@example.test', otp: sent.payload.developmentOtp });
    assert.equal(verified.response.status, 200);
    assert.ok(verified.payload.verificationToken);

    await new Promise(resolve => running.server.close(resolve));
    delete require.cache[require.resolve('../routes/auth')];
    running = await startServer();
    const signup = await call('driver-signup', {
      name: 'OTP Driver', username: 'otp-driver@example.test', password: 'safe-pass-123',
      busNumber: 'BUS-OTP', route: 'College to Bus Stand', verificationToken: verified.payload.verificationToken
    });
    assert.equal(signup.response.status, 201);

    const replay = await call('driver-signup', {
      name: 'OTP Driver', username: 'otp-driver@example.test', password: 'safe-pass-123',
      busNumber: 'BUS-OTP', route: 'College to Bus Stand', verificationToken: verified.payload.verificationToken
    });
    assert.equal(replay.response.status, 401, 'the signup proof can only be used once');
    const driver = await (await dbModule.getDb()).get("SELECT is_approved, bus_number FROM users WHERE username = 'otp-driver@example.test'");
    assert.deepEqual(driver, { is_approved: 0, bus_number: 'BUS-OTP' });
  } finally {
    await new Promise(resolve => running.server.close(resolve));
    await (await dbModule.getDb()).close();
    delete process.env.TRACKMYBUS_DB_PATH;
    delete process.env.NODE_ENV;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    delete process.env.OTP_ALLOW_DEV_FALLBACK;
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
