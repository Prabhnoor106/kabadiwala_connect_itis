/**
 * Lots oversight.
 *
 * A read-only ledger of every lot on the platform (GET /admin/lots), filterable
 * by lifecycle state. There is no admin edit action on a lot — the admin's job
 * here is to watch flow and spot stuck or stale inventory — so a row opens a
 * detail sheet built entirely from data already on the page.
 */
import { useState } from 'react';
import api from '../../lib/api';
import { useQuery, useTitle } from '../../lib/hooks';
import { money, weight, humanize, date, dateTime, phone as fmtPhone } from '../../lib/format';
import {
  StatusBadge,
  HazardBadge,
  Segmented,
  Sheet,
  Thumb,
  Pagination,
  EmptyState,
  ErrorState,
  SkeletonTable,
} from '../../components/ui';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: '', label: 'All', countKey: 'total' },
  { value: 'active', label: 'Active', countKey: 'active' },
  { value: 'matched', label: 'Matched', countKey: 'matched' },
  { value: 'in_transaction', label: 'In transaction', countKey: 'in_transaction' },
  { value: 'completed', label: 'Completed', countKey: 'completed' },
  { value: 'draft', label: 'Draft', countKey: 'draft' },
  { value: 'expired', label: 'Expired', countKey: 'expired' },
];

export default function AdminLots() {
  useTitle('Lots');

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [active, setActive] = useState(null);

  const { data: stats } = useQuery(() => api.admin.stats(), []);
  const counts = stats?.lots;

  const { data, loading, error, refetch } = useQuery(
    () =>
      api.admin.lots({
        page,
        limit: PAGE_SIZE,
        ...(status ? { status } : {}),
      }),
    [status, page]
  );

  const items = data?.items || [];
  const pagination = data?.pagination;

  const options = STATUS_FILTERS.map((f) => ({
    value: f.value,
    label: f.label,
    count: counts ? counts[f.countKey] : undefined,
  }));

  function changeStatus(next) {
    setStatus(next);
    setPage(1);
  }

  return (
    <div className="page space-y-5">
      <header>
        <h1 className="page-title">Lots</h1>
        <p className="mt-1 text-sm text-ink-600">Every lot listed on the platform, across its lifecycle.</p>
      </header>

      <div className="overflow-x-auto pb-1">
        <Segmented options={options} value={status} onChange={changeStatus} />
      </div>

      {loading && <SkeletonTable rows={8} cols={6} />}

      {error && !loading && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon="package"
          title="No lots found"
          description={status ? 'No lots in this state.' : 'Lots appear here as collectors list material.'}
        />
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Material</th>
                  <th className="text-right">Weight</th>
                  <th>Condition</th>
                  <th className="text-right">Est. value</th>
                  <th>Collector</th>
                  <th>Status</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {items.map((lot) => (
                  <tr
                    key={lot.id}
                    onClick={() => setActive(lot)}
                    className="cursor-pointer hover:bg-ink-50"
                  >
                    <td>
                      <div className="flex items-center gap-2.5">
                        <Thumb src={lot.image_url} alt={lot.category?.name} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">{lot.category?.name || '—'}</p>
                          <div className="mt-0.5">
                            <HazardBadge level={lot.category?.hazard_level} />
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="text-right tabular">{weight(lot.approximate_weight)}</td>
                    <td className="text-sm text-ink-700">{humanize(lot.condition)}</td>
                    <td className="text-right font-semibold text-brand-700 tabular">{money(lot.estimated_value)}</td>
                    <td className="text-sm text-ink-600 tabular">{fmtPhone(lot.collector?.phone, { mask: true })}</td>
                    <td>
                      <StatusBadge status={lot.status} kind="lot" />
                    </td>
                    <td className="text-sm text-ink-600 tabular">{date(lot.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={setPage} />
          )}
        </>
      )}

      <Sheet open={Boolean(active)} onClose={() => setActive(null)} title={active?.category?.name || 'Lot'}>
        {active && <LotDetail lot={active} />}
      </Sheet>
    </div>
  );
}

function LotDetail({ lot }) {
  const tx = lot.transactions?.[0]; // endpoint returns only the latest

  return (
    <div className="space-y-4">
      <div className="flex gap-3">
        <Thumb src={lot.image_url} alt={lot.category?.name} size="lg" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-lg font-bold text-ink-900">{lot.category?.name || '—'}</p>
            <HazardBadge level={lot.category?.hazard_level} />
          </div>
          <div className="mt-1">
            <StatusBadge status={lot.status} kind="lot" />
          </div>
          <p className="mt-2 text-2xl font-bold text-brand-700 tabular">{money(lot.estimated_value)}</p>
          <p className="text-xs text-ink-500">Platform estimate</p>
        </div>
      </div>

      <dl className="space-y-1.5 rounded-xl bg-ink-50 p-3.5 text-sm">
        <DetailRow label="Weight" value={weight(lot.approximate_weight)} mono />
        <DetailRow label="Condition" value={humanize(lot.condition)} />
        <DetailRow label="Source" value={humanize(lot.source_type)} />
        <DetailRow label="Category code" value={lot.category?.code} mono />
        <DetailRow label="Collector" value={fmtPhone(lot.collector?.phone, { mask: true })} mono />
        <DetailRow label="Pickup address" value={lot.collection_address} />
        <DetailRow label="Listed" value={dateTime(lot.created_at)} />
      </dl>

      <div>
        <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Latest transaction</p>
        {tx ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-white p-3 ring-1 ring-ink-200">
            <StatusBadge status={tx.status} kind="transaction" />
            <span className="font-bold text-ink-900 tabular">
              {money(tx.final_price ?? tx.offered_price)}
            </span>
          </div>
        ) : (
          <p className="text-sm text-ink-500">No transaction on this lot yet.</p>
        )}
      </div>
    </div>
  );
}

function DetailRow({ label, value, mono = false }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className={`min-w-0 text-right text-ink-800 ${mono ? 'tabular' : ''}`}>{value}</dd>
    </div>
  );
}
