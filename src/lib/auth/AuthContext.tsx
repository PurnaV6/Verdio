/* ================================================================
   VERDIO — Password Auth Gate (replaces magic link)
   Features: Email + Password Sign in / Sign up, mandatory before upload
   Drop in: src/lib/auth/AuthContext.tsx (overwrite)
   ================================================================ */

import React, { createContext, useContext, useEffect, useState } from 'react';
import { getSupabase, isSupabaseEnabled } from './supabaseClient';

type AuthState = {
  user: any | null;
  loading: boolean;
  signOut: () => Promise<void>;
  isEnabled: boolean;
};

const Ctx = createContext<AuthState>({ user: null, loading: false, signOut: async () => {}, isEnabled: false });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<any | null>(null);
  const [loading, setLoading] = useState(isSupabaseEnabled);

  useEffect(() => {
    const sb = getSupabase();
    if (!sb) { setLoading(false); return; }
    sb.auth.getSession().then(({ data }) => {
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    const sb = getSupabase();
    if (sb) await sb.auth.signOut();
    setUser(null);
  };

  return <Ctx.Provider value={{ user, loading, signOut, isEnabled: isSupabaseEnabled }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }

// Small header badge / user pill (kept for header)
export function LoginButton() {
  const { user, isEnabled, signOut } = useAuth();
  if (!isEnabled) return <span className="text-[10px] px-2 py-1 rounded-full bg-amber-100 text-amber-700 border border-amber-200 font-bold">Auth: Local Mode</span>;
  if (!user) return null;
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="text-slate-500 truncate max-w-[140px] hidden md:block">{user.email}</span>
      <button onClick={signOut} className="px-3 py-1.5 rounded-full border border-slate-200 font-bold hover:bg-slate-50">Sign out</button>
    </div>
  );
}

/* Full page password gate */
export function PasswordGateScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const submit = async () => {
    setError(''); setInfo('');
    if (!email.includes('@')) { setError('Enter a valid email'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters'); return; }
    setLoading(true);
    const sb = getSupabase();
    if (!sb) { setError('Supabase not configured. Check .env'); setLoading(false); return; }

    try {
      if (mode === 'signin') {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;
        // If email confirmation is disabled, user will be signed in immediately
        // If enabled, they need to confirm email
        if (data.user && !data.session) {
          setInfo('Account created. Check your email to confirm, then sign in.');
          setMode('signin');
        }
      }
    } catch (e: any) {
      setError(e.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F7FB] flex items-center justify-center p-8">
      <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 shadow-xl p-10">
        <div className="text-center mb-8">
          <div className="mx-auto mb-5 h-14 w-14 rounded-2xl bg-[#0F172A] flex items-center justify-center shadow-lg">
            <span className="text-[#22C55E] font-black text-xl">V</span>
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-[#0F172A]">{mode === 'signin' ? 'Sign in to Verdio' : 'Create your Verdio account'}</h1>
          <p className="text-sm text-slate-500 mt-2 leading-6">{mode === 'signin' ? 'Welcome back. Sign in to continue to your decision intelligence workspace.' : 'Start analyzing your business data in seconds.'}</p>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1.5 block">Work email</label>
            <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/10 bg-slate-50" />
          </div>
          <div>
            <label className="text-xs font-bold text-slate-700 mb-1.5 block">Password</label>
            <input type="password" value={password} onChange={e=>setPassword(e.target.value)} onKeyDown={e=> e.key==='Enter' && submit()} placeholder={mode==='signin' ? 'Your password' : 'At least 6 characters'} className="w-full px-4 py-3 rounded-xl border border-slate-300 text-sm focus:outline-none focus:border-[#16A34A] focus:ring-2 focus:ring-[#16A34A]/10 bg-slate-50" />
          </div>

          {error && <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-2.5 text-xs text-red-700">{error}</div>}
          {info && <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-2.5 text-xs text-emerald-700">{info}</div>}

          <button onClick={submit} disabled={loading} className="w-full py-3 bg-[#0F172A] hover:bg-black text-white rounded-xl text-sm font-bold transition-all disabled:opacity-50">
            {loading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
          </button>

          <div className="text-center pt-2">
            <button onClick={()=>{ setMode(mode==='signin'?'signup':'signin'); setError(''); setInfo(''); }} className="text-xs font-semibold text-slate-500 hover:text-[#0F172A]">
              {mode === 'signin' ? "Don't have an account? Create one" : "Already have an account? Sign in"}
            </button>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">Secure authentication · Your data stays private</p>
        </div>
      </div>
    </div>
  );
}
