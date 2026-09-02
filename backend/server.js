const express = require('express');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const { initDb } = require('./db');

// Load environment variables
dotenv.config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*', // For development flexibility
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

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

app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/passenger', passengerRouter);
app.use('/api/driver', driverRouter);
app.use('/api/routes', routingRouter);

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
