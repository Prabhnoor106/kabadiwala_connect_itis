/**
 * Recycler inbox — pickup requests and in-flight deals.
 *
 * A recycler works these left to right: a new quote is accepted or declined,
 * then tracked through pickup and handover. Accepting is gated on being an
 * authorized facility, because material may only ever reach a verified recycler.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useMutation, useTitle } from '../../lib/hooks';
import { money, weight, distance, relative } from '../../lib/format';
import {
  SectionHeader,
  StatusBadge,
  HazardBadge,
  Segmented,
  Sheet,
  Pagination,
  Thumb,
  EmptyState,
  ErrorState,
  InlineError,
  Spinner,
  SkeletonCards,
} from '../../components/ui';
import Icon from '../../components/Icon';

const FILTERS = [
  { value: '', label: 'All' },
  { value: 'quoted', key: 'tx.status.quoted' },
  { value: 'accepted', key: 'tx.status.accepted' },
  { value: 'in_transit', key: 'tx.status.in_transit' },
  { value: 'handed_over', key: 'tx.status.handed_over' },
  { value: 'confirmed', key: 'tx.status.confirmed' },
];

/** Great-circle distance in km, or null when either point is missing. */
function haversineKm(aLat, aLng, bLat, bLng) {
  const nums = [aLat, aLng, bLat, bLng].map(Number);
  if (nums.some((n) => !Number.isFinite(n))) return null;
  const [lat1, lng1, lat2, lng2] = nums;
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export default function Incoming() {
  const { t, lang, isAuthorizedRecycler } = useApp();
  useTitle(t('nav.incoming'));

  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [acting, setActing] = useState(null); // { tx, mode: 'accept' | 'reject' }

  // The recycler's own location powers a best-effort distance to each lot.
  const { data: me } = useQuery(() => api.recyclers.profile(), []);
  const { data, loading, error, refetch } = useQuery(
    () => api.recyclers.incoming({ status, page }),
    [status, page]
  );

  const items = data?.items || [];
  const pagination = data?.pagination;

  const options = FILTERS.map((f) => ({ value: f.value, label: f.key ? t(f.key) : f.label }));

  return (
    <div className="page space-y-6">
      <SectionHeader title={t('nav.incoming')} />

      {!isAuthorizedRecycler && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="flex items-start gap-3">
            <Icon name="alert" size={20} className="mt-0.5 text-amber-700" />
            <div>
              <p className="font-semibold text-amber-900">Verification required to accept lots</p>
              <p className="mt-1 text-sm text-amber-800">
                An admin must authorize your facility before you can accept or decline pickup requests.
                You can review incoming requests below in the meantime.
              </p>
            </div>
          </div>
        </div>
      )}

      <Segmented
        options={options}
        value={status}
        onChange={(v) => {
          setStatus(v);
          setPage(1);
        }}
      />

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : items.length === 0 ? (
        <EmptyState
          icon="package"
          title={t('common.empty')}
          description="No requests match this filter yet. Collectors who choose your facility will show up here."
        />
      ) : (
        <>
          <div className="space-y-3">
            {items.map((tx) => {
              const lot = tx.lot || {};
              const cat = lot.category || {};
              const km = me
                ? haversineKm(
                    me.location_lat,
                    me.location_lng,
                    lot.collection_location_lat,
                    lot.collection_location_lng
                  )
                : null;

              return (
                <div key={tx.id} className="card card-pad">
                  <div className="flex items-start gap-3">
                    <Thumb src={lot.image_url} alt={cat.name} size="lg" />

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-ink-900">{cat.name || 'Material'}</p>
                        <StatusBadge status={tx.status} kind="transaction" label={t(`tx.status.${tx.status}`)} />
                        <HazardBadge level={cat.hazard_level} />
                      </div>

                      <p className="mt-1 text-sm text-ink-600 tabular">
                        {weight(lot.approximate_weight)}
                        {lot.condition ? ` · ${t(`condition.${lot.condition}`)}` : ''}
                        {lot.source_type ? ` · ${t(`source.${lot.source_type}`)}` : ''}
                      </p>

                      <p className="mt-0.5 flex items-center gap-1 text-sm text-ink-500">
                        <Icon name="location" size={14} />
                        {km != null ? (
                          <span className="tabular">{distance(km)} away</span>
                        ) : (
                          <span className="truncate">{lot.collection_address || 'Location not shared'}</span>
                        )}
                      </p>

                      <p className="mt-0.5 text-xs text-ink-400">{relative(tx.created_at, lang)}</p>
                    </div>

                    <div className="shrink-0 text-right">
                      <p className="text-xs text-ink-500">Collector asks</p>
                      <p className="text-lg font-bold text-ink-900 tabular">{money(tx.offered_price)}</p>
                      {lot.estimated_value ? (
                        <p className="text-xs text-ink-400 tabular">est. {money(lot.estimated_value)}</p>
                      ) : null}
                    </div>
                  </div>

                  {/* Row actions */}
                  <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-ink-100 pt-3">
                    <Link to={`/recycler/transactions/${tx.id}`} className="btn-secondary btn-sm">
                      <Icon name="eye" size={16} />
                      {t('common.viewAll')}
                    </Link>

                    {isAuthorizedRecycler && tx.status === 'quoted' && (
                      <>
                        <button
                          type="button"
                          className="btn-secondary btn-sm"
                          onClick={() => setActing({ tx, mode: 'reject' })}
                        >
                          <Icon name="xCircle" size={16} />
                          {t('recycler.reject')}
                        </button>
                        <button
                          type="button"
                          className="btn-primary btn-sm"
                          onClick={() => setActing({ tx, mode: 'accept' })}
                        >
                          <Icon name="checkCircle" size={16} />
                          {t('recycler.accept')}
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <Pagination
            page={pagination?.page || page}
            totalPages={pagination?.totalPages || 1}
            onChange={setPage}
          />
        </>
      )}

      <ActionSheet
        key={acting ? `${acting.tx.id}:${acting.mode}` : 'none'}
        acting={acting}
        onClose={() => setActing(null)}
        onDone={() => {
          setActing(null);
          refetch();
        }}
      />
    </div>
  );
}

/** Accept (optionally re-price + schedule) or decline a quoted request. */
function ActionSheet({ acting, onClose, onDone }) {
  const { t } = useApp();
  const tx = acting?.tx;
  const mode = acting?.mode;

  // Remounted (via key) whenever a different request/action opens, so plain
  // initial state is always correct — no need to reset on prop change.
  const [finalPrice, setFinalPrice] = useState(
    tx?.offered_price != null ? String(Number(tx.offered_price)) : ''
  );
  const [schedule, setSchedule] = useState('');
  const [reason, setReason] = useState('');

  const m = useMutation((body) => api.transactions.setStatus(tx.id, body));

  if (!tx) return null;

  async function submit(e) {
    e.preventDefault();
    try {
      if (mode === 'accept') {
        const body = { status: 'accepted' };
        if (finalPrice !== '') body.final_price = Number(finalPrice);
        if (schedule) body.pickup_scheduled_at = new Date(schedule).toISOString();
        await m.run(body);
      } else {
        await m.run({ status: 'cancelled', cancellation_reason: reason.trim() });
      }
      onDone();
    } catch {
      /* surfaced via m.error */
    }
  }

  const fieldErrors = m.error?.fieldErrors || {};

  return (
    <Sheet
      open={Boolean(tx)}
      onClose={onClose}
      title={mode === 'accept' ? t('recycler.accept') : t('recycler.reject')}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="incoming-action-form"
            disabled={m.pending || (mode === 'reject' && reason.trim().length === 0)}
            className={mode === 'accept' ? 'btn-primary flex-1' : 'btn-danger flex-1'}
          >
            {m.pending ? <Spinner size={18} /> : <Icon name={mode === 'accept' ? 'checkCircle' : 'xCircle'} size={18} />}
            {mode === 'accept' ? t('recycler.accept') : t('recycler.reject')}
          </button>
        </div>
      }
    >
      <form id="incoming-action-form" onSubmit={submit} className="space-y-4">
        <div className="rounded-xl bg-ink-50 px-3 py-2.5 text-sm">
          <p className="font-semibold text-ink-900">{tx.lot?.category?.name || 'Material'}</p>
          <p className="text-ink-600 tabular">
            {weight(tx.lot?.approximate_weight)} · collector asks {money(tx.offered_price)}
          </p>
        </div>

        {mode === 'accept' ? (
          <>
            <div>
              <label className="label" htmlFor="final-price">
                Price you will pay <span className="font-normal text-ink-400">({t('common.optional')})</span>
              </label>
              <input
                id="final-price"
                type="number"
                inputMode="decimal"
                min="0"
                step="1"
                value={finalPrice}
                onChange={(e) => setFinalPrice(e.target.value)}
                className={`input tabular ${fieldErrors.final_price ? 'input-error' : ''}`}
                placeholder={String(Number(tx.offered_price || 0))}
              />
              <p className="field-hint">Leave as-is to accept the collector's asking price.</p>
              {fieldErrors.final_price && <p className="field-error">{fieldErrors.final_price}</p>}
            </div>

            <div>
              <label className="label" htmlFor="pickup-at">
                Schedule pickup <span className="font-normal text-ink-400">({t('common.optional')})</span>
              </label>
              <input
                id="pickup-at"
                type="datetime-local"
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                className="input"
              />
            </div>
          </>
        ) : (
          <div>
            <label className="label" htmlFor="reject-reason">
              Reason for declining <span className="font-normal text-ink-400">({t('common.required')})</span>
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className={`input ${fieldErrors.cancellation_reason ? 'input-error' : ''}`}
              placeholder="e.g. Material outside our accepted categories"
            />
            {fieldErrors.cancellation_reason && (
              <p className="field-error">{fieldErrors.cancellation_reason}</p>
            )}
          </div>
        )}

        {m.error && <InlineError message={m.error.message} />}
      </form>
    </Sheet>
  );
}
