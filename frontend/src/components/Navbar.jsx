import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { BusFront, Menu, X, ArrowUpRight } from 'lucide-react';

export default function Navbar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);

  const goToSection = (id) => {
    setIsOpen(false);
    if (location.pathname !== '/') {
      navigate('/');
      window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 120);
      return;
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <header className="transit-nav">
      <div className="transit-nav-inner">
        <button className="brand-lockup" onClick={() => navigate('/')} aria-label="TrackMyBus home">
          <span className="brand-mark"><BusFront size={20} strokeWidth={2.1} /></span>
          <span className="brand-copy"><strong>TrackMyBus</strong><small>City transit, in view</small></span>
        </button>
        <nav className="desktop-nav" aria-label="Main navigation">
          <button onClick={() => goToSection('home')}>Home</button>
          <button onClick={() => goToSection('about')}>Workspaces</button>
          <button onClick={() => goToSection('how-it-works')}>How it works</button>
        </nav>
        <button className="nav-tracker-button" onClick={() => navigate('/tracker')}>Live tracker <ArrowUpRight size={16} /></button>
        <button className="nav-menu-button" onClick={() => setIsOpen(value => !value)} aria-label={isOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={isOpen}>
          {isOpen ? <X size={21} /> : <Menu size={21} />}
        </button>
      </div>
      {isOpen && (
        <div className="mobile-nav">
          <button onClick={() => goToSection('home')}>Home</button>
          <button onClick={() => goToSection('about')}>Workspaces</button>
          <button onClick={() => goToSection('how-it-works')}>How it works</button>
          <button className="mobile-nav-cta" onClick={() => { setIsOpen(false); navigate('/tracker'); }}>Open live tracker <ArrowUpRight size={16} /></button>
        </div>
      )}
    </header>
  );
}
