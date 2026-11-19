const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { getDb } = require('../db');

const nodemailer = require('nodemailer');

const DEVELOPMENT_JWT_SECRET = 'trackmybus_secret_key_12345';
if (process.env.NODE_ENV === 'production' && (!process.env.JWT_SECRET || process.env.JWT_SECRET === DEVELOPMENT_JWT_SECRET)) {
  throw new Error('A strong JWT_SECRET must be configured before starting the production backend.');
}
const JWT_SECRET = process.env.JWT_SECRET || DEVELOPMENT_JWT_SECRET;

const otpRequestWindows = new Map();

function hashOtp(email, otp) {
  return crypto.createHmac('sha256', JWT_SECRET).update(`${email}:${otp}`).digest('hex');
}

function reserveOtpRequest(key) {
  const now = Date.now();
  const history = (otpRequestWindows.get(key) || []).filter(time => now - time < 15 * 60 * 1000);
  if (history.length >= 5 || (history.length > 0 && now - history[history.length - 1] < 60 * 1000)) return false;
  history.push(now);
  otpRequestWindows.set(key, history);
  return true;
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
// POST /send-otp - Generate & send 6-digit OTP code to driver email
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!reserveOtpRequest(`email:${normalizedEmail}`) || !reserveOtpRequest(`ip:${req.ip}`)) {
    return res.status(429).json({ error: 'Too many verification code requests. Please wait before trying again.' });
  }

  // Persist only a keyed hash so challenges survive an API restart without
  // storing the raw verification code in the database.
  const code = crypto.randomInt(100000, 1000000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiry
  try {
    const db = await getDb();
    await db.run(`
      INSERT INTO email_verifications (email, otp_hash, expires_at, attempts, proof_id, proof_expires_at, updated_at)
      VALUES (?, ?, ?, 0, NULL, NULL, ?)
      ON CONFLICT(email) DO UPDATE SET otp_hash = excluded.otp_hash, expires_at = excluded.expires_at,
        attempts = 0, proof_id = NULL, proof_expires_at = NULL, updated_at = excluded.updated_at
    `, [normalizedEmail, hashOtp(normalizedEmail, code), expiresAt, new Date().toISOString()]);
  } catch (error) {
    console.error('Could not store OTP challenge:', error.message);
    return res.status(503).json({ error: 'Verification service is temporarily unavailable. Please try again.' });
  }

  const mailOptions = {
    from: process.env.SMTP_FROM || '"TrackMyBus Verification" <no-reply@trackmybus.com>',
    to: normalizedEmail,
    subject: 'Ã°Å¸Å¡Å’ Your Driver Registration Verification Code',
    text: `Hello,\n\nYour 6-digit email verification code for TrackMyBus Driver Registration is:\n\n   ${code}\n\nThis code will expire in 5 minutes. Please enter this code on the registration page to complete your application.\n\nThank you,\nTrackMyBus Team`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px;">
        <h2 style="color: #38bdf8; margin-bottom: 12px;">Ã°Å¸Å¡Å’ TrackMyBus Driver Registration</h2>
        <p style="font-size: 14px; color: #94a3b8;">Your 6-digit email verification OTP code is:</p>
        <div style="background-color: #1e293b; border: 1px solid #3b82f6; color: #60a5fa; font-size: 28px; font-weight: bold; letter-spacing: 6px; padding: 16px; text-align: center; border-radius: 8px; margin: 16px 0;">
          ${code}
        </div>
        <p style="font-size: 12px; color: #64748b;">This code expires in 5 minutes. If you did not request this, please ignore this email.</p>
      </div>
    `
  };

  try {
    const activeTransporter = await getTransporter();
    if (!activeTransporter) throw new Error('SMTP_HOST, SMTP_USER, and SMTP_PASS are not configured.');
    const info = await activeTransporter.sendMail(mailOptions);

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`\nÃ°Å¸â€œÂ¬ REAL EMAIL DELIVERED! VIEW ONLINE INBOX HERE:\n   Ã°Å¸â€˜â€° ${previewUrl}\n`);
    }

    res.json({
      success: true,
      message: `Verification OTP code sent to ${normalizedEmail}`,
      previewUrl: previewUrl || null
    });
  } catch (err) {
    // The local SMTP relay may be unreachable during development. Keep a
    // development-only fallback, and never expose verification codes in prod.
    if (process.env.NODE_ENV !== 'production' && process.env.OTP_ALLOW_DEV_FALLBACK !== 'false') {
      console.warn(`OTP email delivery failed for ${normalizedEmail}; using development-only fallback: ${err.message}`);
      return res.json({
        success: true,
        developmentFallback: true,
        developmentOtp: code,
        message: 'Email could not be delivered. Use the development verification code shown on this page.'
      });
    }
    console.error('Error sending OTP email:', err.message);
    try { await (await getDb()).run('DELETE FROM email_verifications WHERE email = ?', [normalizedEmail]); } catch (_) {}
    res.status(502).json({ error: 'OTP email could not be delivered. Check the SMTP host, port, and credentials.' });
  }
});

// POST /verify-otp - Validate entered OTP code
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP code are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  let db;
  let record;
  try {
    db = await getDb();
    record = await db.get('SELECT * FROM email_verifications WHERE email = ?', [normalizedEmail]);
  }
  catch (error) { return res.status(503).json({ error: 'Verification service is temporarily unavailable.' }); }

  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this email address or it has expired.' });
  }

  if (Date.now() > record.expires_at || !record.otp_hash) {
    try { await db.run('DELETE FROM email_verifications WHERE email = ?', [normalizedEmail]); }
    catch (_) { return res.status(503).json({ error: 'Verification service is temporarily unavailable.' }); }
    return res.status(400).json({ error: 'OTP code has expired. Please request a new code.' });
  }

  const expectedHash = Buffer.from(record.otp_hash, 'hex');
  const actualHash = Buffer.from(hashOtp(normalizedEmail, String(otp).trim()), 'hex');
  if (expectedHash.length !== actualHash.length || !crypto.timingSafeEqual(expectedHash, actualHash)) {
    const attempts = (record.attempts || 0) + 1;
    if (attempts >= 5) {
      try { await db.run('DELETE FROM email_verifications WHERE email = ?', [normalizedEmail]); }
      catch (_) { return res.status(503).json({ error: 'Verification service is temporarily unavailable.' }); }
      return res.status(429).json({ error: 'Too many incorrect codes. Request a new verification code.' });
    }
    try { await db.run('UPDATE email_verifications SET attempts = ? WHERE email = ?', [attempts, normalizedEmail]); }
    catch (_) { return res.status(503).json({ error: 'Verification service is temporarily unavailable.' }); }
    return res.status(400).json({ error: 'Invalid OTP code. Please check and try again.' });
  }

  // Replace the code with a single-use signup proof in persistent storage.
  const proofId = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 10 * 60 * 1000;
  try {
    await db.run(`UPDATE email_verifications SET otp_hash = NULL, expires_at = NULL,
      proof_id = ?, proof_expires_at = ?, updated_at = ? WHERE email = ?`,
    [proofId, expiresAt, new Date().toISOString(), normalizedEmail]);
  } catch (_) { return res.status(503).json({ error: 'Verification service is temporarily unavailable.' }); }
  const verificationToken = jwt.sign({ purpose: 'driver_signup_otp', email: normalizedEmail, proofId }, JWT_SECRET, { expiresIn: '10m' });
  res.json({ success: true, message: 'Email address verified successfully.', verificationToken });
});

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
    const user = await db.get('SELECT * FROM users WHERE LOWER(username) = ?', [normalizedUsername]);

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
        status: user.is_approved === 1 ? 'approved' : 'pending'
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// GET /driver-status - Check real-time driver approval status from SQLite
router.get('/driver-status', async (req, res) => {
  const email = (req.query.email || req.query.username || '').trim().toLowerCase();
  const id = req.query.id;

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

// POST driver signup (creates a pending driver request)
router.post('/driver-signup', async (req, res) => {
  const { name, username, password, busNumber, route, verificationToken } = req.body;
  const normalizedEmail = typeof username === 'string' ? username.trim().toLowerCase() : '';

  if (!name?.trim() || !normalizedEmail.includes('@') || !password || password.length < 6 || !busNumber?.trim() || !route?.trim() || !verificationToken) {
    return res.status(400).json({ error: 'Name, valid email, password (at least 6 characters), bus, route, and verified email are required.' });
  }

  let proof;
  try {
    proof = jwt.verify(verificationToken, JWT_SECRET);
  } catch (_) {
    return res.status(401).json({ error: 'Email verification expired. Request a new code.' });
  }
  let storedProof;
  try {
    storedProof = await (await getDb()).get(
      'SELECT proof_id, proof_expires_at FROM email_verifications WHERE email = ?', [normalizedEmail]
    );
  } catch (_) {
    return res.status(503).json({ error: 'Verification service is temporarily unavailable. Please try again.' });
  }
  if (proof.purpose !== 'driver_signup_otp' || proof.email !== normalizedEmail || !storedProof ||
      storedProof.proof_id !== proof.proofId || storedProof.proof_expires_at < Date.now()) {
    return res.status(401).json({ error: 'Email verification is invalid or has already been used.' });
  }

  try {
    const db = await getDb();
    const consumedProof = await db.run(`UPDATE email_verifications SET proof_id = NULL, proof_expires_at = NULL,
      updated_at = ? WHERE email = ? AND proof_id = ? AND proof_expires_at >= ?`,
    [new Date().toISOString(), normalizedEmail, proof.proofId, Date.now()]);
    if (!consumedProof.changes) {
      return res.status(401).json({ error: 'Email verification expired or has already been used. Request a new code.' });
    }
    const existingUser = await db.get("SELECT id FROM users WHERE LOWER(username) = LOWER(?)", [normalizedEmail]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert as pending driver (is_approved = 0)
    await db.run(
      'INSERT INTO users (name, username, password, role, is_approved, bus_number, assigned_route) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [name.trim(), normalizedEmail, hashedPassword, 'driver', 0, busNumber.trim(), route.trim()]
    );

    await db.run('DELETE FROM email_verifications WHERE email = ?', [normalizedEmail]);
    res.status(201).json({ success: true, message: 'Driver registration request submitted for admin approval.' });
  } catch (error) {
    console.error('Driver signup error:', error);
    res.status(500).json({ error: 'Server error during registration request' });
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

