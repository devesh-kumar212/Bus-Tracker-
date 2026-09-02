import { useNavigate, useLocation } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { ArrowLeft, Clock, Lock, User, Key, ShieldAlert } from 'lucide-react';

export default function Placeholder() {
  const navigate = useNavigate();
  const location = useLocation();

  // Determine role based on route path
  const getRoleConfig = () => {
    switch (location.pathname) {
      case '/driver-login':
        return {
          title: 'Driver Login',
          emoji: '🚍',
          accent: 'from-blue-600 to-indigo-650',
          desc: 'Commence your shift, select your route track, and activate live GPS location coordinates broadcast.'
        };
      case '/passenger-login':
        return {
          title: 'Passenger Login',
          emoji: '🧑',
          accent: 'from-violet-600 to-purple-650',
          desc: 'Save your favorite routes, configure customize ETA alerts, and submit commuter feedback ticket logs.'
        };
      case '/admin-login':
        return {
          title: 'Admin Login',
          emoji: '🛠',
          accent: 'from-cyan-600 to-blue-650',
          desc: 'Register bus fleets, manage driver sign-ups, assemble route sequences, and resolve passenger complaints.'
        };
      default:
        return {
          title: 'Transit Portal',
          emoji: '🗺️',
          accent: 'from-blue-500 to-cyan-500',
          desc: 'Access your dedicated public transit portal configuration console.'
        };
    }
  };

  const role = getRoleConfig();

  return (
    <div className="min-h-screen bg-slate-950 text-gray-100 flex flex-col justify-between overflow-x-hidden font-sans relative">
      {/* Background glow overlay */}
      <div className="absolute top-[20%] left-[5%] w-[45%] h-[45%] bg-blue-500/5 rounded-full blur-[140px] pointer-events-none"></div>
      <div className="absolute bottom-[10%] right-[10%] w-[45%] h-[45%] bg-indigo-500/5 rounded-full blur-[140px] pointer-events-none"></div>

      <Navbar />

      {/* Main page content block */}
      <main className="flex-grow flex items-center justify-center px-6 pt-32 pb-16 z-10 w-full">
        <div className="w-full max-w-md relative">
          
          {/* Card Border Line highlight */}
          <div className="absolute inset-0 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-2xl blur-xl opacity-10 pointer-events-none"></div>
          
          <div className="relative bg-slate-900/50 backdrop-blur-md border border-slate-900 rounded-2xl shadow-2xl p-8 overflow-hidden">
            
            {/* Corner coming soon label tag */}
            <div className="absolute top-4 right-4 flex items-center gap-1.5 px-2.5 py-1 bg-amber-950 text-amber-300 border border-amber-900 rounded-lg text-[9px] font-bold tracking-wider uppercase">
              <Clock className="w-3 h-3" />
              <span>Coming Soon</span>
            </div>

            {/* Back Button */}
            <button 
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-8 transition-colors duration-200 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to home</span>
            </button>

            {/* Title Header */}
            <div className="mb-8">
              <div className="text-4xl mb-3">{role.emoji}</div>
              <h2 className="text-2xl font-black text-white">{role.title}</h2>
              <p className="text-xs text-slate-400 mt-2 font-light leading-relaxed">{role.desc}</p>
            </div>

            {/* Mock Visual Form Fields (Disabled UI Only) */}
            <div className="space-y-4 opacity-50 select-none pointer-events-none mb-8">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                  <User className="w-3 h-3" /> Username / Email
                </label>
                <input
                  type="text"
                  disabled
                  value="commuter@bustracker.com"
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-3 text-xs text-slate-400 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Account Password
                </label>
                <input
                  type="password"
                  disabled
                  value="••••••••••••"
                  className="w-full bg-slate-950 border border-slate-900 rounded-xl px-4 py-3 text-xs text-slate-400 outline-none"
                />
              </div>
            </div>

            {/* Informational Warning */}
            <div className="flex gap-2.5 p-3.5 bg-slate-950 border border-slate-900 rounded-xl text-[11px] text-slate-500 font-light mb-6">
              <ShieldAlert className="w-4.5 h-4.5 text-blue-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-400">Submission Submission Status:</span> This page acts as a Week 1 mock interface layout. Authentication logic, Firebase configurations, and databases will be fully integrated during Week 2.
              </div>
            </div>

            {/* Disabled Action CTA */}
            <button
              disabled
              className="w-full py-3 bg-slate-800 border border-slate-900 text-slate-400 rounded-xl text-xs font-bold select-none cursor-not-allowed text-center"
            >
              Sign In (Inactive)
            </button>

          </div>
        </div>
      </main>

      {/* Basic Mini Footer */}
      <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-slate-900 text-center text-[10px] text-slate-600 font-light z-10">
        Bus Tracker System &middot; Phase 1 Mockup
      </footer>
    </div>
  );
}
