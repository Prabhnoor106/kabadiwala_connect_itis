/**
 * Recycler authorization — the admin's core gatekeeping workflow.
 *
 * A recycler cannot be matched with a lot until an admin has vetted its CPCB
 * registration and moved it to "authorized". This screen makes that decision
 * fast and legible: filter by state, read the facility's papers, and set the
 * authorization in one confirmed action (PATCH /recyclers/:id/authorization).
 */
import { useState } from 'react';
import api from '../../lib/api';
import { useQuery, useMutation, useDebounced, useTitle } from '../../lib/hooks';
import { humanize, phone as fmtPhone, date, money } from '../../lib/format';
import {
  StatusBadge,
  Segmented,
  Sheet,
  Pagination,
  EmptyState,
  ErrorState,
  InlineError,
  SuccessNote,
  Spinner,
  SkeletonTable,
} from '../../components/ui';
import Icon from '../../components/Icon';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: '', label: 'All', countKey: 'total' },
  { value: 'pending', label: 'Pending', countKey: 'pending' },
  { value: 'authorized', label: 'Authorized', countKey: 'authorized' },
  { value: 'suspended', label: 'Suspended', countKey: 'suspended' },
  { value: 'revoked', label: 'Revoked', countKey: 'revoked' },
];

/** The four states an admin can set, with plain-language consequences. */
const AUTH_CHOICES = [
  {
    value: 'authorized',
    label: 'Authorized',
    help: 'Can be matched with lots and accept material.',
    ring: 'ring-brand-500',
    bg: 'bg-brand-50',
    icon: 'checkCircle',
    iconColor: 'text-brand-700',
  },
  {
    value: 'pending',
    label: 'Pending review',
    help: 'Not matched with lots until an admin approves it.',
    ring: 'ring-amber-500',
    bg: 'bg-amber-50',
    icon: 'clock',
    iconColor: 'text-amber-700',
  },
  {
    value: 'suspended',
    label: 'Suspended',
    help: 'Temporarily blocked from new lots. Reversible.',
    ring: 'ring-orange-500',
    bg: 'bg-orange-50',
    icon: 'alert',
    iconColor: 'text-orange-700',
  },
  {
    value: 'revoked',
    label: 'Revoked',
    help: 'Removed from matching. Use for lost or invalid registration.',
    ring: 'ring-red-500',
    bg: 'bg-red-50',
    icon: 'xCircle',
    iconColor: 'text-red-700',
  },
];

export default function AdminRecyclers() {
  useTitle('Recyclers');

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const search = useDebounced(searchInput, 350);
  const [selected, setSelected] = useState(null);

  // Platform counts drive the segment badges; failure here is non-fatal.
  const { data: stats } = useQuery(() => api.admin.stats(), []);
  const counts = stats?.recyclers;

  const { data, loading, error, refetch } = useQuery(
    () =>
      api.recyclers.list({
        page,
        limit: PAGE_SIZE,
        ...(status ? { authorization_status: status } : {}),
        ...(search ? { search } : {}),
      }),
    [status, page, search]
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

  function handleSaved() {
    setSelected(null);
    refetch();
  }

  return (
    <div className="page space-y-5">
      <header>
        <h1 className="page-title">Recyclers</h1>
        <p className="mt-1 text-sm text-ink-600">
          Verify CPCB registration and control which facilities can receive material.
        </p>
      </header>

      <div className="flex flex-col gap-3">
        <div className="overflow-x-auto pb-1">
          <Segmented options={options} value={status} onChange={changeStatus} />
        </div>
        <label className="relative block max-w-sm">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
            <Icon name="search" size={18} />
          </span>
          <input
            type="search"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Search name or registration…"
            className="input pl-10"
          />
        </label>
      </div>

      {loading && <SkeletonTable rows={8} />}

      {error && !loading && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && items.length === 0 && (
        <EmptyState
          icon="factory"
          title="No recyclers found"
          description={
            status || search
              ? 'No facilities match this filter.'
              : 'Recyclers appear here after they register.'
          }
        />
      )}

      {!loading && !error && items.length > 0 && (
        <>
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th>Contact</th>
                  <th className="text-right">Materials</th>
                  <th>Joined</th>
                  <th>Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <p className="font-semibold text-ink-900">{r.business_name}</p>
                      <p className="text-xs text-ink-500 tabular">
                        {r.registration_number || 'No registration number'}
                      </p>
                    </td>
                    <td>
                      <p className="text-sm text-ink-700 tabular">{fmtPhone(r.contact_phone)}</p>
                      {r.contact_email && (
                        <p className="flex items-center gap-1 text-xs text-ink-500">
                          <span className="truncate max-w-[180px]">{r.contact_email}</span>
                          {r.email_verified && (
                            <Icon name="checkCircle" size={13} className="shrink-0 text-brand-600" />
                          )}
                        </p>
                      )}
                    </td>
                    <td className="text-right tabular">{r.recycler_materials?.length || 0}</td>
                    <td className="text-sm text-ink-600 tabular">{date(r.created_at)}</td>
                    <td>
                      <StatusBadge status={r.authorization_status} kind="authorization" />
                    </td>
                    <td className="text-right">
                      <button
                        type="button"
                        onClick={() => setSelected(r)}
                        className={r.authorization_status === 'pending' ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
                      >
                        <Icon name="shield" size={15} />
                        {r.authorization_status === 'pending' ? 'Review' : 'Manage'}
                      </button>
                    </td>
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

      <Sheet
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Set authorization"
      >
        {selected && <AuthorizationPanel recycler={selected} onSaved={handleSaved} />}
      </Sheet>
    </div>
  );
}

// ------------------------------------------------------------
// Authorization decision (inside the sheet)
// ------------------------------------------------------------

function AuthorizationPanel({ recycler, onSaved }) {
  const [choice, setChoice] = useState(recycler.authorization_status);
  const save = useMutation((id, next) => api.recyclers.setAuthorization(id, next));

  const changed = choice !== recycler.authorization_status;

  async function submit() {
    try {
      await save.run(recycler.id, choice);
      onSaved();
    } catch {
      /* surfaced via save.error */
    }
  }

  return (
    <div className="space-y-5">
      {/* Facility papers */}
      <div className="rounded-xl bg-ink-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-bold text-ink-900">{recycler.business_name}</p>
            <p className="text-sm text-ink-600 tabular">
              {recycler.registration_number || 'No CPCB registration number on file'}
            </p>
          </div>
          <StatusBadge status={recycler.authorization_status} kind="authorization" />
        </div>

        <dl className="mt-3 space-y-1.5 text-sm">
          <DetailRow label="Phone" value={fmtPhone(recycler.contact_phone)} mono />
          <DetailRow
            label="Email"
            value={
              recycler.contact_email ? (
                <span className="inline-flex items-center gap-1">
                  {recycler.contact_email}
                  {recycler.email_verified ? (
                    <span className="text-brand-600">verified</span>
                  ) : (
                    <span className="text-ink-400">unverified</span>
                  )}
                </span>
              ) : null
            }
          />
          <DetailRow label="Address" value={recycler.address} />
          <DetailRow
            label="Pickup"
            value={
              recycler.pickup_available
                ? `Yes · up to ${recycler.max_pickup_distance_km ?? '—'} km`
                : 'No'
            }
          />
          <DetailRow label="Registered" value={date(recycler.created_at)} />
        </dl>

        {recycler.recycler_materials?.length > 0 && (
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">
              Buying rates ({recycler.recycler_materials.length})
            </p>
            <div className="flex flex-wrap gap-1.5">
              {recycler.recycler_materials.map((m) => (
                <span
                  key={m.category_id}
                  className="rounded-lg bg-white px-2 py-1 text-xs font-medium text-ink-700 ring-1 ring-ink-200"
                >
                  {m.category?.name || m.category?.code}
                  {m.buying_price != null && (
                    <span className="ml-1 font-semibold text-brand-700 tabular">
                      {money(m.buying_price)}/{m.unit || 'kg'}
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Decision */}
      <div>
        <p className="mb-2 text-sm font-semibold text-ink-800">Authorization status</p>
        <div className="space-y-2">
          {AUTH_CHOICES.map((c) => {
            const active = choice === c.value;
            return (
              <button
                key={c.value}
                type="button"
                onClick={() => setChoice(c.value)}
                className={`flex w-full items-start gap-3 rounded-xl p-3 text-left ring-1 transition-colors ${
                  active ? `${c.bg} ${c.ring}` : 'bg-white ring-ink-200 hover:bg-ink-50'
                }`}
              >
                <span className={`mt-0.5 ${active ? c.iconColor : 'text-ink-400'}`}>
                  <Icon name={c.icon} size={20} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2 font-semibold text-ink-900">
                    {c.label}
                    {c.value === recycler.authorization_status && (
                      <span className="rounded bg-ink-100 px-1.5 py-0.5 text-[11px] font-medium text-ink-500">
                        current
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-ink-500">{c.help}</span>
                </span>
                <span
                  className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${
                    active ? 'border-brand-600 bg-brand-600 ring-2 ring-brand-100' : 'border-ink-300'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {save.error && <InlineError message={save.error.message} />}
      {save.success && <SuccessNote message="Authorization updated." />}

      <button
        type="button"
        onClick={submit}
        disabled={!changed || save.pending}
        className="btn-primary w-full"
      >
        {save.pending ? <Spinner size={18} /> : <Icon name="check" size={18} />}
        {changed ? `Set to ${humanize(choice)}` : 'No change'}
      </button>
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
