import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { logout, getAuthUser } from '../services/api';
import { XCircle, LogOut, ArrowLeft } from 'lucide-react';

export default function DriverRejected() {
  const navigate = useNavigate();
  const user = getAuthUser();

  const handleLogout = () => { logout(); navigate('/driver-login'); };

  return (
    <div className="min-h-screen bg-[#08080f] text-gray-100 flex flex-col overflow-x-hidden relative selection:bg-red-500 selection:text-white">
      <div className="absolute inset-0 bg-dots opacity-40 pointer-events-none z-0" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="scan-line" style={{ top: '25%', animationDelay: '0s' }} />
        <div className="scan-line" style={{ top: '65%', animationDelay: '3s' }} />
      </div>
      <div className="absolute top-0 left-[-10%] w-[45%] h-[45%] bg-red-500/5 rounded-full blur-[180px] pointer-events-none z-0" />

      <Navbar />

      <main className="flex-grow flex items-center justify-center px-6 pt-36 pb-20 z-10 w-full">
        <div className="w-full max-w-lg">

          <div className="bg-[#111118] border border-gray-800/60 border-l-4 border-l-red-500 rounded-xl shadow-2xl overflow-hidden p-8">

            {/* Icon */}
            <div className="flex items-center justify-center mb-6">
              <div className="w-16 h-16 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
                <XCircle className="w-8 h-8 text-red-500" />
              </div>
            </div>

            <div className="text-center mb-6">
              <div className="mono text-[10px] font-bold uppercase tracking-widest text-red-500 mb-1">Status: Rejected</div>
              <h2 className="text-2xl font-bold text-white">Registration Rejected</h2>
              <p className="text-xs text-gray-500 mt-2 leading-relaxed font-normal max-w-sm mx-auto">
                Your driver registration was declined. If you believe this is an error, please contact transit administration.
              </p>
            </div>

            <div className="bg-red-500/5 border border-red-500/15 rounded-lg p-4 text-xs text-red-300 mb-6 leading-relaxed mono text-center">
              "Your driver registration was rejected. Please contact the administrator."
            </div>

            {user && (
              <div className="bg-[#0d0d16] rounded-xl p-5 border border-gray-800/60 mb-6 space-y-1">
                <div className="mono text-[10px] uppercase font-bold text-gray-600 tracking-widest mb-3">Account Details</div>
                {[
                  { label: 'Email', value: user.username || user.email || 'N/A' },
                  { label: 'Name',  value: user.name || 'N/A' },
                  { label: 'Status', value: 'Rejected', valueClass: 'text-red-400 font-bold uppercase' },
                ].map(({ label, value, valueClass }) => (
                  <div key={label} className="flex items-center justify-between text-xs py-2.5 border-b border-gray-800/40 last:border-0">
                    <span className="text-gray-500 mono">{label}</span>
                    <span className={`font-semibold mono ${valueClass || 'text-white'}`}>{value}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={() => navigate('/')}
                className="flex-1 py-3 bg-[#1a1a26] hover:bg-[#212130] text-white rounded-lg text-xs font-bold transition-all border border-gray-700/60 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Return to Home
              </button>
              <button
                onClick={handleLogout}
                className="flex-1 py-3 bg-red-950/30 hover:bg-red-900/40 text-red-400 rounded-lg text-xs font-bold transition-all border border-red-800/40 flex items-center justify-center gap-2 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                Log Out
              </button>
            </div>

          </div>
        </div>
      </main>
    </div>
  );
}
