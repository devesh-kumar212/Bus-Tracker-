import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import MapContainer from '../components/MapContainer';
import { apiRequest, logout, getAuthUser, initSocket, joinRoom, leaveRoom } from '../services/api';
import { getPendingDrivers, approveDriver, rejectDriver } from '../services/authService';
import {
  Shield,
  Activity,
  Layers,
  Users,
  AlertTriangle,
  MessageSquare,
  Plus,
  Trash2,
  CheckCircle,
  Clock,
  Loader2,
  ArrowLeft,
  LogOut,
  MapPin,
  Settings
} from 'lucide-react';

export default function AdminPortal() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getAuthUser());

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState(null);
  const [loggingIn, setLoggingIn] = useState(false);

  // General state
  const [activeTab, setActiveTab] = useState('monitor'); // monitor, buses, drivers, routes, complaints
  const [loading, setLoading] = useState(false);
  const [buses, setBuses] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [pendingDrivers, setPendingDrivers] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [complaints, setComplaints] = useState([]);
  const [activeTrips, setActiveTrips] = useState([]);
  const [selectedBusId, setSelectedBusId] = useState(null); // for tracking on monitor map

  // Dialog / Modal Form States
  const [showBusModal, setShowBusModal] = useState(false);
  const [newBus, setNewBus] = useState({ bus_number: '', capacity: 40, status: 'inactive' });
  
  const [showDriverModal, setShowDriverModal] = useState(false);
  const [newDriver, setNewDriver] = useState({ name: '', username: '', password: '' });

  const [showStopModal, setShowStopModal] = useState(false);
  const [newStop, setNewStop] = useState({ stop_name: '', latitude: 26.4601, longitude: 74.6441 });

  const [showRouteModal, setShowRouteModal] = useState(false);
  const [newRoute, setNewRoute] = useState({ route_name: '', description: '', stops: [] }); // array of stop ids

  // 1. Authorization check
  useEffect(() => {
    if (user) {
      if (user.role !== 'admin') {
        alert('Access denied. Administrator permissions required.');
        handleLogout();
      } else {
        loadMetrics();
        // Join socket channel to listen to all location updates live
        const socket = initSocket();
        joinRoom('admin_monitor');
      }
    }
    return () => {
      leaveRoom('admin_monitor');
    };
  }, [user]);

  // 2. Fetch data based on active tab
  useEffect(() => {
    if (user) {
      loadTabData();
    }
  }, [activeTab, user]);

  // 3. Socket updates for active fleet monitor map
  useEffect(() => {
    if (!user) return;
    const socket = initSocket();

    const handleLocationUpdate = (updatedBus) => {
      console.log('Admin received socket location update:', updatedBus);
      setActiveTrips(prev => {
        const exists = prev.some(t => t.trip_id.toString() === updatedBus.trip_id.toString());
        if (exists) {
          return prev.map(t => 
            t.trip_id.toString() === updatedBus.trip_id.toString()
              ? {
                  ...t,
                  current_latitude: updatedBus.latitude,
                  current_longitude: updatedBus.longitude,
                  last_update: updatedBus.last_update
                }
              : t
          );
        } else {
          return [...prev, {
            trip_id: updatedBus.trip_id,
            bus_number: updatedBus.bus_number,
            route_name: updatedBus.route_name,
            current_latitude: updatedBus.latitude,
            current_longitude: updatedBus.longitude,
            last_update: updatedBus.last_update
          }];
        }
      });
    };

    socket.on('location_changed', handleLocationUpdate);

    return () => {
      socket.off('location_changed', handleLocationUpdate);
    };
  }, [user]);

  // Loading initial stats summary
  const loadMetrics = async () => {
    try {
      const activeTripsList = await apiRequest('/admin/active-trips');
      setActiveTrips(activeTripsList);
    } catch (err) {
      console.error('Failed to load active fleet metrics:', err);
    }
  };

  const loadTabData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'monitor') {
        const activeTripsList = await apiRequest('/admin/active-trips');
        const stopsList = await apiRequest('/admin/stops');
        setActiveTrips(activeTripsList);
        setStops(stopsList);
      } else if (activeTab === 'buses') {
        const busesList = await apiRequest('/admin/buses');
        setBuses(busesList);
      } else if (activeTab === 'drivers') {
        const driversList = await apiRequest('/admin/drivers').catch(() => []);
        const pendingList = await getPendingDrivers().catch(() => []);
        const apiPending = await apiRequest('/admin/pending-drivers').catch(() => []);
        // Combine pending drivers from Supabase and API
        const combinedPending = [...pendingList];
        apiPending.forEach(ap => {
          if (!combinedPending.some(p => p.email === ap.username || p.email === ap.email)) {
            combinedPending.push(ap);
          }
        });
        setDrivers(driversList);
        setPendingDrivers(combinedPending);
      } else if (activeTab === 'routes') {
        const routesList = await apiRequest('/admin/routes');
        const stopsList = await apiRequest('/admin/stops');
        setRoutes(routesList);
        setStops(stopsList);
      } else if (activeTab === 'complaints') {
        const complaintsList = await apiRequest('/admin/complaints');
        setComplaints(complaintsList);
      }
    } catch (err) {
      console.error(`Error loading tab ${activeTab}:`, err);
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username || !password) return;

    setLoggingIn(true);
    setAuthError(null);
    try {
      const response = await fetch(`${window.location.protocol}//${window.location.hostname}:5000/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Authentication failed');
      }
      if (data.user.role !== 'admin') {
        throw new Error('Access denied. Administrator credentials required.');
      }
      localStorage.setItem('tmb_token', data.token);
      localStorage.setItem('tmb_user', JSON.stringify(data.user));
      setUser(data.user);
    } catch (err) {
      setAuthError(err.message);
    } finally {
      setLoggingIn(false);
    }
  };

  const handleLogout = () => {
    logout();
    setUser(null);
    setActiveTrips([]);
  };

  // ==================== BUS CRUD API OPERATIONS ====================
  const handleAddBus = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/admin/buses', {
        method: 'POST',
        body: JSON.stringify(newBus)
      });
      setShowBusModal(false);
      setNewBus({ bus_number: '', capacity: 40, status: 'inactive' });
      loadTabData();
    } catch (err) {
      alert(err.message);
    }
  };

  const toggleBusStatus = async (bus) => {
    const nextStatus = bus.status === 'active' ? 'inactive' : bus.status === 'inactive' ? 'maintenance' : 'inactive';
    try {
      await apiRequest(`/admin/buses/${bus.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          bus_number: bus.bus_number,
          capacity: bus.capacity,
          status: nextStatus
        })
      });
      loadTabData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteBus = async (id) => {
    if (!confirm('Are you sure you want to delete this bus?')) return;
    try {
      await apiRequest(`/admin/buses/${id}`, { method: 'DELETE' });
      loadTabData();
    } catch (err) {
      alert(err.message);
    }
  };

  // ==================== DRIVER CRUD API OPERATIONS ====================
  const handleAddDriver = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/admin/drivers', {
        method: 'POST',
        body: JSON.stringify(newDriver)
      });
      setShowDriverModal(false);
      setNewDriver({ name: '', username: '', password: '' });
      loadTabData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteDriver = async (id) => {
    if (!confirm('Are you sure you want to delete this driver?')) return;
    try {
      await apiRequest(`/admin/drivers/${id}`, { method: 'DELETE' });
      loadTabData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleApproveDriver = async (driver) => {
    try {
      const driverName = typeof driver === 'object' ? driver.name : 'Driver';

      const result = await approveDriver(driver);

      if (typeof driver === 'object' && typeof driver.id === 'number') {
        await apiRequest(`/admin/pending-drivers/${driver.id}/approve`, { method: 'POST' }).catch(() => {});
      }

      if (result && result.alreadyApproved) {
        alert(`Driver "${driverName}" is already approved. Duplicate approval email was not sent.`);
      } else {
        alert(`Driver "${driverName}" has been approved! Confirmation email sent to ${driver.email || 'driver'}.`);
      }
      loadTabData();
    } catch (err) {
      alert('Failed to approve driver: ' + err.message);
    }
  };

  const handleRejectDriver = async (driver) => {
    const driverName = typeof driver === 'object' ? driver.name : 'Driver';
    if (!confirm(`Are you sure you want to reject registration for "${driverName}"?`)) return;
    try {
      await rejectDriver(driver);

      if (typeof driver === 'object' && typeof driver.id === 'number') {
        await apiRequest(`/admin/pending-drivers/${driver.id}/reject`, { method: 'DELETE' }).catch(() => {});
      }

      alert(`Driver registration for "${driverName}" was rejected.`);
      loadTabData();
    } catch (err) {
      alert('Failed to reject driver: ' + err.message);
    }
  };

  // ==================== STOP CRUD API OPERATIONS ====================
  const handleAddStop = async (e) => {
    e.preventDefault();
    try {
      await apiRequest('/admin/stops', {
        method: 'POST',
        body: JSON.stringify({
          ...newStop,
          latitude: parseFloat(newStop.latitude),
          longitude: parseFloat(newStop.longitude)
        })
      });
      setShowStopModal(false);
      setNewStop({ stop_name: '', latitude: 26.4601, longitude: 74.6441 });
      loadTabData();
    } catch (err) {
      alert(err.message);
    }
  };

  // ==================== ROUTE CRUD API OPERATIONS ====================
  const toggleStopInRoute = (stopId) => {
    setNewRoute(prev => {
      const idx = prev.stops.indexOf(stopId);
      if (idx !== -1) {
        return { ...prev, stops: prev.stops.filter(id => id !== stopId) };
      } else {
        return { ...prev, stops: [...prev.stops, stopId] };
      }
    });
  };

  const handleAddRoute = async (e) => {
    e.preventDefault();
    if (!newRoute.route_name) return;
    if (newRoute.stops.length < 2) {
      alert('A route must have at least 2 stops configured.');
      return;
    }

    try {
      await apiRequest('/admin/routes', {
        method: 'POST',
        body: JSON.stringify({
          route_name: newRoute.route_name,
          description: newRoute.description,
          stops: newRoute.stops
        })
      });
      setShowRouteModal(false);
      setNewRoute({ route_name: '', description: '', stops: [] });
      loadTabData();
    } catch (err) {
      alert(err.message);
    }
  };

  const handleDeleteRoute = async (id) => {
    if (!confirm('Are you sure you want to delete this route track?')) return;
    try {
      await apiRequest(`/admin/routes/${id}`, { method: 'DELETE' });
      loadTabData();
    } catch (err) {
      alert(err.message);
    }
  };

  // ==================== COMPLAINTS TICKET API OPERATIONS ====================
  const resolveComplaint = async (id) => {
    try {
      await apiRequest(`/admin/complaints/${id}/resolve`, { method: 'PUT' });
      loadTabData();
    } catch (err) {
      alert(err.message);
    }
  };

  // Convert activeTrips telemetry array to fit Map structure
  const monitorBuses = activeTrips.map(trip => ({
    trip_id: trip.trip_id,
    bus_number: trip.bus_number,
    route_name: trip.route_name,
    latitude: trip.current_latitude,
    longitude: trip.current_longitude,
    last_update: trip.last_update
  }));

  // Login component layout
  if (!user) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center px-4 font-sans relative">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] bg-indigo-500/10 rounded-full blur-[120px] pointer-events-none"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 rounded-full blur-[120px] pointer-events-none"></div>

        <button 
          onClick={() => navigate('/')} 
          className="absolute top-6 left-6 flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="w-full max-w-md bg-slate-900/60 backdrop-blur-md border border-slate-800 rounded-2xl shadow-2xl p-8 z-10">
          <div className="text-center mb-8">
            <div className="w-12 h-12 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold mx-auto mb-4 text-xl shadow-lg shadow-indigo-900/30">
              🛡️
            </div>
            <h2 className="text-2xl font-bold text-white">Admin Control Center</h2>
            <p className="text-xs text-slate-400 mt-1">Manage public transit configurations</p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {authError && (
              <div className="flex items-center gap-2 p-3.5 bg-rose-950/40 border border-rose-800/60 rounded-xl text-xs text-rose-300">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{authError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Administrator Username</label>
              <input
                type="text"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-xs text-white"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. chandanpanchal817@gmail.com"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">Secret Key / Password</label>
              <input
                type="password"
                required
                className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-xl px-4 py-3 text-xs text-white"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loggingIn}
              className="w-full py-3 bg-gradient-to-r from-indigo-500 to-violet-600 hover:from-indigo-600 hover:to-violet-750 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-indigo-900/30 flex items-center justify-center gap-1.5"
            >
              {loggingIn && <Loader2 className="w-4 h-4 animate-spin" />}
              <span>Enter Workspace</span>
            </button>
          </form>

          <div className="mt-6 text-center text-[10px] text-slate-500 font-light border-t border-slate-800/80 pt-4">
            Secured admin panel. Unauthenticated requests are logged. Registered administrators only.
          </div>
        </div>
      </div>
    );
  }

  // Dashboard layout
  return (
    <div className="flex flex-col h-screen bg-slate-950 text-gray-100 overflow-hidden font-sans">
      
      {/* Top navbar */}
      <header className="flex justify-between items-center bg-slate-900 border-b border-slate-800 px-6 py-4 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white font-bold shadow shadow-indigo-900/40">
            🛡️
          </div>
          <div>
            <h1 className="text-md font-bold text-white flex items-center gap-2">
              TrackMyBus Admin Dashboard
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-800 text-slate-400">
                Staff: {user.name}
              </span>
            </h1>
            <p className="text-xs text-slate-500 font-medium">Global Transit Management Workspace</p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 bg-slate-800 border border-slate-700 hover:bg-slate-700 hover:border-slate-650 rounded-lg text-slate-400 hover:text-white transition-all"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Exit Panel</span>
        </button>
      </header>

      {/* Workspace panel split */}
      <div className="flex flex-col md:flex-row flex-grow overflow-hidden relative">
        
        {/* Left Sidebars - Tab bar */}
        <aside className="w-full md:w-[260px] bg-slate-900 border-b md:border-b-0 md:border-r border-slate-850 flex flex-col shrink-0 z-20">
          <nav className="p-3 md:p-4 flex flex-row md:flex-col overflow-x-auto md:overflow-y-auto space-x-2 md:space-x-0 md:space-y-1 flex-grow scrollbar-thin">
            <button
              onClick={() => setActiveTab('monitor')}
              className={`w-auto md:w-full whitespace-nowrap shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left ${
                activeTab === 'monitor'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/35'
                  : 'text-slate-400 hover:bg-slate-850 hover:text-white'
              }`}
            >
              <Activity className="w-4 h-4" />
              <span>Fleet Monitor</span>
              {activeTrips.length > 0 && (
                <span className="ml-2 md:ml-auto w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {activeTrips.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setActiveTab('buses')}
              className={`w-auto md:w-full whitespace-nowrap shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left ${
                activeTab === 'buses'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/35'
                  : 'text-slate-400 hover:bg-slate-850 hover:text-white'
              }`}
            >
              <Settings className="w-4 h-4" />
              <span>Buses</span>
            </button>

            <button
              onClick={() => setActiveTab('drivers')}
              className={`w-auto md:w-full whitespace-nowrap shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left ${
                activeTab === 'drivers'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/35'
                  : 'text-slate-400 hover:bg-slate-850 hover:text-white'
              }`}
            >
              <Users className="w-4 h-4" />
              <span>Drivers</span>
            </button>

            <button
              onClick={() => setActiveTab('routes')}
              className={`w-auto md:w-full whitespace-nowrap shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left ${
                activeTab === 'routes'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/35'
                  : 'text-slate-400 hover:bg-slate-850 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>Routes & Stops</span>
            </button>

            <button
              onClick={() => setActiveTab('complaints')}
              className={`w-auto md:w-full whitespace-nowrap shrink-0 flex items-center gap-3 px-4 py-3 rounded-xl text-xs font-bold transition-all text-left ${
                activeTab === 'complaints'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/35'
                  : 'text-slate-400 hover:bg-slate-850 hover:text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>Feedback</span>
            </button>
          </nav>
        </aside>

        {/* Right Content Panel */}
        <main className="flex-grow h-full bg-slate-950 overflow-y-auto flex flex-col p-6">
          
          {loading && (
            <div className="absolute top-4 right-4 z-30 bg-slate-900/80 border border-slate-800 px-3 py-1.5 rounded-lg flex items-center gap-2 text-xs font-light text-slate-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-500" /> Updating feed...
            </div>
          )}

          {/* ==================== MONITOR TAB CANVAS ==================== */}
          {activeTab === 'monitor' && (
            <div className="flex-grow flex flex-col md:flex-row gap-6 h-full overflow-hidden min-h-[450px]">
              
              {/* Active bus listing sidebar */}
              <div className="w-full md:w-[300px] flex flex-col gap-4 shrink-0 overflow-y-auto h-full pr-1">
                <div>
                  <h2 className="text-lg font-bold text-white">Live Fleet Status</h2>
                  <p className="text-xs text-slate-400 mt-1">Real-time GPS coordinates reported by drivers</p>
                </div>

                <div className="space-y-2">
                  {activeTrips.length === 0 ? (
                    <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-xl text-center text-xs text-slate-500 italic">
                      No active buses on the road currently.
                    </div>
                  ) : (
                    activeTrips.map(trip => (
                      <div
                        key={trip.trip_id}
                        onClick={() => setSelectedBusId(
                          selectedBusId === trip.trip_id ? null : trip.trip_id
                        )}
                        className={`p-4 rounded-xl border transition-all cursor-pointer ${
                          selectedBusId === trip.trip_id
                            ? 'bg-indigo-950/40 border-indigo-500'
                            : 'bg-slate-900/40 border-slate-800 hover:border-slate-700/65'
                        }`}
                      >
                        <div className="flex justify-between items-start mb-2">
                          <h4 className="font-bold text-sm text-gray-200">🚌 {trip.bus_number}</h4>
                          <span className="text-[9px] bg-indigo-900/60 text-indigo-300 font-bold px-1.5 py-0.5 rounded border border-indigo-800/40">
                            TRIP #{trip.trip_id}
                          </span>
                        </div>
                        <p className="text-xs text-slate-400 font-medium truncate">{trip.route_name}</p>
                        
                        <div className="flex items-center justify-between text-[10px] text-slate-500 mt-3 pt-2.5 border-t border-slate-850">
                          <span>Driver: {trip.driver_name || 'N/A'}</span>
                          <span>
                            {trip.last_update ? new Date(trip.last_update).toLocaleTimeString() : 'No timestamp'}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Map rendering */}
              <div className="flex-grow h-full min-h-[400px]">
                <MapContainer
                  stops={stops}
                  buses={monitorBuses}
                  selectedBusId={selectedBusId}
                  onBusClick={(bus) => setSelectedBusId(bus.trip_id)}
                />
              </div>

            </div>
          )}

          {/* ==================== BUSES TAB CRUD ==================== */}
          {activeTab === 'buses' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-white">Buses Fleet Configuration</h2>
                  <p className="text-xs text-slate-400 mt-1">Manage public transit buses details and active statuses</p>
                </div>
                <button
                  onClick={() => setShowBusModal(true)}
                  className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow transition-all"
                >
                  <Plus className="w-4 h-4" /> Add New Bus
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden shadow-2xl">
                <table className="w-full text-left border-collapse text-xs text-slate-400">
                  <thead className="bg-slate-850 text-white font-bold border-b border-slate-850 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-4">Bus ID</th>
                      <th className="p-4">Bus Number</th>
                      <th className="p-4">Capacity (Seats)</th>
                      <th className="p-4">Operational Status</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {buses.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-slate-500 italic">No buses configured yet.</td>
                      </tr>
                    ) : (
                      buses.map(b => (
                        <tr key={b.id} className="hover:bg-slate-850/30">
                          <td className="p-4 font-mono font-bold text-slate-500">#{b.id}</td>
                          <td className="p-4 text-white font-bold">{b.bus_number}</td>
                          <td className="p-4">{b.capacity} commuters</td>
                          <td className="p-4">
                            <button
                              onClick={() => toggleBusStatus(b)}
                              className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border transition-all ${
                                b.status === 'active'
                                  ? 'bg-emerald-950 text-emerald-300 border-emerald-800 hover:bg-emerald-900/30'
                                  : b.status === 'maintenance'
                                  ? 'bg-rose-950 text-rose-300 border-rose-800 hover:bg-rose-900/30'
                                  : 'bg-slate-950 text-slate-400 border-slate-850 hover:bg-slate-800/30'
                              }`}
                              title="Click to toggle status"
                            >
                              {b.status}
                            </button>
                          </td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleDeleteBus(b.id)}
                              className="p-2 bg-slate-950 hover:bg-rose-950 border border-slate-850 hover:border-rose-900 text-slate-500 hover:text-rose-400 rounded-lg transition-all"
                              title="Delete Bus"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ==================== DRIVERS TAB CRUD ==================== */}
          {activeTab === 'drivers' && (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-lg font-bold text-white">Assigned Bus Drivers</h2>
                  <p className="text-xs text-slate-400 mt-1">Manage employee login profiles and track operational logs</p>
                </div>
                <button
                  onClick={() => setShowDriverModal(true)}
                  className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow transition-all"
                >
                  <Plus className="w-4 h-4" /> Register Driver
                </button>
              </div>

              <div className="bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden shadow-2xl">
                <table className="w-full text-left border-collapse text-xs text-slate-400">
                  <thead className="bg-slate-850 text-white font-bold border-b border-slate-850 uppercase tracking-wider text-[10px]">
                    <tr>
                      <th className="p-4">Driver ID</th>
                      <th className="p-4">Full Name</th>
                      <th className="p-4">Username</th>
                      <th className="p-4">Assigned On</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-850">
                    {drivers.length === 0 ? (
                      <tr>
                        <td colSpan="5" className="p-8 text-center text-slate-500 italic">No drivers registered yet.</td>
                      </tr>
                    ) : (
                      drivers.map(d => (
                        <tr key={d.id} className="hover:bg-slate-850/30">
                          <td className="p-4 font-mono font-bold text-slate-500">#{d.id}</td>
                          <td className="p-4 text-white font-bold">{d.name}</td>
                          <td className="p-4 font-semibold text-slate-300">{d.username}</td>
                          <td className="p-4">{d.created_at ? new Date(d.created_at).toLocaleDateString() : 'N/A'}</td>
                          <td className="p-4 text-right">
                            <button
                              onClick={() => handleDeleteDriver(d.id)}
                              className="p-2 bg-slate-950 hover:bg-rose-950 border border-slate-850 hover:border-rose-900 text-slate-500 hover:text-rose-400 rounded-lg transition-all"
                              title="Deregister Driver"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Pending Driver Requests section */}
              <div id="driver-requests" className="pt-8 border-t border-slate-800 space-y-4">
                <div>
                  <h3 className="text-md font-bold text-white flex items-center gap-2">
                    <span>Driver Requests</span>
                    {pendingDrivers.length > 0 && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                        {pendingDrivers.length} pending
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-450 mt-1">Review driver registration requests and grant or decline dashboard access</p>
                </div>

                <div className="bg-slate-900 border border-slate-850 rounded-2xl overflow-hidden shadow-2xl">
                  <table className="w-full text-left border-collapse text-xs text-slate-400">
                    <thead className="bg-slate-850 text-white font-bold border-b border-slate-850 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="p-4">Driver Name</th>
                        <th className="p-4">Email</th>
                        <th className="p-4">Route</th>
                        <th className="p-4">Bus Number</th>
                        <th className="p-4">Registration Date</th>
                        <th className="p-4">Status</th>
                        <th className="p-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-850">
                      {pendingDrivers.length === 0 ? (
                        <tr>
                          <td colSpan="7" className="p-8 text-center text-slate-500 italic">No pending driver registration requests.</td>
                        </tr>
                      ) : (
                        pendingDrivers.map(d => (
                          <tr key={d.id || d.uid} className="hover:bg-slate-850/30">
                            <td className="p-4 text-white font-bold">{d.name}</td>
                            <td className="p-4 font-semibold text-slate-300">{d.email || d.username}</td>
                            <td className="p-4 text-slate-300">{d.route || 'College → Bus Stand'}</td>
                            <td className="p-4 font-mono font-bold text-cyan-400">{d.busNumber || d.bus_number || 'BUS-101'}</td>
                            <td className="p-4 text-slate-400">
                              {d.createdAt ? new Date(d.createdAt).toLocaleDateString() : d.created_at ? new Date(d.created_at).toLocaleDateString() : new Date().toLocaleDateString()}
                            </td>
                            <td className="p-4">
                              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wide">
                                {d.status || 'pending'}
                              </span>
                            </td>
                            <td className="p-4 text-right space-x-2">
                              <button
                                onClick={() => handleApproveDriver(d)}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                                title="Approve Request"
                              >
                                Approve
                              </button>
                              <button
                                onClick={() => handleRejectDriver(d)}
                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-lg transition-all cursor-pointer shadow-sm"
                                title="Reject Request"
                              >
                                Reject
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

            </div>
          )}

          {/* ==================== ROUTES & STOPS TAB CRUD ==================== */}
          {activeTab === 'routes' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              
              {/* Routes Listing Sidebar (2/3 width) */}
              <div className="lg:col-span-2 space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-white">Route Schedules</h2>
                    <p className="text-xs text-slate-400 mt-1">Configure physical route paths and map stop timelines</p>
                  </div>
                  <button
                    onClick={() => setShowRouteModal(true)}
                    className="flex items-center gap-1.5 text-xs font-bold px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow transition-all"
                  >
                    <Plus className="w-4 h-4" /> Create Route Path
                  </button>
                </div>

                <div className="space-y-4">
                  {routes.length === 0 ? (
                    <div className="p-6 bg-slate-900 border border-slate-850 rounded-xl text-center text-xs text-slate-500 italic">No routes configured.</div>
                  ) : (
                    routes.map(r => (
                      <div key={r.id} className="p-5 rounded-2xl bg-slate-900 border border-slate-850 shadow-md space-y-4">
                        <div className="flex justify-between items-start gap-4">
                          <div>
                            <h3 className="font-bold text-sm text-white">{r.route_name}</h3>
                            <p className="text-xs text-slate-500 mt-1">{r.description || 'No description provided.'}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteRoute(r.id)}
                            className="p-2 bg-slate-950 hover:bg-rose-950 border border-slate-850 hover:border-rose-900 text-slate-500 hover:text-rose-400 rounded-lg transition-all"
                            title="Delete Route"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* Stop markers sequence */}
                        <div className="pt-3 border-t border-slate-850">
                          <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block mb-2.5">Stops Flow:</span>
                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            {r.stops && r.stops.map((stop, idx) => (
                              <div key={stop.id} className="flex items-center gap-1.5">
                                <span className="bg-slate-950 text-indigo-300 px-2.5 py-1 rounded-lg border border-slate-800 font-medium">
                                  {stop.stop_order}. {stop.stop_name}
                                </span>
                                {idx < r.stops.length - 1 && <span className="text-slate-600 font-bold">&rarr;</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Standalone Stops (1/3 width) */}
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="text-lg font-bold text-white">Stops Registry</h2>
                    <p className="text-xs text-slate-400 mt-1">Independent GPS waypoints</p>
                  </div>
                  <button
                    onClick={() => setShowStopModal(true)}
                    className="p-2 bg-slate-900 hover:bg-slate-850 border border-slate-850 rounded-lg text-slate-300 hover:text-white transition-all"
                    title="Add Stop Node"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 bg-slate-900 border border-slate-850 rounded-2xl max-h-[500px] overflow-y-auto space-y-2">
                  {stops.length === 0 ? (
                    <div className="text-center text-xs text-slate-500 py-6 italic">No stop registers.</div>
                  ) : (
                    stops.map(stop => (
                      <div key={stop.id} className="p-3 bg-slate-950 border border-slate-850 rounded-xl flex justify-between items-center text-xs">
                        <div>
                          <div className="font-bold text-slate-200">{stop.stop_name}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5 font-mono">
                            {stop.latitude.toFixed(4)}, {stop.longitude.toFixed(4)}
                          </div>
                        </div>
                        <span className="text-[9px] bg-slate-850 text-slate-400 font-bold px-1.5 py-0.5 rounded">
                          ID: #{stop.id}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>
          )}

          {/* ==================== COMPLAINTS TAB CRUD ==================== */}
          {activeTab === 'complaints' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-lg font-bold text-white">Commuter Issues Registry</h2>
                <p className="text-xs text-slate-400 mt-1">Review commuter issues, delay logs, operational complaints, and submit resolutions</p>
              </div>

              <div className="grid grid-cols-1 gap-4">
                {complaints.length === 0 ? (
                  <div className="p-8 bg-slate-900 border border-slate-850 rounded-xl text-center text-xs text-slate-500 italic">No feedback tickets logged.</div>
                ) : (
                  complaints.map(ticket => (
                    <div
                      key={ticket.id}
                      className={`p-5 rounded-2xl bg-slate-900 border border-slate-850 shadow-md flex flex-col md:flex-row justify-between gap-6 transition-all ${
                        ticket.status === 'resolved' ? 'opacity-65' : ''
                      }`}
                    >
                      <div className="space-y-2 flex-grow">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-white">Subject: {ticket.subject}</span>
                          <span className={`text-[9px] font-bold px-2 py-0.5 rounded border ${
                            ticket.status === 'resolved'
                              ? 'bg-emerald-950 text-emerald-300 border-emerald-800'
                              : 'bg-amber-950 text-amber-300 border-amber-800'
                          }`}>
                            {ticket.status === 'resolved' ? 'RESOLVED' : 'PENDING'}
                          </span>
                          {ticket.bus_number && (
                            <span className="text-[9px] bg-indigo-950 text-indigo-300 px-2 py-0.5 rounded border border-indigo-900 font-bold font-mono">
                              BUS {ticket.bus_number}
                            </span>
                          )}
                        </div>

                        <p className="text-xs text-slate-400 font-light leading-relaxed max-w-3xl">
                          &ldquo;{ticket.description}&rdquo;
                        </p>

                        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-500 pt-2 border-t border-slate-850">
                          <div>Filer: <span className="font-bold text-slate-400">{ticket.passenger_name}</span></div>
                          {ticket.email && <div>Email: <span className="text-indigo-400 font-medium">{ticket.email}</span></div>}
                          {ticket.phone && <div>Phone: <span className="text-slate-400">{ticket.phone}</span></div>}
                          <div>Reported: <span>{new Date(ticket.created_at).toLocaleString()}</span></div>
                        </div>
                      </div>

                      {ticket.status === 'pending' && (
                        <div className="flex items-center shrink-0">
                          <button
                            onClick={() => resolveComplaint(ticket.id)}
                            className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-md shadow-emerald-950/40 transition-all"
                          >
                            <CheckCircle className="w-4 h-4" />
                            <span>Mark Resolved</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

        </main>
      </div>

      {/* ==================== FORM DIALOGS / MODALS ==================== */}
      
      {/* 1. Add Bus Modal */}
      {showBusModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-sm text-white">Add Bus to Fleet</h3>
              <button onClick={() => setShowBusModal(false)} className="text-slate-400 hover:text-white text-lg font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleAddBus} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Bus Number (Registration ID) *</label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                  value={newBus.bus_number}
                  onChange={(e) => setNewBus({...newBus, bus_number: e.target.value})}
                  placeholder="e.g. RJ-01-TA-1122"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Commuter Seating Capacity *</label>
                <input
                  type="number"
                  required
                  min="5"
                  max="120"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                  value={newBus.capacity}
                  onChange={(e) => setNewBus({...newBus, capacity: parseInt(e.target.value)})}
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBusModal(false)}
                  className="px-4 py-2 border border-slate-800 bg-transparent hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                >
                  Register Bus
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Add Driver Modal */}
      {showDriverModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-sm text-white">Register Driver Account</h3>
              <button onClick={() => setShowDriverModal(false)} className="text-slate-400 hover:text-white text-lg font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleAddDriver} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Full Driver Name *</label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                  value={newDriver.name}
                  onChange={(e) => setNewDriver({...newDriver, name: e.target.value})}
                  placeholder="e.g. Nikhil Nayak"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Unique Login Username *</label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                  value={newDriver.username}
                  onChange={(e) => setNewDriver({...newDriver, username: e.target.value})}
                  placeholder="e.g. driver_nikhil"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Temporary Security Password *</label>
                <input
                  type="password"
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                  value={newDriver.password}
                  onChange={(e) => setNewDriver({...newDriver, password: e.target.value})}
                  placeholder="••••••••"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowDriverModal(false)}
                  className="px-4 py-2 border border-slate-800 bg-transparent hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                >
                  Create Driver Profile
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. Add Stop Waypoint Modal */}
      {showStopModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150">
            <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center">
              <h3 className="font-bold text-sm text-white">Create Waypoint Node</h3>
              <button onClick={() => setShowStopModal(false)} className="text-slate-400 hover:text-white text-lg font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleAddStop} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Stop Station Name *</label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                  value={newStop.stop_name}
                  onChange={(e) => setNewStop({...newStop, stop_name: e.target.value})}
                  placeholder="e.g. Vaishali Nagar Crossroad"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Latitude coordinate *</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                    value={newStop.latitude}
                    onChange={(e) => setNewStop({...newStop, latitude: e.target.value})}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Longitude coordinate *</label>
                  <input
                    type="number"
                    step="0.000001"
                    required
                    className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                    value={newStop.longitude}
                    onChange={(e) => setNewStop({...newStop, longitude: e.target.value})}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowStopModal(false)}
                  className="px-4 py-2 border border-slate-800 bg-transparent hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                >
                  Publish Waypoint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Create Route Modal */}
      {showRouteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-150 flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-800/50 border-b border-slate-800 flex justify-between items-center shrink-0">
              <h3 className="font-bold text-sm text-white">Create New Route Schedule</h3>
              <button onClick={() => setShowRouteModal(false)} className="text-slate-400 hover:text-white text-lg font-bold">&times;</button>
            </div>
            
            <form onSubmit={handleAddRoute} className="p-6 space-y-4 overflow-y-auto flex-grow">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Route Name / Display Title *</label>
                <input
                  type="text"
                  required
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                  value={newRoute.route_name}
                  onChange={(e) => setNewRoute({...newRoute, route_name: e.target.value})}
                  placeholder="e.g. Route 3: Bus Stand to Vaishali"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Route description</label>
                <input
                  type="text"
                  className="w-full bg-slate-950 border border-slate-800 focus:border-indigo-500 outline-none rounded-lg px-3 py-2 text-xs text-white"
                  value={newRoute.description}
                  onChange={(e) => setNewRoute({...newRoute, description: e.target.value})}
                  placeholder="Summarize coordinates or frequency details..."
                />
              </div>

              {/* Waypoints lists checklist */}
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-2">Assemble Stop Sequence (Click in ordered sequence) *</label>
                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-950 border border-slate-850 rounded-xl max-h-[160px] overflow-y-auto">
                  {stops.map(stop => {
                    const isChecked = newRoute.stops.includes(stop.id);
                    const orderNum = newRoute.stops.indexOf(stop.id) + 1;
                    
                    return (
                      <div
                        key={stop.id}
                        onClick={() => toggleStopInRoute(stop.id)}
                        className={`p-2.5 rounded-lg border text-left cursor-pointer transition-all flex items-center justify-between text-xs ${
                          isChecked
                            ? 'bg-indigo-950/40 border-indigo-700 text-white font-bold'
                            : 'bg-slate-900 border-slate-850 text-slate-400 hover:bg-slate-800 hover:text-white'
                        }`}
                      >
                        <span className="truncate">{stop.stop_name}</span>
                        {isChecked && (
                          <span className="w-5 h-5 rounded-full bg-indigo-600 border border-indigo-500/50 flex items-center justify-center text-[10px] text-white shrink-0">
                            {orderNum}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Chosen sequence order helper preview */}
                {newRoute.stops.length > 0 && (
                  <div className="mt-3.5 space-y-1.5">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-bold block">Configured order preview:</span>
                    <div className="flex flex-wrap items-center gap-1.5 text-xs bg-slate-950/50 p-2.5 border border-slate-850 rounded-xl">
                      {newRoute.stops.map((stopId, idx) => {
                        const stopObj = stops.find(s => s.id === stopId);
                        return (
                          <div key={stopId} className="flex items-center gap-1 text-[11px]">
                            <span className="bg-indigo-950/80 text-indigo-300 font-semibold px-2 py-0.5 rounded border border-indigo-900/60">
                              {idx + 1}. {stopObj ? stopObj.stop_name : `#${stopId}`}
                            </span>
                            {idx < newRoute.stops.length - 1 && <span className="text-slate-700 font-bold">&rarr;</span>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-850 shrink-0">
                <button
                  type="button"
                  onClick={() => setShowRouteModal(false)}
                  className="px-4 py-2 border border-slate-800 bg-transparent hover:bg-slate-800 rounded-lg text-xs font-semibold text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                >
                  Assemble Route Path
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
