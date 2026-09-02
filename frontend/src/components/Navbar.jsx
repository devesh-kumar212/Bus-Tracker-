import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Menu, X, Bus, Sparkles } from 'lucide-react';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const navItems = [
    { name: 'Home', id: '#home' },
    { name: 'About', id: '#about' },
    { name: 'Contact', id: '#contact' }
  ];

  const handleNavClick = (id) => {
    setIsOpen(false);
    if (location.pathname !== '/') {
      navigate('/');
      // Give a tiny delay to allow the home page DOM to mount
      setTimeout(() => {
        const element = document.querySelector(id);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth' });
        }
      }, 100);
    } else {
      const element = document.querySelector(id);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-[#080c14]/80 backdrop-blur-xl border-b border-emerald-900/20">
      <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
        
        {/* Logo */}
        <div 
          onClick={() => navigate('/')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 via-teal-500 to-emerald-600 flex items-center justify-center text-zinc-950 shadow-lg shadow-emerald-500/25 group-hover:scale-105 transition-transform duration-200 font-bold">
            <Bus className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div className="flex flex-col">
            <span className="text-xl font-black tracking-tight bg-gradient-to-r from-white via-emerald-200 to-teal-300 bg-clip-text text-transparent">
              Bus Tracker
            </span>
            <span className="text-[9px] uppercase tracking-widest font-semibold text-emerald-400/80 -mt-1">
              Live Fleet Telemetry
            </span>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-8">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => handleNavClick(item.id)}
              className="text-sm font-medium text-zinc-400 hover:text-emerald-300 transition-colors duration-200 cursor-pointer"
            >
              {item.name}
            </button>
          ))}
          <button
            onClick={() => handleNavClick('#login-selection')}
            className="group flex items-center gap-2 text-xs font-semibold px-4 py-2 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 rounded-xl transition-all duration-200 shadow-md shadow-emerald-500/20 hover:shadow-emerald-500/35 hover:-translate-y-0.5 cursor-pointer"
          >
            <span>Get Started</span>
            <Sparkles className="w-3.5 h-3.5" />
          </button>
        </nav>

        {/* Mobile Toggle Button */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="md:hidden p-2 text-zinc-400 hover:text-white transition-colors cursor-pointer"
        >
          {isOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>

      </div>

      {/* Mobile Drawer */}
      {isOpen && (
        <div className="md:hidden border-t border-emerald-900/30 bg-[#080c14] px-6 py-4 space-y-4 shadow-2xl">
          {navItems.map((item) => (
            <button
              key={item.name}
              onClick={() => handleNavClick(item.id)}
              className="block w-full text-left text-sm font-medium text-zinc-300 hover:text-emerald-400 py-2"
            >
              {item.name}
            </button>
          ))}
          <button
            onClick={() => handleNavClick('#login-selection')}
            className="block w-full text-center text-xs font-bold py-3 bg-gradient-to-r from-emerald-500 to-teal-500 text-zinc-950 rounded-xl"
          >
            Get Started
          </button>
        </div>
      )}
    </header>
  );
}

