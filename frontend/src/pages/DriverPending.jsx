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
    if (!user) { navigate('/driver-login'); return; }
    fetchStatus();
    const interval = setInterval(() => { fetchStatusSilently(); }, 2000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchStatusSilently = async () => {
    if (!user) return;
    try {
      const details = await getDriverDetails(user);
      if (details) {
        setProfile(details);
        if (details.approvalStatus === 'approved') {
          const u = { ...user, status: 'approved', approvalStatus: 'approved' };
          localStorage.setItem('tmb_user', JSON.stringify(u));
          navigate('/driver/dashboard');
        } else if (details.approvalStatus === 'rejected') {
          const u = { ...user, status: 'rejected', approvalStatus: 'rejected' };
          localStorage.setItem('tmb_user', JSON.stringify(u));
          navigate('/driver/rejected');
        }
      }
    } catch (_) {}
  };

  const fetchStatus = async () => {
    if (!user) return;
    setChecking(true);
    try { await fetchStatusSilently(); }
    finally { setChecking(false); setLastChecked(new Date().toLocaleTimeString()); }
  };

  const handleLogout = () => { logout(); navigate('/driver-login'); };

  const rows = [
    { icon: User,   label: 'Name',       value: profile?.name || user?.name || 'Driver' },
    { icon: User,   label: 'Email',      value: profile?.email || user?.username || user?.email || '—' },
    { icon: MapPin, label: 'Route',      value: profile?.route || user?.route || 'Assigned Route' },
    { icon: Bus,    label: 'Bus Number', value: profile?.bus_number || profile?.busNumber || user?.busNumber || 'Assigned Bus' },
  ];

  return (
    <div className="min-h-screen bg-[#08080f] text-gray-100 flex flex-col overflow-x-hidden relative selection:bg-orange-500 selection:text-black">
      <div className="absolute inset-0 bg-dots opacity-40 pointer-events-none z-0" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="scan-line" style={{ top: '30%', animationDelay: '0s' }} />
        <div className="scan-line" style={{ top: '70%', animationDelay: '3s' }} />
      </div>
      <div className="absolute top-0 right-0 w-[45%] h-[45%] bg-amber-500/5 rounded-full blur-[180px] pointer-events-none z-0" />

      <Navbar />

      <main className="flex-grow flex items-center justify-center px-6 pt-36 pb-20 z-10 w-full">
        <div className="w-full max-w-lg">

          <div className="bg-[#111118] border border-gray-800/60 border-l-4 border-l-amber-400 rounded-xl shadow-2xl overflow-hidden p-8">

            {/* Icon */}
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                <Clock className="w-8 h-8 text-amber-400 animate-pulse" />
              </div>
            </div>

            <div className="text-center mb-6">
              <div className="mono text-[10px] font-bold uppercase tracking-widest text-amber-500 mb-1">Status: Pending</div>
              <h2 className="text-2xl font-bold text-white">Awaiting Admin Approval</h2>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed font-normal max-w-sm mx-auto">
                Your registration is submitted. This screen will automatically redirect once your account is approved.
              </p>
            </div>

            <div className="bg-amber-500/5 border border-amber-500/15 rounded-lg p-4 text-xs text-amber-300 mb-6 leading-relaxed mono text-center">
              "Your registration request has been submitted. Please wait for admin approval."
            </div>

            {/* Application details */}
            {(profile || user) && (
              <div className="bg-[#0d0d16] rounded-xl p-5 border border-gray-800/60 mb-6 space-y-1">
                <div className="mono text-[10px] uppercase font-bold text-gray-600 tracking-widest mb-3">Application Details</div>
                {rows.map(({ icon: Icon, label, value }) => (
                  <div key={label} className="flex items-center justify-between text-xs py-2.5 border-b border-gray-800/40 last:border-0">
                    <span className="text-gray-500 flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-gray-700" /> {label}
                    </span>
                    <span className="font-semibold text-white mono">{value}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between text-xs pt-2.5">
                  <span className="text-gray-500">Current Status</span>
                  <span className="px-2.5 py-0.5 rounded-md text-[10px] font-bold mono bg-amber-500/10 text-amber-400 border border-amber-500/20 uppercase">
                    {profile?.approval_status || profile?.status || 'pending'}
                  </span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={fetchStatus}
                disabled={checking}
                className="flex-1 py-3 bg-[#1a1a26] hover:bg-[#212130] text-white rounded-lg text-xs font-bold transition-all border border-gray-700/60 flex items-center justify-center gap-2 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} />
                {checking ? 'Checking...' : 'Refresh Status'}
              </button>
              <button
                onClick={handleLogout}
                className="py-3 px-5 bg-red-950/30 hover:bg-red-900/40 text-red-400 rounded-lg text-xs font-bold transition-all border border-red-800/40 flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Log Out
              </button>
            </div>

            <div className="mt-4 text-center mono text-[10px] text-gray-700">
              Last checked: {lastChecked} · Auto-polling every 2s
            </div>
          </div>

        </div>
      </main>
    </div>
  );
}
