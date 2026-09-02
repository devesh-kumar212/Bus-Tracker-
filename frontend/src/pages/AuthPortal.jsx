import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { 
  sendEmailOtp, 
  verifyEmailOtp, 
  signUpPassenger, 
  loginUser 
} from '../services/authService';
import { 
  ArrowLeft, 
  Loader2, 
  Lock, 
  User, 
  CheckCircle2, 
  ShieldAlert, 
  Award, 
  KeyRound, 
  RefreshCw, 
  MailCheck,
  Mail
} from 'lucide-react';

export default function AuthPortal() {
  const navigate = useNavigate();
  const location = useLocation();

  // Auth portal configuration depending on URL pathname
  const getRoleConfig = () => {
    switch (location.pathname) {
      case '/driver-login':
        return {
          role: 'driver',
          title: 'Driver Console',
          emoji: '🚍',
          accent: 'from-emerald-500 to-teal-600',
          desc: 'Sign in with your Email & Password to start route shifts.'
        };
      case '/passenger-login':
        return {
          role: 'passenger',
          title: 'Passenger Portal',
          emoji: '🧑‍💻',
          accent: 'from-teal-400 to-cyan-500',
          desc: 'Sign up with Email OTP or log in with password to track city buses in real-time.'
        };
      case '/admin-login':
        return {
          role: 'admin',
          title: 'Admin Operations',
          emoji: '🛠️',
          accent: 'from-cyan-500 to-blue-600',
          desc: 'Access transit management logs, fleet configuration, and complaint systems.'
        };
      default:
        return {
          role: 'passenger',
          title: 'Commuter Portal',
          emoji: '🚌',
          accent: 'from-emerald-500 to-teal-500',
          desc: 'Access your Bus Tracker workspace.'
        };
    }
  };

  const config = getRoleConfig();

  // Form Mode & Step state
  const [isSignUp, setIsSignUp] = useState(false);
  
  // Multi-step signup flow for Passenger:
  // Step 1: Email Input
  // Step 2: 6-Digit OTP Verification
  // Step 3: Enter Full Name & Password
  const [signupStep, setSignupStep] = useState(1);

  // Input states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  // OTP 6-Digit Array state
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const digitInputRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  // Resend OTP countdown timer
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Clear errors when toggling tabs or routes & redirect /passenger-login to public tracker
  useEffect(() => {
    if (location.pathname === '/passenger-login') {
      navigate('/tracker', { replace: true });
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setSignupStep(1);
  }, [isSignUp, location.pathname, navigate]);

  // Countdown timer for OTP step
  useEffect(() => {
    let interval = null;
    if (isSignUp && signupStep === 2 && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [isSignUp, signupStep, resendTimer]);

  // Handle digit box changes
  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...otpDigits];
    newDigits[index] = value.slice(-1);
    setOtpDigits(newDigits);

    if (value && index < 5) {
      digitInputRefs[index + 1].current?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) {
      digitInputRefs[index - 1].current?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').trim().replace(/\D/g, '').slice(0, 6);
    if (pastedData.length === 6) {
      setOtpDigits(pastedData.split(''));
      digitInputRefs[5].current?.focus();
    }
  };

  // STEP 1: Send OTP to Passenger Email
  const handleSendPassengerOtp = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email || !email.includes('@')) {
      setErrorMsg('Please enter a valid email address.');
      return;
    }

    setSendingOtp(true);
    try {
      await sendEmailOtp(email);
      setSuccessMsg(`6-digit OTP sent to ${email.trim()}. Check your inbox.`);
      setSignupStep(2);
      setResendTimer(60);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);

      setTimeout(() => {
        digitInputRefs[0].current?.focus();
      }, 300);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to send OTP code. Please try again.');
    } finally {
      setSendingOtp(false);
    }
  };

  // STEP 2: Verify OTP
  const handleVerifyPassengerOtp = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) {
      setErrorMsg('Please enter the full 6-digit OTP code.');
      return;
    }

    setLoading(true);
    try {
      await verifyEmailOtp(email, fullOtp);
      setSuccessMsg('Email OTP Verified! Now set your name and password.');
      setSignupStep(3);
    } catch (err) {
      setErrorMsg(err.message || 'Invalid or expired OTP code.');
    } finally {
      setLoading(false);
    }
  };

  // STEP 3: Complete Passenger Account Creation with Supabase Auth
  const handleCompletePassengerSignup = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!name.trim() || !password) {
      setErrorMsg('Please enter your full name and password.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setLoading(true);
    try {
      await signUpPassenger({
        email,
        password,
        name
      });

      setSuccessMsg('Account registered successfully! Redirecting to Passenger Dashboard...');
      setTimeout(() => {
        navigate('/passenger');
      }, 1000);
    } catch (err) {
      setErrorMsg(err.message || 'Failed to complete signup with Supabase Auth.');
    } finally {
      setLoading(false);
    }
  };

  // Standard Login Handler (Supabase Auth signInWithPassword)
  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!email || !password) {
      setErrorMsg('Please enter both email and password.');
      return;
    }

    setLoading(true);

    try {
      if (config.role === 'admin') {
        // Authenticate Admin
        const authRes = await loginUser({ email, password, expectedRole: 'admin' });
        setSuccessMsg('Authenticated! Opening Admin Operations Dashboard...');
        setTimeout(() => navigate('/admin/dashboard'), 800);

      } else if (config.role === 'driver') {
        // Authenticate Driver
        const authRes = await loginUser({ email, password, expectedRole: 'driver' });
        
        // Driver status gatekeeper check
        if (authRes.status === 'approved') {
          setSuccessMsg('Driver Authenticated! Opening Driver Console...');
          setTimeout(() => navigate('/driver/dashboard'), 800);
        } else if (authRes.status === 'pending') {
          setErrorMsg('Your account is waiting for admin approval.');
          setTimeout(() => navigate('/driver/pending'), 1000);
        } else if (authRes.status === 'rejected') {
          setErrorMsg('Your driver account has been rejected. Please contact the administrator.');
          setTimeout(() => navigate('/driver/rejected'), 1200);
        } else {
          setErrorMsg(`Account status: "${authRes.status}". Pending admin review.`);
          setTimeout(() => navigate('/driver/pending'), 1000);
        }

      } else {
        // Authenticate Passenger
        const authRes = await loginUser({ email, password, expectedRole: 'passenger' });
        setSuccessMsg('Authenticated! Opening Passenger Portal...');
        setTimeout(() => navigate('/passenger'), 800);
      }
    } catch (err) {
      setErrorMsg(err.message || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-100 flex flex-col justify-between overflow-x-hidden font-sans relative">
      <div className="absolute top-[20%] left-[5%] w-[45%] h-[45%] bg-emerald-500/10 rounded-full blur-[160px] pointer-events-none"></div>
      <div className="absolute bottom-[10%] right-[10%] w-[45%] h-[45%] bg-teal-500/10 rounded-full blur-[160px] pointer-events-none"></div>

      <Navbar />

      <main className="flex-grow flex items-center justify-center px-6 pt-36 pb-20 z-10 w-full">
        <div className="w-full max-w-md relative">

          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl blur-2xl opacity-15 pointer-events-none"></div>

          <div className="relative bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden">

            <div className={`absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r ${config.accent}`}></div>

            <div className="p-8">
              {/* Back button */}
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white mb-6 transition-colors duration-200 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to home</span>
              </button>

              {/* Title Header */}
              <div className="mb-6">
                <div className="text-4xl mb-3">{config.emoji}</div>
                <h2 className="text-2xl font-black text-white">
                  {config.title}
                </h2>
                <p className="text-xs text-zinc-400 mt-1.5 font-normal leading-relaxed">
                  {config.desc}
                </p>
              </div>

              {/* Tab Selector Toggle (For Passenger Portal) */}
              {config.role === 'passenger' && (
                <div className="grid grid-cols-2 bg-zinc-950/80 p-1 rounded-xl border border-zinc-800 mb-6">
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(false); setSignupStep(1); }}
                    className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${!isSignUp ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Sign In
                  </button>
                  <button
                    type="button"
                    onClick={() => { setIsSignUp(true); setSignupStep(1); }}
                    className={`py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${isSignUp ? 'bg-zinc-800 text-white shadow' : 'text-zinc-500 hover:text-zinc-300'}`}
                  >
                    Sign Up with OTP
                  </button>
                </div>
              )}

              {/* Alerts Banners */}
              {errorMsg && (
                <div className="flex gap-2.5 p-3.5 bg-rose-950/50 border border-rose-800/60 rounded-xl text-xs text-rose-300 mb-5">
                  <ShieldAlert className="w-4.5 h-4.5 text-rose-400 shrink-0 mt-0.5" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {successMsg && (
                <div className="flex gap-2.5 p-3.5 bg-emerald-950/50 border border-emerald-800/65 rounded-xl text-xs text-emerald-300 mb-5">
                  <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
                  <span>{successMsg}</span>
                </div>
              )}

              {/* ------------------------------------------------------------ */}
              {/* PASSENGER SIGNUP MULTI-STEP FLOW */}
              {/* ------------------------------------------------------------ */}
              {config.role === 'passenger' && isSignUp && (
                <>
                  {/* Step Indicator Header */}
                  <div className="flex items-center justify-between mb-5 pb-3 border-b border-zinc-800/80 text-xs font-semibold text-zinc-400">
                    <span>Passenger Email Verification</span>
                    <div className="flex items-center gap-1.5">
                      <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${signupStep >= 1 ? 'bg-emerald-500 text-zinc-950 font-bold' : 'bg-zinc-800'}`}>1</span>
                      <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${signupStep >= 2 ? 'bg-emerald-500 text-zinc-950 font-bold' : 'bg-zinc-800'}`}>2</span>
                      <span className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center ${signupStep >= 3 ? 'bg-emerald-500 text-zinc-950 font-bold' : 'bg-zinc-800'}`}>3</span>
                    </div>
                  </div>

                  {/* Step 1: Enter Email & Request OTP */}
                  {signupStep === 1 && (
                    <form onSubmit={handleSendPassengerOtp} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-emerald-400" /> Email Address
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="e.g. passenger@email.com"
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={sendingOtp}
                        className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer mt-4"
                      >
                        {sendingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
                        <span>Send 6-Digit OTP</span>
                      </button>
                    </form>
                  )}

                  {/* Step 2: Enter 6-Digit OTP Code */}
                  {signupStep === 2 && (
                    <form onSubmit={handleVerifyPassengerOtp} className="space-y-5">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-3 text-center flex items-center justify-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5 text-emerald-400" /> Enter 6-Digit Verification Code sent to {email}
                        </label>

                        <div className="flex justify-between gap-1.5" onPaste={handlePaste}>
                          {otpDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              ref={digitInputRefs[idx]}
                              type="text"
                              maxLength={1}
                              value={digit}
                              onChange={(e) => handleDigitChange(idx, e.target.value)}
                              onKeyDown={(e) => handleKeyDown(idx, e)}
                              className="w-10 h-12 bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none rounded-xl text-center text-lg font-bold font-mono text-white transition-all"
                            />
                          ))}
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={loading || otpDigits.join('').length !== 6}
                        className={`w-full py-3.5 rounded-xl text-xs font-bold transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer ${
                          otpDigits.join('').length === 6
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950'
                            : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
                        }`}
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        <span>Verify OTP Code</span>
                      </button>

                      <div className="flex items-center justify-between pt-2 text-xs border-t border-zinc-800/80">
                        <button
                          type="button"
                          onClick={handleSendPassengerOtp}
                          disabled={!canResend || sendingOtp}
                          className={`flex items-center gap-1.5 transition-colors ${
                            canResend && !sendingOtp
                              ? 'text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer'
                              : 'text-zinc-600 cursor-not-allowed'
                          }`}
                        >
                          <RefreshCw className={`w-3.5 h-3.5 ${sendingOtp ? 'animate-spin' : ''}`} />
                          <span>{canResend ? 'Resend OTP' : `Resend in 00:${resendTimer.toString().padStart(2, '0')}`}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setSignupStep(1)}
                          className="text-zinc-400 hover:text-white underline cursor-pointer"
                        >
                          Change Email
                        </button>
                      </div>
                    </form>
                  )}

                  {/* Step 3: Enter Full Name & Create Password */}
                  {signupStep === 3 && (
                    <form onSubmit={handleCompletePassengerSignup} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5 text-emerald-400" /> Full Name
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="e.g. Rahul Sharma"
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5 text-emerald-400" /> Create Password
                        </label>
                        <input
                          type="password"
                          required
                          placeholder="••••••••"
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer mt-4"
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        <span>Create Supabase Account</span>
                      </button>
                    </form>
                  )}
                </>
              )}

              {/* ------------------------------------------------------------ */}
              {/* STANDARD SIGN IN FORM (PASSENGER / DRIVER / ADMIN LOGIN) */}
              {/* ------------------------------------------------------------ */}
              {(!isSignUp || config.role !== 'passenger') && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-400" /> Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. user@email.com"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5 text-emerald-400" /> Password
                    </label>
                    <input
                      type="password"
                      required
                      placeholder="••••••••"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className={`w-full py-3.5 bg-gradient-to-r ${config.accent} text-zinc-950 font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer mt-6`}
                  >
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>Sign In</span>
                  </button>
                </form>
              )}

              {/* Driver Registration Prompt Footer */}
              {config.role === 'driver' && (
                <div className="mt-6 pt-4 border-t border-zinc-800/80 text-center text-xs text-zinc-400">
                  Need a driver account?{' '}
                  <Link to="/driver-register" className="text-emerald-400 font-bold hover:underline">
                    Register here with Email OTP
                  </Link>
                </div>
              )}

            </div>

          </div>
        </div>
      </main>

      <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-zinc-900/80 text-center text-[11px] text-zinc-500 font-normal z-10">
        Bus Tracker Telemetry &middot; Powered by Supabase Auth & Email Verification
      </footer>
    </div>
  );
}
