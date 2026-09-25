/**
 * Shells for each role.
 *
 * Collectors get a mobile-first bottom tab bar — thumb-reachable, five items
 * max, icons with short labels. Recyclers and admins get a desktop sidebar that
 * collapses to a top bar on small screens, since they work at a desk.
 */
import { NavLink, useNavigate, Link } from 'react-router-dom';
import { useState } from 'react';
import Icon from './Icon';
import { useApp } from '../context/AppContext';
import { useOnline } from '../lib/hooks';
import { LANGUAGES } from '../lib/i18n';

// ============================================================
// Shared pieces
// ============================================================

/** Banner shown whenever the browser reports no connectivity. */
function OfflineBanner() {
  const online = useOnline();
  const { t } = useApp();
  if (online) return null;

  return (
    <div className="flex items-center justify-center gap-2 bg-amber-500 px-4 py-2 text-sm font-semibold text-white">
      <Icon name="wifiOff" size={16} />
      {t('common.offline')}
    </div>
  );
}

/** Language switcher — always reachable, never buried in settings. */
export function LanguagePicker({ compact = false }) {
  const { lang, setLang } = useApp();

  if (compact) {
    return (
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label="Language"
        className="rounded-lg border border-ink-300 bg-white px-2 py-1.5 text-sm font-semibold text-ink-700"
      >
        {LANGUAGES.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className="flex gap-1.5" role="group" aria-label="Language">
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
            lang === l.code
              ? 'bg-brand-600 text-white'
              : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'
          }`}
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}

function BrandMark({ className = '' }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Icon name="refresh" size={18} />
      </span>
      <span className="font-bold tracking-tight text-ink-900">Kabadiwala Connect</span>
    </span>
  );
}

// ============================================================
// Collector shell — mobile first
// ============================================================

const COLLECTOR_TABS = [
  { to: '/app', icon: 'home', key: 'nav.home', end: true },
  { to: '/app/prices', icon: 'tag', key: 'nav.prices' },
  { to: '/app/lots/new', icon: 'plus', key: 'nav.addLot', primary: true },
  { to: '/app/lots', icon: 'package', key: 'nav.lots' },
  { to: '/app/earnings', icon: 'wallet', key: 'nav.earnings' },
];

export function CollectorLayout({ children }) {
  const { t, user, logout, lang } = useApp();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-ink-50" lang={lang}>
      <OfflineBanner />

      <header className="sticky top-0 z-30 border-b border-ink-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link to="/app" className="flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-white">
              <Icon name="refresh" size={19} />
            </span>
            <span className="text-sm font-bold leading-tight text-ink-900">
              {t('auth.title')}
            </span>
          </Link>

          <div className="flex items-center gap-2">
            <LanguagePicker compact />
            <Link
              to="/app/safety"
              className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
              aria-label={t('nav.safety')}
            >
              <Icon name="shield" size={20} />
            </Link>
            <button
              type="button"
              onClick={() => {
                logout();
                navigate('/login');
              }}
              className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
              aria-label={t('nav.logout')}
            >
              <Icon name="logout" size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl safe-bottom">{children}</main>

      {/* Bottom tab bar: primary navigation for a one-handed phone user. */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 border-t border-ink-200 bg-white
                   pb-[env(safe-area-inset-bottom)] sm:hidden"
        aria-label="Main"
      >
        <div className="mx-auto flex max-w-3xl">
          {COLLECTOR_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[11px] font-semibold transition-colors ${
                  isActive ? 'text-brand-700' : 'text-ink-500'
                }`
              }
            >
              {tab.primary ? (
                <span className="-mt-4 flex h-11 w-11 items-center justify-center rounded-full bg-brand-600 text-white shadow-lift">
                  <Icon name={tab.icon} size={24} />
                </span>
              ) : (
                <Icon name={tab.icon} size={21} />
              )}
              <span className={tab.primary ? 'mt-0.5' : ''}>{t(tab.key)}</span>
            </NavLink>
          ))}
        </div>
      </nav>

      {/* Same destinations as a horizontal bar from sm upward. */}
      <nav
        className="sticky bottom-0 z-30 hidden border-t border-ink-200 bg-white sm:block"
        aria-label="Main"
      >
        <div className="mx-auto flex max-w-3xl justify-around px-4">
          {COLLECTOR_TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `flex items-center gap-2 border-t-2 px-3 py-3 text-sm font-semibold transition-colors ${
                  isActive
                    ? 'border-brand-600 text-brand-700'
                    : 'border-transparent text-ink-500 hover:text-ink-700'
                }`
              }
            >
              <Icon name={tab.icon} size={18} />
              {t(tab.key)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}

// ============================================================
// Recycler / Admin shell — sidebar
// ============================================================

const RECYCLER_NAV = [
  { to: '/recycler', icon: 'home', key: 'nav.dashboard', end: true },
  { to: '/recycler/incoming', icon: 'package', key: 'nav.incoming' },
  { to: '/recycler/rates', icon: 'tag', key: 'nav.rates' },
  { to: '/recycler/profile', icon: 'settings', key: 'nav.profile' },
];

const ADMIN_NAV = [
  { to: '/admin', icon: 'chart', key: 'nav.dashboard', end: true, label: 'Overview' },
  { to: '/admin/recyclers', icon: 'factory', label: 'Recyclers' },
  { to: '/admin/collectors', icon: 'users', label: 'Collectors' },
  { to: '/admin/lots', icon: 'package', label: 'Lots' },
  { to: '/admin/prices', icon: 'tag', label: 'Prices' },
  { to: '/admin/datasets', icon: 'download', label: 'Datasets' },
];

function DeskLayout({ children, nav, title, subtitle, badge }) {
  const { t, logout, lang } = useApp();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const signOut = () => {
    logout();
    navigate('/login');
  };

  const links = nav.map((item) => (
    <NavLink
      key={item.to}
      to={item.to}
      end={item.end}
      onClick={() => setMenuOpen(false)}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-colors ${
          isActive ? 'bg-brand-50 text-brand-700' : 'text-ink-600 hover:bg-ink-100'
        }`
      }
    >
      <Icon name={item.icon} size={19} />
      {item.label || t(item.key)}
    </NavLink>
  ));

  return (
    <div className="min-h-screen bg-ink-50 lg:flex" lang={lang}>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 border-r border-ink-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-ink-200 px-4 py-4">
          <BrandMark />
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-wide text-ink-400">
            {title}
          </p>
          {subtitle && <p className="mt-1 text-sm text-ink-600">{subtitle}</p>}
          {badge}
        </div>

        <nav className="flex-1 space-y-1 p-3" aria-label="Main">
          {links}
        </nav>

        <div className="border-t border-ink-200 p-3">
          <button type="button" onClick={signOut} className="btn-ghost w-full justify-start">
            <Icon name="logout" size={18} />
            {t('nav.logout')}
          </button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Mobile top bar */}
        <header className="sticky top-0 z-30 border-b border-ink-200 bg-white lg:hidden">
          <OfflineBanner />
          <div className="flex items-center justify-between gap-3 px-4 py-3">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-ink-600 hover:bg-ink-100"
              aria-label="Menu"
              aria-expanded={menuOpen}
            >
              <Icon name={menuOpen ? 'x' : 'menu'} size={22} />
            </button>
            <span className="truncate text-sm font-bold text-ink-900">{title}</span>
            <button
              type="button"
              onClick={signOut}
              className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
              aria-label={t('nav.logout')}
            >
              <Icon name="logout" size={20} />
            </button>
          </div>

          {menuOpen && (
            <nav className="animate-slide-up space-y-1 border-t border-ink-200 p-3" aria-label="Main">
              {links}
            </nav>
          )}
        </header>

        <div className="hidden lg:block">
          <OfflineBanner />
        </div>

        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

export function RecyclerLayout({ children }) {
  const { user } = useApp();

  const pending = user?.authorization_status && user.authorization_status !== 'authorized';

  return (
    <DeskLayout
      nav={RECYCLER_NAV}
      title="Recycler"
      subtitle={user?.business_name}
      badge={
        pending ? (
          <span className="badge mt-2 bg-amber-50 text-amber-700 ring-1 ring-amber-200">
            <Icon name="clock" size={13} />
            Awaiting verification
          </span>
        ) : (
          <span className="badge mt-2 bg-brand-50 text-brand-700 ring-1 ring-brand-200">
            <Icon name="shield" size={13} />
            Authorized
          </span>
        )
      }
    >
      {children}
    </DeskLayout>
  );
}

export function AdminLayout({ children }) {
  const { user } = useApp();

  return (
    <DeskLayout nav={ADMIN_NAV} title="Admin console" subtitle={user?.full_name || user?.email}>
      {children}
    </DeskLayout>
  );
}
