import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import {
  sendEmailOtp,
  verifyEmailOtp,
  signUpPassenger,
  loginUser,
  requestPasswordReset
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
} from 'lucide-react';

export default function AuthPortal() {
  const navigate = useNavigate();
  const location = useLocation();

  const getRoleConfig = () => {
    switch (location.pathname) {
      case '/driver-login':
        return {
          role: 'driver',
          title: 'Driver Console',
          emoji: '🚍',
          cardAccent: 'border-orange-500',
          focusColor: 'focus:border-orange-500',
          btnGrad: 'bg-orange-500 hover:bg-orange-400',
          stepActive: 'bg-orange-500 text-black',
          desc: 'Sign in with your credentials to start broadcasting route GPS.',
          tag: 'GPS Broadcast'
        };
      case '/passenger-login':
        return {
          role: 'passenger',
          title: 'Passenger Portal',
          emoji: '🧑‍💻',
          cardAccent: 'border-gray-400',
          focusColor: 'focus:border-gray-400',
          btnGrad: 'bg-gray-200 hover:bg-white',
          stepActive: 'bg-gray-200 text-black',
          desc: 'Sign up with Email OTP or log in with password to track city buses.',
          tag: 'Public Access'
        };
      case '/admin-login':
        return {
          role: 'admin',
          title: 'Admin Operations',
          emoji: '🛠️',
          cardAccent: 'border-amber-400',
          focusColor: 'focus:border-amber-400',
          btnGrad: 'bg-amber-400 hover:bg-amber-300',
          stepActive: 'bg-amber-400 text-black',
          desc: 'Access transit management logs, fleet configuration, and complaint systems.',
          tag: 'Full Oversight'
        };
      default:
        return {
          role: 'passenger',
          title: 'Commuter Portal',
          emoji: '🚌',
          cardAccent: 'border-orange-500',
          focusColor: 'focus:border-orange-500',
          btnGrad: 'bg-orange-500 hover:bg-orange-400',
          stepActive: 'bg-orange-500 text-black',
          desc: 'Access your TrackMyBus workspace.',
          tag: 'Access'
        };
    }
  };

  const config = getRoleConfig();

  const [isSignUp, setIsSignUp] = useState(false);
  const [signupStep, setSignupStep] = useState(1);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const digitInputRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resetSending, setResetSending] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  useEffect(() => {
    if (location.pathname === '/passenger-login') {
      navigate('/tracker', { replace: true });
      return;
    }
    setErrorMsg(null);
    setSuccessMsg(null);
    setSignupStep(1);
  }, [isSignUp, location.pathname, navigate]);

  useEffect(() => {
    let interval = null;
    if (isSignUp && signupStep === 2 && resendTimer > 0) {
      interval = setInterval(() => setResendTimer(p => p - 1), 1000);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [isSignUp, signupStep, resendTimer]);

  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    if (value.length > 1) {
      const digits = value.slice(0, 6).split('');
      setOtpDigits([...digits, ...Array(6 - digits.length).fill('')]);
      digitInputRefs[Math.min(digits.length, 5)].current?.focus();
      return;
    }
    const nd = [...otpDigits]; nd[index] = value.slice(-1); setOtpDigits(nd);
    if (value && index < 5) digitInputRefs[index + 1].current?.focus();
  };
  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !otpDigits[index] && index > 0) digitInputRefs[index - 1].current?.focus();
  };
  const handlePaste = (e) => {
    e.preventDefault();
    const p = e.clipboardData.getData('text').trim().replace(/\D/g, '').slice(0, 6);
    if (p.length === 6) { setOtpDigits(p.split('')); digitInputRefs[5].current?.focus(); }
  };

  const handleSendPassengerOtp = async (e) => {
    e.preventDefault(); setErrorMsg(null); setSuccessMsg(null);
    if (!email || !email.includes('@')) { setErrorMsg('Please enter a valid email address.'); return; }
    setSendingOtp(true);
    try {
      await sendEmailOtp(email, { role: 'passenger' });
      setSuccessMsg(`Supabase accepted the OTP request for ${email.trim()}. Check Inbox and Spam. If no email arrives, the project owner must configure custom SMTP in Supabase Auth settings.`);
      setSignupStep(2); setResendTimer(60); setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);
      setTimeout(() => digitInputRefs[0].current?.focus(), 300);
    } catch (err) { setErrorMsg(err.message || 'Failed to send OTP.'); }
    finally { setSendingOtp(false); }
  };

  const handleVerifyPassengerOtp = async (e) => {
    e.preventDefault(); setErrorMsg(null); setSuccessMsg(null);
    const fullOtp = otpDigits.join('');
    if (fullOtp.length !== 6) { setErrorMsg('Please enter the full 6-digit OTP.'); return; }
    setLoading(true);
    try {
      await verifyEmailOtp(email, fullOtp);
      setSuccessMsg('Email verified! Now set your name and password.');
      setSignupStep(3);
    } catch (err) { setErrorMsg(err.message || 'Invalid or expired OTP.'); }
    finally { setLoading(false); }
  };

  const handleCompletePassengerSignup = async (e) => {
    e.preventDefault(); setErrorMsg(null); setSuccessMsg(null);
    if (!name.trim() || !password) { setErrorMsg('Please enter your full name and password.'); return; }
    if (password.length < 6) { setErrorMsg('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await signUpPassenger({ email, password, name });
      setSuccessMsg('Account created! Redirecting to Passenger Dashboard...');
      setTimeout(() => navigate('/passenger'), 1000);
    } catch (err) { setErrorMsg(err.message || 'Signup failed.'); }
    finally { setLoading(false); }
  };

  const handleLoginSubmit = async (e) => {
    e.preventDefault(); setErrorMsg(null); setSuccessMsg(null);
    if (!email || !password) { setErrorMsg('Please enter both email and password.'); return; }
    setLoading(true);
    try {
      if (config.role === 'admin') {
        await loginUser({ email, password, expectedRole: 'admin' });
        setSuccessMsg('Authenticated! Opening Admin Dashboard...');
        setTimeout(() => navigate('/admin/dashboard'), 800);
      } else if (config.role === 'driver') {
        const authRes = await loginUser({ email, password, expectedRole: 'driver' });
        if (authRes.status === 'approved') {
          setSuccessMsg('Authenticated! Opening Driver Console...');
          setTimeout(() => navigate('/driver/dashboard'), 800);
        } else if (authRes.status === 'pending') {
          setErrorMsg('Your account is awaiting admin approval.');
          setTimeout(() => navigate('/driver/pending'), 1000);
        } else if (authRes.status === 'rejected') {
          setErrorMsg('Your driver account has been rejected.');
          setTimeout(() => navigate('/driver/rejected'), 1200);
        } else {
          setErrorMsg(`Account status: "${authRes.status}". Pending review.`);
          setTimeout(() => navigate('/driver/pending'), 1000);
        }
      } else {
        await loginUser({ email, password, expectedRole: 'passenger' });
        setSuccessMsg('Authenticated! Opening Passenger Portal...');
        setTimeout(() => navigate('/passenger'), 800);
      }
    } catch (err) { setErrorMsg(err.message || 'Login failed. Check your credentials.'); }
    finally { setLoading(false); }
  };

  const handleForgotPassword = async () => {
    setErrorMsg(null); setSuccessMsg(null);
    if (!email.trim().includes('@')) { setErrorMsg('Enter your account email first.'); return; }
    setResetSending(true);
    try {
      await requestPasswordReset(email);
      setSuccessMsg('Password reset link sent. Check your email inbox and spam folder.');
    } catch (err) { setErrorMsg(err.message || 'Could not send the password reset link.'); }
    finally { setResetSending(false); }
  };

  /* ── shared input class ───────────────────────────────── */
  const inputCls = `w-full bg-[#0d0d16] border border-gray-800 ${config.focusColor} outline-none rounded-lg px-4 py-3 text-sm text-white placeholder-gray-700 transition-colors mono`;

  return (
    <div className="min-h-screen bg-[#08080f] text-gray-100 flex flex-col overflow-x-hidden relative selection:bg-orange-500 selection:text-black">

      {/* Background */}
      <div className="absolute inset-0 bg-dots opacity-40 pointer-events-none z-0" />
      <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
        <div className="scan-line" style={{ top: '20%', animationDelay: '0s' }} />
        <div className="scan-line" style={{ top: '70%', animationDelay: '3s' }} />
      </div>
      <div className={`absolute top-[15%] right-[10%] w-[40%] h-[40%] rounded-full blur-[180px] pointer-events-none z-0 ${
        config.role === 'admin' ? 'bg-amber-500/5' : 'bg-orange-500/5'
      }`} />

      <Navbar />

      <main className="flex-grow flex items-center justify-center px-6 pt-36 pb-20 z-10 w-full">
        <div className="w-full max-w-md">

          {/* Card */}
          <div className={`bg-[#111118] border border-gray-800/60 border-l-4 ${config.cardAccent} rounded-xl shadow-2xl overflow-hidden`}>
            <div className="p-8">

              {/* Back */}
              <button
                onClick={() => navigate('/')}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-orange-400 mb-7 transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                Back to home
              </button>

              {/* Header */}
              <div className="mb-7">
                <div className="flex items-start justify-between">
                  <div className="text-4xl mb-3">{config.emoji}</div>
                  <span className={`mono text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md ${
                    config.role === 'admin'
                      ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      : config.role === 'driver'
                        ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                        : 'bg-gray-500/10 text-gray-300 border border-gray-600/20'
                  }`}>
                    {config.tag}
                  </span>
                </div>
                <h2 className="text-2xl font-bold text-white">{config.title}</h2>
                <p className="text-xs text-gray-500 mt-1.5 leading-relaxed font-normal">{config.desc}</p>
              </div>

              {/* Sign in / Sign up tab (passenger only) */}
              {config.role === 'passenger' && (
                <div className="grid grid-cols-2 bg-[#0a0a14] p-1 rounded-lg border border-gray-800 mb-6">
                  {['Sign In', 'Sign Up'].map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => { setIsSignUp(idx === 1); setSignupStep(1); }}
                      className={`py-2 rounded-md text-xs font-bold transition-all cursor-pointer ${
                        isSignUp === (idx === 1) ? 'bg-[#1a1a26] text-white shadow' : 'text-gray-600 hover:text-gray-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {/* Alerts */}
              {errorMsg && (
                <div className="flex gap-2.5 p-3.5 bg-red-950/40 border border-red-800/50 rounded-lg text-xs text-red-300 mb-5">
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  {errorMsg}
                </div>
              )}
              {successMsg && (
                <div className="flex gap-2.5 p-3.5 bg-green-950/40 border border-green-800/50 rounded-lg text-xs text-green-300 mb-5">
                  <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0 mt-0.5" />
                  {successMsg}
                </div>
              )}

              {/* ── PASSENGER SIGNUP FLOW ─────────────────── */}
              {config.role === 'passenger' && isSignUp && (
                <>
                  {/* Step indicator */}
                  <div className="flex items-center justify-between mb-6 pb-4 border-b border-gray-800/60 text-xs font-medium text-gray-500">
                    <span className="mono">Email Verification</span>
                    <div className="flex items-center gap-1.5">
                      {[1, 2, 3].map(n => (
                        <span key={n} className={`w-5 h-5 rounded-full text-[10px] flex items-center justify-center mono font-bold ${
                          signupStep >= n ? config.stepActive : 'bg-[#1a1a26] text-gray-600'
                        }`}>{n}</span>
                      ))}
                    </div>
                  </div>

                  {signupStep === 1 && (
                    <form onSubmit={handleSendPassengerOtp} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5" /> Email Address
                        </label>
                        <input type="email" required placeholder="passenger@email.com" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
                      </div>
                      <button type="submit" disabled={sendingOtp} className={`w-full py-3 ${config.btnGrad} text-black font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer mt-2`}>
                        {sendingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
                        Send 6-Digit OTP
                      </button>
                    </form>
                  )}

                  {signupStep === 2 && (
                    <form onSubmit={handleVerifyPassengerOtp} className="space-y-5">
                      <div>
                        <label className="block text-xs font-medium text-gray-500 mb-3 text-center flex items-center justify-center gap-1.5">
                          <KeyRound className="w-3.5 h-3.5" /> 6-Digit code sent to {email}
                        </label>
                        <div className="flex justify-between gap-2" onPaste={handlePaste}>
                          {otpDigits.map((digit, idx) => (
                            <input
                              key={idx}
                              ref={digitInputRefs[idx]}
                              type="text"
                              maxLength={idx === 0 ? 6 : 1}
                              inputMode="numeric"
                              autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                              value={digit}
                              onChange={e => handleDigitChange(idx, e.target.value)}
                              onKeyDown={e => handleKeyDown(idx, e)}
                              className={`w-10 h-12 bg-[#0d0d16] border border-gray-800 ${config.focusColor} outline-none rounded-lg text-center text-lg font-bold mono text-white transition-all`}
                            />
                          ))}
                        </div>
                      </div>
                      <button type="submit" disabled={loading || otpDigits.join('').length !== 6}
                        className={`w-full py-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                          otpDigits.join('').length === 6 ? `${config.btnGrad} text-black` : 'bg-[#1a1a26] text-gray-600 cursor-not-allowed'
                        }`}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Verify OTP
                      </button>
                      <div className="flex items-center justify-between text-xs border-t border-gray-800/60 pt-3">
                        <button type="button" onClick={handleSendPassengerOtp} disabled={!canResend || sendingOtp}
                          className={`flex items-center gap-1.5 transition-colors ${canResend && !sendingOtp ? 'text-orange-400 hover:text-orange-300 cursor-pointer' : 'text-gray-700 cursor-not-allowed'}`}>
                          <RefreshCw className={`w-3.5 h-3.5 ${sendingOtp ? 'animate-spin' : ''}`} />
                          {canResend ? 'Resend OTP' : `Resend in 00:${resendTimer.toString().padStart(2, '0')}`}
                        </button>
                        <button type="button" onClick={() => setSignupStep(1)} className="text-gray-500 hover:text-white underline cursor-pointer">Change Email</button>
                      </div>
                    </form>
                  )}

                  {signupStep === 3 && (
                    <form onSubmit={handleCompletePassengerSignup} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
                          <Award className="w-3.5 h-3.5" /> Full Name
                        </label>
                        <input type="text" required placeholder="Rahul Sharma" className={inputCls} value={name} onChange={e => setName(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
                          <Lock className="w-3.5 h-3.5" /> Create Password
                        </label>
                        <input type="password" required placeholder="••••••••" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} />
                      </div>
                      <button type="submit" disabled={loading} className={`w-full py-3 ${config.btnGrad} text-black font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer mt-2`}>
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                        Create Account
                      </button>
                    </form>
                  )}
                </>
              )}

              {/* ── STANDARD LOGIN FORM ───────────────────── */}
              {(!isSignUp || config.role !== 'passenger') && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" /> Email Address
                    </label>
                    <input type="email" required placeholder="user@email.com" className={inputCls} value={email} onChange={e => setEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" /> Password
                    </label>
                    <input type="password" required placeholder="••••••••" className={inputCls} value={password} onChange={e => setPassword(e.target.value)} />
                  </div>
                  {config.role === 'driver' && (
                    <div className="text-right">
                      <button type="button" onClick={handleForgotPassword} disabled={resetSending}
                        className="text-xs text-orange-400 hover:text-orange-300 disabled:text-gray-600">
                        {resetSending ? 'Sending reset link…' : 'Forgot password?'}
                      </button>
                    </div>
                  )}
                  <button type="submit" disabled={loading}
                    className={`w-full py-3 ${config.btnGrad} text-black font-bold rounded-lg text-xs transition-all flex items-center justify-center gap-2 cursor-pointer mt-4 hover:-translate-y-0.5 hover:shadow-lg`}>
                    {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                    Sign In →
                  </button>
                </form>
              )}

              {/* Driver register prompt */}
              {config.role === 'driver' && (
                <div className="mt-6 pt-4 border-t border-gray-800/60 text-center text-xs text-gray-500">
                  Need a driver account?{' '}
                  <Link to="/driver-register" className="text-orange-400 font-bold hover:underline">
                    Register here
                  </Link>
                </div>
              )}

            </div>
          </div>

          <p className="text-center text-[11px] text-gray-700 mono mt-5">
            TrackMyBus · Supabase Auth · End-to-End Encrypted
          </p>
        </div>
      </main>
    </div>
  );
}
