function initTrackingSocket(io) {
  io.on('connection', socket => {
    socket.on('join_room', ({ room } = {}) => {
      if (typeof room === 'string' && /^(trip|route)_\d+$/.test(room)) socket.join(room);
    });
    socket.on('leave_room', ({ room } = {}) => {
      if (typeof room === 'string') socket.leave(room);
    });
  });
}

module.exports = initTrackingSocket;