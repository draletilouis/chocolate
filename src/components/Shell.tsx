'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { BarChart3, ChevronDown, ClipboardCheck, ClipboardList, FlaskConical, LayoutDashboard, LogOut, Package, Search, Settings2, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { activeBatches, allAlerts, stationQueue } from '@/lib/derive';
import { ACTIVE_KEY, useStore } from '@/lib/store';
import { groupBySlug, stationGroups, stations } from '@/lib/stations';
import { LoginScreen } from './LoginScreen';
import { Notice } from './ui';

interface NavItem { href: string; label: string; short?: string; icon: LucideIcon; count?: 'alerts' | 'batches' | 'work'; managers?: boolean }

const navItems: NavItem[] = [
  { href: '/work', label: 'My work', icon: ClipboardCheck, count: 'work' },
  { href: '/overview', label: 'Overview', icon: LayoutDashboard, count: 'alerts', managers: true },
  { href: '/production', label: 'Production line', short: 'Production', icon: ClipboardList, count: 'batches' },
  { href: '/materials', label: 'Materials', icon: Package, managers: true },
  { href: '/recipes', label: 'Recipes', icon: FlaskConical, managers: true },
  { href: '/reports', label: 'Reports', icon: BarChart3, managers: true },
  { href: '/setup', label: 'Setup', icon: Settings2, managers: true },
];

/** Pages operators do not need; they stay one tap away for managers */
const managerOnly = ['/overview', '/recipes', '/reports', '/setup'];

export function Shell({ children }: { children: ReactNode }) {
  const store = useStore();
  const pathname = usePathname();
  const router = useRouter();
  // `user` is who records (a manager can record on someone's behalf); access follows whoever signed in.
  const user = store.users.find((u) => u.id === store.currentUserId);
  const signedIn = store.users.find((u) => u.id === store.sessionUserId) ?? user;
  const isManager = signedIn?.access !== 'operator';
  const myStations = user?.stations ?? [];
  // Operators get My work and the production line; managers get everything, plus My work when they have stations.
  const items = navItems.filter((item) => (item.href === '/work' ? !isManager || myStations.length > 0 : !item.managers || isManager));
  const counts = {
    alerts: allAlerts(store).length,
    batches: activeBatches(store).length,
    work: myStations.reduce((n, s) => n + stationQueue(store, s).ready.length, 0),
  };
  const active = items.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  const [productionOpen, setProductionOpen] = useState(() => pathname.startsWith('/production'));
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (pathname.startsWith('/production')) setProductionOpen(true);
  }, [pathname]);

  // Shared devices return to the sign-in screen after a while without use, even across reloads.
  const { sessionUserId, idleMinutes, signOut } = store;
  useEffect(() => {
    if (!sessionUserId || !idleMinutes) return;
    const limit = idleMinutes * 60_000;
    const read = () => { try { return Number(window.localStorage.getItem(ACTIVE_KEY)) || Date.now(); } catch { return Date.now(); } };
    let last = read();
    if (Date.now() - last > limit) { signOut(); return; }
    let written = 0;
    const bump = () => {
      last = Date.now();
      if (last - written > 10_000) { written = last; try { window.localStorage.setItem(ACTIVE_KEY, String(last)); } catch { /* ignore */ } }
    };
    bump();
    const events = ['pointerdown', 'keydown', 'touchstart', 'wheel'] as const;
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    // Left idle on a page: hand the device back at the start. (A stale session found on load keeps its URL, so a scanned link still opens.)
    const timer = window.setInterval(() => { if (Date.now() - last > limit) { signOut(); router.push('/'); } }, 15_000);
    return () => { events.forEach((e) => window.removeEventListener(e, bump)); window.clearInterval(timer); };
  }, [sessionUserId, idleMinutes, signOut, router]);

  const parts = stationGroups.map((g) => ({
    href: `/production/parts/${g.slug}`, label: g.name,
    waiting: stations.filter((s) => s.group === g.name).reduce((n, s) => n + stationQueue(store, s.id).ready.length, 0),
  }));
  const partSlug = pathname.startsWith('/production/parts/') ? pathname.split('/')[3] : undefined;
  const pageTitle = partSlug && groupBySlug(partSlug) ? `Production line · ${groupBySlug(partSlug)!.name}` : pathname.startsWith('/search') ? 'Search' : active?.label ?? 'Chocolate Factory';
  const home = !isManager || myStations.length > 0 ? '/work' : '/production';
  const blocked = !isManager && managerOnly.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // Operators who open a manager page (an old link, a shared device) go straight to their own work.
  useEffect(() => { if (sessionUserId && blocked) router.replace('/work'); }, [sessionUserId, blocked, router]);

  // Signing out hands the device to the next person, who should land on their own home page.
  function switchUser() {
    signOut();
    router.push('/');
  }

  function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  // Stored data and the session are loaded after mount; wait so the sample data never flashes first.
  if (!store.hydrated) return <p className="empty-state" aria-busy="true">Loading…</p>;
  if (!store.sessionUserId) return <LoginScreen />;

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar: always visible */}
      <aside className="sidebar hidden md:flex">
        <Link href={home} className="nav-brand">
          <span className="brand-logo-shell" aria-hidden="true">CF</span>
          <span className="brand-copy">
            <span className="brand-app">Chocolate Factory</span>
            <span className="brand-sub">Production records</span>
          </span>
        </Link>
        <nav className="nav-menu" aria-label="Main navigation">
          <div className="nav-section-label">Operations</div>
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item === active;
            const count = item.count ? counts[item.count] : 0;
            const countTone = item.count === 'alerts' ? 'is-alert' : item.count ? 'is-work' : '';
            return (
              <div key={item.href} className={item.href === '/setup' ? 'nav-item-manage' : undefined}>
                {item.href === '/setup' && <div className="nav-section-label nav-section-label-secondary">Manage</div>}
                {item.href === '/production' ? (
                  <div className={`nav-parent-row ${isActive ? 'active' : ''}`}>
                    <Link href={item.href} aria-current={isActive ? 'page' : undefined} className="nav-btn nav-parent-link" aria-label={`${item.label}${count > 0 ? `, ${count} active batches` : ''}`}>
                      <Icon size={20} className="nav-icon" />
                      <span className="nav-text">{item.label}</span>
                      {count > 0 && <span className={`nav-count ${countTone}`} aria-hidden="true">{count}</span>}
                    </Link>
                    <button type="button" className="nav-expand-button" aria-label={`${productionOpen ? 'Collapse' : 'Expand'} production line parts`} aria-expanded={productionOpen} aria-controls="production-sidebar-subnav" onClick={() => setProductionOpen((open) => !open)}>
                      <ChevronDown size={16} aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <Link href={item.href} aria-current={isActive ? 'page' : undefined} className={`nav-btn ${isActive ? 'active' : ''}`} aria-label={`${item.label}${count > 0 ? `, ${count} ${item.count === 'alerts' ? 'alerts' : 'waiting'}` : ''}`}>
                    <Icon size={20} className="nav-icon" />
                    <span className="nav-text">{item.label}</span>
                    {count > 0 && <span className={`nav-count ${countTone}`} aria-hidden="true">{count}</span>}
                  </Link>
                )}
                {item.href === '/production' && (
                  <div id="production-sidebar-subnav" className={`nav-sub ${productionOpen ? '' : 'is-collapsed'}`} aria-label="Parts of the production line" role="group">
                    {parts.map((p, i) => {
                      const partActive = pathname === p.href;
                      return (
                        <Link key={p.href} href={p.href} aria-current={partActive ? 'page' : undefined} className={`nav-sub-btn ${partActive ? 'active' : ''}`} aria-label={`${p.label}${p.waiting > 0 ? `, ${p.waiting} waiting` : ''}`}>
                          <span className="nav-sub-index">{i + 1}</span>
                          <span className="nav-text">{p.label}</span>
                          {p.waiting > 0 && <span className="nav-count is-queue" aria-hidden="true">{p.waiting}</span>}
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
          <Link href={isManager ? '/setup/users' : home} className="nav-profile min-w-0" title={isManager ? 'Open user settings' : undefined}>
            <span className="avatar is-small">{user?.initials}</span>
            <span className="min-w-0"><span className="profile-name block truncate">{user?.name}</span><span className="profile-role block truncate">{user?.role}</span></span>
          </Link>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 44, padding: '6px 10px' }} onClick={switchUser} aria-label="Sign out" title="Sign out or switch user"><LogOut size={17} /></button>
        </div>
      </aside>

      {/* Desktop top bar: page title and search */}
      <header className="app-topbar hidden md:flex">
        <div className="app-topbar-page-title">{pageTitle}</div>
        <div className="app-topbar-spacer" />
        <form onSubmit={search} role="search">
          <input className="topbar-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search batch, lot or supplier" aria-label="Search batches and lots" />
        </form>
      </header>

      {/* Mobile header */}
      <header className="mobile-header md:hidden">
        <Link href={home} className="flex items-center gap-2.5">
          <span className="avatar is-small" style={{ background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)', color: '#1A3862', border: '1px solid #cbd5e1' }}>CF</span>
          <span className="text-[15px] font-extrabold tracking-tight">{user?.name.split(' ')[0]}</span>
        </Link>
        <span className="flex items-center gap-1">
          <Link href="/search" className="btn btn-ghost" style={{ minHeight: 44, padding: '4px 10px' }} aria-label="Search"><Search size={18} /></Link>
          <button type="button" className="btn btn-ghost" style={{ minHeight: 44, padding: '4px 10px' }} onClick={switchUser} aria-label="Sign out" title="Sign out or switch user"><LogOut size={18} /></button>
        </span>
      </header>

      <main className="main-content md:ml-[260px] md:pt-[68px] pb-24 md:pb-0">
        <div className="tab-content">
          {blocked ? <Notice tone="neutral">This page is for managers. Opening <Link href="/work" className="font-semibold text-green">My work</Link>…</Notice> : children}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="bottom-nav md:hidden" aria-label="Mobile navigation">
        <div className="bottom-nav-container">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = item === active;
            const count = item.count ? counts[item.count] : 0;
            const countTone = item.count === 'alerts' ? 'is-alert' : item.count ? 'is-work' : '';
            return (
              <Link key={item.href} href={item.href} aria-current={isActive ? 'page' : undefined} className={`bottom-nav-btn ${isActive ? 'active' : ''}`} aria-label={`${item.label}${count > 0 ? `, ${count} ${item.count === 'alerts' ? 'alerts' : item.count === 'work' ? 'waiting' : 'active batches'}` : ''}`}>
                <Icon size={22} strokeWidth={1.8} />
                <span>{item.short ?? item.label}</span>
                {count > 0 && <span className={`bottom-nav-badge ${countTone}`} aria-hidden="true">{count}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
