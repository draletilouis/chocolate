'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { api } from './AuthProvider';

type Step = 'email' | 'code' | 'password' | 'done';

/** Three-step recovery: email → 6-digit code → new password (mirrors StockMaster's email reset flow). */
export function ResetPasswordScreen() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [requestId, setRequestId] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(''); setBusy(true);
    try {
      if (step === 'email') {
        const r = await api<{ requestId?: string; devCode?: string }>('/api/auth/password-reset/request', { method: 'POST', body: JSON.stringify({ email }) });
        if (!r.ok) return setError(r.data.message ?? 'Could not start the reset.');
        setRequestId(r.data.requestId ?? '');
        setMessage(r.data.devCode ? `${r.data.message} Development code: ${r.data.devCode}` : (r.data.message ?? ''));
        setStep('code');
      } else if (step === 'code') {
        const r = await api<{ resetToken?: string }>('/api/auth/password-reset/verify', { method: 'POST', body: JSON.stringify({ requestId, code }) });
        if (!r.ok || !r.data.success) return setError(r.data.message ?? 'Incorrect code.');
        setResetToken(r.data.resetToken ?? '');
        setMessage(''); setStep('password');
      } else if (step === 'password') {
        if (password !== confirm) return setError('The passwords do not match.');
        const r = await api('/api/auth/password-reset/confirm', { method: 'POST', body: JSON.stringify({ resetToken, newPassword: password }) });
        if (!r.ok || !r.data.success) return setError(r.data.message ?? 'Could not set the password.');
        setMessage(r.data.message ?? 'Password updated.'); setStep('done');
      }
    } finally { setBusy(false); }
  }

  return (
    <div className="login-layout">
      <aside className="login-left">
        <div className="login-brand"><span className="login-brand-icon" aria-hidden="true">CF</span><div><div className="login-brand-name">Cocoa Factory</div><div className="login-brand-sub">Production workspace</div></div></div>
        <div className="login-left-body">
          <div className="login-badge"><span className="login-badge-dot" aria-hidden="true" />Account recovery</div>
          <h1 className="login-headline">Reset your password in three steps.</h1>
          <p className="login-desc">We email a 6-digit code to the address on your staff account. The code expires after 15 minutes.</p>
        </div>
      </aside>
      <main className="login-right">
        <div className="login-form-area">
          <div className="login-form-card">
            <div className="login-mobile-brand"><span className="login-brand-icon is-light" aria-hidden="true">CF</span><span className="login-mobile-wordmark">Cocoa Factory</span></div>
            <div className="login-form-header">
              <div className="login-form-eyebrow">{step === 'done' ? 'All set' : `Step ${step === 'email' ? 1 : step === 'code' ? 2 : 3} of 3`}</div>
              <h2 className="login-form-title">{step === 'email' ? 'Forgot your password?' : step === 'code' ? 'Enter the code' : step === 'password' ? 'Choose a new password' : 'Password updated'}</h2>
              <p className="login-form-subtitle">{step === 'email' ? 'Enter the email on your staff account.' : step === 'code' ? `Check the inbox for ${email}.` : step === 'password' ? 'A 4-digit PIN or a password of at least 8 characters.' : 'You can sign in with your new password now.'}</p>
            </div>
            <div className="login-divider" />
            {message && <div className="notice notice-green" role="status">{message}</div>}
            {step !== 'done' && (
              <form className="login-form" onSubmit={submit} noValidate>
                {step === 'email' && (
                  <div className="login-field">
                    <label className="login-field-label" htmlFor="resetEmail">Email</label>
                    <div className="login-input-wrap"><input id="resetEmail" className="login-field-input" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Enter your email address" autoFocus /></div>
                  </div>
                )}
                {step === 'code' && (
                  <div className="login-field">
                    <label className="login-field-label" htmlFor="resetCode">Reset code</label>
                    <div className="login-input-wrap"><input id="resetCode" className="login-field-input" inputMode="numeric" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="6-digit code" autoFocus /></div>
                  </div>
                )}
                {step === 'password' && (
                  <>
                    <div className="login-field">
                      <label className="login-field-label" htmlFor="newPassword">New password</label>
                      <div className="login-input-wrap"><input id="newPassword" className="login-field-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus /></div>
                    </div>
                    <div className="login-field">
                      <label className="login-field-label" htmlFor="confirmPassword">Confirm new password</label>
                      <div className="login-input-wrap"><input id="confirmPassword" className="login-field-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
                    </div>
                  </>
                )}
                <button type="submit" className="login-cta" disabled={busy}>{busy ? 'Please wait…' : step === 'email' ? 'Send reset code' : step === 'code' ? 'Verify code' : 'Set new password'}</button>
                {error && <div className="login-error" role="alert">{error}</div>}
              </form>
            )}
            <div className="login-links"><Link href="/login" className="login-link">{step === 'done' ? 'Go to sign in' : 'Back to sign in'}</Link></div>
          </div>
        </div>
      </main>
    </div>
  );
}
