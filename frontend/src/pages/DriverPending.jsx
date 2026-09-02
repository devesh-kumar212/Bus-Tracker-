import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { getAuthUser, logout } from '../services/api';
import { getDriverDetails } from '../services/authService';
import { Clock, RefreshCw, LogOut, Bus, MapPin, User } from 'lucide-react';

export default function DriverPending() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getAuthUser());
  const [profile, setProfile] = useState(null);
  const [checking, setChecking] = useState(false);
  const [lastChecked, setLastChecked] = useState(new Date().toLocaleTimeString());

  useEffect(() => {
    if (!user) {
      navigate('/driver-login');
      return;
    }

    // Initial profile fetch
    fetchStatus();

    // Poll status every 2 seconds for real-time status updates
    const interval = setInterval(() => {
      fetchStatusSilently();
    }, 2000);

    return () => {
      clearInterval(interval);
    };
  }, [user]);

  const fetchStatusSilently = async () => {
    if (!user) return;
    try {
      const details = await getDriverDetails(user);
      if (details) {
        setProfile(details);
        if (details.approvalStatus === 'approved') {
          // Update local session
          const updatedUser = { ...user, status: 'approved', approvalStatus: 'approved' };
          localStorage.setItem('tmb_user', JSON.stringify(updatedUser));
          navigate('/driver/dashboard');
        } else if (details.approvalStatus === 'rejected') {
          const updatedUser = { ...user, status: 'rejected', approvalStatus: 'rejected' };
          localStorage.setItem('tmb_user', JSON.stringify(updatedUser));
          navigate('/driver/rejected');
        }
      }
    } catch (err) {
      // silent retry
    }
  };

  const fetchStatus = async () => {
    if (!user) return;
    setChecking(true);
    try {
      await fetchStatusSilently();
    } finally {
      setChecking(false);
      setLastChecked(new Date().toLocaleTimeString());
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/driver-login');
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-100 flex flex-col justify-between overflow-x-hidden font-sans relative">
      <div className="absolute top-[20%] left-[10%] w-[40%] h-[40%] bg-amber-500/10 rounded-full blur-[160px] pointer-events-none"></div>
      <div className="absolute bottom-[20%] right-[10%] w-[40%] h-[40%] bg-teal-500/10 rounded-full blur-[160px] pointer-events-none"></div>

      <Navbar />

      <main className="flex-grow flex items-center justify-center px-6 pt-36 pb-20 z-10 w-full">
        <div className="w-full max-w-lg relative">

          <div className="absolute inset-0 bg-gradient-to-r from-amber-500 to-teal-500 rounded-3xl blur-2xl opacity-15 pointer-events-none"></div>

          <div className="relative bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden p-8 text-center">

            <div className="absolute top-0 left-0 w-full h-[3px] bg-amber-500"></div>

            <div className="w-20 h-20 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <Clock className="w-10 h-10 text-amber-400 animate-pulse" />
            </div>

            <h2 className="text-2xl font-black text-white mb-2">Pending Admin Approval</h2>

            <div className="p-4 bg-amber-950/40 border border-amber-800/60 rounded-2xl text-xs text-amber-200 mb-6 leading-relaxed">
              "Your registration request has been submitted. Please wait for admin approval."
            </div>

            <p className="text-xs text-zinc-400 font-normal mb-6">
              Your driver account is waiting for admin approval. Once approved, this screen will automatically refresh and grant access to the Driver Dashboard.
            </p>

            {(profile || user) && (
              <div className="bg-zinc-950/80 rounded-2xl p-5 border border-zinc-800 text-left mb-6 space-y-3">
                <div className="text-[10px] uppercase font-bold text-zinc-500 tracking-widest mb-2">
                  Application Details
                </div>

                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-900">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" /> Name
                  </span>
                  <span className="font-semibold text-white">{profile?.name || user?.name || 'Driver'}</span>
                </div>

                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-900">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <User className="w-3.5 h-3.5 text-zinc-500" /> Email
                  </span>
                  <span className="font-semibold text-white">{profile?.email || user?.username || user?.email || '-'}</span>
                </div>

                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-900">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-zinc-500" /> Route
                  </span>
                  <span className="font-semibold text-white">{profile?.route || user?.route || 'Assigned Route'}</span>
                </div>

                <div className="flex items-center justify-between text-xs py-1 border-b border-zinc-900">
                  <span className="text-zinc-400 flex items-center gap-1.5">
                    <Bus className="w-3.5 h-3.5 text-zinc-500" /> Bus Number
                  </span>
                  <span className="font-semibold text-white">{profile?.bus_number || profile?.busNumber || user?.busNumber || 'Assigned Bus'}</span>
                </div>

                <div className="flex items-center justify-between text-xs py-1">
                  <span className="text-zinc-400">Current Status</span>
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30 uppercase tracking-wide">
                    {profile?.approval_status || profile?.status || 'pending'}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={fetchStatus}
                disabled={checking}
                className="flex-1 py-3 bg-zinc-800 hover:bg-zinc-750 text-white rounded-xl text-xs font-bold transition-all border border-zinc-700 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                <span>{checking ? 'Checking Status...' : 'Refresh Status'}</span>
              </button>

              <button
                onClick={handleLogout}
                className="py-3 px-5 bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 rounded-xl text-xs font-bold transition-all border border-rose-800/60 flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>

            <div className="mt-4 text-[10px] text-zinc-500 font-mono">
              Last checked at {lastChecked} &middot; Auto-polling enabled
            </div>

          </div>
        </div>
      </main>

      <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-zinc-900/80 text-center text-[11px] text-zinc-500 font-normal z-10">
        Bus Tracker Telemetry &middot; Driver Status Monitor
      </footer>
    </div>
  );
}
