import { io } from 'socket.io-client';
import { supabase } from './supabaseClient';

const API_HOST = typeof window !== 'undefined' ? `${window.location.protocol}//${window.location.hostname}:5000` : 'http://localhost:5000';
const API_BASE = `${API_HOST}/api`;

// Store/retrieve auth token and user
export const getAuthToken = () => {
  const token = localStorage.getItem('tmb_token');
  // Old mock sessions were written as if they were Supabase access tokens.
  // Expire them so users are sent through real authentication again.
  if (token && (token.startsWith('sb_token_') || token.startsWith('sb_auth_token_'))) {
    localStorage.removeItem('tmb_token');
    localStorage.removeItem('tmb_user');
    return null;
  }
  return token;
};
export const setAuthToken = (token) => {
  if (token) {
    localStorage.setItem('tmb_token', token);
  } else {
    localStorage.removeItem('tmb_token');
  }
};

export const getAuthUser = () => {
  const user = localStorage.getItem('tmb_user');
  return user ? JSON.parse(user) : null;
};
export const setAuthUser = (user) => {
  if (user) {
    localStorage.setItem('tmb_user', JSON.stringify(user));
  } else {
    localStorage.removeItem('tmb_user');
  }
};

export const logout = () => {
  setAuthToken(null);
  setAuthUser(null);
};

// Generic API fetch wrapper
export async function apiRequest(endpoint, options = {}) {
  const token = getAuthToken();
  
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || 'Request failed');
  }

  return data;
}

// Socket Connection Manager
let socket = null;

export const initSocket = () => {
  if (socket) return socket;
  
  socket = io(API_HOST, {
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10
  });

  socket.on('connect', () => {
    console.log('Socket.io connected to server:', socket.id);
  });

  socket.on('disconnect', (reason) => {
    console.log('Socket.io disconnected:', reason);
  });

  return socket;
};

export const getSocket = () => {
  if (!socket) {
    return initSocket();
  }
  return socket;
};

export const joinRoom = (roomName) => {
  const s = getSocket();
  if (s) {
    s.emit('join_room', { room: roomName });
    console.log(`Requested to join room: ${roomName}`);
  }
};

export const leaveRoom = (roomName) => {
  const s = getSocket();
  if (s && s.connected) {
    s.emit('leave_room', { room: roomName });
    console.log(`Requested to leave room: ${roomName}`);
  }
};

export const updateGPSLocation = (tripId, lat, lng) => {
  const s = getSocket();
  if (s) {
    s.emit('update_location', {
      trip_id: tripId,
      latitude: lat,
      longitude: lng
    });
  }
};

export const saveDriverLocationToSupabase = async (tripId, lat, lng) => {
  try {
    const { data, error } = await supabase
      .from('driver_locations')
      .upsert({
        trip_id: tripId.toString(),
        latitude: lat,
        longitude: lng,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error saving driver location to Supabase:', error);
      return { success: false, error };
    }
    return { success: true, data };
  } catch (err) {
    console.error('Exception saving driver location to Supabase:', err);
    return { success: false, error: err };
  }
};

export const subscribeToDriverLocation = (tripId, onUpdate) => {
  const channelName = `driver_loc_${tripId}`;
  
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'driver_locations',
        filter: `trip_id=eq.${tripId}`
      },
      (payload) => {
        console.log('Live location update from Supabase Realtime:', payload);
        if (payload.new) {
          onUpdate({
            trip_id: payload.new.trip_id,
            latitude: payload.new.latitude,
            longitude: payload.new.longitude,
            updated_at: payload.new.updated_at
          });
        }
      }
    )
    .subscribe((status) => {
      console.log(`Supabase Realtime subscription status for trip ${tripId}:`, status);
    });

  return () => {
    console.log(`Unsubscribing from Supabase Realtime channel: ${channelName}`);
    supabase.removeChannel(channel);
  };
};
