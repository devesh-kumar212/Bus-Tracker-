import { supabase } from './supabaseClient';

/**
 * Saves or updates driver GPS coordinates in Supabase.
 * @param {string|number} tripId 
 * @param {number} latitude 
 * @param {number} longitude 
 */
export async function saveDriverLocation(tripId, latitude, longitude) {
  const { data, error } = await supabase
    .from('driver_locations')
    .upsert({
      trip_id: tripId.toString(),
      latitude,
      longitude,
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('Supabase saveDriverLocation error:', error);
    throw error;
  }
  return data;
}

/**
 * Retrieves the current location coordinates for a specific trip.
 * @param {string|number} tripId 
 */
export async function getDriverLocation(tripId) {
  const { data, error } = await supabase
    .from('driver_locations')
    .select('*')
    .eq('trip_id', tripId.toString())
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // Row not found, return null
      return null;
    }
    console.error('Supabase getDriverLocation error:', error);
    throw error;
  }
  return data;
}

/**
 * Subscribes to real-time driver location updates for a specific trip.
 * @param {string|number} tripId 
 * @param {Function} onUpdate - callback triggered on insert or update
 * @returns {Function} unsubscribe function
 */
export function subscribeToDriverLocationUpdates(tripId, onUpdate) {
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
        console.log('Realtime location change payload received:', payload);
        if (payload.new) {
          onUpdate(payload.new);
        }
      }
    )
    .subscribe((status) => {
      console.log(`Realtime sub status for trip ${tripId}:`, status);
    });

  return () => {
    console.log(`Unsubscribing from Realtime channel: ${channelName}`);
    supabase.removeChannel(channel);
  };
}
