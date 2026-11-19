const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const { initDb } = require('./db');

// Load environment variables
dotenv.config();
// In local development, share the frontend's public Supabase project config with the API.
// Production deployments should set SUPABASE_URL and SUPABASE_ANON_KEY directly.
const frontendEnvPath = path.resolve(__dirname, '../frontend/.env');
if (fs.existsSync(frontendEnvPath)) {
  const frontendEnv = dotenv.parse(fs.readFileSync(frontendEnvPath));
  process.env.SUPABASE_URL ||= frontendEnv.VITE_SUPABASE_URL;
  process.env.SUPABASE_ANON_KEY ||= frontendEnv.VITE_SUPABASE_ANON_KEY;
  // Legacy local setup stored this server-side provider key in the frontend env file.
  // Production deployments should set ORS_API_KEY only in the backend environment.
  process.env.ORS_API_KEY ||= frontendEnv.VITE_ORS_API_KEY;
}

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // For development flexibility
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});
app.set('io', io);

// Port configuration
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
const { router: authRouter } = require('./routes/auth');
const adminRouter = require('./routes/admin');
const passengerRouter = require('./routes/passenger');
const driverRouter = require('./routes/driver');
const routingRouter = require('./routes/routing');
const trackingRouter = require('./routes/tracking');

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/passenger', passengerRouter);
app.use('/api/driver', driverRouter);
app.use('/api/routes', routingRouter);
app.use('/api/tracking', trackingRouter);

// Basic health check route
app.get('/health', (req, res) => {
  res.json({ status: 'OK', message: 'TrackMyBus API is running smoothly' });
});

// Initialize real-time tracking socket events
const initTrackingSocket = require('./sockets/tracking');
initTrackingSocket(io);

// Initialize DB and start server
async function startServer() {
  try {
    await initDb();
    server.listen(PORT, () => {
      console.log(`=========================================`);
      console.log(`  TrackMyBus backend listening on PORT ${PORT}`);
      console.log(`  Real-time Socket.io system active      `);
      console.log(`=========================================`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
