const { getDb } = require('../db');

function initTrackingSocket(io) {
  io.on('connection', (socket) => {
    console.log(`Socket client connected: ${socket.id}`);

    // Join a room (trip_123 or admin_monitor)
    socket.on('join_room', ({ room }) => {
      socket.join(room);
      console.log(`Socket ${socket.id} joined room: ${room}`);
    });

    // Leave a room
    socket.on('leave_room', ({ room }) => {
      socket.leave(room);
      console.log(`Socket ${socket.id} left room: ${room}`);
    });

    // Update GPS coordinates from driver
    socket.on('update_location', async (data) => {
      const { trip_id, latitude, longitude } = data;
      
      if (!trip_id || latitude === undefined || longitude === undefined) {
        return;
      }

      console.log(`Location update for Trip ${trip_id}: [${latitude}, ${longitude}]`);

      try {
        const db = await getDb();
        
        // 1. Update active trip current coordinates and timestamp in SQLite database
        await db.run(`
          UPDATE trips
          SET current_latitude = ?, current_longitude = ?, last_update = datetime('now', 'localtime')
          WHERE id = ? AND status = 'active'
        `, [latitude, longitude, trip_id]);

        // 2. Append to trip logs (optional breadcrumb trailing, throttle if necessary in production)
        await db.run(`
          INSERT INTO trip_logs (trip_id, latitude, longitude)
          VALUES (?, ?, ?)
        `, [trip_id, latitude, longitude]);

        // Fetch bus details to include in the broadcast
        const tripDetails = await db.get(`
          SELECT t.id as trip_id, t.route_id, b.bus_number, r.route_name
          FROM trips t
          JOIN buses b ON t.bus_id = b.id
          JOIN routes r ON t.route_id = r.id
          WHERE t.id = ?
        `, [trip_id]);

        if (tripDetails) {
          const broadcastPayload = {
            trip_id,
            route_id: tripDetails.route_id,
            bus_number: tripDetails.bus_number,
            route_name: tripDetails.route_name,
            latitude,
            longitude,
            last_update: new Date().toISOString()
          };

          // 3. Broadcast to passengers watching this trip
          io.to(`trip_${trip_id}`).emit('location_changed', broadcastPayload);
          
          // 4. Broadcast to passengers watching the route
          io.to(`route_${tripDetails.route_id}`).emit('location_changed', broadcastPayload);

          // 5. Broadcast to admins monitoring all fleet
          io.to('admin_monitor').emit('location_changed', broadcastPayload);
        }
      } catch (err) {
        console.error(`Error updating socket location for Trip ${trip_id}:`, err);
      }
    });

    socket.on('disconnect', () => {
      console.log(`Socket client disconnected: ${socket.id}`);
    });
  });
}

module.exports = initTrackingSocket;
