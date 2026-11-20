const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const nodemailer = require('nodemailer');

const DEVELOPMENT_JWT_SECRET = 'trackmybus_secret_key_12345';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEVELOPMENT_JWT_SECRET)) {
  throw new Error('A strong JWT_SECRET must be configured before starting the production backend.');
}
const JWT_SECRET = process.env.JWT_SECRET || DEVELOPMENT_JWT_SECRET;

function normalizeMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return String(value || '').trim().startsWith('+') ? `+${digits}` : digits;
}

async function getTransporter() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000
  });
}
function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}
// Middleware to verify JWT token
async function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const user = jwt.verify(token, JWT_SECRET);
    if (user.role === 'admin') {
      req.user = user;
      return next();
    }
    if (user.role === 'driver') {
      const db = await getDb();
      const driver = await db.get("SELECT id, is_approved FROM users WHERE id = ? AND role = 'driver'", [user.id]);
      if (!driver || driver.is_approved !== 1) return res.status(403).json({ error: 'Approved driver access is required.' });
      req.user = { ...user, id: driver.id };
      return next();
    }
  } catch (_) {
    // Supabase access tokens are verified against Auth below.
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return res.status(403).json({ error: 'Invalid or expired token.' });

  try {
    const baseUrl = supabaseUrl.replace(/\/$/, '');
    const authResponse = await fetch(`${baseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!authResponse.ok) return res.status(401).json({ error: 'Session is invalid or expired.' });
    const authUser = await authResponse.json();
    const query = new URLSearchParams({ select: 'id,email,name,role,status', id: `eq.${authUser.id}` });
    const profileResponse = await fetch(`${baseUrl}/rest/v1/profiles?${query}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!profileResponse.ok) return res.status(403).json({ error: 'An approved application profile is required.' });
    const profiles = await profileResponse.json();
    const profile = profiles?.[0];
    if (!profile || !['admin', 'driver'].includes(profile.role)) {
      return res.status(403).json({ error: 'This account does not have administrative or driver access.' });
    }

    let id = String(authUser.id);
    if (profile.role === 'driver' && authUser.email) {
      const db = await getDb();
      const localDriver = await db.get(
        "SELECT id, is_approved FROM users WHERE LOWER(username) = LOWER(?) AND role = 'driver'",
        [authUser.email]
      );
      if (localDriver) {
        id = String(localDriver.id);
        if (localDriver.is_approved !== 1) return res.status(403).json({ error: 'Driver account is not approved.' });
      } else {
        const driverQuery = new URLSearchParams({ select: 'approval_status', user_id: `eq.${authUser.id}` });
        const driverResponse = await fetch(`${baseUrl}/rest/v1/drivers?${driverQuery}`, {
          headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(8000)
        });
        if (!driverResponse.ok) return res.status(403).json({ error: 'Driver approval could not be verified.' });
        const assignments = await driverResponse.json();
        if (assignments?.[0]?.approval_status !== 'approved') return res.status(403).json({ error: 'Driver account is not approved.' });
      }
    }
    req.user = { id, username: authUser.email, name: profile.name || authUser.user_metadata?.name, role: profile.role, authType: 'supabase' };
    return next();
  } catch (error) {
    console.error('Supabase API session verification failed:', error.message);
    return res.status(503).json({ error: 'Could not verify the session with Supabase.' });
  }
}

// POST login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const db = await getDb();
    const normalizedUsername = String(username).trim().toLowerCase();
    const normalizedPhone = normalizeMobile(username);
    const user = await db.get('SELECT * FROM users WHERE LOWER(username) = ? OR mobile = ?', [normalizedUsername, normalizedPhone]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    if (user.role === 'driver' && user.is_approved !== 1) {
      return res.status(403).json({ error: 'Your driver registration request is pending admin approval.' });
    }

    // Generate token
    const token = jwt.sign(
      { id: user.id, username: user.username, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        is_approved: user.is_approved,
        status: user.is_approved === 1 ? 'approved' : 'pending',
        mobile: user.mobile,
        license_number: user.license_number
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /driver-status - Check real-time driver approval status from SQLite
router.get('/driver-status', authenticateToken, async (req, res) => {
  const email = (req.query.email || req.query.username || '').trim().toLowerCase();
  const id = req.query.id;

  if (req.user.role !== 'driver' ||
      (email && email !== String(req.user.username || '').toLowerCase() && String(id || '') !== String(req.user.id)) ||
      (!email && String(id || '') !== String(req.user.id))) {
    return res.status(403).json({ error: 'You can only view your own driver status.' });
  }

  if (!email && !id) {
    return res.status(400).json({ error: 'Email or ID is required' });
  }

  try {
    const db = await getDb();
    let user = null;
    if (email) {
      user = await db.get(
        "SELECT id, name, username, role, is_approved, bus_number, assigned_route FROM users WHERE LOWER(username) = LOWER(?) AND role = 'driver'",
        [email]
      );
    }
    if (!user && id) {
      user = await db.get(
        "SELECT id, name, username, role, is_approved, bus_number, assigned_route FROM users WHERE (id = ? OR LOWER(username) = LOWER(?)) AND role = 'driver'",
        [id, id]
      );
    }

    if (!user) {
      return res.json({ status: 'not_found', approvalStatus: 'not_found' });
    }

    const status = user.is_approved === 1 ? 'approved' : 'pending';
    res.json({
      id: user.id,
      email: user.username,
      name: user.name,
      role: user.role,
      is_approved: user.is_approved,
      bus_number: user.bus_number,
      route: user.assigned_route,
      status,
      approvalStatus: status
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST driver signup after Supabase Auth has confirmed the signup email.
router.post('/driver-signup', async (req, res) => {
  const { name, username, password, busNumber, route, mobile, licenseNumber } = req.body || {};
  const normalizedEmail = typeof username === 'string' ? username.trim().toLowerCase() : '';
  const normalizedMobile = normalizeMobile(mobile);
  const normalizedLicense = typeof licenseNumber === 'string' ? licenseNumber.trim().toUpperCase() : '';
  const token = (req.headers.authorization || '').startsWith('Bearer ')
    ? req.headers.authorization.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'A verified Supabase email session is required.' });
  if (!name?.trim() || !normalizedEmail.includes('@') || !password || password.length < 8 ||
      !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password) ||
      !/^\+?[1-9]\d{7,14}$/.test(normalizedMobile) || normalizedLicense.length < 5 || normalizedLicense.length > 30 ||
      !busNumber?.trim() || !route?.trim()) {
    return res.status(400).json({ error: 'Name, verified email session, strong password, mobile, license number, bus and route are required.' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) return res.status(503).json({ error: 'Supabase Auth verification is not configured on the server.' });
  let authUser;
  try {
    const response = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) return res.status(401).json({ error: 'Confirm the signup email and reopen the confirmation link before registering.' });
    authUser = await response.json();
  } catch (error) {
    console.error('Supabase signup session verification failed:', error.message);
    return res.status(503).json({ error: 'Could not verify the Supabase signup session.' });
  }
  if (authUser.email?.trim().toLowerCase() !== normalizedEmail || !authUser.email_confirmed_at) {
    return res.status(401).json({ error: 'A verified Supabase email session matching this application is required.' });
  }
  try {
    const baseUrl = supabaseUrl.replace(/\/$/, '');
    const headers = { apikey: anonKey, Authorization: `Bearer ${token}` };
    const profileQuery = new URLSearchParams({ select: 'role,status', id: `eq.${authUser.id}` });
    const driverQuery = new URLSearchParams({ select: 'user_id', user_id: `eq.${authUser.id}` });
    const [profileResponse, driverResponse] = await Promise.all([
      fetch(`${baseUrl}/rest/v1/profiles?${profileQuery}`, { headers, signal: AbortSignal.timeout(8000) }),
      fetch(`${baseUrl}/rest/v1/drivers?${driverQuery}`, { headers, signal: AbortSignal.timeout(8000) })
    ]);
    if (!profileResponse.ok || !driverResponse.ok) throw new Error('Could not read verified driver application records.');
    const [profiles, driverRows] = await Promise.all([profileResponse.json(), driverResponse.json()]);
    if (profiles?.[0]?.role !== 'driver' || !driverRows?.[0]) {
      return res.status(403).json({ error: 'Apply through the verified driver registration flow first.' });
    }
  } catch (error) {
    console.error('Supabase driver application lookup failed:', error.message);
    return res.status(503).json({ error: 'Could not verify the Supabase driver application. Check the database migration and retry.' });
  }

  try {
    const db = await getDb();
    const existingUser = await db.get("SELECT id, role, is_approved FROM users WHERE LOWER(username) = LOWER(?)", [normalizedEmail]);
    if (existingUser) {
      if (existingUser.role !== 'driver' || existingUser.is_approved === 1) {
        return res.status(409).json({ error: 'An account already exists with this email. Please sign in or contact the administrator.' });
      }
      const duplicateContact = await db.get(
        'SELECT id FROM users WHERE id != ? AND (mobile = ? OR UPPER(license_number) = ?)',
        [existingUser.id, normalizedMobile, normalizedLicense]
      );
      if (duplicateContact) return res.status(409).json({ error: 'This mobile or license number is already registered to another driver.' });
      const hashedPassword = await bcrypt.hash(password, 12);
      await db.run(`UPDATE users SET name = ?, password = ?, bus_number = ?, assigned_route = ?, mobile = ?, license_number = ?
        WHERE id = ? AND role = 'driver' AND is_approved = 0`,
      [name.trim(), hashedPassword, busNumber.trim().toUpperCase(), route.trim(), normalizedMobile, normalizedLicense, existingUser.id]);
      return res.status(200).json({ success: true, alreadySubmitted: true, message: 'Your pending driver application has been updated.' });
    }
    const duplicateContact = await db.get(
      'SELECT id FROM users WHERE mobile = ? OR UPPER(license_number) = ?', [normalizedMobile, normalizedLicense]
    );
    if (duplicateContact) return res.status(409).json({ error: 'This mobile or license number is already registered to another driver.' });
    const hashedPassword = await bcrypt.hash(password, 12);
    await db.run(`INSERT INTO users
      (name, username, password, role, is_approved, bus_number, assigned_route, mobile, license_number)
      VALUES (?, ?, ?, 'driver', 0, ?, ?, ?, ?)`,
    [name.trim(), normalizedEmail, hashedPassword, busNumber.trim().toUpperCase(), route.trim(), normalizedMobile, normalizedLicense]);
    res.status(201).json({ success: true, message: 'Driver registration request submitted for admin approval.' });
  } catch (error) {
    console.error('Driver signup error:', error);
    res.status(500).json({ error: 'Server error during registration request.' });
  }
});
// POST /send-approval-email - Send official approval email to driver
router.post('/send-approval-email', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin permission required.' });
  const { email, name, busNumber, route } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid driver email address is required.' });
  }

  const driverName = name || 'Driver';
  const driverBus = busNumber || 'N/A';
  const driverRoute = route || 'Assigned Route';
  const normalizedEmail = email.trim().toLowerCase();
  const safeName = escapeHtml(driverName);
  const safeBus = escapeHtml(driverBus);
  const safeRoute = escapeHtml(driverRoute);

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Bus Tracker Admin Team" <no-reply@trackmybus.com>',
    to: normalizedEmail,
    subject: 'Bus Tracker - Driver Approval Confirmed',
    text: `Hello ${driverName},\n\nCongratulations!\n\nYour driver registration for Bus Tracker has been approved.\n\nYou are now authorized to operate:\n\nBus Number: ${driverBus}\nRoute: ${driverRoute}\n\nYou can now log in to your Bus Tracker account and access your Driver Dashboard.\n\nThank you,\nBus Tracker Admin Team`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #080c14; color: #f4f4f5; padding: 28px; border-radius: 16px; max-w: 600px; border: 1px solid #10b981;">
        <h2 style="color: #34d399; margin-bottom: 16px;">Ã°Å¸Å¡Å’ Bus Tracker - Driver Approval Confirmed</h2>
        <p style="font-size: 15px; color: #e4e4e7;">Hello <strong>${safeName}</strong>,</p>
        <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">Congratulations! Your driver registration for <strong>Bus Tracker</strong> has been approved.</p>
        <div style="background-color: #092e20; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 8px;">
          <div style="font-size: 13px; font-weight: bold; color: #6ee7b7; text-transform: uppercase; margin-bottom: 8px;">Authorized Operations</div>
          <div style="font-size: 14px; color: #ffffff; margin-bottom: 4px;"><strong>Bus Number:</strong> ${safeBus}</div>
          <div style="font-size: 14px; color: #ffffff;"><strong>Route:</strong> ${safeRoute}</div>
        </div>
        <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">You can now log in to your Bus Tracker account and access your Driver Dashboard to initiate shifts and broadcast live GPS location.</p>
        <hr style="border: 0; border-top: 1px solid #27272a; margin: 24px 0;" />
        <p style="font-size: 12px; color: #71717a;">Thank you,<br/><strong>Bus Tracker Admin Team</strong></p>
      </div>
    `
  };

  try {
    const activeTransporter = await getTransporter();
    if (!activeTransporter) return res.status(503).json({ error: 'Email service is not configured.' });
    const info = await activeTransporter.sendMail(mailOptions);
    console.log(`\n========================================================`);
    console.log(` Ã°Å¸â€œÂ§ DRIVER APPROVAL EMAIL SENT TO: ${normalizedEmail}`);
    console.log(` Ã°Å¸Å¡Å’ BUS: ${driverBus} | ROUTE: ${driverRoute}`);
    console.log(`========================================================\n`);

    const previewUrl = nodemailer.getTestMessageUrl(info);
    res.json({ success: true, message: `Approval email sent to ${normalizedEmail}`, previewUrl: previewUrl || null });
  } catch (err) {
    console.error('Error sending approval email:', err);
    res.status(502).json({ error: 'Approval email could not be delivered. Check the SMTP settings.' });
  }
});

// POST /send-rejection-email - Send rejection notification email to driver
router.post('/send-rejection-email', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin permission required.' });
  const { email, name } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid driver email address is required.' });
  }

  const driverName = name || 'Driver';
  const normalizedEmail = email.trim().toLowerCase();
  const safeName = escapeHtml(driverName);

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Bus Tracker Admin Team" <no-reply@trackmybus.com>',
    to: normalizedEmail,
    subject: 'Bus Tracker - Driver Registration Status Update',
    text: `Hello ${driverName},\n\nYour driver registration for Bus Tracker has been rejected. Please contact the administrator.\n\nThank you,\nBus Tracker Admin Team`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #080c14; color: #f4f4f5; padding: 28px; border-radius: 16px; max-w: 600px; border: 1px solid #f43f5e;">
        <h2 style="color: #fb7185; margin-bottom: 16px;">Bus Tracker - Registration Status</h2>
        <p style="font-size: 15px; color: #e4e4e7;">Hello <strong>${safeName}</strong>,</p>
        <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">Your driver registration for <strong>Bus Tracker</strong> has been rejected. Please contact the administrator for assistance.</p>
        <hr style="border: 0; border-top: 1px solid #27272a; margin: 24px 0;" />
        <p style="font-size: 12px; color: #71717a;">Thank you,<br/><strong>Bus Tracker Admin Team</strong></p>
      </div>
    `
  };

  try {
    const activeTransporter = await getTransporter();
    if (!activeTransporter) return res.status(503).json({ error: 'Email service is not configured.' });
    const info = await activeTransporter.sendMail(mailOptions);
    console.log(`\n========================================================`);
    console.log(` Ã°Å¸â€œÂ§ DRIVER REJECTION EMAIL SENT TO: ${normalizedEmail}`);
    console.log(`========================================================\n`);

    res.json({ success: true, message: `Rejection email sent to ${normalizedEmail}` });
  } catch (err) {
    console.error('Error sending rejection email:', err);
    res.status(502).json({ error: 'Rejection email could not be delivered. Check the SMTP settings.' });
  }
});

// POST /clear-user-data - Delete all non-admin drivers, users and sign up data from SQLite
router.post('/clear-user-data', authenticateToken, async (req, res) => {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin permission required.' });
  }
  try {
    const db = await getDb();
    
    // Clear tracking snapshots for removed users before dependent records.
    await db.run("DELETE FROM bus_locations WHERE driver_id IN (SELECT CAST(id AS TEXT) FROM users WHERE role != 'admin') OR driver_email IN (SELECT username FROM users WHERE role != 'admin')");
    await db.run('DELETE FROM complaints');
    await db.run("DELETE FROM trip_logs WHERE trip_id IN (SELECT id FROM trips WHERE driver_id IN (SELECT id FROM users WHERE role != 'admin'))");
    await db.run("DELETE FROM trips WHERE driver_id IN (SELECT id FROM users WHERE role != 'admin')");
    await db.run("DELETE FROM users WHERE role != 'admin'");

    console.log('\n========================================================');
    console.log(' Ã°Å¸Â§Â¹ CLEARED ALL USER & SIGNUP DATA FROM SQLITE DATABASE');
    console.log('========================================================\n');

    res.json({ success: true, message: 'All user data and sign up info deleted successfully.' });
  } catch (err) {
    console.error('Error clearing user data:', err);
    res.status(500).json({ error: 'Failed to clear user data: ' + err.message });
  }
});

// GET profile
router.get('/me', authenticateToken, (req, res) => {
  res.json({ user: req.user });
});

module.exports = {
  router,
  authenticateToken,
  JWT_SECRET
};

