/**
 * Collector home.
 *
 * Opens with the number that matters most — money earned — then the two things
 * needing action: lots waiting for a recycler, and deals in motion. Everything
 * else is one tap away.
 */
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useTitle } from '../../lib/hooks';
import { money, moneyCompact, weight, relative } from '../../lib/format';
import {
  StatTile,
  SkeletonStats,
  SkeletonCards,
  ErrorState,
  EmptyState,
  StatusBadge,
  SectionHeader,
  Thumb,
} from '../../components/ui';
import Icon from '../../components/Icon';

export default function CollectorHome() {
  const { t, lang, user } = useApp();
  useTitle(t('nav.home'));

  const { data, loading, error, refetch } = useQuery(() => api.collector.dashboard(), []);

  if (loading) {
    return (
      <div className="page space-y-5">
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

  const { earnings, lots, active_lots: activeLots, live_transactions: liveTx, recent_completed: recent } = data;

  return (
    <div className="page space-y-6">
      {/* ---------- Earnings headline ---------- */}
      <section
        className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lift"
        aria-label={t('earn.total')}
      >
        <p className="text-sm font-medium text-brand-100">{t('earn.total')}</p>
        <p className="mt-1 text-4xl font-bold tabular">{money(earnings.total)}</p>

        <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="text-brand-100">{t('earn.thisMonth')}</p>
            <p className="mt-0.5 text-lg font-bold tabular">{money(earnings.last_30d)}</p>
          </div>
          <div className="rounded-xl bg-white/15 px-3 py-2">
            <p className="text-brand-100">{t('earn.pending')}</p>
            <p className="mt-0.5 text-lg font-bold tabular">{money(earnings.pending_dues)}</p>
          </div>
        </div>

        <Link
          to="/app/earnings"
          className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-white underline"
        >
          {t('earn.ledger')}
          <Icon name="chevronRight" size={15} />
        </Link>
      </section>

      {/* ---------- Quick counts ---------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t('lot.myLots')}
          value={lots.total}
          sub={`${lots.active} ${t('tx.status.quoted').toLowerCase()}`}
          icon="package"
        />
        <StatTile
          label={t('earn.deals')}
          value={earnings.completed_transactions}
          sub={t('tx.status.completed')}
          icon="checkCircle"
          tone="money"
        />
        <StatTile
          label="Weight sold"
          value={weight(earnings.total_weight_kg)}
          icon="chart"
          tone="muted"
        />
        <StatTile
          label={t('earn.pending')}
          value={earnings.pending_count}
          sub={moneyCompact(earnings.pending_dues)}
          icon="clock"
          tone={earnings.pending_count > 0 ? 'warn' : 'default'}
        />
      </section>

      {/* ---------- Primary actions ---------- */}
      <section className="grid grid-cols-2 gap-3">
        <Link
          to="/app/lots/new"
          className="card card-pad flex flex-col items-center gap-2 text-center transition-shadow hover:shadow-lift"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <Icon name="camera" size={24} />
          </span>
          <span className="font-semibold text-ink-900">{t('nav.addLot')}</span>
        </Link>
        <Link
          to="/app/prices"
          className="card card-pad flex flex-col items-center gap-2 text-center transition-shadow hover:shadow-lift"
        >
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-rupee-100 text-rupee-700">
            <Icon name="tag" size={24} />
          </span>
          <span className="font-semibold text-ink-900">{t('price.board')}</span>
        </Link>
      </section>

      {/* ---------- Deals in motion ---------- */}
      {liveTx.length > 0 && (
        <section>
          <SectionHeader title={t('tx.myDeals')} />
          <div className="space-y-3">
            {liveTx.map((tx) => (
              <Link
                key={tx.id}
                to={`/app/transactions/${tx.id}`}
                className="card card-pad flex items-center gap-3 transition-shadow hover:shadow-lift"
              >
                <Thumb src={tx.lot?.image_url} alt={tx.lot?.category?.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{tx.lot?.category?.name}</p>
                  <p className="truncate text-sm text-ink-600">{tx.recycler?.business_name}</p>
                  <div className="mt-1.5">
                    <StatusBadge status={tx.status} label={t(`tx.status.${tx.status}`)} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-ink-900 tabular">
                    {money(tx.final_price ?? tx.offered_price)}
                  </p>
                  <p className="text-xs text-ink-500">{relative(tx.created_at, lang)}</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Lots waiting for a recycler ---------- */}
      <section>
        <SectionHeader
          title={t('lot.myLots')}
          action={
            <Link to="/app/lots" className="text-sm font-semibold text-brand-700 underline">
              {t('common.viewAll')}
            </Link>
          }
        />

        {activeLots.length === 0 ? (
          <EmptyState
            icon="package"
            title={t('common.empty')}
            description="Photograph your collected material and get an instant value estimate."
            action={
              <Link to="/app/lots/new" className="btn-primary btn-sm">
                <Icon name="plus" size={16} />
                {t('nav.addLot')}
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {activeLots.map((lot) => (
              <Link
                key={lot.id}
                to={`/app/lots/${lot.id}`}
                className="card card-pad flex items-center gap-3 transition-shadow hover:shadow-lift"
              >
                <Thumb src={lot.image_url} alt={lot.category?.name} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-ink-900">{lot.category?.name}</p>
                  <p className="text-sm text-ink-600 tabular">
                    {weight(lot.approximate_weight)} · {t(`condition.${lot.condition}`)}
                  </p>
                  <div className="mt-1.5">
                    <StatusBadge status={lot.status} kind="lot" />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-ink-500">{t('lot.estimate')}</p>
                  <p className="font-bold text-brand-700 tabular">{money(lot.estimated_value)}</p>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Recently completed ---------- */}
      {recent.length > 0 && (
        <section>
          <SectionHeader title={t('tx.status.completed')} />
          <div className="card divide-y divide-ink-100">
            {recent.map((r) => (
              <div key={r.transaction_id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-100 text-brand-700">
                  <Icon name="check" size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-ink-900">{r.category}</p>
                  <p className="truncate text-xs text-ink-500">{r.recycler}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-bold text-brand-700 tabular">{money(r.amount)}</p>
                  <p className="text-xs text-ink-500 tabular">{weight(r.weight_kg)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Safety nudge ---------- */}
      <Link
        to="/app/safety"
        className="flex items-center gap-3 rounded-2xl bg-amber-50 px-4 py-3.5 ring-1 ring-amber-200"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
          <Icon name="shield" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-amber-900">{t('safety.title')}</p>
          <p className="text-sm text-amber-800">
            Batteries, CRTs and circuit boards need careful handling.
          </p>
        </div>
        <Icon name="chevronRight" size={18} className="text-amber-700" />
      </Link>

      {!user?.is_verified && (
        <p className="text-center text-xs text-ink-500">
          Your phone number is not verified yet. Some features may be limited.
        </p>
      )}
    </div>
  );
}
