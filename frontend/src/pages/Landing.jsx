import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { 
  ChevronRight, 
  ArrowUpRight, 
  Compass, 
  Shield, 
  Navigation, 
  Twitter, 
  Github, 
  Linkedin, 
  Slack,
  Radio,
  Zap,
  Activity,
  MapPin,
  Clock,
  Users,
  CheckCircle2
} from 'lucide-react';

export default function Landing() {
  const navigate = useNavigate();

  const handleGetStartedClick = () => {
    const element = document.querySelector('#login-selection');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const loginOptions = [
    {
      title: 'Driver Console',
      emoji: '🚍',
      role: 'Fleet Operator',
      description: 'Initiate route shifts, broadcast live GPS coordinates in real-time, and manage route stops.',
      color: 'from-emerald-500 via-teal-500 to-cyan-500',
      badge: 'Live GPS Broadcast',
      hoverColor: 'group-hover:border-emerald-500/50',
      path: '/driver-login'
    },
    {
      title: 'Public Bus Tracker',
      emoji: '🚌',
      role: 'Public Commuter Hub',
      description: 'Track city buses on live interactive maps in real-time. Completely public, no signup or login required.',
      color: 'from-teal-400 via-cyan-500 to-blue-500',
      badge: 'Public Live GPS',
      hoverColor: 'group-hover:border-teal-500/50',
      path: '/tracker'
    },
    {
      title: 'Admin Operations',
      emoji: '🛠️',
      role: 'System Control',
      description: 'Oversee fleet registration, register driver nodes, configure route paths, and resolve support logs.',
      color: 'from-emerald-400 via-teal-600 to-emerald-700',
      badge: 'Full Oversight',
      hoverColor: 'group-hover:border-cyan-500/50',
      path: '/admin-login'
    }
  ];

  const stats = [
    { label: 'Live Telemetry Latency', value: '< 1 sec', icon: Zap },
    { label: 'Active City Routes', value: '45+', icon: Navigation },
    { label: 'Daily Commuters', value: '12,000+', icon: Users },
    { label: 'Fleet Sync Accuracy', value: '99.9%', icon: CheckCircle2 }
  ];

  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-100 flex flex-col justify-between overflow-x-hidden font-sans relative scroll-smooth selection:bg-emerald-500 selection:text-zinc-950">
      
      {/* Dynamic Background Radial Mesh & Grid */}
      <div className="absolute top-[-10%] left-[-10%] w-[65%] h-[65%] bg-emerald-500/10 rounded-full blur-[160px] pointer-events-none"></div>
      <div className="absolute top-[30%] right-[-10%] w-[55%] h-[55%] bg-teal-500/10 rounded-full blur-[160px] pointer-events-none"></div>
      <div className="absolute bottom-[-10%] left-[20%] w-[50%] h-[50%] bg-cyan-500/10 rounded-full blur-[160px] pointer-events-none"></div>
      
      {/* Background Grid Pattern */}
      <div className="absolute inset-0 bg-grid-pattern opacity-30 pointer-events-none z-0"></div>

      <Navbar />

      {/* Hero Section */}
      <section 
        id="home" 
        className="relative max-w-7xl mx-auto px-6 pt-36 pb-24 md:pt-44 md:pb-32 flex flex-col items-center text-center z-10 w-full"
      >
        {/* Status Pill Badge */}
        <div className="mb-8 px-4 py-1.5 rounded-full bg-emerald-950/60 border border-emerald-500/30 text-emerald-400 text-xs font-semibold tracking-wide flex items-center gap-2 shadow-lg shadow-emerald-950/50 backdrop-blur-md">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span>Next-Gen City Transit Telemetry Platform</span>
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-black tracking-tight mb-8 max-w-5xl leading-[1.1]">
          Real-Time Fleet Tracking <br className="hidden sm:inline" />
          <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400 bg-clip-text text-transparent">
            Simplified for Everyone
          </span>
        </h1>
        
        <p className="text-base sm:text-lg md:text-xl text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed mb-12">
          Eliminate commuter uncertainty with live GPS map telemetry, instant ETA calculations, and unified fleet administration for drivers and operators.
        </p>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          <button
            onClick={handleGetStartedClick}
            className="group flex items-center gap-3 px-8 py-4 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold rounded-2xl transition-all duration-300 shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 hover:-translate-y-0.5 cursor-pointer text-sm tracking-wide"
          >
            <span>Launch Workspaces</span>
            <ChevronRight className="w-4 h-4 stroke-[3] transform group-hover:translate-x-1 transition-transform" />
          </button>
          
          <a
            href="#about"
            className="px-8 py-4 bg-zinc-900/60 hover:bg-zinc-800/80 border border-zinc-800 text-zinc-300 hover:text-white font-semibold rounded-2xl transition-all duration-200 backdrop-blur-md text-sm cursor-pointer"
          >
            Learn How It Works
          </a>
        </div>

        {/* Metrics Grid */}
        <div className="mt-16 grid grid-cols-2 md:grid-cols-4 gap-4 w-full max-w-4xl">
          {stats.map((s, idx) => {
            const Icon = s.icon;
            return (
              <div key={idx} className="p-4 rounded-2xl bg-zinc-900/40 border border-zinc-800/80 backdrop-blur-md flex flex-col items-center text-center group hover:border-emerald-500/40 transition-colors">
                <Icon className="w-5 h-5 text-emerald-400 mb-2 group-hover:scale-110 transition-transform" />
                <span className="text-xl md:text-2xl font-black text-white">{s.value}</span>
                <span className="text-[11px] text-zinc-500 font-medium mt-0.5">{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Interactive Telemetry Showcase Graphic */}
        <div className="mt-16 w-full max-w-5xl rounded-3xl border border-emerald-500/20 bg-zinc-950/60 p-4 shadow-2xl relative overflow-hidden backdrop-blur-xl">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-emerald-400 to-transparent"></div>
          
          <div className="rounded-2xl bg-gradient-to-b from-zinc-900/90 to-zinc-950/90 overflow-hidden border border-zinc-800/80 aspect-[16/9] md:aspect-[21/9] flex flex-col justify-between p-6 sm:p-10 relative">
            
            {/* Ambient Map Radar Effect */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/10 rounded-full blur-[100px] pointer-events-none"></div>

            {/* Mock Telemetry Dashboard Top Bar */}
            <div className="relative z-10 flex items-center justify-between border-b border-zinc-800/80 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-rose-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
                  <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
                </div>
                <span className="text-xs font-mono text-zinc-400 pl-2 border-l border-zinc-800">
                  fleet-console-v2.4 // active_node: BUS-102
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Radio className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono font-bold tracking-wider text-emerald-400 uppercase">SIGNAL: 100% ONLINE</span>
              </div>
            </div>

            {/* Mock Map Route Visualizer */}
            <div className="relative z-10 my-auto py-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-left">
              
              <div className="p-4 rounded-xl bg-zinc-900/80 border border-emerald-500/30 flex items-start gap-3 shadow-lg">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <MapPin className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase">Current Station</div>
                  <div className="text-sm font-bold text-white">Central Transit Terminal</div>
                  <div className="text-[11px] text-emerald-400 mt-1 font-medium">Departed 2 mins ago</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/80 border border-teal-500/30 flex items-start gap-3 shadow-lg">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase">Estimated Arrival</div>
                  <div className="text-sm font-bold text-white">Metro Station Stop #4</div>
                  <div className="text-[11px] text-teal-400 mt-1 font-medium">ETA: 4 minutes (On Time)</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-zinc-900/80 border border-cyan-500/30 flex items-start gap-3 shadow-lg">
                <div className="p-2 rounded-lg bg-cyan-500/10 text-cyan-400">
                  <Activity className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-[10px] font-semibold text-zinc-500 uppercase">Telemetry Metrics</div>
                  <div className="text-sm font-bold text-white">Speed: 42 km/h</div>
                  <div className="text-[11px] text-cyan-400 mt-1 font-medium">GPS Signal: Locked (3D)</div>
                </div>
              </div>

            </div>

            {/* Interactive Interface Preview Footer */}
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 pt-4 border-t border-zinc-800/80 text-left">
              <div>
                <span className="text-[10px] font-extrabold tracking-widest text-emerald-400 uppercase block mb-0.5">
                  Live System Preview
                </span>
                <h3 className="text-base sm:text-lg font-bold text-white leading-tight">
                  High-Precision Bus Telemetry Engine
                </h3>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
                <span className="text-xs text-zinc-400 font-mono">Updating location every 300ms...</span>
              </div>
            </div>

          </div>
        </div>
      </section>

      {/* Login Selection Portals */}
      <section 
        id="login-selection" 
        className="max-w-7xl mx-auto px-6 py-24 border-t border-zinc-900/80 w-full z-10"
      >
        <div className="text-center mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-950/40 border border-emerald-900/50 text-emerald-400 text-xs font-semibold mb-3">
            <Zap className="w-3.5 h-3.5" /> Direct Access Portals
          </div>
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">Choose Your Workspace</h2>
          <p className="text-sm sm:text-base text-zinc-400 mt-3 font-normal max-w-xl mx-auto">
            Select your role to open your dedicated monitoring or operational dashboard.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {loginOptions.map((opt, i) => (
            <div
              key={i}
              onClick={() => navigate(opt.path)}
              className="group relative cursor-pointer overflow-hidden rounded-3xl border border-zinc-800/90 bg-zinc-900/40 hover:bg-zinc-900/70 p-8 flex flex-col justify-between transition-all duration-300 hover:-translate-y-2 shadow-xl hover:shadow-2xl hover:shadow-emerald-500/10 backdrop-blur-xl"
            >
              {/* Colored Gradient Accent Line */}
              <div className={`absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r ${opt.color}`}></div>

              <div>
                <div className="flex items-center justify-between mb-6">
                  <span className="text-4xl p-3 bg-zinc-950/80 border border-zinc-800 rounded-2xl shadow-inner">
                    {opt.emoji}
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 border border-emerald-900/60 px-3 py-1 rounded-full">
                    {opt.badge}
                  </span>
                </div>

                <div className="text-xs font-mono font-semibold text-zinc-500 uppercase tracking-widest mb-1">
                  {opt.role}
                </div>

                <h3 className="text-2xl font-bold text-white group-hover:text-emerald-400 transition-colors mb-3 flex items-center justify-between">
                  <span>{opt.title}</span>
                  <ArrowUpRight className="w-5 h-5 text-zinc-500 group-hover:text-emerald-400 group-hover:translate-x-1 group-hover:-translate-y-1 transition-all" />
                </h3>

                <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-normal mb-8">
                  {opt.description}
                </p>
              </div>

              <div className="pt-4 border-t border-zinc-800/60 flex items-center justify-between">
                <span className="text-xs font-bold text-emerald-400 group-hover:text-emerald-300 transition-colors">
                  Open Portal &rarr;
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">Instant Auth</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* About Section */}
      <section 
        id="about" 
        className="max-w-7xl mx-auto px-6 py-24 border-t border-zinc-900/80 w-full z-10"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-teal-950/40 border border-teal-900/50 text-teal-400 text-xs font-semibold mb-4">
              <Compass className="w-3.5 h-3.5" /> Built for Modern Transit
            </div>
            
            <h2 className="text-3xl sm:text-4xl font-black text-white mb-6 leading-tight">
              Empowering Cities with Next-Gen Fleet Intelligence
            </h2>
            
            <p className="text-zinc-400 font-normal leading-relaxed mb-6 text-sm sm:text-base">
              Bus Tracker is an all-in-one real-time transit intelligence system engineered to eliminate wait times and commuter uncertainty. We connect passengers, drivers, and fleet managers into a single synchronized platform.
            </p>
            
            <p className="text-zinc-400 font-normal leading-relaxed text-sm sm:text-base">
              Riders gain complete clarity through live map telemetry and instant arrival estimations, while drivers broadcast coordinates effortlessly and administrators optimize operational performance.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            <div className="p-6 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl space-y-4 hover:border-emerald-500/30 transition-colors backdrop-blur-md">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Compass className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-white">For Commuters</h4>
              <p className="text-xs text-zinc-400 leading-normal font-normal">Know exact arrival times with live maps and stop schedules.</p>
            </div>

            <div className="p-6 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl space-y-4 hover:border-teal-500/30 transition-colors backdrop-blur-md">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/20 flex items-center justify-center text-teal-400">
                <Navigation className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-white">For Drivers</h4>
              <p className="text-xs text-zinc-400 leading-normal font-normal">Initiate route shifts and broadcast live GPS coordinates.</p>
            </div>

            <div className="p-6 bg-zinc-900/40 border border-zinc-800/80 rounded-2xl space-y-4 hover:border-cyan-500/30 transition-colors backdrop-blur-md">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <Shield className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-sm text-white">For Admins</h4>
              <p className="text-xs text-zinc-400 leading-normal font-normal">Manage fleet registration, route stops, and system audit logs.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer Section */}
      <footer 
        id="contact" 
        className="w-full max-w-7xl mx-auto px-6 py-10 border-t border-zinc-900/80 text-xs text-zinc-500 font-normal z-10 flex flex-col md:flex-row items-center justify-between gap-6"
      >
        <div className="flex flex-col items-center md:items-start gap-1">
          <div className="text-zinc-400 font-semibold">&copy; {new Date().getFullYear()} Bus Tracker Telemetry. All rights reserved.</div>
          <div className="text-[11px] text-zinc-500">Engineered for real-time city transit optimization</div>
        </div>

        {/* Social Icons */}
        <div className="flex gap-3">
          <button className="p-2.5 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 rounded-xl text-zinc-400 hover:text-emerald-400 transition-all cursor-pointer">
            <Twitter className="w-4 h-4" />
          </button>
          <button className="p-2.5 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 rounded-xl text-zinc-400 hover:text-white transition-all cursor-pointer">
            <Github className="w-4 h-4" />
          </button>
          <button className="p-2.5 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 rounded-xl text-zinc-400 hover:text-teal-400 transition-all cursor-pointer">
            <Linkedin className="w-4 h-4" />
          </button>
          <button className="p-2.5 bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 hover:border-emerald-500/40 rounded-xl text-zinc-400 hover:text-cyan-400 transition-all cursor-pointer">
            <Slack className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}

