import { useNavigate } from 'react-router-dom';
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BusFront,
  Check,
  CircleHelp,
  Compass,
  LocateFixed,
  MapPinned,
  Radio,
  ShieldCheck,
  Smartphone,
  UsersRound,
} from 'lucide-react';
import Navbar from '../components/Navbar';

const portals = [
  {
    number: '01',
    title: 'Track a bus',
    description: 'Open the public map to see buses sharing their latest location.',
    action: 'Open live map',
    path: '/tracker',
    icon: MapPinned,
    tone: 'mint',
  },
  {
    number: '02',
    title: 'Drive a route',
    description: 'Sign in to start a shift and share GPS from your device.',
    action: 'Driver sign in',
    path: '/driver-login',
    icon: BusFront,
    tone: 'orange',
  },
  {
    number: '03',
    title: 'Manage the fleet',
    description: 'Review driver access, routes, and fleet operations.',
    action: 'Admin sign in',
    path: '/admin-login',
    icon: ShieldCheck,
    tone: 'blue',
  },
];

const steps = [
  { icon: BusFront, title: 'Driver starts tracking', text: 'An approved driver starts a shift and allows device location access.' },
  { icon: Radio, title: 'Location updates', text: 'The bus shares GPS while tracking is active. Updates can pause if the signal drops.' },
  { icon: Smartphone, title: 'Riders check the map', text: 'Open the public tracker to see the latest reported bus position and status.' },
];

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div className="transit-home">
      <Navbar />

      <main>
        <section className="home-hero" id="home">
          <div className="home-hero-copy">
            <div className="home-eyebrow"><span className="home-eyebrow-dot" /> Public transit, made easier</div>
            <h1>Know where your<br /><span>bus is going.</span></h1>
            <p className="home-lede">A clearer trip starts with a current location. Track buses on the public map, or sign in to keep your route moving.</p>
            <div className="home-actions">
              <button className="home-button home-button-primary" onClick={() => navigate('/tracker')}>
                Open live tracker <ArrowRight size={17} />
              </button>
              <button className="home-button home-button-secondary" onClick={() => navigate('/driver-login')}>
                Driver sign in <ArrowUpRight size={16} />
              </button>
            </div>
            <div className="home-trust-row">
              <span><Check size={15} /> No rider account needed</span>
              <span><LocateFixed size={15} /> GPS status shown clearly</span>
            </div>
          </div>

          <div className="route-preview" aria-label="Illustration of a bus route map">
            <div className="route-preview-top">
              <div>
                <div className="preview-label">ROUTE PREVIEW</div>
                <div className="preview-title">A simpler way across town</div>
              </div>
              <span className="preview-map-icon"><Compass size={18} /></span>
            </div>
            <div className="route-map-art">
              <svg viewBox="0 0 560 310" role="img" aria-label="A route connecting three stops">
                <path className="map-road road-a" d="M-20 80 C90 22 142 158 250 109 S425 23 590 78" />
                <path className="map-road road-b" d="M28 310 C84 223 112 177 203 155 S360 172 430 108 S522 74 574 16" />
                <path className="map-road road-c" d="M-10 241 C89 201 162 269 247 222 S383 202 565 278" />
                <path className="map-route-shadow" d="M65 228 C130 198 148 144 233 147 S322 202 390 143 S444 102 500 93" />
                <path className="map-route" d="M65 228 C130 198 148 144 233 147 S322 202 390 143 S444 102 500 93" />
                <circle className="map-stop" cx="65" cy="228" r="8" />
                <circle className="map-stop" cx="233" cy="147" r="8" />
                <circle className="map-stop map-stop-end" cx="500" cy="93" r="9" />
                <g className="map-bus" transform="translate(354 153) rotate(-34)">
                  <rect x="-18" y="-13" width="36" height="26" rx="8" />
                  <path d="M-10 -6h20v8h-20z" />
                  <circle cx="-10" cy="11" r="3" /><circle cx="10" cy="11" r="3" />
                </g>
                <text x="42" y="260">START</text><text x="206" y="177">CENTRE</text><text x="472" y="124">NEXT STOP</text>
              </svg>
              <div className="map-neighborhood neighborhood-one">OLD TOWN</div>
              <div className="map-neighborhood neighborhood-two">RIVER SIDE</div>
              <div className="map-neighborhood neighborhood-three">MARKET</div>
            </div>
            <div className="route-preview-bottom">
              <div className="preview-route-meta"><span className="preview-route-line" /><span>Route preview</span></div>
              <button onClick={() => navigate('/tracker')} aria-label="Open public tracker"><ArrowUpRight size={18} /></button>
            </div>
          </div>
          <div className="hero-index"><span>TRACKMYBUS</span><span>01 / 03</span></div>
        </section>

        <section className="portal-section" id="about">
          <div className="section-heading">
            <div>
              <div className="section-kicker">ONE NETWORK, THREE WAYS IN</div>
              <h2>Where do you want to go?</h2>
            </div>
            <p>Choose the workspace that fits your trip. Each one keeps the next step simple.</p>
          </div>
          <div className="portal-grid">
            {portals.map((portal) => {
              const Icon = portal.icon;
              return (
                <button key={portal.number} className={`portal-card portal-${portal.tone}`} onClick={() => navigate(portal.path)}>
                  <div className="portal-card-top"><span>{portal.number}</span><Icon size={21} strokeWidth={1.8} /></div>
                  <h3>{portal.title}</h3>
                  <p>{portal.description}</p>
                  <div className="portal-card-action">{portal.action}<ArrowRight size={16} /></div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="how-intro">
            <div className="section-kicker">HOW IT WORKS</div>
            <h2>From the driver’s phone<br />to your next stop.</h2>
            <p>Bus positions depend on a driver sharing GPS. We show the update status so you can judge how current the location is.</p>
            <button className="text-link" onClick={() => navigate('/tracker')}>See the public map <ArrowRight size={16} /></button>
          </div>
          <div className="how-steps">
            {steps.map((step, index) => {
              const Icon = step.icon;
              return (
                <div className="how-step" key={step.title}>
                  <div className="step-icon"><Icon size={19} /></div>
                  <div className="step-copy"><span>STEP 0{index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></div>
                  {index < steps.length - 1 && <ArrowDownRight className="step-arrow" size={19} />}
                </div>
              );
            })}
          </div>
        </section>

        <section className="help-strip" id="contact">
          <div className="help-icon"><CircleHelp size={20} /></div>
          <div><strong>Need access as a driver?</strong><p>Send a registration request. An administrator must approve your bus and route assignment.</p></div>
          <button className="home-button home-button-light" onClick={() => navigate('/driver-register')}>Driver registration <ArrowRight size={16} /></button>
        </section>
      </main>

      <footer className="home-footer">
        <div className="footer-brand"><span className="footer-brand-icon"><BusFront size={17} /></span><span>TrackMyBus</span></div>
        <span>Live locations are shared by active drivers.</span>
        <button onClick={() => navigate('/admin-login')}><UsersRound size={15} /> Fleet administration</button>
      </footer>
    </div>
  );
}
