import { useState, useEffect, useRef } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { sendEmailOtp, verifyEmailOtp, signUpDriver } from '../services/authService';
import { 
  ArrowLeft, 
  Loader2, 
  Lock, 
  User, 
  CheckCircle2, 
  ShieldAlert, 
  Award, 
  Bus, 
  MapPin, 
  MailCheck, 
  KeyRound, 
  RefreshCw
} from 'lucide-react';

export default function DriverRegister() {
  const navigate = useNavigate();

  // Wizard Step: 1 = Details, 2 = Email OTP Verification
  const [step, setStep] = useState(1);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [route, setRoute] = useState('');
  const [busNumber, setBusNumber] = useState('');

  // Interactive OTP 6-Digit Array State
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const digitInputRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  // Resend Countdown Timer (60s)
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Timer countdown effect for step 2
  useEffect(() => {
    let interval = null;
    if (step === 2 && resendTimer > 0) {
      interval = setInterval(() => {
        setResendTimer((prev) => prev - 1);
      }, 1000);
    } else if (resendTimer === 0) {
      setCanResend(true);
    }
    return () => clearInterval(interval);
  }, [step, resendTimer]);

  // Handle digit box changes
  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;

    if (value.length > 1) {
      const pastedDigits = value.slice(0, 6).split('');
      setOtpDigits([...pastedDigits, ...Array(6 - pastedDigits.length).fill('')]);
      digitInputRefs[Math.min(pastedDigits.length, 5)].current?.focus();
      return;
    }

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

  // Step 1: Send OTP to Driver Email
  const handleSendOtp = async (e) => {
    if (e) e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    // Form validations
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword || !route.trim() || !busNumber.trim()) {
      setErrorMsg('Please fill out all required fields.');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match. Please re-enter your password.');
      return;
    }

    if (password.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }

    setSendingOtp(true);

    try {
      const otpResult = await sendEmailOtp(email);

      setSuccessMsg(otpResult.developmentFallback
        ? `Email service is unavailable. Local development verification code: ${otpResult.developmentOtp}`
        : `Verification 6-digit OTP code sent to ${email.trim()}. Check your email inbox.`);
      setStep(2);
      setResendTimer(60);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);

      setTimeout(() => {
        digitInputRefs[0].current?.focus();
      }, 300);

    } catch (err) {
      setErrorMsg(err.message || 'Error sending verification OTP email.');
    } finally {
      setSendingOtp(false);
    }
  };

  // Step 2: Verify OTP & Complete Driver Registration in Supabase Auth & DB
  const handleVerifyOtpAndRegister = async (e) => {
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
      // 1. Verify OTP with backend Gmail service
      const verification = await verifyEmailOtp(email, fullOtp);

      // 2. Register Driver in Supabase Auth & create profiles + drivers records with status: "pending"
      await signUpDriver({
        name: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
        route: route.trim(),
        busNumber: busNumber.trim().toUpperCase(),
        verificationToken: verification.verificationToken
      });

      // 3. Show required success banner
      setSuccessMsg('Your registration request has been submitted. Please wait for admin approval.');

      // 4. Redirect to Pending Approval page
      setTimeout(() => {
        navigate('/driver/pending');
      }, 1500);

    } catch (err) {
      setErrorMsg(err.message || 'Verification or registration failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#080c14] text-zinc-100 flex flex-col justify-between overflow-x-hidden font-sans relative">
      <div className="absolute top-[15%] left-[5%] w-[45%] h-[45%] bg-emerald-500/10 rounded-full blur-[160px] pointer-events-none"></div>
      <div className="absolute bottom-[10%] right-[10%] w-[45%] h-[45%] bg-teal-500/10 rounded-full blur-[160px] pointer-events-none"></div>

      <Navbar />

      <main className="flex-grow flex items-center justify-center px-6 pt-36 pb-20 z-10 w-full">
        <div className="w-full max-w-lg relative">

          <div className="absolute inset-0 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-3xl blur-2xl opacity-15 pointer-events-none"></div>

          <div className="relative bg-zinc-900/60 backdrop-blur-xl border border-zinc-800/80 rounded-3xl shadow-2xl overflow-hidden">

            {/* Top progress accent bar */}
            <div className="h-1 w-full bg-zinc-950 relative">
              <div 
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-cyan-400 transition-all duration-500"
                style={{ width: step === 1 ? '50%' : '100%' }}
              ></div>
            </div>

            <div className="p-8">
              {/* Interactive Step Indicator Header */}
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-zinc-800/80">
                <button
                  onClick={() => step === 2 ? setStep(1) : navigate('/driver-login')}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors duration-200 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{step === 2 ? 'Back to Details' : 'Back to Login'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${step === 1 ? 'bg-emerald-500 text-zinc-950' : 'bg-teal-500 text-zinc-950'}`}>
                    {step === 1 ? '1' : '✓'}
                  </span>
                  <div className="w-4 h-[1px] bg-zinc-800"></div>
                  <span className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${step === 2 ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 text-zinc-500'}`}>
                    2
                  </span>
                </div>
              </div>

              {/* Title Header */}
              <div className="mb-6">
                <div className="text-4xl mb-3">{step === 1 ? '🚍' : '📧'}</div>
                <h2 className="text-2xl font-black text-white">
                  {step === 1 ? 'Driver Registration' : 'Email OTP Verification'}
                </h2>
                <p className="text-xs text-zinc-400 mt-1.5 font-normal leading-relaxed">
                  {step === 1 
                    ? 'Submit your details to request access to the Bus Tracker Driver Console.'
                    : `We sent a 6-digit verification code to ${email}`}
                </p>
              </div>

              {/* Status Banner Messages */}
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

              {/* STEP 1: Registration Form Details */}
              {step === 1 && (
                <form onSubmit={handleSendOtp} className="space-y-4">
                  {/* Full Name */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <Award className="w-3.5 h-3.5 text-emerald-400" /> Full Name
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Rahul Sharma"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                    />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-400" /> Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. rahul@example.com"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  {/* Route and Bus Number Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5 text-emerald-400" /> Assigned Route
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. College → Bus Stand"
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                        value={route}
                        onChange={(e) => setRoute(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                        <Bus className="w-3.5 h-3.5 text-emerald-400" /> Bus Number
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. BUS-101"
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                        value={busNumber}
                        onChange={(e) => setBusNumber(e.target.value)}
                      />
                    </div>
                  </div>

                  {/* Password Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                        <Lock className="w-3.5 h-3.5 text-emerald-400" /> Confirm Password
                      </label>
                      <input
                        type="password"
                        required
                        placeholder="••••••••"
                        className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={sendingOtp}
                    className="w-full py-3.5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-zinc-950 font-bold rounded-xl text-xs transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer mt-6"
                  >
                    {sendingOtp ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
                    <span>Send Verification Code</span>
                  </button>
                </form>
              )}

              {/* STEP 2: Email OTP Verification */}
              {step === 2 && (
                <form onSubmit={handleVerifyOtpAndRegister} className="space-y-6">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-3 text-center flex items-center justify-center gap-1.5">
                      <KeyRound className="w-3.5 h-3.5 text-emerald-400" /> Enter 6-Digit OTP Code
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
                          onChange={(e) => handleDigitChange(idx, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(idx, e)}
                          className="w-11 h-13 sm:w-12 sm:h-14 bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none rounded-xl text-center text-xl font-bold font-mono text-white transition-all"
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
                    <span>Verify Code & Submit Registration</span>
                  </button>

                  <div className="flex items-center justify-between pt-2 text-xs border-t border-zinc-800/80">
                    <button
                      type="button"
                      onClick={handleSendOtp}
                      disabled={!canResend || sendingOtp}
                      className={`flex items-center gap-1.5 transition-colors ${
                        canResend && !sendingOtp
                          ? 'text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer'
                          : 'text-zinc-600 cursor-not-allowed'
                      }`}
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${sendingOtp ? 'animate-spin' : ''}`} />
                      <span>{canResend ? 'Resend OTP Code' : `Resend in 00:${resendTimer.toString().padStart(2, '0')}`}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep(1)}
                      className="text-zinc-400 hover:text-white underline cursor-pointer"
                    >
                      Edit Details
                    </button>
                  </div>
                </form>
              )}

              <div className="mt-6 pt-4 border-t border-zinc-800/80 text-center text-xs text-zinc-400">
                Already registered?{' '}
                <Link to="/driver-login" className="text-emerald-400 hover:underline font-bold">
                  Sign in here
                </Link>
              </div>

            </div>

          </div>
        </div>
      </main>

      <footer className="w-full max-w-7xl mx-auto px-6 py-6 border-t border-zinc-900/80 text-center text-[11px] text-zinc-500 font-normal z-10">
        Bus Tracker Telemetry &middot; Driver Verification Portal
      </footer>
    </div>
  );
}
