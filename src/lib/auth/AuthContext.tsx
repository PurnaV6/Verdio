/* ================================================================
   VERD.IO — Password Auth Gate (replaces magic link)
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
export function PasswordGateScreen({ initialMode = 'signin', onBack }: { initialMode?: 'signin' | 'signup'; onBack?: () => void } = {}) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'signin' | 'signup'>(initialMode);
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
    <div className="v2-entry-shell">
      <main className="v2-entry-col is-auth">
        {onBack&&<button type="button" onClick={onBack} className="v2-auth-back">← Back to Verd.io</button>}
        <p className="v2-entry-mark">Verd<i>.</i>io</p>
        <div className="v2-auth-panel">
          <header className="v2-auth-head">
            <p className="v2-eyebrow">VERD.IO DECISION INTELLIGENCE</p>
            <h1 className="v2-entry-title is-compact">{mode === 'signin' ? 'Welcome back' : 'Create your workspace'}</h1>
            <p className="v2-entry-lede">{mode === 'signin' ? 'Sign in to continue to your executive workspace.' : 'Turn your business data into prioritised decisions.'}</p>
          </header>

          <form className="v2-auth-form" noValidate onSubmit={e => { e.preventDefault(); void submit(); }}>
            <div className="v2-auth-field">
              <label htmlFor="auth-email">Work email</label>
              <input id="auth-email" name="email" type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="you@company.com" aria-describedby={error ? 'auth-error' : undefined} className="v2-auth-input" />
            </div>
            <div className="v2-auth-field">
              <label htmlFor="auth-password">Password</label>
              <input id="auth-password" name="password" type="password" autoComplete={mode==='signin' ? 'current-password' : 'new-password'} value={password} onChange={e=>setPassword(e.target.value)} placeholder={mode==='signin' ? 'Your password' : 'At least 6 characters'} aria-describedby={error ? 'auth-error' : undefined} className="v2-auth-input" />
            </div>

            {error && <div id="auth-error" role="alert" className="v2-auth-msg is-error">{error}</div>}
            {info && <div role="status" className="v2-auth-msg is-info">{info}</div>}

            <button type="submit" disabled={loading} className="v2-btn is-block">
              {loading ? 'Please wait...' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>

            <div className="v2-auth-switch">
              <button type="button" onClick={()=>{ setMode(mode==='signin'?'signup':'signin'); setError(''); setInfo(''); }} className="v2-link-button">
                {mode === 'signin' ? "Don't have an account? Create one" : "Already have an account? Sign in"}
              </button>
            </div>
          </form>

          <p className="v2-tag v2-auth-foot">SECURE AUTHENTICATION · PRIVATE BY DESIGN</p>
        </div>
      </main>
    </div>
  );
}
