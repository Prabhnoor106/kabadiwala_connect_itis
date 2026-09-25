/**
 * Collectors directory.
 *
 * Collectors sign up with just a phone number, so there is little to review —
 * the one lever an admin has is the verified flag, which this page toggles in
 * place (PATCH /admin/collectors/:id/verification). Phone numbers are masked;
 * an admin managing accounts at scale does not need to see them in full.
 */
import { useState } from 'react';
import api from '../../lib/api';
import { useQuery, useMutation, useTitle } from '../../lib/hooks';
import { phone as fmtPhone, date } from '../../lib/format';
import {
  Segmented,
  Pagination,
  EmptyState,
  ErrorState,
  Spinner,
  SkeletonTable,
} from '../../components/ui';
import Icon from '../../components/Icon';

const PAGE_SIZE = 20;

const FILTERS = [
  { value: '', label: 'All', countKey: 'total' },
  { value: 'true', label: 'Verified', countKey: 'verified' },
  { value: 'false', label: 'Unverified', countKey: 'unverified' },
];

const LANGUAGES = { hi: 'Hindi', mr: 'Marathi', en: 'English' };

export default function AdminCollectors() {
  useTitle('Collectors');

  const [verified, setVerified] = useState(''); // '', 'true', 'false'
  const [page, setPage] = useState(1);

  const { data: stats } = useQuery(() => api.admin.stats(), []);
  const counts = stats?.collectors;

  const { data, loading, error, refetch, setData } = useQuery(
    () =>
      api.admin.collectors({
        page,
        limit: PAGE_SIZE,
        ...(verified ? { is_verified: verified } : {}),
      }),
    [verified, page]
  );

  const items = data?.items || [];
  const pagination = data?.pagination;

  const options = FILTERS.map((f) => ({
    value: f.value,
    label: f.label,
    count: counts ? counts[f.countKey] : undefined,
  }));

  function changeFilter(next) {
    setVerified(next);
    setPage(1);
  }

  // Patch just the toggled row so the table doesn't reflow on every click.
  function handleToggled(updated) {
    setData((prev) =>
      prev
        ? { ...prev, items: prev.items.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)) }
        : prev
    );
  }

  return (
    <div className="page space-y-5">
      <header>
        <h1 className="page-title">Collectors</h1>
        <p className="mt-1 text-sm text-ink-600">
          Waste collectors registered on the platform. Toggle verification per account.
        </p>
      </header>

      <div className="overflow-x-auto pb-1">
        <Segmented options={options} value={verified} onChange={changeFilter} />
      </div>

      {loading && <SkeletonTable rows={8} cols={6} />}

      {error && !loading && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon="users"
          title="No collectors found"
          description={verified ? 'No accounts match this filter.' : 'Collectors appear here after they sign up.'}
        />
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Collector</th>
                  <th className="text-right">Lots</th>
                  <th className="text-right">Deals</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <CollectorRow key={c.id} collector={c} onToggled={handleToggled} />
                ))}
              </tbody>
            </table>
          </div>

          {pagination && (
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onChange={setPage} />
          )}
        </>
      )}
    </div>
  );
}

function CollectorRow({ collector: c, onToggled }) {
  const toggle = useMutation((id, next) => api.admin.setCollectorVerification(id, next));

  async function handleToggle() {
    try {
      const updated = await toggle.run(c.id, !c.is_verified);
      onToggled(updated); // { id, phone, is_verified }
    } catch {
      /* transient; the badge simply stays as-is */
    }
  }

  return (
    <tr>
      <td>
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-500">
            <Icon name="users" size={16} />
          </span>
          <div>
            <p className="font-semibold text-ink-900 tabular">{fmtPhone(c.phone, { mask: true })}</p>
            <p className="text-xs text-ink-500">{LANGUAGES[c.preferred_language] || c.preferred_language || '—'}</p>
          </div>
        </div>
      </td>
      <td className="text-right tabular">{c.lot_count ?? 0}</td>
      <td className="text-right tabular">{c.transaction_count ?? 0}</td>
      <td className="text-sm text-ink-600 tabular">{date(c.created_at)}</td>
      <td>
        {c.is_verified ? (
          <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200">
            <Icon name="checkCircle" size={13} />
            Verified
          </span>
        ) : (
          <span className="badge bg-ink-100 text-ink-600 ring-1 ring-ink-200">
            <Icon name="clock" size={13} />
            Unverified
          </span>
        )}
      </td>
      <td className="text-right">
        <button
          type="button"
          onClick={handleToggle}
          disabled={toggle.pending}
          className={c.is_verified ? 'btn-secondary btn-sm' : 'btn-primary btn-sm'}
        >
          {toggle.pending ? (
            <Spinner size={15} />
          ) : (
            <Icon name={c.is_verified ? 'xCircle' : 'check'} size={15} />
          )}
          {c.is_verified ? 'Unverify' : 'Verify'}
        </button>
      </td>
    </tr>
  );
}
