/**
 * Recycler dashboard.
 *
 * Leads with the one fact that gates everything else — authorization status —
 * then the counts a recycler acts on daily: new requests, pickups in motion,
 * handovers awaiting their confirmation, and what they have already settled.
 */
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useTitle } from '../../lib/hooks';
import { money, moneyCompact, weight, relative } from '../../lib/format';
import {
  StatTile,
  SectionHeader,
  StatusBadge,
  Thumb,
  EmptyState,
  ErrorState,
  SkeletonStats,
  SkeletonCards,
} from '../../components/ui';
import Icon from '../../components/Icon';

const AUTH_COPY = {
  authorized: {
    title: 'Your facility is authorized',
    body: 'You can publish buying rates and accept pickup requests from collectors.',
  },
  pending: {
    title: 'Verification pending',
    body: 'An admin must verify your registration before you can publish rates or accept lots. Set up your rates and profile in the meantime.',
  },
  suspended: {
    title: 'Authorization suspended',
    body: 'Your account is suspended. You cannot accept new lots until an admin restores it.',
  },
  revoked: {
    title: 'Authorization revoked',
    body: 'Your authorization has been revoked. Contact the platform admin for details.',
  },
};

export default function RecyclerHome() {
  const { t, lang } = useApp();
  useTitle(t('nav.dashboard'));

  const { data, loading, error, refetch } = useQuery(() => api.recyclers.dashboard(), []);

  if (loading) {
    return (
      <div className="page space-y-6">
        <div className="skeleton h-28 w-full rounded-2xl" />
        <SkeletonStats count={4} />
        <SkeletonCards count={3} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="page">
        <ErrorState error={error} onRetry={refetch} />
      </div>
    );
  }

  const { profile, counts, totals, recent_activity: recent } = data;
  const status = profile?.authorization_status || 'pending';
  const authorized = status === 'authorized';
  const copy = AUTH_COPY[status] || AUTH_COPY.pending;

  return (
    <div className="page space-y-6">
      {/* ---------- Authorization headline ---------- */}
      <section
        className={
          authorized
            ? 'rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lift'
            : `rounded-2xl p-5 ring-1 ${
                status === 'pending'
                  ? 'bg-amber-50 text-amber-900 ring-amber-200'
                  : 'bg-red-50 text-red-900 ring-red-200'
              }`
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className={authorized ? 'text-sm font-medium text-brand-100' : 'text-sm font-medium opacity-80'}>
              {profile?.business_name || 'Your facility'}
            </p>
            <h1 className="mt-1 text-2xl font-bold">{copy.title}</h1>
            <p className={`mt-1.5 max-w-2xl text-sm ${authorized ? 'text-brand-50' : ''}`}>{copy.body}</p>
          </div>
          <StatusBadge
            status={status}
            kind="authorization"
            className={authorized ? 'bg-white/20 text-white ring-white/30' : ''}
          />
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            to="/recycler/rates"
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${
              authorized ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white/70 text-ink-800 hover:bg-white'
            }`}
          >
            <Icon name="tag" size={16} />
            {t('nav.rates')}
          </Link>
          <Link
            to="/recycler/incoming"
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold ${
              authorized ? 'bg-white/15 text-white hover:bg-white/25' : 'bg-white/70 text-ink-800 hover:bg-white'
            }`}
          >
            <Icon name="package" size={16} />
            {t('nav.incoming')}
          </Link>
        </div>
      </section>

      {/* ---------- Counts that need action ---------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="New requests"
          value={counts.pending_requests}
          sub={t('tx.status.quoted')}
          icon="package"
          tone={counts.pending_requests > 0 ? 'warn' : 'default'}
        />
        <StatTile
          label="Pickups in motion"
          value={counts.accepted + counts.in_transit}
          sub={`${counts.in_transit} ${t('tx.status.in_transit').toLowerCase()}`}
          icon="truck"
        />
        <StatTile
          label="Awaiting your confirmation"
          value={counts.awaiting_confirmation}
          sub={t('tx.status.handed_over')}
          icon="handCoins"
          tone={counts.awaiting_confirmation > 0 ? 'warn' : 'default'}
        />
        <StatTile
          label="Completed deals"
          value={totals.completed_transactions}
          sub={t('tx.status.completed')}
          icon="checkCircle"
          tone="money"
        />
      </section>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Total paid out" value={moneyCompact(totals.total_paid)} icon="wallet" tone="money" />
        <StatTile label="Material processed" value={weight(totals.total_weight_kg)} icon="chart" tone="muted" />
        <StatTile
          label="Materials priced"
          value={profile?.materials_accepted ?? 0}
          sub="categories"
          icon="tag"
        />
        <StatTile
          label="Service radius"
          value={profile?.max_pickup_distance_km ? `${profile.max_pickup_distance_km} km` : '—'}
          sub={profile?.pickup_available ? t('recycler.pickup') : t('recycler.dropOff')}
          icon="location"
          tone="muted"
        />
      </section>

      {/* ---------- New-request nudge ---------- */}
      {counts.pending_requests > 0 && (
        <Link
          to="/recycler/incoming"
          className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3.5 ring-1 ring-amber-200 transition-shadow hover:shadow-lift"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
            <Icon name="package" size={20} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-amber-900">
              {counts.pending_requests} new pickup{counts.pending_requests > 1 ? 's' : ''} to review
            </p>
            <p className="text-sm text-amber-800">Accept or decline collectors who chose your facility.</p>
          </div>
          <Icon name="chevronRight" size={18} className="text-amber-700" />
        </Link>
      )}

      {/* ---------- Recent activity ---------- */}
      <section>
        <SectionHeader
          title="Recent activity"
          action={
            <Link to="/recycler/incoming" className="text-sm font-semibold text-brand-700 underline">
              {t('common.viewAll')}
            </Link>
          }
        />

        {!recent || recent.length === 0 ? (
          <EmptyState
            icon="package"
            title={t('common.empty')}
            description="Pickup requests and deals you are working on will appear here."
          />
        ) : (
          <div className="space-y-3">
            {recent.map((r) => (
              <Link
                key={r.id}
                to={`/recycler/transactions/${r.id}`}
                className="card card-pad flex items-center gap-3 transition-shadow hover:shadow-lift"
              >
                <Thumb src={null} alt={r.category} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{r.category || 'Material'}</p>
                  <p className="text-sm text-ink-600 tabular">{weight(r.weight)}</p>
                  <div className="mt-1.5">
                    <StatusBadge status={r.status} kind="transaction" label={t(`tx.status.${r.status}`)} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-ink-900 tabular">{money(r.amount)}</p>
                  <p className="text-xs text-ink-500">{relative(r.created_at, lang)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
