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
  RefreshCw,
  Phone,
  CreditCard
} from 'lucide-react';

export default function DriverRegister() {
  const navigate = useNavigate();

  // Wizard Step: 1 = Details, 2 = Email OTP verification
  const [step, setStep] = useState(1);
  const [otpVerified, setOtpVerified] = useState(false);

  // Form fields
  const [fullName, setFullName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpDigits, setOtpDigits] = useState(['', '', '', '', '', '']);
  const digitInputRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];
  const [route, setRoute] = useState('');
  const [busNumber, setBusNumber] = useState('');

  // Confirmation email resend cooldown.
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

  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    if (value.length > 1) {
      const pastedDigits = value.slice(0, 6).split('');
      setOtpDigits([...pastedDigits, ...Array(6 - pastedDigits.length).fill('')]);
      digitInputRefs[Math.min(pastedDigits.length, 5)].current?.focus();
      return;
    }
    const nextDigits = [...otpDigits];
    nextDigits[index] = value.slice(-1);
    setOtpDigits(nextDigits);
    if (value && index < 5) digitInputRefs[index + 1].current?.focus();
  };

  const handleKeyDown = (index, event) => {
    if (event.key === 'Backspace' && !otpDigits[index] && index > 0) digitInputRefs[index - 1].current?.focus();
  };

  const handlePaste = (event) => {
    event.preventDefault();
    const pastedDigits = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pastedDigits.length === 6) {
      setOtpDigits(pastedDigits.split(''));
      digitInputRefs[5].current?.focus();
    }
  };

  // Request the email OTP for driver registration.
  const handleSendOtp = async (event) => {
    if (event) event.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    if (!fullName.trim() || !email.trim() || !password || !confirmPassword || !route.trim() || !busNumber.trim()) {
      setErrorMsg('Please fill out all required fields.'); return;
    }
    if (!/^[^\s@]+@gmail\.com$/i.test(email.trim())) {
      setErrorMsg('Enter the driver’s Gmail address (name@gmail.com) to receive the OTP in Gmail.'); return;
    }
    if (password !== confirmPassword) { setErrorMsg('Passwords do not match. Please re-enter your password.'); return; }
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setErrorMsg('Use at least 8 characters with an uppercase letter, lowercase letter, and number.'); return;
    }
    if (!/^\+?[1-9]\d{7,14}$/.test(mobile.replace(/[\s()-]/g, ''))) {
      setErrorMsg('Enter a valid mobile number with country code if needed.'); return;
    }
    if (!licenseNumber.trim()) { setErrorMsg('Enter your driver license number.'); return; }

    setSendingOtp(true);
    try {
      await sendEmailOtp(email, {
        role: 'driver', name: fullName.trim(), mobile: mobile.trim(), license_number: licenseNumber.trim(),
        route: route.trim(), bus_number: busNumber.trim().toUpperCase()
      });
      setStep(2);
      setOtpVerified(false);
      setResendTimer(60);
      setCanResend(false);
      setOtpDigits(['', '', '', '', '', '']);
      setSuccessMsg(`A 6-digit verification code was requested for ${email.trim()}. Check that Gmail inbox and Spam.`);
      setTimeout(() => digitInputRefs[0].current?.focus(), 300);
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message.trim() : '';
      setErrorMsg(message && message !== '{}' ? message : 'Could not send the OTP. Check Supabase Auth logs and SMTP settings.');
    } finally { setSendingOtp(false); }
  };

  // Verify the OTP before creating the pending driver application.
  const handleVerifyOtpAndRegister = async (event) => {
    event.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    const fullOtp = otpDigits.join('');
    if (!otpVerified && !/^\d{6}$/.test(fullOtp)) { setErrorMsg('Enter the complete 6-digit OTP from Gmail.'); return; }
    if (otpVerified && (!password || password !== confirmPassword)) { setErrorMsg('Enter and confirm the password for your driver account.'); return; }
    if (otpVerified && (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password))) {
      setErrorMsg('Use at least 8 characters with an uppercase letter, lowercase letter, and number.'); return;
    }
    setLoading(true);
    try {
      if (!otpVerified) {
        await verifyEmailOtp(email, fullOtp);
        setOtpVerified(true);
      }
      await signUpDriver({
        name: fullName.trim(), mobile: mobile.trim(), licenseNumber: licenseNumber.trim(),
        email: email.trim().toLowerCase(), password, route: route.trim(), busNumber: busNumber.trim().toUpperCase()
      });
      setSuccessMsg('Your registration request has been submitted. Please wait for admin approval.');
      setTimeout(() => navigate('/driver/pending'), 1500);
    } catch (err) {
      const message = typeof err?.message === 'string' ? err.message.trim() : '';
      setErrorMsg(message && message !== '{}' ? message : 'OTP verification or registration failed. Check Supabase Auth and API logs.');
    } finally { setLoading(false); }
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
                  onClick={() => step === 1 && navigate('/driver-login')}
                  disabled={step === 2}
                  className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-white transition-colors duration-200 disabled:cursor-default"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>{step === 2 ? (otpVerified ? 'Email verified' : 'OTP pending') : 'Back to Login'}</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${step === 1 ? 'bg-emerald-500 text-zinc-950' : 'bg-teal-500 text-zinc-950'}`}>
                    {step === 1 ? '1' : '2'}
                  </span>
                  <div className="w-4 h-[1px] bg-zinc-800"></div>
                  <span className={`w-6 h-6 rounded-full text-[10px] font-bold flex items-center justify-center ${step === 2 ? 'bg-emerald-500 text-zinc-950' : 'bg-zinc-800 text-zinc-500'}`}>
                    2
                  </span>
                </div>
              </div>

              {/* Title Header */}
              <div className="mb-6">
                <div className="text-4xl mb-3">{step === 1 ? <Bus className="w-9 h-9 text-emerald-400" /> : <MailCheck className="w-9 h-9 text-emerald-400" />}</div>
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

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-emerald-400" /> Mobile Number
                    </label>
                    <input type="tel" required autoComplete="tel" placeholder="e.g. +91 9876543210"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                      value={mobile} onChange={(e) => setMobile(e.target.value)} />
                  </div>

                  {/* Email */}
                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-emerald-400" /> Email Address
                    </label>
                    <input
                      type="email"
                      required
                      placeholder="e.g. rahul@gmail.com"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-zinc-400 mb-1.5 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-emerald-400" /> Driver License Number
                    </label>
                    <input type="text" required autoComplete="off" placeholder="Enter your license number"
                      className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-600 transition-colors"
                      value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
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
                        placeholder="e.g. College to Bus Stand"
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
                        placeholder="Enter password"
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
                        placeholder="Enter password"
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
                    <span>Send 6-Digit OTP</span>
                  </button>
                </form>
              )}

              {/* STEP 2: Verify OTP and submit driver application */}
              {step === 2 && (
                <form onSubmit={handleVerifyOtpAndRegister} className="space-y-6">
                  {!otpVerified ? (
                    <div>
                      <label className="block text-xs font-semibold text-zinc-400 mb-3 text-center flex items-center justify-center gap-1.5">
                        <MailCheck className="w-3.5 h-3.5 text-emerald-400" /> Enter the 6-digit code sent to Gmail
                      </label>
                      <div className="flex justify-between gap-2" onPaste={handlePaste}>
                        {otpDigits.map((digit, idx) => (
                          <input key={idx} ref={digitInputRefs[idx]} type="text" maxLength={idx === 0 ? 6 : 1}
                            pattern="[0-9]*" inputMode="numeric" autoComplete={idx === 0 ? 'one-time-code' : 'off'}
                            value={digit} onChange={(event) => handleDigitChange(idx, event.target.value)}
                            onKeyDown={(event) => handleKeyDown(idx, event)}
                            className="w-11 h-13 sm:w-12 sm:h-14 bg-zinc-950 border border-zinc-800 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none rounded-xl text-center text-xl font-bold font-mono text-white transition-all" />
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl border border-emerald-900/70 bg-emerald-950/30 p-3 text-xs text-emerald-300">
                        <CheckCircle2 className="inline w-4 h-4 mr-2" /> Email verified. Submit the driver application for admin review.
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input type="password" required autoComplete="new-password" placeholder="Enter password" value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-500" />
                        <input type="password" required autoComplete="new-password" placeholder="Confirm password" value={confirmPassword}
                          onChange={(event) => setConfirmPassword(event.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 focus:border-emerald-500 outline-none rounded-xl px-4 py-3 text-xs text-white placeholder-zinc-500" />
                      </div>
                    </>
                  )}
                  <button type="submit" disabled={loading || (!otpVerified && otpDigits.join('').length !== 6)}
                    className="w-full py-3.5 rounded-xl text-xs font-bold bg-gradient-to-r from-emerald-500 to-teal-500 text-zinc-950 flex items-center justify-center gap-2 disabled:opacity-50">
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                    {otpVerified ? 'Submit Driver Registration' : 'Verify OTP & Submit Registration'}
                  </button>
                  {!otpVerified && (
                    <div className="flex justify-between pt-2 text-xs border-t border-zinc-800/80">
                      <button type="button" onClick={handleSendOtp} disabled={!canResend || sendingOtp}
                        className={`flex items-center gap-1.5 ${canResend && !sendingOtp ? 'text-emerald-400 hover:text-emerald-300 font-semibold' : 'text-zinc-600 cursor-not-allowed'}`}>
                        {sendingOtp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                        {canResend ? 'Resend code' : `Resend in 00:${resendTimer.toString().padStart(2, '0')}`}
                      </button>
                    </div>
                  )}
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
