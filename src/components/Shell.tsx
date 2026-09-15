'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { BarChart3, ClipboardList, FlaskConical, LayoutDashboard, LogOut, Package, Settings2, type LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { activeBatches, allAlerts, stationQueue } from '@/lib/derive';
import { useStore } from '@/lib/store';
import { groupBySlug, stationGroups, stations } from '@/lib/stations';
import { LoginScreen } from './LoginScreen';

interface NavItem { href: string; label: string; short?: string; icon: LucideIcon; count?: 'alerts' | 'batches' }

const navItems: NavItem[] = [
  { href: '/overview', label: 'Overview', icon: LayoutDashboard, count: 'alerts' },
  { href: '/production', label: 'Production line', short: 'Production', icon: ClipboardList, count: 'batches' },
  { href: '/materials', label: 'Materials', icon: Package },
  { href: '/recipes', label: 'Recipes', icon: FlaskConical },
  { href: '/reports', label: 'Reports', icon: BarChart3 },
  { href: '/setup', label: 'Setup', icon: Settings2 },
];

export function Shell({ children }: { children: ReactNode }) {
  const store = useStore();
  const pathname = usePathname();
  const counts = { alerts: allAlerts(store).length, batches: activeBatches(store).length };
  const user = store.users.find((u) => u.id === store.currentUserId);
  const active = navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)) ?? navItems[1];
  // Each part of the line is its own sidebar entry under Production line.
  const parts = stationGroups.map((g) => ({
    href: `/production/parts/${g.slug}`, label: g.name,
    waiting: stations.filter((s) => s.group === g.name).reduce((n, s) => n + stationQueue(store, s.id).ready.length, 0),
  }));
  const partSlug = pathname.startsWith('/production/parts/') ? pathname.split('/')[3] : undefined;
  const pageTitle = partSlug && groupBySlug(partSlug) ? `Production line · ${groupBySlug(partSlug)!.name}` : active.label;

  // Stored data and the session are loaded after mount; wait so the sample data never flashes first.
  if (!store.hydrated) return <p className="empty-state" aria-busy="true">Loading…</p>;
  if (!store.sessionUserId) return <LoginScreen />;

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar: always visible */}
      <aside className="sidebar hidden md:flex">
        <Link href="/production" className="nav-brand">
          <span className="brand-logo-shell" aria-hidden="true">CF</span>
          <span className="brand-app">Chocolate Factory</span>
          <span className="brand-sub">Production records</span>
        </Link>
        <nav className="nav-menu" aria-label="Main navigation">
          <div className="nav-section-label">Factory</div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item === active;
            const count = item.count ? counts[item.count] : 0;
            return (
              <div key={item.href}>
                <Link href={item.href} aria-current={isActive ? 'page' : undefined} className={`nav-btn ${isActive ? 'active' : ''}`}>
                  <Icon size={20} className="nav-icon" />
                  <span className="nav-text">{item.label}</span>
                  {count > 0 && <span className={`nav-count ${item.count === 'alerts' ? 'is-alert' : ''}`} aria-label={`${count} ${item.count}`}>{count}</span>}
                </Link>
                {item.href === '/production' && (
                  <div className="nav-sub" aria-label="Parts of the production line" role="group">
                    {parts.map((p, i) => {
                      const partActive = pathname === p.href;
                      return (
                        <Link key={p.href} href={p.href} aria-current={partActive ? 'page' : undefined} className={`nav-sub-btn ${partActive ? 'active' : ''}`}>
                          <span className="nav-sub-index">{i + 1}</span>
                          <span className="nav-text">{p.label}</span>
                          {p.waiting > 0 && <span className="nav-count" aria-label={`${p.waiting} waiting`}>{p.waiting}</span>}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
        <div className="nav-footer flex items-center justify-between gap-2">
          <Link href="/setup/users" className="app-topbar-profile min-w-0" style={{ padding: 4 }}>
            <span className="avatar is-small">{user?.initials}</span>
            <span className="min-w-0"><span className="profile-name block truncate">{user?.name}</span><span className="profile-role block truncate">{user?.role}</span></span>
          </Link>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 36, padding: '6px 8px' }} onClick={store.signOut} aria-label="Sign out" title="Sign out"><LogOut size={17} /></button>
        </div>
      </aside>

      {/* Desktop top bar: page title + who is recording */}
      <header className="app-topbar hidden md:flex">
        <div className="app-topbar-page-title">{pageTitle}</div>
        <div className="app-topbar-spacer" />
        <Link href="/setup/users" className="app-topbar-profile" title="Signed in as">
          <span className="avatar">{user?.initials}</span>
          <span className="hidden lg:block"><span className="profile-name block">{user?.name}</span><span className="profile-role">{user?.role}</span></span>
        </Link>
        <button type="button" className="btn btn-secondary" onClick={store.signOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /> <span className="hidden lg:inline">Sign out</span></button>
      </header>

      {/* Mobile header */}
      <header className="mobile-header md:hidden">
        <Link href="/production" className="flex items-center gap-2.5">
          <span className="avatar is-small" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', color: '#1A3862', border: '1px solid #cbd5e1' }}>CF</span>
          <span className="text-[15px] font-extrabold tracking-tight">Chocolate Factory</span>
        </Link>
        <span className="flex items-center gap-2">
          <span className="text-[13px] font-bold text-green">{active.label}</span>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 34, padding: '4px 8px' }} onClick={store.signOut} aria-label="Sign out" title="Sign out"><LogOut size={16} /></button>
        </span>
      </header>

      <main className="main-content md:ml-[260px] md:pt-[68px] pb-24 md:pb-0">
        <div className="tab-content">{children}</div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="bottom-nav md:hidden" aria-label="Mobile navigation">
        <div className="bottom-nav-container">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = item === active;
            const count = item.count ? counts[item.count] : 0;
            return (
              <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} className={`bottom-nav-btn ${isActive ? 'active' : ''}`}>
                <Icon size={22} strokeWidth={1.8} />
                <span>{item.short ?? item.label}</span>
                {count > 0 && <span className={`bottom-nav-badge ${item.count === 'alerts' ? 'is-alert' : ''}`}>{count}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
