'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Delete, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useStore } from '@/lib/store';

type Mode = 'pick' | 'pin' | 'email';

export function LoginScreen() {
  const store = useStore();
  const [mode, setMode] = useState<Mode>('pick');
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const user = store.users.find((u) => u.id === userId);

  function enterDigit(digit: string) {
    setError('');
    const next = `${pin}${digit}`.slice(0, 4);
    if (next.length === 4 && !store.signInWithPin(userId, next)) {
      setError('Wrong PIN. Try again.');
      setPin('');
      return;
    }
    setPin(next);
  }

  // A keyboard works too: digits, Backspace, Escape.
  useEffect(() => {
    if (mode !== 'pin') return;
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) enterDigit(event.key);
      else if (event.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (event.key === 'Escape') { setMode('pick'); setPin(''); setError(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password.');
    if (!store.signIn(email, password)) return setError('Invalid credentials. Check the email and password and try again.');
    setError('');
  }

  return (
    <div className="login-layout">
      <aside className="login-left">
        <div className="login-brand">
          <span className="login-brand-icon" aria-hidden="true">CF</span>
          <div>
            <div className="login-brand-name">Chocolate Factory</div>
            <div className="login-brand-sub">Production workspace</div>
          </div>
        </div>
        <div className="login-left-body">
          <div className="login-badge"><span className="login-badge-dot" aria-hidden="true" />Factory access</div>
          <h1 className="login-headline">Record every station from beans to bars.</h1>
          <p className="login-desc">Tap your name, enter your PIN, and your work is waiting.</p>
          <ul className="login-features">
            <li><strong>Weigh · save · move on</strong><span>Enter what the scale shows. The balance is checked while you type.</span></li>
            <li><strong>Traceable batches</strong><span>Every lot, station and correction stays on record with who entered it.</span></li>
          </ul>
        </div>
        <div className="login-left-footer">
          <ShieldCheck size={13} aria-hidden="true" />
          <span>Shared devices sign out after {store.idleMinutes || 'no'} minutes without use</span>
        </div>
      </aside>

      <main className="login-right">
        <div className="login-form-area">
          <div className="login-form-card" style={{ maxWidth: mode === 'pick' ? 560 : 440 }}>
            <div className="login-mobile-brand"><span className="login-brand-icon is-light" aria-hidden="true">CF</span><span className="login-mobile-wordmark">Chocolate Factory</span></div>

            {mode === 'pick' && (
              <>
                <div className="login-form-header">
                  <div className="login-form-eyebrow">Quick sign in</div>
                  <h2 className="login-form-title">Who is recording?</h2>
                  <p className="login-form-subtitle">Tap your name, then enter your 4-digit PIN.</p>
                </div>
                <div className="user-grid">
                  {store.users.map((u) => (
                    <button key={u.id} type="button" className="user-tile" onClick={() => { setUserId(u.id); setPin(''); setError(''); setMode('pin'); }} aria-label={`Sign in as ${u.name}`}>
                      <span className="avatar">{u.initials}</span>
                      <span className="user-tile-name">{u.name}</span>
                      <span className="user-tile-role">{u.role}</span>
                    </button>
                  ))}
                </div>
                <div className="login-links">
                  <button type="button" className="login-link" onClick={() => { setMode('email'); setError(''); }}>Sign in with email and password</button>
                  <span className="login-link is-muted">Demo PIN for every account: <strong>1234</strong></span>
                </div>
              </>
            )}

            {mode === 'pin' && user && (
              <>
                <button type="button" className="login-link inline-flex min-h-[44px] items-center gap-1" onClick={() => { setMode('pick'); setPin(''); setError(''); }}><ArrowLeft size={15} /> Not {user.name.split(' ')[0]}?</button>
                <div className="login-form-header mt-2 text-center">
                  <span className="avatar mx-auto" style={{ width: 56, height: 56, fontSize: 17 }}>{user.initials}</span>
                  <h2 className="login-form-title mt-3">Hi {user.name.split(' ')[0]}</h2>
                  <p className="login-form-subtitle">Enter your PIN</p>
                </div>
                <div className="pin-dots" aria-label={`${pin.length} of 4 digits entered`}>
                  {[0, 1, 2, 3].map((i) => <span key={i} className={`pin-dot ${i < pin.length ? 'is-filled' : ''}`} />)}
                </div>
                {error && <div className="login-error text-center" role="alert">{error}</div>}
                <div className="pin-pad">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" className="pin-key" onClick={() => enterDigit(d)}>{d}</button>)}
                  <button type="button" className="pin-key is-muted" onClick={() => { setMode('pick'); setPin(''); setError(''); }}>Back</button>
                  <button type="button" className="pin-key" onClick={() => enterDigit('0')}>0</button>
                  <button type="button" className="pin-key is-muted" onClick={() => setPin((p) => p.slice(0, -1))} aria-label="Delete last digit"><Delete size={20} className="mx-auto" /></button>
                </div>
              </>
            )}

            {mode === 'email' && (
              <>
                <div className="login-form-header">
                  <div className="login-form-eyebrow">Staff sign in</div>
                  <h2 className="login-form-title">Enter your workspace</h2>
                  <p className="login-form-subtitle">Use the email linked to your account and your password.</p>
                </div>
                <div className="login-divider" />
                <form className="login-form" onSubmit={submitEmail} noValidate>
                  <div className="login-field">
                    <label className="login-field-label" htmlFor="loginEmail">Email</label>
                    <div className="login-input-wrap">
                      <input id="loginEmail" className="login-field-input" type="email" name="email" autoComplete="username" placeholder="Enter your email address" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                    </div>
                  </div>
                  <div className="login-field">
                    <label className="login-field-label" htmlFor="loginPassword">Password</label>
                    <div className="login-input-wrap">
                      <input id="loginPassword" className="login-field-input" type={show ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
                      <button type="button" className="login-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                    </div>
                  </div>
                  <button type="submit" className="login-cta">Sign in</button>
                  {error && <div className="login-error" role="alert">{error}</div>}
                </form>
                <div className="login-links">
                  <button type="button" className="login-link" onClick={() => { setMode('pick'); setError(''); }}>Use quick sign in with a PIN</button>
                  <span className="login-link is-muted">Demo: <strong>alex.morgan@cocoafactory.example</strong> · <strong>cocoa123</strong></span>
                </div>
                <p className="login-help">Forgot your password or PIN? Ask the production manager to reset it in Setup → Users.</p>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
