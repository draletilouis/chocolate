'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertTriangle, BarChart3, ChevronDown, ClipboardCheck, ClipboardList, FlaskConical, LayoutDashboard, LogOut, Search, Settings2, Target, Truck, Warehouse, Waypoints, WifiOff, X, type LucideIcon } from 'lucide-react';
import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { activeBatches, allAlerts, waitingCount } from '@/lib/derive';
import { useStore } from '@/lib/store';
import { groupBySlug, lineStations, stationById, stationGroups } from '@/lib/stations';
import { LoginScreen } from './LoginScreen';
import { Button, Notice } from './ui';

interface NavItem { href: string; label: string; short?: string; icon: LucideIcon; count?: 'alerts' | 'batches' | 'work'; managers?: boolean; phone?: false; also?: string }

const navItems: NavItem[] = [
  { href: '/work', label: 'My work', icon: ClipboardCheck, count: 'work' },
  { href: '/overview', label: 'Overview', icon: LayoutDashboard, count: 'alerts', managers: true },
  { href: '/production', label: 'Production line', short: 'Production', icon: ClipboardList, count: 'batches' },
  // Kept off the phone bar so it fits; Overview and My work link to the plan.
  { href: '/plan', label: 'Production plan', short: 'Plan', icon: Target, managers: true, phone: false },
  // Lot records and receiving live under /materials and belong to the Store.
  { href: '/store', label: 'Store', icon: Warehouse, managers: true, also: '/materials' },
  // Goods out to customers; off the phone bar, the Store links to it.
  { href: '/dispatch', label: 'Dispatch', icon: Truck, managers: true, phone: false },
  // Off the phone bar too; the Store links to it.
  { href: '/trace', label: 'Batch tracing', short: 'Trace', icon: Waypoints, managers: true, phone: false },
  { href: '/recipes', label: 'Chocolate types', short: 'Chocolate', icon: FlaskConical, managers: true },
  { href: '/reports', label: 'Reports', icon: BarChart3, managers: true },
  { href: '/setup', label: 'Setup', icon: Settings2, managers: true },
];

/** Pages operators do not need; they stay one tap away for managers */
const managerOnly = ['/overview', '/recipes', '/reports', '/setup', '/dispatch'];

export function Shell({ children }: { children: ReactNode }) {
  const store = useStore();
  const pathname = usePathname();
  const router = useRouter();
  // `user` is who records (a manager can record on someone's behalf); access follows whoever signed in.
  const user = store.users.find((u) => u.id === store.currentUserId) ?? store.signedInUser ?? undefined;
  const signedIn = store.signedInUser ?? user;
  const isManager = signedIn?.access !== 'operator';
  const myStations = user?.stations ?? [];
  // Operators get My work and the production line; managers get everything, plus My work when they have stations.
  const items = navItems.filter((item) => (item.href === '/work' ? !isManager || myStations.length > 0 : !item.managers || isManager));
  const counts = {
    alerts: allAlerts(store).length,
    batches: activeBatches(store).length,
    work: myStations.filter((s) => !stationById[s]?.retired).reduce((n, s) => n + waitingCount(store, s), 0),
  };
  const active = items.find((item) => [item.href, item.also].some((p) => p && (pathname === p || pathname.startsWith(`${p}/`))));
  const [productionOpen, setProductionOpen] = useState(() => pathname.startsWith('/production'));
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (pathname.startsWith('/production')) setProductionOpen(true);
  }, [pathname]);

  // The server ends idle sessions; when that happens with the app open, the next person starts from the beginning.
  const { endedWhileOpen, signOut } = store;
  useEffect(() => {
    if (endedWhileOpen) router.push('/');
  }, [endedWhileOpen, router]);

  const parts = stationGroups.map((g) => ({
    href: `/production/parts/${g.slug}`, label: g.name,
    waiting: lineStations.filter((s) => s.group === g.name).reduce((n, s) => n + waitingCount(store, s.id), 0),
  }));
  const partSlug = pathname.startsWith('/production/parts/') ? pathname.split('/')[3] : undefined;
  const pageTitle = partSlug && groupBySlug(partSlug) ? `Production line · ${groupBySlug(partSlug)!.name}` : pathname.startsWith('/search') ? 'Search' : active?.label ?? 'Chocolate Factory';
  const home = !isManager || myStations.length > 0 ? '/work' : '/production';
  const blocked = !isManager && managerOnly.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  // Operators who open a manager page (an old link, a shared device) go straight to their own work.
  const { sessionUserId } = store;
  useEffect(() => { if (sessionUserId && blocked) router.replace('/work'); }, [sessionUserId, blocked, router]);

  // Signing out hands the device to the next person, who should land on their own home page.
  async function switchUser() {
    await signOut();
    router.push('/');
  }

  function search(event: FormEvent) {
    event.preventDefault();
    if (query.trim()) router.push(`/search?q=${encodeURIComponent(query.trim())}`);
  }

  // The session and data come from the server after the page opens.
  if (store.loadError) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="max-w-sm text-center">
          <WifiOff size={28} className="mx-auto text-muted" />
          <h1 className="mt-3 text-[20px] font-extrabold">Cannot reach the server</h1>
          <p className="mt-1 text-[14px] text-muted">{store.notice ?? 'Check the connection, then try again.'}</p>
          <Button className="mt-4" onClick={store.retry}>Try again</Button>
        </div>
      </div>
    );
  }
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
          <input className="topbar-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search batch, lot, supplier or customer" aria-label="Search batches and lots" />
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
          {!store.online && <div className="notice notice-warn" role="status"><WifiOff size={16} className="mt-0.5 shrink-0" /><div>Offline: trying to reach the server. Changes cannot be saved until it is back.</div></div>}
          {store.notice && (
            <div className="notice notice-danger" role="alert">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div className="flex-1">{store.notice}</div>
              <button type="button" className="-my-1 grid min-h-[36px] min-w-[36px] place-items-center rounded-md hover:bg-white/60" onClick={store.dismissNotice} aria-label="Dismiss message"><X size={16} /></button>
            </div>
          )}
          {blocked ? <Notice tone="neutral">This page is for managers. Opening <Link href="/work" className="font-semibold text-green">My work</Link>…</Notice> : children}
        </div>
      </main>

      {/* Mobile bottom navigation */}
      <nav className="bottom-nav md:hidden" aria-label="Mobile navigation">
        <div className="bottom-nav-container">
          {items.filter((item) => item.phone !== false).map((item) => {
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
