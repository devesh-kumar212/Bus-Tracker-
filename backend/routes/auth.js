const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db');

const nodemailer = require('nodemailer');

const JWT_SECRET = process.env.JWT_SECRET || 'trackmybus_secret_key_12345';

// OTP cache store in memory: email -> { code, expiresAt }
const otpStore = new Map();

// Function to get/create Nodemailer transporter
async function getTransporter() {
  if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });
  }

  // Auto-generate Ethereal Email account for real online web inbox delivery
  try {
    if (!global._etherealTransporter) {
      console.log('Creating Ethereal Email test account for real web inbox delivery...');
      const testAccount = await nodemailer.createTestAccount();
      global._etherealTransporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
      console.log(`Ethereal Test Mailbox Created: ${testAccount.user}`);
    }
    return global._etherealTransporter;
  } catch (err) {
    console.warn('Failed to create Ethereal account, falling back to direct log:', err.message);
    return {
      sendMail: async (mailOptions) => {
        console.log('\n========================================================');
        console.log(` 📧 EMAIL OTP DELIVERY TO: ${mailOptions.to}`);
        console.log(` 🔑 SUBJECT: ${mailOptions.subject}`);
        console.log(` 💬 CONTENT:\n${mailOptions.text}`);
        console.log('========================================================\n');
        return { messageId: 'dev_mock_id_' + Date.now() };
      }
    };
  }
}

// POST /send-otp - Generate & send 6-digit OTP code to driver email
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'A valid email address is required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();

  // Generate 6-digit OTP code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes expiry

  otpStore.set(normalizedEmail, { code, expiresAt });

  console.log('\n========================================================');
  console.log(` 📧 REAL GMAIL OTP SENT TO DRIVER: ${normalizedEmail}`);
  console.log(` 🔑 6-DIGIT VERIFICATION CODE: [ ${code} ]`);
  console.log('========================================================\n');

  const mailOptions = {
    from: process.env.SMTP_FROM || '"TrackMyBus Verification" <no-reply@trackmybus.com>',
    to: normalizedEmail,
    subject: '🚌 Your Driver Registration Verification Code',
    text: `Hello,\n\nYour 6-digit email verification code for TrackMyBus Driver Registration is:\n\n   ${code}\n\nThis code will expire in 5 minutes. Please enter this code on the registration page to complete your application.\n\nThank you,\nTrackMyBus Team`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #0f172a; color: #f8fafc; padding: 24px; border-radius: 12px;">
        <h2 style="color: #38bdf8; margin-bottom: 12px;">🚌 TrackMyBus Driver Registration</h2>
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
    const info = await activeTransporter.sendMail(mailOptions);

    const previewUrl = nodemailer.getTestMessageUrl(info);
    if (previewUrl) {
      console.log(`\n📬 REAL EMAIL DELIVERED! VIEW ONLINE INBOX HERE:\n   👉 ${previewUrl}\n`);
    }

    res.json({
      success: true,
      message: `Verification OTP code sent to ${normalizedEmail}`,
      previewUrl: previewUrl || null
    });
  } catch (err) {
    console.error('Error sending OTP email:', err);
    res.status(500).json({ error: 'Failed to send OTP email: ' + err.message });
  }
});

// POST /verify-otp - Validate entered OTP code
router.post('/verify-otp', (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP code are required.' });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const record = otpStore.get(normalizedEmail);

  if (!record) {
    return res.status(400).json({ error: 'No OTP requested for this email address or it has expired.' });
  }

  if (Date.now() > record.expiresAt) {
    otpStore.delete(normalizedEmail);
    return res.status(400).json({ error: 'OTP code has expired. Please request a new code.' });
  }

  if (record.code !== otp.trim()) {
    return res.status(400).json({ error: 'Invalid OTP code. Please check and try again.' });
  }

  // OTP verified! Remove from store
  otpStore.delete(normalizedEmail);
  res.json({ success: true, message: 'Email address verified successfully.' });
});

// Middleware to verify JWT token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

// POST login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  try {
    const db = await getDb();
    const user = await db.get('SELECT * FROM users WHERE username = ?', [username]);

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Check if the user is a pending driver
    if (user.role === 'driver' && user.is_approved === 0) {
      return res.status(403).json({ error: 'Your driver registration request is pending admin approval.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials' });
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
        role: user.role
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Server error during login' });
  }
});

// POST driver signup (creates a pending driver request)
router.post('/driver-signup', async (req, res) => {
  const { name, username, password } = req.body;

  if (!name || !username || !password) {
    return res.status(400).json({ error: 'Name, username, and password are required' });
  }

  try {
    const db = await getDb();
    
    // Check if user already exists
    const existingUser = await db.get('SELECT * FROM users WHERE username = ?', [username]);
    if (existingUser) {
      return res.status(400).json({ error: 'Username is already registered.' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Insert as pending driver (is_approved = 0)
    await db.run(
      'INSERT INTO users (name, username, password, role, is_approved) VALUES (?, ?, ?, ?, ?)',
      [name, username, hashedPassword, 'driver', 0]
    );

    res.status(201).json({ success: true, message: 'Driver registration request submitted for admin approval.' });
  } catch (error) {
    console.error('Driver signup error:', error);
    res.status(500).json({ error: 'Server error during registration request' });
  }
});

// POST /send-approval-email - Send official approval email to driver
router.post('/send-approval-email', async (req, res) => {
  const { email, name, busNumber, route } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid driver email address is required.' });
  }

  const driverName = name || 'Driver';
  const driverBus = busNumber || 'N/A';
  const driverRoute = route || 'Assigned Route';
  const normalizedEmail = email.trim().toLowerCase();

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Bus Tracker Admin Team" <no-reply@trackmybus.com>',
    to: normalizedEmail,
    subject: 'Bus Tracker - Driver Approval Confirmed',
    text: `Hello ${driverName},\n\nCongratulations!\n\nYour driver registration for Bus Tracker has been approved.\n\nYou are now authorized to operate:\n\nBus Number: ${driverBus}\nRoute: ${driverRoute}\n\nYou can now log in to your Bus Tracker account and access your Driver Dashboard.\n\nThank you,\nBus Tracker Admin Team`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #080c14; color: #f4f4f5; padding: 28px; border-radius: 16px; max-w: 600px; border: 1px solid #10b981;">
        <h2 style="color: #34d399; margin-bottom: 16px;">🚌 Bus Tracker - Driver Approval Confirmed</h2>
        <p style="font-size: 15px; color: #e4e4e7;">Hello <strong>${driverName}</strong>,</p>
        <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">Congratulations! Your driver registration for <strong>Bus Tracker</strong> has been approved.</p>
        <div style="background-color: #092e20; border-left: 4px solid #10b981; padding: 16px; margin: 20px 0; border-radius: 8px;">
          <div style="font-size: 13px; font-weight: bold; color: #6ee7b7; text-transform: uppercase; margin-bottom: 8px;">Authorized Operations</div>
          <div style="font-size: 14px; color: #ffffff; margin-bottom: 4px;"><strong>Bus Number:</strong> ${driverBus}</div>
          <div style="font-size: 14px; color: #ffffff;"><strong>Route:</strong> ${driverRoute}</div>
        </div>
        <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">You can now log in to your Bus Tracker account and access your Driver Dashboard to initiate shifts and broadcast live GPS location.</p>
        <hr style="border: 0; border-top: 1px solid #27272a; margin: 24px 0;" />
        <p style="font-size: 12px; color: #71717a;">Thank you,<br/><strong>Bus Tracker Admin Team</strong></p>
      </div>
    `
  };

  try {
    const activeTransporter = await getTransporter();
    const info = await activeTransporter.sendMail(mailOptions);
    console.log(`\n========================================================`);
    console.log(` 📧 DRIVER APPROVAL EMAIL SENT TO: ${normalizedEmail}`);
    console.log(` 🚌 BUS: ${driverBus} | ROUTE: ${driverRoute}`);
    console.log(`========================================================\n`);

    const previewUrl = nodemailer.getTestMessageUrl(info);
    res.json({ success: true, message: `Approval email sent to ${normalizedEmail}`, previewUrl: previewUrl || null });
  } catch (err) {
    console.error('Error sending approval email:', err);
    res.status(500).json({ error: 'Failed to send approval email: ' + err.message });
  }
});

// POST /send-rejection-email - Send rejection notification email to driver
router.post('/send-rejection-email', async (req, res) => {
  const { email, name } = req.body;

  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Valid driver email address is required.' });
  }

  const driverName = name || 'Driver';
  const normalizedEmail = email.trim().toLowerCase();

  const mailOptions = {
    from: process.env.SMTP_FROM || '"Bus Tracker Admin Team" <no-reply@trackmybus.com>',
    to: normalizedEmail,
    subject: 'Bus Tracker - Driver Registration Status Update',
    text: `Hello ${driverName},\n\nYour driver registration for Bus Tracker has been rejected. Please contact the administrator.\n\nThank you,\nBus Tracker Admin Team`,
    html: `
      <div style="font-family: Arial, sans-serif; background-color: #080c14; color: #f4f4f5; padding: 28px; border-radius: 16px; max-w: 600px; border: 1px solid #f43f5e;">
        <h2 style="color: #fb7185; margin-bottom: 16px;">Bus Tracker - Registration Status</h2>
        <p style="font-size: 15px; color: #e4e4e7;">Hello <strong>${driverName}</strong>,</p>
        <p style="font-size: 14px; color: #a1a1aa; line-height: 1.6;">Your driver registration for <strong>Bus Tracker</strong> has been rejected. Please contact the administrator for assistance.</p>
        <hr style="border: 0; border-top: 1px solid #27272a; margin: 24px 0;" />
        <p style="font-size: 12px; color: #71717a;">Thank you,<br/><strong>Bus Tracker Admin Team</strong></p>
      </div>
    `
  };

  try {
    const activeTransporter = await getTransporter();
    const info = await activeTransporter.sendMail(mailOptions);
    console.log(`\n========================================================`);
    console.log(` 📧 DRIVER REJECTION EMAIL SENT TO: ${normalizedEmail}`);
    console.log(`========================================================\n`);

    res.json({ success: true, message: `Rejection email sent to ${normalizedEmail}` });
  } catch (err) {
    console.error('Error sending rejection email:', err);
    res.status(500).json({ error: 'Failed to send rejection email: ' + err.message });
  }
});

// POST /clear-user-data - Delete all non-admin drivers, users and sign up data from SQLite
router.post('/clear-user-data', async (req, res) => {
  try {
    const db = await getDb();
    
    // Clear complaints, trip logs, trips, and non-admin users
    await db.run('DELETE FROM complaints');
    await db.run('DELETE FROM trip_logs');
    await db.run('DELETE FROM trips');
    await db.run("DELETE FROM users WHERE role != 'admin'");

    console.log('\n========================================================');
    console.log(' 🧹 CLEARED ALL USER & SIGNUP DATA FROM SQLITE DATABASE');
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

