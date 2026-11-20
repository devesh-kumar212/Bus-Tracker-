import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import Navbar from '../components/Navbar';
import { KeyRound, Loader2, ShieldAlert, CheckCircle2 } from 'lucide-react';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!alive) return;
      if (sessionError || !data.session) setError('This password reset link is invalid or expired. Request a new link.');
      else setReady(true);
    });
    return () => { alive = false; };
  }, []);

  const submit = async (event) => {
    event.preventDefault(); setError(''); setSuccess('');
    if (password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
      setError('Use at least 8 characters with an uppercase letter, lowercase letter, and number.'); return;
    }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess('Password updated. Redirecting to sign in…');
      await supabase.auth.signOut();
      setTimeout(() => navigate('/driver-login', { replace: true }), 900);
    } catch (err) { setError(err.message || 'Could not update your password.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-[#08080f] text-gray-100 flex flex-col">
      <Navbar />
      <main className="flex-grow flex items-center justify-center px-5 py-28">
        <form onSubmit={submit} className="w-full max-w-md rounded-2xl border border-gray-800 bg-[#111118] p-7 shadow-2xl space-y-5">
          <div>
            <KeyRound className="w-8 h-8 text-orange-400 mb-3" />
            <h1 className="text-2xl font-bold">Set a new password</h1>
            <p className="text-sm text-gray-400 mt-2">Choose a strong password for your TrackMyBus account.</p>
          </div>
          {error && <div className="flex gap-2 rounded-lg border border-rose-900 bg-rose-950/40 p-3 text-sm text-rose-300"><ShieldAlert className="w-4 h-4 shrink-0" />{error}</div>}
          {success && <div className="flex gap-2 rounded-lg border border-emerald-900 bg-emerald-950/40 p-3 text-sm text-emerald-300"><CheckCircle2 className="w-4 h-4 shrink-0" />{success}</div>}
          <input type="password" required autoComplete="new-password" placeholder="New password" value={password} onChange={e => setPassword(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-[#0d0d16] px-4 py-3 text-sm outline-none focus:border-orange-500" />
          <input type="password" required autoComplete="new-password" placeholder="Confirm new password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} className="w-full rounded-lg border border-gray-800 bg-[#0d0d16] px-4 py-3 text-sm outline-none focus:border-orange-500" />
          <button type="submit" disabled={!ready || loading} className="w-full rounded-lg bg-orange-500 py-3 text-sm font-bold text-black disabled:opacity-50">
            {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : ready ? 'Update password' : 'Checking reset link…'}
          </button>
          <Link to="/driver-login" className="block text-center text-sm text-gray-400 hover:text-white">Back to driver login</Link>
        </form>
      </main>
    </div>
  );
}
