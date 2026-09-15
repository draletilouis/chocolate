'use client';

import { useState, type FormEvent } from 'react';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useStore } from '@/lib/store';

export function LoginScreen() {
  const store = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState('');
  const [help, setHelp] = useState(false);

  function submit(event: FormEvent) {
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
          <p className="login-desc">Sign in to weigh in, record outputs, and follow each batch down the production line.</p>
          <ul className="login-features">
            <li><strong>Weigh · record · continue</strong><span>Enter only what the scale shows. Yield, waste and variance are worked out for you.</span></li>
            <li><strong>Traceable batches</strong><span>Every lot, station and correction stays on record with who entered it.</span></li>
          </ul>
        </div>
        <div className="login-left-footer">
          <ShieldCheck size={13} aria-hidden="true" />
          <span>Sign in with the email and password on your staff account</span>
        </div>
      </aside>

      <main className="login-right">
        <div className="login-form-area">
          <div className="login-form-card">
            <div className="login-mobile-brand"><span className="login-brand-icon is-light" aria-hidden="true">CF</span><span className="login-mobile-wordmark">Chocolate Factory</span></div>
            <div className="login-form-header">
              <div className="login-form-eyebrow">Staff sign in</div>
              <h2 className="login-form-title">Enter your workspace</h2>
              <p className="login-form-subtitle">Use the email linked to your account and your password to continue.</p>
            </div>
            <div className="login-divider" />
            <form className="login-form" onSubmit={submit} noValidate>
              <div className="login-field">
                <label className="login-field-label" htmlFor="loginEmail">Email</label>
                <p className="login-field-hint">Use the email address linked to your staff account.</p>
                <div className="login-input-wrap">
                  <input id="loginEmail" className="login-field-input" type="email" name="email" autoComplete="username" placeholder="Enter your email address" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
                </div>
              </div>
              <div className="login-field">
                <label className="login-field-label" htmlFor="loginPassword">Password</label>
                <p className="login-field-hint">Use the password linked to this staff account.</p>
                <div className="login-input-wrap">
                  <input id="loginPassword" className="login-field-input" type={show ? 'text' : 'password'} name="password" autoComplete="current-password" placeholder="Enter your password" value={password} onChange={(e) => setPassword(e.target.value)} />
                  <button type="button" className="login-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? <EyeOff size={16} /> : <Eye size={16} />}</button>
                </div>
              </div>
              <button type="submit" className="login-cta">Sign in</button>
              {error && <div className="login-error" role="alert">{error}</div>}
            </form>
            <div className="login-links">
              <button type="button" className="login-link" onClick={() => setHelp(!help)}>Forgot password?</button>
              <span className="login-link is-muted">Demo account: <strong>alex.morgan@cocoafactory.example</strong> · password <strong>cocoa123</strong></span>
            </div>
            {help && <p className="login-help">Ask the production manager to reset your password from Setup → Users.</p>}
          </div>
        </div>
      </main>
    </div>
  );
}
