'use client';

import type { ReactNode } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/components/ui';
import { brand } from '@/lib/brand';
import { userName } from '@/lib/derive';
import { dateTime } from '@/lib/format';
import { useStore } from '@/lib/store';
import type { SignOff } from '@/lib/types';

/**
 * One of the factory's forms, laid out like the paper: letterhead, document number, title, the form
 * itself and the signature lines. The same markup is what prints (see the print rules in globals.css).
 */
export function PaperSheet({ title, subtitle, docNumber, wide, children }: { title: string; subtitle?: ReactNode; docNumber?: string; wide?: boolean; children: ReactNode }) {
  const { business } = useStore();
  const contact = [business.address, business.phone, business.email].filter(Boolean).join(' · ');
  return (
    <article className={`paper-sheet ${wide ? 'is-wide' : ''}`}>
      <header className="paper-head">
        {/* eslint-disable-next-line @next/next/no-img-element -- a small static mark that must also print */}
        <img src={brand.mark} alt="" />
        <div className="min-w-0">
          <div className="paper-brand">{business.name || brand.name}</div>
          {contact && <div className="paper-contact">{contact}</div>}
        </div>
        {docNumber && <div className="paper-doc">Doc No<strong>{docNumber}</strong></div>}
      </header>
      <h2 className="paper-title">{title}</h2>
      {subtitle && <p className="paper-subtitle">{subtitle}</p>}
      {children}
      <footer className="paper-foot"><span>Printed from the production records · {dateTime(new Date().toISOString())}</span><span>{docNumber}</span></footer>
    </article>
  );
}

/** A label, a dotted leader and the value, like a line of the paper form. An empty value prints as a dash. */
export function PaperLine({ label, value, sub }: { label: ReactNode; value?: ReactNode; sub?: boolean }) {
  return <div className={`paper-line ${sub ? 'is-sub' : ''}`}><span>{label}</span><span className="paper-fill" /><strong>{value === undefined || value === '' ? '—' : value}</strong></div>;
}

export function PaperSection({ children }: { children: ReactNode }) {
  return <h3 className="paper-section">{children}</h3>;
}

/** Signature lines: a name already in the records is printed on its line, an empty one is left to sign by hand */
export function PaperSignatures({ lines }: { lines: { role: string; name?: string; at?: string; note?: string }[] }) {
  return (
    <div className="paper-signs">
      {lines.map((l) => (
        <div key={l.role} className="paper-sign">
          <div className="paper-sign-line">{l.name ?? ''}</div>
          <div className="paper-sign-role">{l.role}{l.at ? ` · ${dateTime(l.at)}` : ''}{l.note ? ` · ${l.note}` : ''}</div>
        </div>
      ))}
    </div>
  );
}

/** The signature line of a manager's sign-off, as PaperSignatures takes it */
export function useSignLine() {
  const store = useStore();
  return (role: string, sign: SignOff | undefined) => ({ role, name: sign ? userName(store, sign.by) : undefined, at: sign?.at, note: sign ? 'signed in the app' : undefined });
}

export function PrintButton({ children = 'Print' }: { children?: ReactNode }) {
  return <Button variant="secondary" onClick={() => window.print()}><Printer size={14} /> {children}</Button>;
}
