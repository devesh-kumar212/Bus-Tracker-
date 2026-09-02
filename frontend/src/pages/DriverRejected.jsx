import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { logout, getAuthUser } from '../services/api';
import { XCircle, LogOut, ArrowLeft } from 'lucide-react';

export default function DriverRejected() {
  const navigate = useNavigate();
  const user = getAuthUser();

  const handleLogout = () => {
    logout();
    navigate('/driver-login');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100 flex flex-col justify-between overflow-x-hidden font-sans relative">
      {/* Background glow effects */}
      <div className="absolute top-[20%] left-[10%] w-[40%] h-[40%] bg-rose-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      <Navbar />

      <main className="flex-grow flex items-center justify-center px-6 pt-32 pb-16 z-10 w-full">
        <div className="w-full max-w-lg relative">

          <div className="absolute inset-0 bg-gradient-to-r from-rose-600 to-rose-900 rounded-3xl blur-xl opacity-10 pointer-events-none"></div>

          <div className="relative bg-slate-900/70 backdrop-blur-md border border-slate-800 rounded-3xl shadow-2xl overflow-hidden p-8 text-center">

            {/* Top red accent line */}
            <div className="absolute top-0 left-0 w-full h-[3px] bg-rose-600"></div>

            {/* Rejected Icon */}
            <div className="w-20 h-20 bg-rose-500/10 border border-rose-500/30 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
              <XCircle className="w-10 h-10 text-rose-500" />
            </div>

            {/* Header */}
            <h2 className="text-2xl font-black text-white mb-2">Registration Rejected</h2>

            {/* Required Rejection Message */}
            <div className="p-4 bg-rose-950/50 border border-rose-800/60 rounded-2xl text-xs text-rose-200 mb-6 leading-relaxed">
              "Your driver registration was rejected. Please contact the administrator."
            </div>

            <p className="text-xs text-slate-400 font-light mb-6 leading-relaxed">
              Unfortunately, your request to register as a driver for Bus Tracker was declined by the administrator. If you believe this is an error, please contact transit administration.
            </p>

            {user && (
              <div className="bg-slate-950/80 rounded-2xl p-4 border border-slate-800 text-xs text-slate-400 mb-6 text-left space-y-1">
                <div><strong className="text-slate-300">Registered Email:</strong> {user.username || user.email || 'N/A'}</div>
                <div><strong className="text-slate-300">Name:</strong> {user.name || 'N/A'}</div>
                <div><strong className="text-slate-300">Status:</strong> <span className="text-rose-400 font-bold uppercase">Rejected</span></div>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/')}
                className="flex-1 py-3 bg-slate-800 hover:bg-slate-750 text-white rounded-xl text-xs font-bold transition-all border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Return to Home</span>
              </button>

              <button
                onClick={handleLogout}
                className="flex-1 py-3 bg-rose-950/60 hover:bg-rose-900/60 text-rose-200 rounded-xl text-xs font-bold transition-all border border-rose-800/60 flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Log Out</span>
              </button>
            </div>

          </div>
        </div>
      </main>

      <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-slate-900 text-center text-[10px] text-slate-600 font-light z-10">
        Bus Tracker System &middot; Access Control
      </footer>
    </div>
  );
}
