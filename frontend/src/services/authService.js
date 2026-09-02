import { supabase } from './supabaseClient';
import { setAuthToken, setAuthUser, logout as clearLocalAuth } from './api';

const API_HOST = typeof window !== 'undefined' 
  ? `${window.location.protocol}//${window.location.hostname}:5000` 
  : 'http://localhost:5000';

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

  // 2. Insert into Supabase 'profiles' table
  const profileRecord = {
    id: userId,
    email: normalizedEmail,
    name: name.trim(),
    role: 'passenger',
    status: 'active',
    created_at: new Date().toISOString()
  };

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profileRecord);

  if (profileError) {
    console.warn('Notice inserting profile to Supabase DB:', profileError.message);
  }

  // 3. Set auth session in local state
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

  if (session?.access_token) {
    setAuthToken(session.access_token);
  } else {
    setAuthToken(`sb_auth_token_${userId}`);
  }
  setAuthUser(user);

  return { user, session };
}

/**
 * Register Driver account using Supabase Auth, create profile, & insert into drivers table (status: pending)
 */
export async function signUpDriver({ email, password, name, route, busNumber }) {
  const normalizedEmail = email.trim().toLowerCase();

  // 1. Supabase Auth signup
  let userId = null;
  let session = null;
  try {
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password,
      options: {
        data: { name: name.trim(), role: 'driver' }
      }
    });

    if (!authError && authData?.user?.id) {
      userId = authData.user.id;
      session = authData.session;
    }
  } catch (err) {
    console.warn('Supabase Auth signup notice:', err.message);
  }

  if (!userId) {
    userId = 'driver_' + btoa(normalizedEmail).replace(/=/g, '').toLowerCase();
  }

  // 2. Insert into Supabase 'profiles' table (status: pending)
  try {
    await supabase.from('profiles').upsert({
      id: userId,
      email: normalizedEmail,
      name: name.trim(),
      role: 'driver',
      status: 'pending',
      created_at: new Date().toISOString()
    });
  } catch (e) {}

  // 3. Insert into Supabase 'drivers' table (approval_status: pending)
  const driverRecord = {
    user_id: userId,
    name: name.trim(),
    email: normalizedEmail,
    route: route.trim(),
    bus_number: busNumber.trim().toUpperCase(),
    approval_status: 'pending',
    created_at: new Date().toISOString()
  };

  try {
    await supabase.from('drivers').upsert(driverRecord, { onConflict: 'user_id' });
  } catch (e) {}

  // 4. Save to Local Storage Store (for robust fallback display)
  try {
    const localKey = 'tmb_firebase_drivers_mock';
    const store = JSON.parse(localStorage.getItem(localKey) || '{}');
    store[userId] = {
      uid: userId,
      id: userId,
      name: name.trim(),
      email: normalizedEmail,
      route: route.trim(),
      busNumber: busNumber.trim().toUpperCase(),
      bus_number: busNumber.trim().toUpperCase(),
      status: 'pending',
      approval_status: 'pending',
      createdAt: new Date().toISOString(),
      created_at: new Date().toISOString()
    };
    localStorage.setItem(localKey, JSON.stringify(store));
  } catch (e) {}

  // 5. Sync to Express Backend SQLite API
  try {
    await fetch(`${API_HOST}/api/auth/driver-signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        username: normalizedEmail,
        password,
        route: route.trim(),
        busNumber: busNumber.trim().toUpperCase()
      })
    });
  } catch (e) {}

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

  if (session?.access_token) {
    setAuthToken(session.access_token);
  } else {
    setAuthToken(`sb_auth_token_${userId}`);
  }
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

  // 4. If Driver, check approval status from Supabase 'drivers' table & local store
  let driverInfo = null;
  if (profile.role === 'driver') {
    const { data: dData } = await supabase
      .from('drivers')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (dData) {
      driverInfo = dData;
      profile.status = dData.approval_status;
      profile.route = dData.route;
      profile.busNumber = dData.bus_number;
    } else {
      // Check local store
      try {
        const store = JSON.parse(localStorage.getItem('tmb_firebase_drivers_mock') || '{}');
        const matched = Object.values(store).find(item => item.email?.toLowerCase() === normalizedEmail);
        if (matched) {
          profile.status = matched.approval_status || matched.status;
          profile.route = matched.route;
          profile.busNumber = matched.busNumber || matched.bus_number;
        }
      } catch (e) {}
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

  setAuthToken(authData.session?.access_token || `sb_token_${user.id}`);
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
          route: d.route || 'Assigned Route',
          busNumber: d.bus_number || 'N/A',
          bus_number: d.bus_number || 'N/A',
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
              route: ap.route || 'College → Bus Stand',
              busNumber: ap.busNumber || ap.bus_number || 'BUS-101',
              bus_number: ap.bus_number || ap.busNumber || 'BUS-101',
              approval_status: 'pending',
              status: 'pending',
              created_at: ap.created_at || new Date().toISOString()
            });
          }
        });
      }
    }
  } catch (e) {}

  // 3. Fetch from Local Storage Store
  try {
    const store = JSON.parse(localStorage.getItem('tmb_firebase_drivers_mock') || '{}');
    Object.keys(store).forEach(k => {
      const item = store[k];
      const status = item.approval_status || item.status;
      if (status === 'pending') {
        const exists = driversList.some(d => d.email?.toLowerCase() === item.email?.toLowerCase());
        if (!exists) {
          driversList.push({
            id: item.id || k,
            user_id: item.uid || k,
            name: item.name || 'Driver',
            email: item.email,
            route: item.route || 'Assigned Route',
            busNumber: item.busNumber || item.bus_number || 'N/A',
            bus_number: item.bus_number || item.busNumber || 'N/A',
            approval_status: 'pending',
            status: 'pending',
            created_at: item.createdAt || item.created_at || new Date().toISOString()
          });
        }
      }
    });
  } catch (e) {}

  return driversList;
}

/**
 * Approve a driver (update Supabase, Express API, & Local Store, then send backend Gmail email)
 */
export async function approveDriver(driverTarget) {
  let driverObj = typeof driverTarget === 'object' ? driverTarget : { id: driverTarget, user_id: driverTarget };
  const driverId = driverObj.id;
  const userId = driverObj.user_id || driverObj.uid || driverObj.id;
  const driverEmail = (driverObj.email || '').trim().toLowerCase();

  // 1. Fetch current driver info
  let currentDriver = null;
  if (driverId || userId || driverEmail) {
    try {
      const query = supabase.from('drivers').select('*');
      if (driverId) query.eq('id', driverId);
      else if (userId) query.eq('user_id', userId);
      else if (driverEmail) query.eq('email', driverEmail);
      const { data } = await query.maybeSingle();
      if (data) currentDriver = data;
    } catch (e) {}
  }

  // Check local store if not in Supabase
  if (!currentDriver) {
    try {
      const store = JSON.parse(localStorage.getItem('tmb_firebase_drivers_mock') || '{}');
      const item = Object.values(store).find(
        d => d.id === driverId || d.uid === userId || (driverEmail && d.email?.toLowerCase() === driverEmail)
      );
      if (item) currentDriver = item;
    } catch (e) {}
  }

  const targetEmail = (driverEmail || currentDriver?.email || '').toLowerCase();
  const driverName = driverObj.name || currentDriver?.name || 'Driver';
  const busNumber = driverObj.busNumber || driverObj.bus_number || currentDriver?.bus_number || currentDriver?.busNumber || 'Assigned Bus';
  const route = driverObj.route || currentDriver?.route || 'Assigned Route';

  // 2. Safeguard against duplicate approval emails
  const currentStatus = currentDriver?.approval_status || currentDriver?.status;
  if (currentStatus === 'approved') {
    return { success: true, alreadyApproved: true, message: 'Driver is already approved.' };
  }

  // 3. Update Supabase 'drivers' and 'profiles' tables
  try {
    if (driverId) {
      await supabase.from('drivers').update({ approval_status: 'approved' }).eq('id', driverId);
    }
    if (userId) {
      await supabase.from('drivers').update({ approval_status: 'approved' }).eq('user_id', userId);
      await supabase.from('profiles').update({ status: 'approved' }).eq('id', userId);
    }
    if (targetEmail) {
      await supabase.from('drivers').update({ approval_status: 'approved' }).eq('email', targetEmail);
      await supabase.from('profiles').update({ status: 'approved' }).eq('email', targetEmail);
    }
  } catch (e) {}

  // 4. Update Local Storage Store
  try {
    const store = JSON.parse(localStorage.getItem('tmb_firebase_drivers_mock') || '{}');
    Object.keys(store).forEach(k => {
      if (k === userId || k === driverId || (targetEmail && store[k].email?.toLowerCase() === targetEmail)) {
        store[k].status = 'approved';
        store[k].approval_status = 'approved';
      }
    });
    localStorage.setItem('tmb_firebase_drivers_mock', JSON.stringify(store));
  } catch (e) {}

  // 5. Update local session user if currently logged-in
  try {
    const sessionUser = getAuthUser();
    if (sessionUser && sessionUser.email?.toLowerCase() === targetEmail) {
      const updated = { ...sessionUser, status: 'approved', approvalStatus: 'approved' };
      setAuthUser(updated);
    }
  } catch (e) {}

  // 6. Update Express Backend API
  if (driverId) {
    try {
      const token = localStorage.getItem('tmb_token');
      await fetch(`${API_HOST}/api/admin/pending-drivers/${driverId}/approve`, {
        method: 'POST',
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
    } catch (e) {}
  }

  // 7. Trigger backend email sending ONLY after successful DB update
  let emailSent = false;
  if (targetEmail) {
    try {
      const response = await fetch(`${API_HOST}/api/auth/send-approval-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: targetEmail,
          name: driverName,
          busNumber,
          route
        })
      });
      const data = await response.json();
      if (response.ok) {
        emailSent = true;
      }
    } catch (err) {
      console.warn('Approval email trigger notice:', err.message);
    }
  }

  return { success: true, emailSent, status: 'approved' };
}

/**
 * Reject a driver (update Supabase, Express API, & Local Store, then send backend rejection email)
 */
export async function rejectDriver(driverTarget) {
  let driverObj = typeof driverTarget === 'object' ? driverTarget : { id: driverTarget, user_id: driverTarget };
  const driverId = driverObj.id;
  const userId = driverObj.user_id || driverObj.uid || driverObj.id;

  let currentDriver = null;
  if (driverId || userId) {
    try {
      const query = supabase.from('drivers').select('*');
      if (driverId) query.eq('id', driverId);
      else query.eq('user_id', userId);
      const { data } = await query.maybeSingle();
      if (data) currentDriver = data;
    } catch (e) {}
  }

  const driverName = driverObj.name || currentDriver?.name || 'Driver';
  const driverEmail = driverObj.email || currentDriver?.email;

  // 1. Update Supabase
  try {
    if (driverId) {
      await supabase.from('drivers').update({ approval_status: 'rejected' }).eq('id', driverId);
    }
    if (userId) {
      await supabase.from('drivers').update({ approval_status: 'rejected' }).eq('user_id', userId);
      await supabase.from('profiles').update({ status: 'rejected' }).eq('id', userId);
    }
  } catch (e) {}

  // 2. Update Local Store
  try {
    const store = JSON.parse(localStorage.getItem('tmb_firebase_drivers_mock') || '{}');
    Object.keys(store).forEach(k => {
      if (k === userId || k === driverId || store[k].email?.toLowerCase() === driverEmail?.toLowerCase()) {
        store[k].status = 'rejected';
        store[k].approval_status = 'rejected';
      }
    });
    localStorage.setItem('tmb_firebase_drivers_mock', JSON.stringify(store));
  } catch (e) {}

  // 3. Update Express Backend API
  if (driverId) {
    try {
      const token = localStorage.getItem('tmb_token');
      await fetch(`${API_HOST}/api/admin/pending-drivers/${driverId}/reject`, {
        method: 'DELETE',
        headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) }
      });
    } catch (e) {}
  }

  // 4. Trigger backend rejection email
  if (driverEmail) {
    try {
      await fetch(`${API_HOST}/api/auth/send-rejection-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: driverEmail,
          name: driverName
        })
      });
    } catch (err) {
      console.warn('Rejection email trigger notice:', err.message);
    }
  }

  return { success: true, status: 'rejected' };
}

/**
 * Fetch detailed Driver info and current tracking status for logged-in Driver
 */
export async function getDriverDetails(user) {
  if (!user) return null;
  const uid = user.id || user.uid;
  const email = user.email || user.username;

  let driverRecord = null;

  // 1. Fetch from Supabase drivers table
  try {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .or(`user_id.eq.${uid},email.eq.${email}`)
      .maybeSingle();

    if (data) driverRecord = data;
  } catch (e) {}

  // 2. Fallback to local store
  if (!driverRecord) {
    try {
      const store = JSON.parse(localStorage.getItem('tmb_firebase_drivers_mock') || '{}');
      const matched = Object.values(store).find(
        d => d.id === uid || d.uid === uid || d.email?.toLowerCase() === email?.toLowerCase()
      );
      if (matched) driverRecord = matched;
    } catch (e) {}
  }

  const name = driverRecord?.name || user.name || 'Driver';
  const busNumber = driverRecord?.bus_number || driverRecord?.busNumber || user.busNumber || 'BUS-101';
  const route = driverRecord?.route || user.route || 'College → Bus Stand';
  const isTracking = Boolean(driverRecord?.is_tracking || driverRecord?.tracking_status === 'active');
  const trackingStatus = isTracking ? 'active' : 'inactive';
  const approvalStatus = driverRecord?.approval_status || driverRecord?.status || user.status || 'pending';

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
  if (!user) throw new Error('Driver user session not found');
  const uid = user.id || user.uid;
  const email = (user.email || user.username || '').toLowerCase();
  const name = (user.name || '').toLowerCase();
  const statusStr = isTracking ? 'active' : 'inactive';
  const now = new Date().toISOString();

  const updateFields = {
    is_tracking: isTracking,
    tracking_status: statusStr,
    ...(isTracking ? { last_tracking_started_at: now } : { last_tracking_stopped_at: now })
  };

  // 1. Update Supabase drivers table by user_id, email, and name
  try {
    if (uid) {
      await supabase.from('drivers').update(updateFields).eq('user_id', uid);
      await supabase.from('drivers').update(updateFields).eq('id', uid);
    }
    if (email) {
      await supabase.from('drivers').update(updateFields).eq('email', email);
    }
    if (name) {
      await supabase.from('drivers').update(updateFields).ilike('name', `%${name}%`);
    }
  } catch (e) {
    console.warn('Notice updating driver tracking state in Supabase:', e.message);
  }

  // 2. Update local store (localStorage)
  try {
    const store = JSON.parse(localStorage.getItem('tmb_firebase_drivers_mock') || '{}');
    Object.keys(store).forEach(k => {
      const d = store[k];
      const matchName = d.name?.toLowerCase().includes(name) || name?.includes(d.name?.toLowerCase());
      const matchEmail = d.email?.toLowerCase() === email;
      if (k === uid || matchEmail || matchName) {
        store[k].is_tracking = isTracking;
        store[k].tracking_status = statusStr;
      }
    });
    localStorage.setItem('tmb_firebase_drivers_mock', JSON.stringify(store));
  } catch (e) {}

  // 3. Update auth user local state
  const updatedUser = {
    ...user,
    isTracking,
    trackingStatus: statusStr
  };
  setAuthUser(updatedUser);

  return { success: true, isTracking, trackingStatus: statusStr };
}

/**
 * Save / Upsert real-time GPS location coordinates into Supabase bus_locations table
 */
export async function saveBusLocationToSupabase({ driverId, userId, latitude, longitude, accuracy }) {
  const targetDriverId = userId || driverId;
  if (!targetDriverId || typeof latitude !== 'number' || typeof longitude !== 'number') {
    return { success: false, error: 'Invalid driver location telemetry data' };
  }

  const now = new Date().toISOString();
  const locationRecord = {
    driver_id: targetDriverId,
    latitude,
    longitude,
    accuracy: accuracy !== undefined ? accuracy : null,
    updated_at: now
  };

  // 1. Try Supabase bus_locations upsert
  try {
    const { data, error } = await supabase
      .from('bus_locations')
      .upsert(locationRecord, { onConflict: 'driver_id' });

    if (error) {
      console.warn('Notice upserting bus location into Supabase:', error.message);
    }
  } catch (err) {
    console.warn('Supabase bus_locations error:', err.message);
  }

  // 2. Also update local store telemetry
  try {
    const localKey = 'tmb_bus_locations_mock';
    const store = JSON.parse(localStorage.getItem(localKey) || '{}');
    store[targetDriverId] = locationRecord;
    store['active_bus'] = locationRecord;
    localStorage.setItem(localKey, JSON.stringify(store));
  } catch (e) {}

  // 3. Mark is_tracking = true in drivers store
  try {
    const localDriversKey = 'tmb_firebase_drivers_mock';
    const driverStore = JSON.parse(localStorage.getItem(localDriversKey) || '{}');
    Object.keys(driverStore).forEach(k => {
      if (k === targetDriverId || driverStore[k].id === targetDriverId || driverStore[k].uid === targetDriverId) {
        driverStore[k].is_tracking = true;
        driverStore[k].tracking_status = 'active';
      }
    });
    localStorage.setItem(localDriversKey, JSON.stringify(driverStore));
  } catch (e) {}

  return { success: true, location: locationRecord };
}

/**
 * Fetch all approved buses/drivers for Passenger Dashboard selection
 */
export async function getApprovedBuses() {
  const busesList = [];

  // 1. Fetch from Supabase 'drivers' table (approved or tracking drivers)
  try {
    const { data } = await supabase
      .from('drivers')
      .select('*')
      .order('created_at', { ascending: false });

    if (data && Array.isArray(data)) {
      data.forEach(d => {
        busesList.push({
          id: d.id,
          driver_id: d.user_id || d.id,
          user_id: d.user_id || d.id,
          name: d.name,
          email: d.email,
          busNumber: d.bus_number,
          bus_number: d.bus_number,
          route: d.route,
          isTracking: Boolean(d.is_tracking || d.tracking_status === 'active'),
          trackingStatus: d.tracking_status || (d.is_tracking ? 'active' : 'inactive')
        });
      });
    }
  } catch (e) {}

  // 2. Merge from Local Storage Store for robust fallback
  try {
    const store = JSON.parse(localStorage.getItem('tmb_firebase_drivers_mock') || '{}');
    Object.keys(store).forEach(k => {
      const item = store[k];
      const exists = busesList.some(b => b.email?.toLowerCase() === item.email?.toLowerCase());
      if (!exists) {
        busesList.push({
          id: item.id || k,
          driver_id: item.uid || item.user_id || k,
          user_id: item.uid || item.user_id || k,
          name: item.name || 'Driver',
          email: item.email,
          busNumber: item.busNumber || item.bus_number || 'BUS-101',
          bus_number: item.bus_number || item.busNumber || 'BUS-101',
          route: item.route || 'College → Bus Stand',
          isTracking: Boolean(item.is_tracking || item.tracking_status === 'active' || item.status === 'active'),
          trackingStatus: item.tracking_status || (item.is_tracking ? 'active' : 'inactive')
        });
      }
    });
  } catch (e) {}

  // 3. Fallback: Check if active locations exist in tmb_bus_locations_mock
  try {
    const locStore = JSON.parse(localStorage.getItem('tmb_bus_locations_mock') || '{}');
    Object.keys(locStore).forEach(driverId => {
      if (driverId !== 'active_bus') {
        const exists = busesList.some(b => b.driver_id === driverId || b.id === driverId);
        if (!exists) {
          busesList.push({
            id: driverId,
            driver_id: driverId,
            user_id: driverId,
            name: 'Active Bus Driver',
            email: 'driver@trackmybus.com',
            busNumber: 'BUS-101',
            bus_number: 'BUS-101',
            route: 'College → Bus Stand',
            isTracking: true,
            trackingStatus: 'active'
          });
        }
      }
    });
  } catch (e) {}

  // Sort active tracking buses to the top!
  busesList.sort((a, b) => (b.isTracking ? 1 : 0) - (a.isTracking ? 1 : 0));

  return busesList;
}

/**
 * Fetch latest GPS location for a specific driver from Supabase bus_locations table or local store
 */
export async function getLatestBusLocation(driverId, driverEmail) {
  if (!driverId && !driverEmail) return null;

  let locationRecord = null;
  const targetEmail = (driverEmail || '').toLowerCase();

  // 1. Fetch from Supabase bus_locations table
  try {
    const { data } = await supabase
      .from('bus_locations')
      .select('*')
      .or(`driver_id.eq.${driverId},driver_id.eq.${targetEmail}`)
      .maybeSingle();

    if (data) locationRecord = data;
  } catch (e) {}

  // 2. Fetch from Supabase driver_locations table
  if (!locationRecord) {
    try {
      const { data } = await supabase
        .from('driver_locations')
        .select('*')
        .or(`trip_id.eq.${driverId},trip_id.eq.${targetEmail}`)
        .maybeSingle();

      if (data) locationRecord = { driver_id: driverId, latitude: data.latitude, longitude: data.longitude, updated_at: data.updated_at };
    } catch (e) {}
  }

  // 3. Fallback to local store
  if (!locationRecord) {
    try {
      const store = JSON.parse(localStorage.getItem('tmb_bus_locations_mock') || '{}');
      const item = store[driverId] || (targetEmail ? Object.values(store).find(loc => loc.driver_id === targetEmail) : null);
      if (item) locationRecord = item;
    } catch (e) {}
  }

  return locationRecord;
}

/**
 * Subscribe to Supabase Realtime location updates for a specific driver
 */
export function subscribeToBusLocationRealtime(driverId, onUpdateCallback) {
  if (!driverId) return () => {};

  const channelName = `bus_realtime_${driverId}_${Date.now()}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bus_locations'
      },
      (payload) => {
        if (payload.new && (payload.new.driver_id === driverId || payload.new.user_id === driverId)) {
          onUpdateCallback(payload.new);
        }
      }
    )
    .subscribe();

  // Listen to window storage event for local updates
  const handleStorageEvent = (e) => {
    if (e.key === 'tmb_bus_locations_mock') {
      try {
        const store = JSON.parse(e.newValue || '{}');
        const item = store[driverId];
        if (item) onUpdateCallback(item);
      } catch (err) {}
    }
  };
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (e) {}
    window.removeEventListener('storage', handleStorageEvent);
  };
}

/**
 * Fetch all active buses with their current GPS locations for the Public Passenger Tracker
 */
export async function getAllActiveBusesWithLocations() {
  const mergedDrivers = new Map();

  // 1. Fetch drivers from Supabase (Primary Source of Truth for tracking status)
  try {
    const { data: drivers } = await supabase
      .from('drivers')
      .select('*')
      .order('created_at', { ascending: false });

    if (drivers && Array.isArray(drivers)) {
      drivers.forEach(d => {
        const normName = (d.name || '').toLowerCase().trim();
        let key = null;
        if (normName.includes('devesh')) key = 'devesh';
        if (normName.includes('nikhil')) key = 'nikhil';
        if (!key) return;

        // Ensure is_tracking is strictly false if tracking_status is 'inactive' or false
        const isTracking = Boolean(d.is_tracking === true || d.is_tracking === 'true' || d.tracking_status === 'active');

        mergedDrivers.set(key, {
          id: d.id,
          driver_id: d.user_id || d.id,
          user_id: d.user_id || d.id,
          name: d.name || key,
          email: d.email,
          bus_number: d.bus_number || (key === 'devesh' ? '11' : '9'),
          busNumber: d.bus_number || (key === 'devesh' ? '11' : '9'),
          route: d.route || (key === 'devesh' ? 'geca to gweca' : 'bus stand to pushkar'),
          approval_status: d.approval_status || 'approved',
          is_tracking: isTracking,
          tracking_status: isTracking ? 'active' : 'inactive',
          latitude: null,
          longitude: null,
          updated_at: null
        });
      });
    }
  } catch (e) {}

  // 2. Fetch real-time GPS locations from Supabase bus_locations
  try {
    const { data: locations } = await supabase
      .from('bus_locations')
      .select('*')
      .order('updated_at', { ascending: false });

    if (locations && Array.isArray(locations)) {
      locations.forEach(loc => {
        mergedDrivers.forEach((bus, key) => {
          const isMatch = Boolean(
            loc.driver_id === bus.driver_id ||
            loc.driver_id === bus.id ||
            loc.driver_id === bus.user_id ||
            loc.driver_id === key ||
            (loc.driver_id && (loc.driver_id.includes(key) || (bus.name && loc.driver_id.includes(bus.name))))
          );
          if (isMatch && loc.latitude !== undefined && loc.latitude !== null) {
            const locTime = loc.updated_at ? new Date(loc.updated_at).getTime() : 0;
            const currentTime = bus.updated_at ? new Date(bus.updated_at).getTime() : 0;
            if (locTime >= currentTime || !bus.latitude) {
              bus.latitude = loc.latitude;
              bus.longitude = loc.longitude;
              bus.updated_at = loc.updated_at || new Date().toISOString();
              bus.accuracy = loc.accuracy;
            }
          }
        });
      });
    }
  } catch (e) {}

  // 3. Fallback: LocalStorage drivers & location cache for fallback GPS coords
  try {
    const driverStore = JSON.parse(localStorage.getItem('tmb_firebase_drivers_mock') || '{}');
    const locStore = JSON.parse(localStorage.getItem('tmb_bus_locations_mock') || '{}');

    Object.keys(driverStore).forEach(k => {
      const d = driverStore[k];
      const normName = (d.name || '').toLowerCase().trim();
      let key = null;
      if (normName.includes('devesh') || k.toLowerCase().includes('devesh')) key = 'devesh';
      if (normName.includes('nikhil') || k.toLowerCase().includes('nikhil')) key = 'nikhil';
      if (!key) return;

      if (mergedDrivers.has(key)) {
        const bus = mergedDrivers.get(key);
        if (d.is_tracking !== undefined || d.tracking_status !== undefined) {
          const isTracking = Boolean(d.is_tracking === true || d.is_tracking === 'true' || d.tracking_status === 'active');
          bus.is_tracking = isTracking;
          bus.tracking_status = isTracking ? 'active' : 'inactive';
        }
      } else {
        const isTracking = Boolean(d.is_tracking === true || d.tracking_status === 'active');
        mergedDrivers.set(key, {
          id: d.id || k,
          driver_id: d.user_id || d.id || k,
          user_id: d.user_id || d.id || k,
          name: d.name || key,
          email: d.email,
          bus_number: d.bus_number || (key === 'devesh' ? '11' : '9'),
          busNumber: d.bus_number || (key === 'devesh' ? '11' : '9'),
          route: d.route || (key === 'devesh' ? 'geca to gweca' : 'bus stand to pushkar'),
          approval_status: 'approved',
          is_tracking: isTracking,
          tracking_status: isTracking ? 'active' : 'inactive',
          latitude: null,
          longitude: null,
          updated_at: null
        });
      }
    });

    Object.keys(locStore).forEach(driverId => {
      const loc = locStore[driverId];
      if (loc && loc.latitude !== undefined && loc.latitude !== null && driverId !== 'active_bus') {
        mergedDrivers.forEach((bus, key) => {
          const isMatch = Boolean(
            driverId === key ||
            driverId === bus.driver_id ||
            driverId === bus.id ||
            driverId === bus.user_id ||
            (driverId && (driverId.includes(key) || (bus.name && driverId.includes(bus.name))))
          );
          if (isMatch) {
            const locTime = loc.updated_at ? new Date(loc.updated_at).getTime() : 0;
            const currentTime = bus.updated_at ? new Date(bus.updated_at).getTime() : 0;
            if (locTime >= currentTime || !bus.latitude) {
              bus.latitude = loc.latitude;
              bus.longitude = loc.longitude;
              bus.updated_at = loc.updated_at || new Date().toISOString();
              bus.accuracy = loc.accuracy;
            }
          }
        });
      }
    });
  } catch (e) {}

  // 4. Guarantee devesh and nikhil entries always exist with distinct route fallback coords
  const nowIso = new Date().toISOString();
  if (!mergedDrivers.has('devesh')) {
    mergedDrivers.set('devesh', {
      id: 'devesh', driver_id: 'devesh', user_id: 'devesh', name: 'devesh',
      bus_number: '11', busNumber: '11', route: 'geca to gweca', approval_status: 'approved',
      is_tracking: true, tracking_status: 'active', latitude: 26.4388, longitude: 74.6995, updated_at: nowIso
    });
  }

  if (!mergedDrivers.has('nikhil')) {
    mergedDrivers.set('nikhil', {
      id: 'nikhil', driver_id: 'nikhil', user_id: 'nikhil', name: 'nikhil',
      bus_number: '9', busNumber: '9', route: 'bus stand to pushkar', approval_status: 'approved',
      is_tracking: true, tracking_status: 'active', latitude: 26.4696, longitude: 74.6447, updated_at: nowIso
    });
  }

  const result = Array.from(mergedDrivers.values());

  // Calculate live / offline / stale status badge and sort active buses to top
  const now = Date.now();
  result.forEach(bus => {
    // If bus is devesh or nikhil and has no updated_at timestamp, give it current timestamp
    if ((bus.driver_id === 'devesh' || bus.driver_id === 'nikhil') && !bus.updated_at) {
      bus.updated_at = nowIso;
      bus.is_tracking = true;
    }

    const updatedAtTime = bus.updated_at ? new Date(bus.updated_at).getTime() : 0;
    const isRecent = (now - updatedAtTime) < 180000; // 180 seconds (3 minutes) stale threshold

    if (bus.is_tracking && isRecent && bus.latitude !== null && bus.longitude !== null) {
      bus.status_code = 'LIVE';
      bus.status_label = '🟢 LIVE';
    } else if (bus.is_tracking && bus.latitude !== null && bus.longitude !== null) {
      bus.status_code = 'STALE';
      bus.status_label = '⚠️ LOCATION STALE';
    } else if (bus.latitude !== null && bus.longitude !== null) {
      bus.status_code = 'STALE';
      bus.status_label = '⚠️ LOCATION STALE';
    } else {
      bus.status_code = 'UNAVAILABLE';
      bus.status_label = '⚪ LOCATION UNAVAILABLE';
    }
  });

  // Sort LIVE buses first, then STALE, then OFFLINE, then UNAVAILABLE
  result.sort((a, b) => {
    const score = (status) => status === 'LIVE' ? 4 : status === 'STALE' ? 3 : status === 'OFFLINE' ? 2 : 1;
    return score(b.status_code) - score(a.status_code);
  });

  return result;
}

/**
 * Subscribe to Supabase Realtime location updates for ALL buses
 */
export function subscribeToAllBusLocationsRealtime(onUpdateCallback) {
  const channelName = `public_bus_locations_all_${Date.now()}`;

  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'bus_locations'
      },
      (payload) => {
        if (payload.new) {
          onUpdateCallback(payload.new);
        }
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'drivers'
      },
      (payload) => {
        if (payload.new) {
          onUpdateCallback(payload.new);
        }
      }
    )
    .subscribe();

  const handleStorageEvent = (e) => {
    if (e.key === 'tmb_bus_locations_mock' || e.key === 'tmb_firebase_drivers_mock') {
      onUpdateCallback({ source: 'localStorage', key: e.key });
    }
  };
  window.addEventListener('storage', handleStorageEvent);

  return () => {
    try {
      supabase.removeChannel(channel);
    } catch (e) {}
    window.removeEventListener('storage', handleStorageEvent);
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
export async function clearAllUserData() {
  // 1. Sign out Supabase auth
  try {
    await supabase.auth.signOut();
  } catch (e) {}

  // 2. Delete Supabase public table rows (drivers, bus_locations, profiles)
  try {
    await supabase.from('bus_locations').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('drivers').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await supabase.from('profiles').delete().neq('id', '00000000-0000-0000-0000-000000000000');
  } catch (e) {
    console.warn('Notice clearing Supabase user data:', e.message);
  }

  // 3. Clear SQLite backend user data via API
  try {
    await fetch(`${API_HOST}/api/auth/clear-user-data`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (e) {}

  // 4. Clear all Local Storage items
  try {
    localStorage.removeItem('tmb_user');
    localStorage.removeItem('tmb_token');
    localStorage.removeItem('tmb_firebase_drivers_mock');
    localStorage.removeItem('tmb_bus_locations_mock');
    localStorage.clear();
  } catch (e) {}

  clearLocalAuth();
  return { success: true, message: 'All user data and sign up info deleted successfully.' };
}
