/**
 * Shared UI primitives.
 *
 * Loading, error and empty states live here so every screen handles them the
 * same way rather than each inventing its own.
 */
import Icon from './Icon';
import { humanize } from '../lib/format';
import { mediaUrl } from '../lib/api';

// ============================================================
// Status badges
// ============================================================

const TX_STATUS_STYLES = {
  quoted: { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', icon: 'clock' },
  accepted: { cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', icon: 'checkCircle' },
  in_transit: { cls: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200', icon: 'truck' },
  handed_over: { cls: 'bg-violet-50 text-violet-700 ring-1 ring-violet-200', icon: 'handCoins' },
  confirmed: { cls: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200', icon: 'shield' },
  completed: { cls: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200', icon: 'check' },
  cancelled: { cls: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200', icon: 'xCircle' },
  disputed: { cls: 'bg-red-50 text-red-700 ring-1 ring-red-200', icon: 'alert' },
};

const LOT_STATUS_STYLES = {
  draft: { cls: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200', icon: 'edit' },
  active: { cls: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200', icon: 'package' },
  matched: { cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', icon: 'factory' },
  in_transaction: { cls: 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200', icon: 'truck' },
  completed: { cls: 'bg-teal-50 text-teal-700 ring-1 ring-teal-200', icon: 'check' },
  expired: { cls: 'bg-ink-100 text-ink-500 ring-1 ring-ink-200', icon: 'clock' },
};

const AUTH_STATUS_STYLES = {
  authorized: { cls: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200', icon: 'shield' },
  pending: { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', icon: 'clock' },
  suspended: { cls: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200', icon: 'alert' },
  revoked: { cls: 'bg-red-50 text-red-700 ring-1 ring-red-200', icon: 'xCircle' },
};

const PAYMENT_STATUS_STYLES = {
  pending: { cls: 'bg-amber-50 text-amber-700 ring-1 ring-amber-200', icon: 'clock' },
  partial: { cls: 'bg-blue-50 text-blue-700 ring-1 ring-blue-200', icon: 'wallet' },
  completed: { cls: 'bg-brand-50 text-brand-700 ring-1 ring-brand-200', icon: 'check' },
  refunded: { cls: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200', icon: 'refresh' },
};

const REGISTRIES = {
  transaction: TX_STATUS_STYLES,
  lot: LOT_STATUS_STYLES,
  authorization: AUTH_STATUS_STYLES,
  payment: PAYMENT_STATUS_STYLES,
};

/**
 * Status pill. `kind` picks the palette; `label` overrides the text so callers
 * can pass a translated string.
 */
export function StatusBadge({ status, kind = 'transaction', label, showIcon = true, className = '' }) {
  if (!status) return null;
  const registry = REGISTRIES[kind] || TX_STATUS_STYLES;
  const style = registry[status] || { cls: 'bg-ink-100 text-ink-600 ring-1 ring-ink-200', icon: 'info' };

  return (
    <span className={`badge ${style.cls} ${className}`}>
      {showIcon && <Icon name={style.icon} size={13} />}
      {label || humanize(status)}
    </span>
  );
}

/** Small hazard indicator — 0 safe through 3 high. */
export function HazardBadge({ level, className = '' }) {
  if (level === null || level === undefined || level === 0) return null;
  const styles = {
    1: { cls: 'bg-yellow-50 text-yellow-700 ring-1 ring-yellow-200', text: 'Low hazard' },
    2: { cls: 'bg-orange-50 text-orange-700 ring-1 ring-orange-200', text: 'Handle with care' },
    3: { cls: 'bg-red-50 text-red-700 ring-1 ring-red-200', text: 'Hazardous' },
  };
  const s = styles[level] || styles[1];

  return (
    <span className={`badge ${s.cls} ${className}`}>
      <Icon name="alert" size={13} />
      {s.text}
    </span>
  );
}

/** Up/down/stable arrow with a percentage. */
export function TrendIndicator({ trend, changePercent, className = '' }) {
  const map = {
    up: { icon: 'arrowUp', cls: 'text-brand-600' },
    down: { icon: 'arrowDown', cls: 'text-red-600' },
    stable: { icon: 'minus', cls: 'text-ink-400' },
  };
  const s = map[trend] || map.stable;

  return (
    <span className={`inline-flex items-center gap-0.5 text-sm font-semibold ${s.cls} ${className}`}>
      <Icon name={s.icon} size={14} />
      {changePercent !== undefined && changePercent !== null && (
        <span className="tabular">{Math.abs(Number(changePercent)).toFixed(1)}%</span>
      )}
    </span>
  );
}

// ============================================================
// Loading states
// ============================================================

export function Spinner({ size = 20, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.2" fill="none" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function LoadingBlock({ label = 'Loading…', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 py-14 text-ink-500 ${className}`}>
      <Spinner size={26} className="text-brand-600" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  );
}

/** Placeholder card grid while data loads. */
export function SkeletonCards({ count = 3, className = '' }) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card card-pad">
          <div className="flex items-start gap-3">
            <div className="skeleton h-12 w-12 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-4 w-2/5" />
              <div className="skeleton h-3 w-3/5" />
            </div>
            <div className="skeleton h-6 w-16 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-ink-200 bg-ink-50 px-4 py-3">
        <div className="skeleton h-3 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 border-b border-ink-100 px-4 py-4 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <div key={c} className="skeleton h-3.5" style={{ width: `${100 / cols - 4}%` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonStats({ count = 4 }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card card-pad space-y-2">
          <div className="skeleton h-3 w-20" />
          <div className="skeleton h-7 w-24" />
        </div>
      ))}
    </div>
  );
}

// ============================================================
// Error and empty states
// ============================================================

/**
 * Error panel. Distinguishes offline from server errors, because the fix
 * differs and these users are frequently on a dead connection.
 */
export function ErrorState({ error, onRetry, className = '' }) {
  const isOffline = error?.status === 0;
  const message = error?.message || 'Something went wrong.';

  return (
    <div className={`card card-pad flex flex-col items-center gap-3 py-10 text-center ${className}`}>
      <div
        className={`flex h-12 w-12 items-center justify-center rounded-full ${
          isOffline ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
        }`}
      >
        <Icon name={isOffline ? 'wifiOff' : 'alert'} size={24} />
      </div>
      <div>
        <p className="font-semibold text-ink-900">
          {isOffline ? 'No internet connection' : 'Could not load this'}
        </p>
        <p className="mt-1 text-sm text-ink-600">{message}</p>
      </div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary btn-sm mt-1">
          <Icon name="refresh" size={16} />
          Try again
        </button>
      )}
    </div>
  );
}

/** Inline error for forms and small regions. */
export function InlineError({ message, className = '' }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className={`flex items-start gap-2 rounded-xl bg-red-50 px-3 py-2.5 text-sm
                  font-medium text-red-700 ring-1 ring-red-200 ${className}`}
    >
      <Icon name="alert" size={16} className="mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

export function SuccessNote({ message, className = '' }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className={`flex items-start gap-2 rounded-xl bg-brand-50 px-3 py-2.5 text-sm
                  font-medium text-brand-700 ring-1 ring-brand-200 ${className}`}
    >
      <Icon name="checkCircle" size={16} className="mt-0.5" />
      <span>{message}</span>
    </div>
  );
}

/**
 * Empty state with an optional primary action — an empty screen with no next
 * step is the most common way a first-time user gets stuck.
 */
export function EmptyState({ icon = 'package', title, description, action, className = '' }) {
  return (
    <div className={`card card-pad flex flex-col items-center gap-3 py-12 text-center ${className}`}>
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-100 text-ink-400">
        <Icon name={icon} size={26} />
      </div>
      <div className="max-w-sm">
        <p className="font-semibold text-ink-900">{title}</p>
        {description && <p className="mt-1 text-sm text-ink-600">{description}</p>}
      </div>
      {action}
    </div>
  );
}

// ============================================================
// Layout helpers
// ============================================================

/** Metric tile. `tone` tints the value for money vs. warnings. */
export function StatTile({ label, value, sub, icon, tone = 'default', className = '' }) {
  const tones = {
    default: 'text-ink-900',
    money: 'text-brand-700',
    warn: 'text-amber-700',
    danger: 'text-red-700',
    muted: 'text-ink-600',
  };

  return (
    <div className={`card card-pad ${className}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
        {icon && (
          <span className="text-ink-400">
            <Icon name={icon} size={16} />
          </span>
        )}
      </div>
      <p className={`mt-1.5 text-2xl font-bold tabular ${tones[tone] || tones.default}`}>{value}</p>
      {sub && <p className="mt-0.5 text-xs text-ink-500">{sub}</p>}
    </div>
  );
}

export function SectionHeader({ title, action, className = '' }) {
  return (
    <div className={`mb-3 flex items-center justify-between gap-3 ${className}`}>
      <h2 className="section-title">{title}</h2>
      {action}
    </div>
  );
}

/** Bottom sheet on mobile, centred dialog on larger screens. */
export function Sheet({ open, onClose, title, children, footer }) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-ink-900/40 animate-fade-in"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full max-w-lg animate-slide-up rounded-t-2xl bg-white
                   shadow-sheet sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3.5">
          <h3 className="font-bold text-ink-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-ink-500 hover:bg-ink-100"
            aria-label="Close"
          >
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4">{children}</div>
        {footer && <div className="border-t border-ink-200 px-4 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

/** Segmented control for small filter sets. */
export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`no-scrollbar flex gap-1.5 overflow-x-auto ${className}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value ?? 'all'}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
              active
                ? 'bg-brand-600 text-white'
                : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'
            }`}
          >
            {opt.label}
            {opt.count !== undefined && (
              <span className={`ml-1.5 tabular ${active ? 'text-brand-100' : 'text-ink-400'}`}>
                {opt.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Simple page-level pagination. */
export function Pagination({ page, totalPages, onChange, className = '' }) {
  if (!totalPages || totalPages <= 1) return null;

  return (
    <div className={`flex items-center justify-center gap-2 pt-4 ${className}`}>
      <button
        type="button"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="btn-secondary btn-sm"
      >
        <Icon name="chevronLeft" size={16} />
      </button>
      <span className="px-2 text-sm font-medium text-ink-600 tabular">
        {page} / {totalPages}
      </span>
      <button
        type="button"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
        className="btn-secondary btn-sm"
      >
        <Icon name="chevronRight" size={16} />
      </button>
    </div>
  );
}

/** Thumbnail with a graceful fallback — seeded image paths often 404 in dev. */
export function Thumb({ src, alt, icon = 'package', size = 'md', className = '' }) {
  const sizes = { sm: 'h-10 w-10', md: 'h-14 w-14', lg: 'h-20 w-20' };
  const box = `${sizes[size] || sizes.md} shrink-0 overflow-hidden rounded-xl bg-ink-100`;

  if (!src) {
    return (
      <div className={`${box} flex items-center justify-center text-ink-400 ${className}`}>
        <Icon name={icon} size={size === 'sm' ? 18 : 22} />
      </div>
    );
  }

  return (
    <div className={`${box} ${className}`}>
      <img
        src={mediaUrl(src)}
        alt={alt || ''}
        loading="lazy"
        className="h-full w-full object-cover"
        onError={(e) => {
          e.currentTarget.style.display = 'none';
        }}
      />
    </div>
  );
}
