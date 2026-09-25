/**
 * Earnings.
 *
 * The money view: what a collector has earned in total, this month, what's
 * still owed, and the itemised ledger behind those numbers. Earnings are always
 * derived from real transactions, so every row here traces back to a handover.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useTitle } from '../../lib/hooks';
import { money, weight, date } from '../../lib/format';
import {
  StatTile,
  SectionHeader,
  StatusBadge,
  Thumb,
  Pagination,
  EmptyState,
  ErrorState,
  SkeletonStats,
  SkeletonTable,
} from '../../components/ui';
import Icon from '../../components/Icon';

const LIMIT = 20;

export default function Earnings() {
  const { t } = useApp();
  useTitle(t('nav.earnings'));

  const [page, setPage] = useState(1);

  const dash = useQuery(() => api.collector.dashboard(), []);
  const ledger = useQuery(() => api.collector.ledger({ page, limit: LIMIT }), [page]);

  const earnings = dash.data?.earnings;
  const entries = ledger.data?.entries ?? [];
  const pagination = ledger.data?.pagination;

  return (
    <div className="page space-y-6">
      {/* ---------- Headline tiles ---------- */}
      {dash.loading ? (
        <SkeletonStats count={4} />
      ) : dash.error ? (
        <ErrorState error={dash.error} onRetry={dash.refetch} />
      ) : (
        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile
            label={t('earn.total')}
            value={money(earnings.total)}
            icon="wallet"
            tone="money"
          />
          <StatTile
            label={t('earn.thisMonth')}
            value={money(earnings.last_30d)}
            icon="chart"
          />
          <StatTile
            label={t('earn.pending')}
            value={money(earnings.pending_dues)}
            sub={`${earnings.pending_count} ${t('earn.deals')}`}
            icon="clock"
            tone={earnings.pending_count > 0 ? 'warn' : 'default'}
          />
          <StatTile
            label={t('earn.deals')}
            value={earnings.completed_transactions}
            sub={weight(earnings.total_weight_kg)}
            icon="checkCircle"
          />
        </section>
      )}

      {/* ---------- Ledger ---------- */}
      <section>
        <SectionHeader title={t('earn.ledger')} />

        {ledger.loading ? (
          <SkeletonTable rows={6} cols={3} />
        ) : ledger.error ? (
          <ErrorState error={ledger.error} onRetry={ledger.refetch} />
        ) : entries.length === 0 ? (
          <EmptyState
            icon="wallet"
            title={t('common.empty')}
            description="Your completed deals and payments will appear here."
            action={
              <Link to="/app/lots" className="btn-secondary btn-sm">
                <Icon name="package" size={16} />
                {t('lot.myLots')}
              </Link>
            }
          />
        ) : (
          <>
            <div className="card divide-y divide-ink-100">
              {entries.map((e) => (
                <LedgerRow key={e.transaction_id} entry={e} />
              ))}
            </div>
            {pagination && (
              <Pagination
                page={pagination.page}
                totalPages={pagination.totalPages}
                onChange={setPage}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function LedgerRow({ entry }) {
  const inner = (
    <div className="flex items-center gap-3 px-4 py-3">
      <Thumb src={entry.image_url || entry.icon_url} alt={entry.category_name} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold text-ink-900">{entry.category_name}</p>
        <p className="truncate text-xs text-ink-500">
          {entry.recycler}
          {entry.date && <> · {date(entry.date)}</>}
        </p>
        {entry.weight > 0 && (
          <p className="text-xs text-ink-500 tabular">{weight(entry.weight)}</p>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="font-bold text-brand-700 tabular">{money(entry.amount)}</p>
        <div className="mt-1 flex justify-end">
          <StatusBadge status={entry.payment_status} kind="payment" showIcon={false} />
        </div>
      </div>
    </div>
  );

  // Each row links to its transaction so the collector can see the full record.
  return entry.transaction_id ? (
    <Link
      to={`/app/transactions/${entry.transaction_id}`}
      className="block transition-colors hover:bg-ink-50"
    >
      {inner}
    </Link>
  ) : (
    inner
  );
}
