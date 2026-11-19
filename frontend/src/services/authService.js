import { supabase } from './supabaseClient';
import { getAuthToken, setAuthToken, setAuthUser, logout as clearLocalAuth, getSocket } from './api';

const API_HOST = typeof window !== 'undefined' 
  ? `${window.location.protocol}//${window.location.hostname}:5000` 
  : 'http://localhost:5000';

async function trackingRequest(path, options = {}) {
  const token = getAuthToken();
  if (!token) throw new Error('Driver session expired. Please sign in again.');
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(`${API_HOST}/api/tracking/${path}`, {
        method: options.method || 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
        signal: AbortSignal.timeout(10000)
      });
      const payload = await response.json().catch(() => ({}));
      if (response.ok) return payload;
      lastError = new Error(payload.error || 'Tracking request failed.');
      if (response.status < 500 || attempt === 2) throw lastError;
    } catch (error) {
      lastError = error;
      if (error.name !== 'AbortError' && error.name !== 'TimeoutError' && !/network|fetch/i.test(error.message) && attempt < 2) throw error;
      if (attempt === 2) throw lastError;
    }
    await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
  }
  throw lastError || new Error('Tracking request failed.');
}

/**
 * Send 6-digit OTP code to email via backend Gmail service
 */
export async function sendEmailOtp(email) {
  const response = await fetch(`${API_HOST}/api/auth/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase() })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Failed to send verification OTP code to your email.');
  }
  return data;
}

/**
 * Verify 6-digit OTP code via backend Gmail service
 */
export async function verifyEmailOtp(email, otp) {
  const response = await fetch(`${API_HOST}/api/auth/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), otp: otp.trim() })
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Invalid or expired OTP code. Please check your email.');
  }
  return data;
}

/**
 * Register Passenger account using Supabase Auth & create profile
 */
export async function signUpPassenger({ email, password, name }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Supabase Auth signup
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { name: name.trim(), role: 'passenger' }
    }
  });

  if (authError) {
    throw new Error(authError.message || 'Failed to create account in Supabase Auth.');
  }

  const userId = authData?.user?.id;
  if (!userId) {
    throw new Error('Supabase Auth user creation failed.');
  }

  // Profiles are created by the auth.users database trigger. Confirm it ran when
  // a session is available instead of reporting a successful partial signup.
  if (authData.session?.access_token) {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (profileError || !profile) throw new Error('Supabase profile was not created. Apply the TrackMyBus signup trigger migration.');
  }

  // Set auth session in local state
  const session = authData.session;
  const user = {
    id: userId,
    uid: userId,
    email: normalizedEmail,
    username: normalizedEmail,
    name: name.trim(),
    role: 'passenger',
    status: 'active'
  };

  setAuthToken(session?.access_token || null);
  setAuthUser(user);

  return { user, session };
}

/**
 * Register Driver account using Supabase Auth, create profile, & insert into drivers table (status: pending)
 */
export async function signUpDriver({ email, password, name, route, busNumber, verificationToken }) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!verificationToken) throw new Error('Verify your email before submitting the driver registration.');

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        name: name.trim(), role: 'driver',
        route: route.trim(), bus_number: busNumber.trim().toUpperCase()
      }
    }
  });
  if (authError) throw new Error(authError.message || 'Could not create the driver account in Supabase Auth.');
  const userId = authData?.user?.id;
  if (!userId) throw new Error('Supabase did not return the new driver account.');
  const session = authData.session;

  // The Auth signup trigger creates these rows for both immediate and
  // email-confirmed sessions. Verify the driver row when a session is returned.
  if (session?.access_token) {
    const { data: savedDriver, error: driverError } = await supabase.from('drivers').select('user_id')
      .eq('user_id', userId).eq('approval_status', 'pending').maybeSingle();
    if (driverError || !savedDriver) throw new Error('Supabase did not create the pending driver assignment. Apply backend/supabase_schema.sql and retry.');
  }

  const backendResponse = await fetch(`${API_HOST}/api/auth/driver-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name.trim(), username: normalizedEmail, password,
      route: route.trim(), busNumber: busNumber.trim().toUpperCase(), verificationToken
    }),
    signal: AbortSignal.timeout(10000)
  });
  const backendResult = await backendResponse.json().catch(() => ({}));
  if (!backendResponse.ok) throw new Error(backendResult.error || 'Could not save the driver application to the tracking service.');

  // 6. Set auth session in local state
  const user = {
    id: userId,
    uid: userId,
    email: normalizedEmail,
    username: normalizedEmail,
    name: name.trim(),
    role: 'driver',
    status: 'pending',
    route: route.trim(),
    busNumber: busNumber.trim().toUpperCase()
  };

  setAuthToken(session?.access_token || null);
  setAuthUser(user);

  return { user, session };
}

/**
 * Authenticate User using Supabase Auth & check role/approval status
 */
export async function loginUser({ email, password, expectedRole }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Authenticate with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password
  });

  if (authError || !authData?.user) {
    // Fallback: Try backend Express API login (for seeded SQLite Admin or Driver accounts)
    try {
      const response = await fetch(`${API_HOST}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: normalizedEmail, password })
      });
      const apiData = await response.json();
      if (response.ok && apiData.user) {
        if (expectedRole && apiData.user.role !== expectedRole) {
          throw new Error(`Unauthorized. This account is registered as a "${apiData.user.role}", and cannot access the "${expectedRole}" portal.`);
        }
        const authUserObj = {
          id: apiData.user.id,
          uid: apiData.user.id,
          email: normalizedEmail,
          username: normalizedEmail,
          name: apiData.user.name || 'User',
          role: apiData.user.role,
          status: 'active'
        };
        setAuthToken(apiData.token);
        setAuthUser(authUserObj);
        return { user: authUserObj, session: { access_token: apiData.token }, role: apiData.user.role, status: 'active' };
      }
    } catch (apiErr) {
      if (apiErr.message.includes('Unauthorized')) throw apiErr;
    }

    throw new Error(authError?.message || 'Invalid email or password.');
  }

  const user = authData.user;
  if (!user) {
    throw new Error('User authentication failed.');
  }

  // 2. Fetch user profile from Supabase 'profiles' table
  let profile = null;
  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single();

  if (profileData) {
    profile = profileData;
  } else {
    profile = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || 'User',
      role: user.user_metadata?.role || expectedRole || 'passenger',
      status: 'active'
    };
  }

  // 3. Verify role match if expectedRole specified
  if (expectedRole && profile.role !== expectedRole) {
    await supabase.auth.signOut();
    throw new Error(`Unauthorized. This account is registered as a "${profile.role}", and cannot access the "${expectedRole}" portal.`);
  }

  // 4. If Driver, check approval status from Supabase 'drivers' table, backend API, & local store
  let driverInfo = null;
  if (profile.role === 'driver') {
    // Check backend API status first (ground truth)
    try {
      const res = await fetch(`${API_HOST}/api/auth/driver-status?email=${encodeURIComponent(normalizedEmail)}`);
      if (res.ok) {
        const apiStatus = await res.json();
        if (apiStatus && apiStatus.status === 'approved') {
          profile.status = 'approved';
        } else if (apiStatus && apiStatus.status === 'pending') {
          profile.status = 'pending';
        }
      }
    } catch (e) {}

    const { data: dData } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (dData) {
      driverInfo = dData;
      if (!profile.status || profile.status === 'pending') {
        profile.status = dData.approval_status;
      }
      profile.route = dData.route;
      profile.busNumber = dData.bus_number;
    }
  }

  const authUserObj = {
    id: user.id,
    uid: user.id,
    email: normalizedEmail,
    username: normalizedEmail,
    name: profile.name,
    role: profile.role,
    status: profile.status || 'active',
    route: profile.route || driverInfo?.route || '',
    busNumber: profile.busNumber || driverInfo?.bus_number || ''
  };

  setAuthToken(authData.session?.access_token || null);
  setAuthUser(authUserObj);

  return {
    user: authUserObj,
    session: authData.session,
    role: profile.role,
    status: profile.status
  };
}

/**
 * Fetch all pending drivers for Admin Approval Panel (merging Supabase, Express API, & Local Store)
 */
export async function getPendingDrivers() {
  const driversList = [];

  // 1. Fetch from Supabase 'drivers' table
  try {
    const { data: supabaseDrivers } = await supabase
      .from('drivers')
      .select('*')
      .eq('approval_status', 'pending')
      .order('created_at', { ascending: false });

    if (supabaseDrivers && Array.isArray(supabaseDrivers)) {
      supabaseDrivers.forEach(d => {
        driversList.push({
          id: d.id,
          user_id: d.user_id,
          name: d.name,
          email: d.email,
          route: d.route || '',
          busNumber: d.bus_number || '',
          bus_number: d.bus_number || '',
          approval_status: d.approval_status || 'pending',
          status: 'pending',
          created_at: d.created_at || new Date().toISOString()
        });
      });
    }
  } catch (err) {
    console.warn('Supabase pending drivers query notice:', err.message);
  }

  // 2. Fetch from Express Backend API
  try {
    const token = localStorage.getItem('tmb_token');
    const res = await fetch(`${API_HOST}/api/admin/pending-drivers`, {
      headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
    });
    if (res.ok) {
      const apiPending = await res.json();
      if (Array.isArray(apiPending)) {
        apiPending.forEach(ap => {
          const email = ap.username || ap.email;
          const exists = driversList.some(d => d.email?.toLowerCase() === email?.toLowerCase());
          if (!exists) {
            driversList.push({
              id: ap.id,
              user_id: ap.id,
              name: ap.name || 'Driver',
              email: email,
              route: ap.route || ap.assigned_route || '',
              busNumber: ap.busNumber || ap.bus_number || '',
              bus_number: ap.bus_number || ap.busNumber || '',
              approval_status: 'pending',
              status: 'pending',
              created_at: ap.created_at || new Date().toISOString()
            });
          }
        });
      }
    }
  } catch (e) {}

  return driversList;
}

/**
 * Approve a driver (update Supabase, Express API, & Local Store, then send backend Gmail email)
 */
export async function approveDriver(driverTarget) {
  const driver = typeof driverTarget === 'object' ? driverTarget : { id: driverTarget };
  const email = String(driver.email || '').trim().toLowerCase();
  const id = driver.id;
  if (!email && !id) throw new Error('Driver record identifier is missing.');
  const busNumber = String(driver.busNumber || driver.bus_number || '').trim().toUpperCase();
  const route = String(driver.route || driver.assigned_route || '').trim();
  if (!busNumber || !route || /^(n\/a|assigned bus|assigned route)$/i.test(busNumber) || /^(n\/a|assigned bus|assigned route)$/i.test(route)) throw new Error('Assign a real bus number and route before approving this driver.');
  const token = getAuthToken();
  if (!token) throw new Error('Admin session expired. Please sign in again.');
  const response = await fetch(`${API_HOST}/api/admin/pending-drivers/${encodeURIComponent(email || String(id))}/approve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ email, id, busNumber, route })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Driver approval failed.');

  let supabaseSync = 'not_applicable';
  try {
    const lookup = email ? await supabase.from('drivers').select('user_id').eq('email', email).maybeSingle() : { data: null };
    if (lookup.data?.user_id) {
      const du = await supabase.from('drivers').update({ approval_status: 'approved', bus_number: busNumber, route }).eq('user_id', lookup.data.user_id);
      if (du.error) throw du.error;
      const pu = await supabase.from('profiles').update({ status: 'approved' }).eq('id', lookup.data.user_id);
      if (pu.error) throw pu.error;
      supabaseSync = 'synced';
    }
  } catch (error) { supabaseSync = 'failed'; console.warn('Supabase approval sync failed:', error.message); }

  let emailSent = false;
  try {
    const mail = await fetch(`${API_HOST}/api/auth/send-approval-email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ email, name: driver.name || 'Driver', busNumber, route })
    });
    emailSent = mail.ok;
  } catch (error) { console.warn('Approval email delivery failed:', error.message); }
  return { success: true, emailSent, supabaseSync, status: 'approved' };
}

export async function rejectDriver(driverTarget) {
  const driver = typeof driverTarget === 'object' ? driverTarget : { id: driverTarget };
  const email = String(driver.email || '').trim().toLowerCase();
  const id = driver.id;
  if (!email && !id) throw new Error('Driver record identifier is missing.');
  const token = getAuthToken();
  if (!token) throw new Error('Admin session expired. Please sign in again.');
  const response = await fetch(`${API_HOST}/api/admin/pending-drivers/${encodeURIComponent(email || String(id))}/reject`, {
    method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ email, id })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.error || 'Driver rejection failed.');
  try {
    if (email) {
      const lookup = await supabase.from('drivers').select('user_id').eq('email', email).maybeSingle();
      if (lookup.data?.user_id) {
        const du = await supabase.from('drivers').update({ approval_status: 'rejected' }).eq('user_id', lookup.data.user_id);
        if (du.error) throw du.error;
        const pu = await supabase.from('profiles').update({ status: 'rejected' }).eq('id', lookup.data.user_id);
        if (pu.error) throw pu.error;
      }
    }
  } catch (error) { console.warn('Supabase rejection sync failed:', error.message); }
  let emailSent = false;
  if (email) {
    try {
      const mail = await fetch(`${API_HOST}/api/auth/send-rejection-email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ email, name: driver.name || 'Driver' })
      });
      emailSent = mail.ok;
    } catch (error) { console.warn('Rejection email delivery failed:', error.message); }
  }
  return { success: true, emailSent, status: 'rejected' };
}
export async function getDriverDetails(user) {
  if (!user) return null;
  const uid = user.id || user.uid;
  const email = (user.email || user.username || '').trim().toLowerCase();

  let driverRecord = null;
  let backendApprovalStatus = null;
  let backendDriverDetails = null;

  // 1. Fetch live status from Express Backend SQLite API (Ground Truth)
  if (email || uid) {
    try {
      const queryParams = new URLSearchParams();
      if (email) queryParams.set('email', email);
      if (uid) queryParams.set('id', uid);
      const res = await fetch(`${API_HOST}/api/auth/driver-status?${queryParams.toString()}`);
      if (res.ok) {
        const apiStatus = await res.json();
        if (apiStatus && apiStatus.status) {
          backendApprovalStatus = apiStatus.status; // 'approved' or 'pending'
          backendDriverDetails = apiStatus;
        }
      }
    } catch (e) {
      console.warn('Backend driver-status check notice:', e.message);
    }
  }

  // Read the real Supabase driver row by Auth user ID, then email for legacy records.
  try {
    let result = uid ? await supabase.from('drivers').select('*').eq('user_id', uid).maybeSingle() : { data: null };
    if (!result.data && email) result = await supabase.from('drivers').select('*').eq('email', email).maybeSingle();
    if (result.data) driverRecord = result.data;
  } catch (e) {
    console.warn('Supabase driver profile lookup failed:', e.message);
  }

  const name = driverRecord?.name || user.name || 'Driver';
  const busNumber = backendDriverDetails?.bus_number || driverRecord?.bus_number || driverRecord?.busNumber || user.busNumber || '';
  const route = backendDriverDetails?.route || driverRecord?.route || user.route || '';
  const isTracking = Boolean(driverRecord?.is_tracking || driverRecord?.tracking_status === 'active');
  const trackingStatus = isTracking ? 'active' : 'inactive';

  // Determine approval status (Backend SQLite is ground truth from Admin Portal)
  let approvalStatus = 'pending';
  if (backendApprovalStatus === 'approved') {
    approvalStatus = 'approved';
  } else if (backendApprovalStatus === 'pending') {
    approvalStatus = 'pending';
  } else if (driverRecord?.approval_status) {
    approvalStatus = driverRecord.approval_status;
  } else if (driverRecord?.status) {
    approvalStatus = driverRecord.status;
  }

  return {
    id: driverRecord?.id || uid,
    user_id: uid,
    name,
    email,
    busNumber,
    bus_number: busNumber,
    route,
    isTracking,
    trackingStatus,
    approvalStatus
  };
}

/**
 * Update Driver Tracking State (START TRACKING / STOP TRACKING)
 */
export async function setDriverTrackingState({ user, isTracking }) {
  if (!user) throw new Error('Driver user session not found.');
  const result = await trackingRequest(isTracking ? 'start' : 'stop', { method: 'POST', body: {} });
  const updatedUser = { ...user, isTracking, trackingStatus: isTracking ? 'active' : 'inactive' };
  setAuthUser(updatedUser);
  return { ...result, isTracking, trackingStatus: updatedUser.trackingStatus };
}

export async function saveBusLocationToSupabase({ latitude, longitude, accuracy, speed, heading }) {
  const result = await trackingRequest('location', {
    method: 'POST', body: { latitude, longitude, accuracy, speed, heading }
  });
  return result;
}

export async function getDriverTrackingStatus() {
  return trackingRequest('me');
}

export async function sendDriverHeartbeat() {
  return trackingRequest('heartbeat', { method: 'POST', body: {} });
}
export async function getAllActiveBusesWithLocations() {
  const response = await fetch(`${API_HOST}/api/tracking/active-buses`, {
    cache: 'no-store', signal: AbortSignal.timeout(8000)
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || 'Unable to load live bus locations.');
  if (!Array.isArray(payload)) return [];

  return payload.map(bus => ({
    ...bus,
    id: bus.driver_id,
    driver_id: bus.driver_id,
    user_id: bus.driver_id,
    name: bus.driver_name || 'Driver',
    busNumber: bus.bus_number,
    route: bus.route,
    updated_at: bus.last_update,
    is_tracking: bus.status_code !== 'OFFLINE'
  }));
}
export async function getPublicRouteCatalog() {
  try {
    const response = await fetch(`${API_HOST}/api/passenger/routes`);
    if (!response.ok) return [];
    const routes = await response.json();
    return Array.isArray(routes) ? routes : [];
  } catch (error) {
    console.warn('Route catalog is unavailable:', error.message);
    return [];
  }
}

/**
 * Subscribe to location updates for ALL buses (Supabase + Socket.io + LocalStorage)
 */
export function subscribeToAllBusLocationsRealtime(onUpdateCallback) {
  const socket = getSocket();
  const onLocation = () => onUpdateCallback();
  const onStatus = () => onUpdateCallback();
  if (socket) {
    socket.on('location_changed', onLocation);
    socket.on('bus_tracking_changed', onStatus);
  }
  return () => {
    if (socket) {
      socket.off('location_changed', onLocation);
      socket.off('bus_tracking_changed', onStatus);
    }
  };
}
/**
 * Log out user
 */
export async function logoutUser() {
  try {
    await supabase.auth.signOut();
  } catch (err) {
    console.warn('Supabase signout notice:', err);
  }
  clearLocalAuth();
}

/**
 * Delete / Clear all local user info, sign up info, Supabase user rows, and backend database user data
 */
