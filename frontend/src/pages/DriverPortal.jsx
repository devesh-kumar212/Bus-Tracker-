import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getAuthUser } from '../services/api';
import { getDriverDetails, getDriverTrackingStatus, sendDriverHeartbeat, setDriverTrackingState, saveBusLocationToSupabase, logoutUser } from '../services/authService';
import { Bus, MapPin, Play, Square, LogOut, CheckCircle2, AlertCircle, Radio, User, Mail, Compass, Navigation, Clock, ShieldCheck, Phone, CreditCard } from 'lucide-react';

export default function DriverPortal() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getAuthUser());
  const [driverInfo, setDriverInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isTracking, setIsTracking] = useState(false);
  const [actionNotice, setActionNotice] = useState(null);

  // Live GPS telemetry state
  const [gpsTelemetry, setGpsTelemetry] = useState(null);
  const [databaseSync, setDatabaseSync] = useState('Waiting for GPS');
  const watchIdRef = useRef(null);
  const heartbeatIdRef = useRef(null);
  const gpsPollIdRef = useRef(null);
  const savingLocationRef = useRef(false);
  const lastDbUpdateRef = useRef(0);

  // 1. Session restoration & Access control checks
  useEffect(() => {
    async function loadAndVerifyDriver() {
      setLoading(true);
      if (!user) {
        navigate('/driver-login');
        return;
      }

      if (user.role !== 'driver') {
        alert('Access denied. Driver privileges required.');
        await logoutUser();
        navigate('/driver-login');
        return;
      }

      try {
        const details = await getDriverDetails(user);
        if (details) {
          setDriverInfo(details);

          // Access control status checks
          if (details.approvalStatus === 'pending') {
            navigate('/driver/pending');
            return;
          }
          if (details.approvalStatus === 'rejected') {
            navigate('/driver/rejected');
            return;
          }

          const trackingStatus = await getDriverTrackingStatus();
          const tracking = trackingStatus.tracking_status === 'ACTIVE';
          setIsTracking(tracking);
          if (trackingStatus.location?.latitude !== null && trackingStatus.location?.longitude !== null) {
            const location = trackingStatus.location;
            setGpsTelemetry({ latitude: location.latitude, longitude: location.longitude, accuracy: location.accuracy,
              speed: location.speed, heading: location.heading,
              timestamp: location.last_update ? new Date(location.last_update).toLocaleTimeString() : null });
            setDatabaseSync(location.last_update ? 'Synced' : 'Waiting for GPS');
          }
        }
      } catch (err) {
        console.error('Error verifying driver credentials:', err);
      } finally {
        setLoading(false);
      }
    }

    loadAndVerifyDriver();

  }, [user]);

  // 2. Real GPS WatchPosition Callbacks
  const handleGpsSuccess = async (position) => {
    const { latitude, longitude, accuracy, speed, heading } = position.coords;
    const timeString = new Date(position.timestamp || Date.now()).toLocaleTimeString();

    setGpsTelemetry({
      latitude,
      longitude,
      accuracy,
      speed,
      heading,
      timestamp: timeString
    });

    // Throttle database upsert to once every 3 seconds to avoid API overload
    const now = Date.now();
    if (now - lastDbUpdateRef.current >= 3000 && !savingLocationRef.current) {
      lastDbUpdateRef.current = now;
      savingLocationRef.current = true;
      setDatabaseSync('Saving…');
      try {
        const result = await saveBusLocationToSupabase({ latitude, longitude, accuracy, speed, heading });
        const savedAt = result.location?.updated_at || new Date().toISOString();
        setDatabaseSync(`Synced ${new Date(savedAt).toLocaleTimeString()}`);
        setGpsTelemetry(current => ({ ...current, timestamp: new Date(savedAt).toLocaleTimeString() }));
        setActionNotice({ type: 'success', text: 'GPS location saved and shared with passengers.' });
      } catch (error) {
        setDatabaseSync('Retrying');
        setActionNotice({ type: 'error', text: `GPS is available, but database sync failed: ${error.message}` });
      } finally {
        savingLocationRef.current = false;
      }
    }
  };

  const handleGpsError = (error) => {
    let message = 'An error occurred while fetching GPS coordinates.';
    switch (error.code) {
      case error.PERMISSION_DENIED:
        message = 'Location permission is required to track the bus.';
        break;
      case error.POSITION_UNAVAILABLE:
        message = 'Unable to determine your current location. Please check your GPS signal.';
        break;
      case error.TIMEOUT:
        message = 'Location request timed out. Retrying GPS lock...';
        break;
      default:
        message = error.message || message;
    }

    // Stop tracking state on permission denial or position error
    if (error.code === error.PERMISSION_DENIED) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      setDriverTrackingState({ user, isTracking: false }).catch(() => {});
      setIsTracking(false);
    }

    setActionNotice({ type: 'error', text: message });
  };

  // 3. Control Handlers
  const handleStartTracking = async () => {
    if (isTracking) return; // Prevent duplicate start actions

    if (!navigator.geolocation) {
      setActionNotice({ type: 'error', text: 'Geolocation is not supported by your browser.' });
      return;
    }

    setLoading(true);
    setActionNotice({ type: 'info', text: 'Requesting device GPS location permission...' });

    let trackingStarted = false;
    try {
      const firstFix = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(
        resolve, reject, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
      ));
      await setDriverTrackingState({ user, isTracking: true });
      trackingStarted = true;
      const { latitude, longitude, accuracy, speed, heading } = firstFix.coords;
      const saved = await saveBusLocationToSupabase({ latitude, longitude, accuracy, speed, heading });
      setIsTracking(true);
      lastDbUpdateRef.current = 0;
      setGpsTelemetry({ latitude, longitude, accuracy, speed, heading,
        timestamp: new Date(saved.location?.updated_at || Date.now()).toLocaleTimeString() });
      setDatabaseSync('Synced');
      setActionNotice({ type: 'success', text: 'GPS tracking is active and your first location has been shared.' });
    } catch (err) {
      if (trackingStarted) await setDriverTrackingState({ user, isTracking: false }).catch(() => {});
      const message = err.code === 1 ? 'Allow location access in browser settings, then try again.'
        : err.code === 2 ? 'GPS is unavailable. Check device location settings and try again.'
        : err.code === 3 ? 'GPS did not provide a fix in time. Move outdoors and try again.'
        : err.message;
      setActionNotice({ type: 'error', text: 'Failed to start tracking: ' + message });
      setIsTracking(false);
    } finally {
      setLoading(false);
    }
  };

  const handleStopTracking = async () => {
    if (!isTracking) return; // Prevent stopping when already stopped
    if (!window.confirm('Stop sharing this bus location and end the current trip?')) return;

    setLoading(true);

    try {
      // 2. Set tracking state to inactive
      await setDriverTrackingState({ user, isTracking: false });
      setIsTracking(false);
      setGpsTelemetry(null);
      setActionNotice({ type: 'success', text: 'Bus tracking stopped.' });
    } catch (err) {
      setActionNotice({ type: 'error', text: 'Failed to stop tracking: ' + err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    if (gpsPollIdRef.current !== null) {
      clearInterval(gpsPollIdRef.current);
      gpsPollIdRef.current = null;
    }
    if (heartbeatIdRef.current !== null) {
      clearInterval(heartbeatIdRef.current);
      heartbeatIdRef.current = null;
    }
    if (isTracking) {
      try { await setDriverTrackingState({ user, isTracking: false }); } catch (error) {
        console.warn('Could not send tracking stop before logout; server heartbeat expiry will mark this bus offline.', error);
      }
    }
    await logoutUser();
    navigate('/driver-login');
  };

  const gpsSuccessRef = useRef(handleGpsSuccess);
  gpsSuccessRef.current = handleGpsSuccess;
  const gpsErrorRef = useRef(handleGpsError);
  gpsErrorRef.current = handleGpsError;

  useEffect(() => {
    if (!isTracking) return undefined;
    if (!navigator.geolocation) {
      setActionNotice({ type: 'error', text: 'Geolocation is not supported by this browser.' });
      setDriverTrackingState({ user, isTracking: false }).catch(() => {});
      setIsTracking(false);
      return undefined;
    }

    const gpsOptions = { enableHighAccuracy: true, maximumAge: 0, timeout: 15000 };
    watchIdRef.current = navigator.geolocation.watchPosition(
      position => gpsSuccessRef.current(position), handleGpsError,
      gpsOptions
    );
    // watchPosition may not emit another event when the device is stationary.
    // Sample periodically as well so the server's last GPS timestamp stays fresh.
    const sampleCurrentPosition = () => navigator.geolocation.getCurrentPosition(
      position => gpsSuccessRef.current(position),
      error => { if (error.code === error.PERMISSION_DENIED) gpsErrorRef.current(error); },
      gpsOptions
    );
    sampleCurrentPosition();
    gpsPollIdRef.current = setInterval(sampleCurrentPosition, 5000);
    heartbeatIdRef.current = setInterval(() => {
      sendDriverHeartbeat().catch(error => setDatabaseSync(`Connection issue: ${error.message}`));
    }, 10000);

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      if (gpsPollIdRef.current !== null) clearInterval(gpsPollIdRef.current);
      gpsPollIdRef.current = null;
      if (heartbeatIdRef.current !== null) clearInterval(heartbeatIdRef.current);
      heartbeatIdRef.current = null;
    };
  }, [isTracking]);

  if (loading && !driverInfo) {
    return (
      <div className="min-h-screen bg-[#080c14] text-zinc-100 flex items-center justify-center font-sans">
        <div className="flex items-center gap-3 text-emerald-400 font-bold text-sm">
          <div className="w-5 h-5 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin"></div>
          <span>Loading Driver Console...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-100 flex flex-col justify-between overflow-x-hidden font-sans relative">
      {/* Dynamic background glow */}
      <div className={`absolute top-[15%] left-[10%] w-[45%] h-[45%] ${isTracking ? 'bg-emerald-500/10' : 'bg-rose-500/10'} rounded-full blur-[160px] pointer-events-none transition-all duration-700`}></div>
      <div className="absolute bottom-[20%] right-[10%] w-[40%] h-[40%] bg-cyan-500/10 rounded-full blur-[160px] pointer-events-none"></div>

      <Navbar />

      <main className="flex-grow flex items-center justify-center px-6 pt-36 pb-20 z-10 w-full">
        <div className="w-full max-w-xl relative">

          {/* Accent glow wrap */}
          <div className={`absolute inset-0 bg-gradient-to-r ${isTracking ? 'from-emerald-500 to-teal-500' : 'from-zinc-700 to-zinc-800'} rounded-3xl blur-2xl opacity-20 pointer-events-none transition-all duration-500`}></div>

          <div className="relative bg-zinc-900/70 backdrop-blur-xl border border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden p-8">

            {/* Header accent line */}
            <div className={`absolute top-0 left-0 w-full h-[4px] ${isTracking ? 'bg-emerald-500 shadow-[0_0_12px_#10b981]' : 'bg-rose-600'} transition-all duration-500`}></div>

            {/* Top Title & Status Badge */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-zinc-800/80">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1">
                  <Radio className="w-3.5 h-3.5 animate-pulse text-emerald-400" />
                  <span>Driver Console</span>
                </div>
                <h1 className="text-2xl font-black text-white tracking-tight">
                  Welcome, {driverInfo?.name || user?.name || 'Driver'}
                </h1>
              </div>

              {/* Status Badge: 🔴 OFFLINE vs 🟢 LIVE */}
              <div className={`self-start sm:self-center px-4 py-2 rounded-2xl text-xs font-black uppercase tracking-wider flex items-center gap-2 border transition-all ${
                isTracking 
                  ? 'bg-emerald-950/70 text-emerald-300 border-emerald-500/50 shadow-[0_0_18px_rgba(16,185,129,0.25)]'
                  : 'bg-rose-950/40 text-rose-300 border-rose-800/60'
              }`}>
                <span className={`w-3 h-3 rounded-full ${isTracking ? 'bg-emerald-400 animate-ping' : 'bg-rose-500'}`}></span>
                <span>{isTracking ? (gpsTelemetry ? 'TRACKING ACTIVE' : 'ACQUIRING GPS') : 'OFFLINE'}</span>
              </div>
            </div>

            {/* Feedback Notice Toast */}
            {actionNotice && (
              <div className={`p-4 rounded-2xl text-xs font-bold mb-6 flex items-center gap-3 border transition-all ${
                actionNotice.type === 'success'
                  ? 'bg-emerald-950/50 text-emerald-200 border-emerald-800/60'
                  : actionNotice.type === 'info'
                  ? 'bg-cyan-950/50 text-cyan-200 border-cyan-800/60'
                  : 'bg-rose-950/50 text-rose-200 border-rose-800/60'
              }`}>
                {actionNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                )}
                <span>{actionNotice.text}</span>
              </div>
            )}

            {/* Driver Profile Details Card */}
            <div className="bg-zinc-950/80 rounded-2xl p-6 border border-zinc-800/80 mb-6 space-y-4 shadow-inner">
              <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-1 flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                <span>Assigned Telemetry Details</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-850">
                  <User className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-[10px] text-zinc-500">Driver Name</div>
                    <div className="text-xs font-bold text-white">{driverInfo?.name || '-'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-850">
                  <Mail className="w-4 h-4 text-teal-400 shrink-0" />
                  <div>
                    <div className="text-[10px] text-zinc-500">Driver Email</div>
                    <div className="text-xs font-bold text-white truncate max-w-[160px]">{driverInfo?.email || user?.email || '-'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-850">
                  <Phone className="w-4 h-4 text-teal-400 shrink-0" />
                  <div><div className="text-[10px] text-zinc-500">Mobile Number</div><div className="text-xs font-bold text-white">{driverInfo?.mobile || '-'}</div></div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-850">
                  <CreditCard className="w-4 h-4 text-teal-400 shrink-0" />
                  <div><div className="text-[10px] text-zinc-500">Driver License</div><div className="text-xs font-bold text-white">{driverInfo?.licenseNumber || '-'}</div></div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-850">
                  <Bus className="w-4 h-4 text-cyan-400 shrink-0" />
                  <div>
                    <div className="text-[10px] text-zinc-500">Assigned Bus Number</div>
                    <div className="text-xs font-bold text-white font-mono">{driverInfo?.busNumber || driverInfo?.bus_number || '-'}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3 p-3 bg-zinc-900/60 rounded-xl border border-zinc-850">
                  <MapPin className="w-4 h-4 text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-[10px] text-zinc-500">Assigned Route</div>
                    <div className="text-xs font-bold text-white">{driverInfo?.route || '-'}</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Real-time GPS Telemetry Display Card (When Active) */}
            {isTracking && (
              <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-2xl p-5 mb-8 space-y-3 animate-fadeIn">
                <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-widest flex items-center gap-2">
                  <Compass className="w-4 h-4 text-emerald-400 animate-spin" />
                  <span>Real Device GPS Telemetry</span>
                </div>

                {gpsTelemetry ? (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div className="bg-zinc-950/70 p-3 rounded-xl border border-emerald-900/50">
                      <div className="text-[10px] text-zinc-400">Latitude</div>
                      <div className="font-mono font-bold text-emerald-300 text-sm">
                        {gpsTelemetry.latitude.toFixed(6)}
                      </div>
                    </div>

                    <div className="bg-zinc-950/70 p-3 rounded-xl border border-emerald-900/50">
                      <div className="text-[10px] text-zinc-400">Longitude</div>
                      <div className="font-mono font-bold text-emerald-300 text-sm">
                        {gpsTelemetry.longitude.toFixed(6)}
                      </div>
                    </div>

                    <div className="bg-zinc-950/70 p-3 rounded-xl border border-emerald-900/50">
                      <div className="text-[10px] text-zinc-400">GPS Accuracy</div>
                      <div className="font-mono font-semibold text-zinc-200">
                        &plusmn; {Math.round(gpsTelemetry.accuracy)} meters
                      </div>
                    </div>

                    <div className="bg-zinc-950/70 p-3 rounded-xl border border-emerald-900/50">
                      <div className="text-[10px] text-zinc-400">Last Update</div>
                      <div className="font-mono font-semibold text-zinc-200 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-emerald-400" />
                        <span>{gpsTelemetry.timestamp}</span>
                      </div>
                    </div>

                    <div className="col-span-2 bg-zinc-950/70 p-3 rounded-xl border border-emerald-900/50 flex items-center justify-between">
                      <div className="text-[10px] text-zinc-400">Database Sync</div>
                      <div className={databaseSync.startsWith('Synced') ? 'text-[10px] font-bold text-emerald-300' : 'text-[10px] font-bold text-amber-300'}>{databaseSync}</div>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-3 bg-zinc-950/50 rounded-xl text-xs text-emerald-300">
                    <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin"></div>
                    <span>Acquiring GPS coordinates from device hardware...</span>
                  </div>
                )}
              </div>
            )}

            {/* Action Controls */}
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                
                {/* START TRACKING BUTTON */}
                <button
                  onClick={handleStartTracking}
                  disabled={isTracking || loading}
                  className={`py-4 px-6 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                    isTracking || loading
                      ? 'bg-zinc-850 text-zinc-600 border border-zinc-800 cursor-not-allowed opacity-50'
                      : 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 border border-emerald-400/40 shadow-emerald-900/30 hover:scale-[1.02]'
                  }`}
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Tracking</span>
                </button>

                {/* STOP TRACKING BUTTON */}
                <button
                  onClick={handleStopTracking}
                  disabled={!isTracking || loading}
                  className={`py-4 px-6 rounded-2xl text-xs font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 cursor-pointer shadow-lg ${
                    !isTracking || loading
                      ? 'bg-zinc-850 text-zinc-600 border border-zinc-800 cursor-not-allowed opacity-50'
                      : 'bg-gradient-to-r from-rose-600 to-rose-700 hover:from-rose-500 hover:to-rose-600 text-white border border-rose-500/40 shadow-rose-900/30 hover:scale-[1.02]'
                  }`}
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Stop Tracking</span>
                </button>

              </div>
              <p className="text-[11px] leading-relaxed text-zinc-500">
                Keep this page open with location permission enabled. Browsers may pause GPS when the page is closed or suspended.
              </p>

              {/* LOGOUT BUTTON */}
              <button
                onClick={handleLogout}
                className="w-full py-3.5 px-6 bg-zinc-950/80 hover:bg-rose-950/40 text-zinc-400 hover:text-rose-300 rounded-2xl text-xs font-bold transition-all border border-zinc-800 hover:border-rose-800/60 flex items-center justify-center gap-2 cursor-pointer mt-4"
              >
                <LogOut className="w-4 h-4" />
                <span>Log Out</span>
              </button>
            </div>

          </div>
        </div>
      </main>

      <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-zinc-900/80 text-center text-[11px] text-zinc-500 font-normal z-10">
        Bus Tracker Telemetry Console &middot; Approved Driver Workspace
      </footer>
    </div>
  );
}
