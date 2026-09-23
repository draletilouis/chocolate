'use client';

import Link from 'next/link';
import { ArrowLeft, ChevronRight, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageHeader({ eyebrow, title, subtitle, action }: { eyebrow?: string; title: string; subtitle?: ReactNode; action?: ReactNode }) {
  return (
    <div className="tab-header">
      <div className="min-w-0">
        {eyebrow && <div className="tab-eyebrow">{eyebrow}</div>}
        <h1 className="tab-title">{title}</h1>
        {subtitle && <p className="tab-subtitle">{subtitle}</p>}
      </div>
      {action && <div className="header-actions">{action}</div>}
    </div>
  );
}

export function Back({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="back-link">
      <ArrowLeft size={15} /> {label}
    </Link>
  );
}

export function Panel({ title, subtitle, action, children, className = '' }: { title?: string; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`dashboard-section ${className}`}>
      {(title || action) && (
        <div className="dashboard-section-header">
          <div>
            {title && <h3>{title}</h3>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'info';
const buttonClass: Record<ButtonVariant, string> = { primary: 'btn-primary', secondary: 'btn-secondary', ghost: 'btn-ghost', danger: 'btn-danger', info: 'btn-info' };

export function Button({ variant = 'primary', className = '', type = 'button', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <button type={type} className={`btn ${buttonClass[variant]} ${className}`} {...props} />;
}

export function LinkButton({ variant = 'primary', className = '', href, children, ...props }: { variant?: ButtonVariant; className?: string; href: string; children: ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return <Link href={href} className={`btn ${buttonClass[variant]} ${className}`} {...props}>{children}</Link>;
}

export function RowLink({ href, children, className = '' }: { href: string; children: ReactNode; className?: string }) {
  return (
    <Link href={href} className={`row-link ${className}`}>
      {children}
      <ChevronRight size={16} className="ml-auto shrink-0 text-faint" />
    </Link>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty-state">{children}</div>;
}

export function Field({ label, hint, children, className = '' }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`form-group ${className}`}>
      <span className="form-label">{label}</span>
      {children}
      {hint && <span className="form-hint">{hint}</span>}
    </label>
  );
}

export const inputClass = 'form-input';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

export function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`${inputClass} ${props.className ?? ''}`} />;
}

/** Numeric input with a unit suffix, used for every measured weight */
export function UnitInput({ unit, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { unit: string }) {
  return (
    <span className="unit-input">
      <input type="number" inputMode="decimal" step="0.01" min="0" placeholder="0.00" {...props} className={props.className ?? ''} />
      <span>{unit}</span>
    </span>
  );
}

const badgeTone = { neutral: 'is-neutral', green: 'is-success', warn: 'is-warning', danger: 'is-danger', info: 'is-info' };
export function Badge({ tone = 'neutral', children }: { tone?: keyof typeof badgeTone; children: ReactNode }) {
  return <span className={`status-badge ${badgeTone[tone]}`}>{children}</span>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'warn' | 'danger' }) {
  return (
    <div className={`metric-card ${tone === 'danger' ? 'is-alert' : tone === 'warn' ? 'is-warn' : ''}`}>
      <h3>{label}</h3>
      <div className="metric-value">{value}</div>
      {hint && <div className="metric-hint">{hint}</div>}
    </div>
  );
}

export function Notice({ tone = 'green', icon: Icon, children }: { tone?: 'green' | 'warn' | 'danger' | 'neutral'; icon?: LucideIcon; children: ReactNode }) {
  return (
    <div className={`notice notice-${tone}`} role="status">
      {Icon && <Icon size={16} className="mt-0.5 shrink-0" />}
      <div>{children}</div>
    </div>
  );
}

/** Simple in-page section switcher (pill tabs) used by Reports, Setup and part pages */
export function SubNav({ items, current }: { items: { id: string; label: string; href: string }[]; current: string }) {
  return (
    <nav className="sub-nav-tabs" aria-label="Sections">
      {items.map((item) => (
        <Link key={item.id} href={item.href} aria-current={item.id === current ? 'page' : undefined} className={`sub-nav-btn ${item.id === current ? 'active' : ''}`}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}

export function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="table-container">
      <table>
        <thead><tr>{head.map((h) => <th key={h}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export const td = 'cell';
export const tdNum = 'cell cell-num';
