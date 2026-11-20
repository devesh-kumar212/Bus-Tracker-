import { supabase, consumeLastAuthEmailRequestFailure } from './supabaseClient';
import { getAuthToken, setAuthToken, setAuthUser, logout as clearLocalAuth, getSocket } from './api';

const API_HOST = typeof window !== 'undefined' 
  ? `${window.location.protocol}//${window.location.hostname}:5000` 
  : 'http://localhost:5000';

function normalizeMobile(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.length === 12 && digits.startsWith('91')) return `+${digits}`;
  return String(value || '').trim().startsWith('+') ? `+${digits}` : digits;
}

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
 * Ask Supabase Auth to send a real email OTP. The Supabase "Magic Link or OTP"
 * template must contain {{ .Token }} (not {{ .ConfirmationURL }}).
 */
export async function sendEmailOtp(email, metadata = {}) {
  const normalizedEmail = email.trim().toLowerCase();
  const authMetadata = { ...metadata };
  if (authMetadata.mobile) authMetadata.mobile = normalizeMobile(authMetadata.mobile);
  const { error } = await supabase.auth.signInWithOtp({
    email: normalizedEmail,
    options: { shouldCreateUser: true, data: authMetadata }
  });
  if (error) {
    const requestFailure = consumeLastAuthEmailRequestFailure();
    const rawMessage = [error.message, error.msg, error.details, error.hint]
      .find(value => typeof value === 'string' && value.trim() && value.trim() !== '{}');
    const detail = rawMessage || requestFailure?.detail;
    const message = String(detail || '').toLowerCase();
    if (message.includes('email address not authorized') || message.includes('smtp') || message.includes('error sending') || message.includes('magic link email')) {
      throw new Error(`Supabase Auth could not hand off the verification email (${detail}). In Supabase Auth â†’ SMTP Settings, make Sender email exactly match the Gmail SMTP username, use a Google App Password, smtp.gmail.com and port 465. Check the Auth log for Gmail's specific rejection. Backend SMTP settings do not send registration OTPs.`);
    }
    if (message.includes('rate limit') || message.includes('too many')) {
      throw new Error('Supabase temporarily rate-limited OTP emails. Wait at least 60 seconds before requesting another code.');
    }
    if (message.includes('email provider is disabled')) {
      throw new Error('Email OTP is disabled in Supabase Auth. Enable the Email provider in Authentication settings.');
    }
    if (detail) throw new Error(`Supabase OTP request failed: ${detail}`);
    const status = error.status || error.statusCode || requestFailure?.status;
    throw new Error(`Supabase Auth returned HTTP ${status || 'error'} without a response detail. Check the matching Auth log for the underlying SMTP, email-template, or database-trigger error.`);
  }
  return { success: true, provider: 'supabase' };
}

/**
 * Verify the email OTP with Supabase Auth and persist its authenticated session.
 */
export async function verifyEmailOtp(email, otp) {
  const normalizedOtp = String(otp || '').trim();
  if (!/^\d{6}$/.test(normalizedOtp)) {
    throw new Error('Enter the complete 6-digit verification code.');
  }
  const { data, error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(), token: normalizedOtp, type: 'email'
  });
  if (error || !data?.session || !data?.user) {
    const message = String(error?.message || '').toLowerCase();
    if (message.includes('expired') || message.includes('invalid') || message.includes('token')) {
      throw new Error('This verification code is invalid or expired. Request a new 6-digit code and try again.');
    }
    throw new Error(error?.message || 'Supabase did not establish a verified session. Check the code and try again.');
  }
  setAuthToken(data.session.access_token);
  return { success: true, user: data.user, session: data.session };
}

/**
 * Register Passenger account using Supabase Auth & create profile
 */
export async function signUpPassenger({ email, password, name }) {
  const normalizedEmail = email.trim().toLowerCase();
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) throw new Error('Verify your email OTP before creating your account.');
  const { data: authData, error: authError } = await supabase.auth.updateUser({
    password,
    data: { name: name.trim(), role: 'passenger' }
  });
  if (authError || !authData?.user) throw new Error(authError?.message || 'Could not finish passenger account setup.');
  const userId = authData.user.id;

  // Profiles are created by the auth.users database trigger. Confirm it ran when
  // a session is available instead of reporting a successful partial signup.
  const { data: currentSession } = await supabase.auth.getSession();
  if (currentSession.session?.access_token) {
    const { data: profile, error: profileError } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
    if (profileError || !profile) throw new Error('Supabase profile was not created. Apply the TrackMyBus signup trigger migration.');
  }

  // Set auth session in local state
  const session = currentSession.session;
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
export async function signUpDriver({ email, password, name, mobile, licenseNumber, route, busNumber }) {
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedMobile = normalizeMobile(mobile);
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError || !sessionData.session?.user) throw new Error('Confirm your email and reopen the confirmation link before submitting registration.');
  if (sessionData.session.user.email?.toLowerCase() !== normalizedEmail) throw new Error('The verified email does not match this driver application.');
  const { data: authData, error: authError } = await supabase.auth.updateUser({
    password,
    data: {
      name: name.trim(), role: 'driver', mobile: normalizedMobile, license_number: licenseNumber.trim(),
      route: route.trim(), bus_number: busNumber.trim().toUpperCase()
    }
  });
  if (authError || !authData?.user) throw new Error(authError?.message || 'Could not finish driver account setup.');
  const userId = authData.user.id;
  const { data: currentSession } = await supabase.auth.getSession();
  const session = currentSession.session;

  // The Auth signup trigger creates these rows for both immediate and
  // email-confirmed sessions. Verify the driver row when a session is returned.
  if (session?.access_token) {
    const { data: savedDriver, error: driverError } = await supabase.from('drivers').select('user_id')
      .eq('user_id', userId).eq('approval_status', 'pending').maybeSingle();
    if (driverError || !savedDriver) throw new Error('Supabase did not create the pending driver profile. Apply backend/supabase_schema.sql and retry.');
  }

  const backendResponse = await fetch(`${API_HOST}/api/auth/driver-signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    body: JSON.stringify({
      name: name.trim(), username: normalizedEmail, password,
      mobile: normalizedMobile, licenseNumber: licenseNumber.trim(),
      route: route.trim(), busNumber: busNumber.trim().toUpperCase()
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
  const identifier = email.trim();
  const normalizedEmail = identifier.toLowerCase();
  const authCredentials = normalizedEmail.includes('@')
    ? { email: normalizedEmail, password }
    : { phone: identifier.replace(/[\s()-]/g, ''), password };

  // 1. Authenticate with Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword(authCredentials);

  if (authError || !authData?.user) {
    // Fallback: Try backend Express API login (for seeded SQLite Admin or Driver accounts)
    try {
      if (!normalizedEmail.includes('@')) throw new Error('Use your email to sign in to this account.');
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
          email: apiData.user.username || normalizedEmail,
          username: apiData.user.username || normalizedEmail,
          name: apiData.user.name || 'User',
          role: apiData.user.role,
          status: 'active',
          mobile: apiData.user.mobile || '',
          licenseNumber: apiData.user.license_number || ''
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
  const accountEmail = (user.email || normalizedEmail).toLowerCase();
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
    if (expectedRole === 'admin' || expectedRole === 'driver') {
      await supabase.auth.signOut();
      throw new Error('Your secure account profile is missing. Contact the administrator to repair the account.');
    }
    profile = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || 'User',
      role: 'passenger',
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
      const res = await fetch(`${API_HOST}/api/auth/driver-status?email=${encodeURIComponent(accountEmail)}`, {
        headers: { Authorization: `Bearer ${authData.session?.access_token || ''}` }
      });
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
    email: accountEmail,
    username: accountEmail,
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

export async function requestPasswordReset(email) {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail.includes('@')) throw new Error('Enter the email address for your account.');
  const redirectTo = typeof window !== 'undefined' ? `${window.location.origin}/reset-password` : undefined;
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
  if (error) throw new Error(error.message || 'Could not send the password reset email.');
  return { success: true };
}

/**
 * Fetch pending drivers from Supabase and the local administration API.
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
          mobile: d.mobile || '',
          licenseNumber: d.license_number || '',
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
              mobile: ap.mobile || '',
              licenseNumber: ap.license_number || '',
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
 * Approve a driver in the local administration API and sync its Supabase profile.
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
      const res = await fetch(`${API_HOST}/api/auth/driver-status?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${getAuthToken() || ''}` }
      });
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
  const mobile = backendDriverDetails?.mobile || driverRecord?.mobile || user.mobile || '';
  const licenseNumber = backendDriverDetails?.license_number || driverRecord?.license_number || user.licenseNumber || '';
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
    mobile,
    licenseNumber,
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
    id: bus.bus_number,
    driver_id: bus.bus_number,
    name: 'Bus',
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
  const realtimeChannel = supabase
    .channel('public-active-bus-locations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'bus_locations' }, onLocation)
    .subscribe(status => {
      if (status === 'SUBSCRIBED') onUpdateCallback();
    });
  if (socket) {
    socket.on('location_changed', onLocation);
    socket.on('bus_tracking_changed', onStatus);
  }
  return () => {
    supabase.removeChannel(realtimeChannel);
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
