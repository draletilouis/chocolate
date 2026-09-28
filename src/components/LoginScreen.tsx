'use client';

import { useEffect, useState, type FormEvent } from 'react';
import { ArrowLeft, Delete, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useStore } from '@/lib/store';

type Mode = 'pick' | 'pin' | 'email';

export function LoginScreen() {
  const store = useStore();
  const auth = store.auth;
  const people = auth?.people ?? [];
  const [mode, setMode] = useState<Mode>(auth?.trustedDevice && people.length ? 'pick' : 'email');
  const [userId, setUserId] = useState('');
  const [pin, setPin] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [deviceName, setDeviceName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const person = people.find((u) => u.id === userId);

  useEffect(() => {
    if (!auth?.trustedDevice || !people.length) setMode('email');
  }, [auth?.trustedDevice, people.length]);

  async function enterDigit(digit: string) {
    if (busy) return;
    setError('');
    const next = `${pin}${digit}`.slice(0, 4);
    setPin(next);
    if (next.length < 4) return;
    setBusy(true);
    const result = await store.signInWithPin(userId, next);
    setBusy(false);
    if (!result.ok) {
      setError(result.error);
      setPin('');
    }
  }

  // A keyboard works too: digits, Backspace, Escape.
  useEffect(() => {
    if (mode !== 'pin') return;
    const onKey = (event: KeyboardEvent) => {
      if (/^\d$/.test(event.key)) void enterDigit(event.key);
      else if (event.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (event.key === 'Escape') { setMode('pick'); setPin(''); setError(''); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function submitEmail(event: FormEvent) {
    event.preventDefault();
    if (!email.trim() || !password) return setError('Enter your email and password.');
    setBusy(true);
    const result = await store.signIn(email.trim(), password, { trustDevice, deviceName: deviceName.trim() || undefined });
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setError('');
  }

  const side = (
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
        <p className="login-desc">Every phone, tablet and computer sees the same batches, as they are saved.</p>
        <ul className="login-features">
          <li><strong>Weigh · save · move on</strong><span>Enter what the scale shows. The balance is checked while you type.</span></li>
          <li><strong>Traceable batches</strong><span>Every lot, station and correction stays on record with who entered it.</span></li>
        </ul>
      </div>
      <div className="login-left-footer">
        <ShieldCheck size={13} aria-hidden="true" />
        <span>Shared devices sign out after a few minutes without use</span>
      </div>
    </aside>
  );

  if (auth?.firstRun) return <div className="login-layout">{side}<main className="login-right"><div className="login-form-area"><FirstManager /></div></main></div>;

  return (
    <div className="login-layout">
      {side}
      <main className="login-right">
        <div className="login-form-area">
          <div className="login-form-card" style={{ maxWidth: mode === 'pick' ? 560 : 440 }}>
            <div className="login-mobile-brand"><span className="login-brand-icon is-light" aria-hidden="true">CF</span><span className="login-mobile-wordmark">Chocolate Factory</span></div>
            {(store.notice || store.endedWhileOpen) && <div className="login-notice" role="status">{store.notice ?? 'You were signed out. Sign in again to carry on.'}</div>}

            {mode === 'pick' && (
              <>
                <div className="login-form-header">
                  <div className="login-form-eyebrow">Quick sign in</div>
                  <h2 className="login-form-title">Who is recording?</h2>
                  <p className="login-form-subtitle">Tap your name, then enter your 4-digit PIN.</p>
                </div>
                <div className="user-grid">
                  {people.map((u) => (
                    <button key={u.id} type="button" className="user-tile" onClick={() => { setUserId(u.id); setPin(''); setError(''); setMode('pin'); }} aria-label={`Sign in as ${u.name}`}>
                      <span className="avatar">{u.initials}</span>
                      <span className="user-tile-name">{u.name}</span>
                      <span className="user-tile-role">{u.role}</span>
                    </button>
                  ))}
                </div>
                <div className="login-links">
                  <button type="button" className="login-link" onClick={() => { setMode('email'); setError(''); }}>Sign in with email and password</button>
                  {auth?.demo && <span className="login-link is-muted">Demo PIN for every account: <strong>1234</strong></span>}
                </div>
              </>
            )}

            {mode === 'pin' && person && (
              <>
                <button type="button" className="login-link inline-flex min-h-[44px] items-center gap-1" onClick={() => { setMode('pick'); setPin(''); setError(''); }}><ArrowLeft size={15} /> Not {person.name.split(' ')[0]}?</button>
                <div className="login-form-header mt-2 text-center">
                  <span className="avatar mx-auto" style={{ width: 56, height: 56, fontSize: 17 }}>{person.initials}</span>
                  <h2 className="login-form-title mt-3">Hi {person.name.split(' ')[0]}</h2>
                  <p className="login-form-subtitle">{busy ? 'Checking…' : 'Enter your PIN'}</p>
                </div>
                <div className="pin-dots" aria-label={`${pin.length} of 4 digits entered`}>
                  {[0, 1, 2, 3].map((i) => <span key={i} className={`pin-dot ${i < pin.length ? 'is-filled' : ''}`} />)}
                </div>
                {error && <div className="login-error text-center" role="alert">{error}</div>}
                <div className="pin-pad">
                  {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} type="button" className="pin-key" disabled={busy} onClick={() => void enterDigit(d)}>{d}</button>)}
                  <button type="button" className="pin-key is-muted" onClick={() => { setMode('pick'); setPin(''); setError(''); }}>Back</button>
                  <button type="button" className="pin-key" disabled={busy} onClick={() => void enterDigit('0')}>0</button>
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
                  {!auth?.trustedDevice && (
                    <div className="login-field">
                      <label className="flex min-h-[44px] items-start gap-2 text-[13px] text-[#334E68]">
                        <input type="checkbox" className="mt-1 h-5 w-5" checked={trustDevice} onChange={(e) => setTrustDevice(e.target.checked)} />
                        <span><strong>Set up this device for quick sign-in</strong><span className="block text-[#5a7080]">For a shared tablet or PC on the floor: staff then tap their name and enter a PIN. Managers only.</span></span>
                      </label>
                      {trustDevice && <input className="login-field-input mt-2" value={deviceName} onChange={(e) => setDeviceName(e.target.value)} placeholder="Name this device, e.g. Roasting tablet" aria-label="Device name" maxLength={80} />}
                    </div>
                  )}
                  <button type="submit" className="login-cta" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
                  {error && <div className="login-error" role="alert">{error}</div>}
                  {info && <div className="login-help" role="status">{info}</div>}
                </form>
                <div className="login-links">
                  {auth?.trustedDevice && people.length > 0 && <button type="button" className="login-link" onClick={() => { setMode('pick'); setError(''); setInfo(''); }}>Use quick sign in with a PIN</button>}
                  {auth?.demo && <span className="login-link is-muted">Demo: <strong>alex.morgan@cocoafactory.example</strong> · <strong>cocoa123</strong></span>}
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

/** First start of a real factory: whoever sets it up becomes the first manager, and this device is set up */
function FirstManager() {
  const store = useStore();
  const [form, setForm] = useState({ name: '', email: '', password: '', pin: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!form.name.trim() || !form.email.trim()) return setError('Enter your name and email.');
    if (form.password.length < 6) return setError('Choose a password of at least 6 characters.');
    if (!/^\d{4}$/.test(form.pin)) return setError('Choose a 4-digit PIN.');
    setBusy(true);
    const result = await store.setupFactory({ ...form, name: form.name.trim(), email: form.email.trim(), deviceName: 'Manager’s device' });
    setBusy(false);
    if (!result.ok) setError(result.error);
  }

  return (
    <div className="login-form-card">
      <div className="login-mobile-brand"><span className="login-brand-icon is-light" aria-hidden="true">CF</span><span className="login-mobile-wordmark">Chocolate Factory</span></div>
      <div className="login-form-header">
        <div className="login-form-eyebrow">First start</div>
        <h2 className="login-form-title">Set up your factory</h2>
        <p className="login-form-subtitle">Create the first manager account. You can add everyone else in Setup → Users.</p>
      </div>
      <form className="login-form" onSubmit={submit} noValidate>
        {([['name', 'Your name', 'text', 'name'], ['email', 'Email', 'email', 'username'], ['password', 'Password (6+ characters)', 'password', 'new-password'], ['pin', '4-digit PIN for quick sign-in', 'password', 'off']] as const).map(([key, label, type, autoComplete]) => (
          <div key={key} className="login-field">
            <label className="login-field-label" htmlFor={`setup-${key}`}>{label}</label>
            <input id={`setup-${key}`} className="login-field-input" type={type} autoComplete={autoComplete} inputMode={key === 'pin' ? 'numeric' : undefined} maxLength={key === 'pin' ? 4 : 200} value={form[key]} onChange={set(key)} />
          </div>
        ))}
        <button type="submit" className="login-cta" disabled={busy}>{busy ? 'Setting up…' : 'Create manager and start'}</button>
        {error && <div className="login-error" role="alert">{error}</div>}
      </form>
    </div>
  );
}
