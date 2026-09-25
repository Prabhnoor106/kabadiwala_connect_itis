/**
 * Recycler deal detail.
 *
 * One incoming deal, end to end. The recycler drives the lifecycle from here:
 * accept a quote, start the pickup, record the physical handover (the weigh-in
 * that mints the verifiable reference), confirm receipt, then settle payment.
 * Every action is gated on the facility being authorized — unverified recyclers
 * may look but not touch, because material must only ever reach a verified site.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useMutation, useGeolocation, useTitle } from '../../lib/hooks';
import { money, weight, dateTime, reference, phone as fmtPhone } from '../../lib/format';
import {
  StatusBadge,
  HazardBadge,
  SectionHeader,
  Thumb,
  Sheet,
  ErrorState,
  LoadingBlock,
  InlineError,
  SkeletonCards,
  Spinner,
} from '../../components/ui';
import Icon from '../../components/Icon';
import Timeline from '../../components/Timeline';

const PAYMENT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'upi', label: 'UPI' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
];

export default function RecyclerTransactionDetail() {
  const { id } = useParams();
  const { t, lang, isAuthorizedRecycler } = useApp();
  const navigate = useNavigate();
  useTitle(t('tx.myDeals'));

  const [sheet, setSheet] = useState(null); // 'accept' | 'cancel' | 'handover' | 'complete'

  const { data: tx, loading, error, refetch } = useQuery(() => api.transactions.one(id), [id]);

  const lotId = tx?.lot_id ?? tx?.lot?.id ?? null;
  const trace = useQuery(() => api.lots.traceability(lotId, lang), [lotId, lang], {
    enabled: !!lotId,
  });

  // Direct (input-free) transitions.
  const transit = useMutation(() => api.transactions.setStatus(id, { status: 'in_transit' }));
  const confirm = useMutation(() => api.transactions.confirmHandover(tx.traceability.id));

  if (loading) {
    return (
      <div className="page space-y-5">
        <div className="card card-pad flex gap-4">
          <div className="skeleton h-16 w-16 rounded-xl" />
          <div className="flex-1 space-y-2">
            <div className="skeleton h-5 w-1/2" />
            <div className="skeleton h-4 w-2/3" />
          </div>
        </div>
        <SkeletonCards count={2} />
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

  const lot = tx.lot || {};
  const cat = lot.category || {};
  const handover = tx.traceability;
  const ref = handover?.handover_reference_number;

  function afterMutation() {
    refetch();
    trace.refetch();
  }

  async function runTransit() {
    try {
      await transit.run();
      afterMutation();
    } catch {
      /* surfaced via transit.error */
    }
  }

  async function runConfirm() {
    try {
      await confirm.run();
      afterMutation();
    } catch {
      /* surfaced via confirm.error */
    }
  }

  const actionable = ['quoted', 'accepted', 'in_transit', 'handed_over', 'confirmed'].includes(
    tx.status
  );

  return (
    <div className="page space-y-6">
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="inline-flex items-center gap-1 text-sm font-semibold text-ink-600 hover:text-ink-900"
      >
        <Icon name="chevronLeft" size={18} />
        {t('common.back')}
      </button>

      {/* ---------- Header ---------- */}
      <section className="card card-pad">
        <div className="flex gap-4">
          <Thumb src={lot.image_url} alt={cat.name} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold text-ink-900">{cat.name || 'Material'}</p>
            <p className="text-sm text-ink-600 tabular">
              {weight(lot.approximate_weight)}
              {lot.condition ? ` · ${t(`condition.${lot.condition}`)}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={tx.status} kind="transaction" label={t(`tx.status.${tx.status}`)} />
              {tx.payment_status && <StatusBadge status={tx.payment_status} kind="payment" />}
              <HazardBadge level={cat.hazard_level} />
            </div>
          </div>
        </div>

        {tx.collector?.phone && (
          <a href={`tel:${tx.collector.phone}`} className="btn-secondary mt-4 w-full">
            <Icon name="phone" size={18} />
            {t('recycler.call')} · {fmtPhone(tx.collector.phone)}
          </a>
        )}
      </section>

      {/* ---------- Handover reference — the verifiable receipt ---------- */}
      {ref && (
        <Link to={`/verify/${ref}`} className="block rounded-2xl bg-brand-600 p-5 text-white shadow-lift">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-brand-100">{t('tx.reference')}</p>
            <Icon name="shield" size={18} className="text-brand-100" />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-2xl font-bold tabular">{reference(ref)}</p>
            <Icon name="chevronRight" size={20} className="text-brand-100" />
          </div>
          {handover?.recycler_confirmed ? null : (
            <p className="mt-1 text-xs text-brand-100">Awaiting your confirmation of receipt.</p>
          )}
        </Link>
      )}

      {/* ---------- Money & weight ---------- */}
      <section className="grid grid-cols-2 gap-3">
        <Metric label="You pay" value={money(tx.final_price ?? tx.offered_price)} tone="money" />
        <Metric
          label={t('lot.weight')}
          value={weight(tx.final_weight ?? handover?.actual_weight ?? lot.approximate_weight)}
        />
      </section>

      {/* ---------- Lot details ---------- */}
      <section className="card card-pad">
        <dl className="space-y-1.5 text-sm">
          <Row label="Collector asked" value={money(tx.offered_price)} />
          {lot.estimated_value != null && <Row label="Platform estimate" value={money(lot.estimated_value)} />}
          {lot.source_type && <Row label={t('lot.source')} value={t(`source.${lot.source_type}`)} />}
          {lot.collection_address && <Row label={t('lot.address')} value={lot.collection_address} />}
          {tx.pickup_scheduled_at && <Row label="Pickup scheduled" value={dateTime(tx.pickup_scheduled_at)} />}
          {tx.payment_method && <Row label="Payment method" value={tx.payment_method} />}
          <Row label="Created" value={dateTime(tx.created_at)} />
        </dl>
      </section>

      {/* ---------- Actions ---------- */}
      {actionable && !isAuthorizedRecycler && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="flex items-start gap-3">
            <Icon name="alert" size={20} className="mt-0.5 text-amber-700" />
            <div>
              <p className="font-semibold text-amber-900">Verification required</p>
              <p className="mt-1 text-sm text-amber-800">
                An admin must authorize your facility before you can act on this deal — accept it,
                record a handover, or settle payment.
              </p>
            </div>
          </div>
        </div>
      )}

      {actionable && isAuthorizedRecycler && (
        <section className="space-y-3">
          {tx.status === 'quoted' && (
            <div className="grid grid-cols-2 gap-3">
              <button type="button" onClick={() => setSheet('accept')} className="btn-primary">
                <Icon name="checkCircle" size={18} />
                {t('tx.accept')}
              </button>
              <button type="button" onClick={() => setSheet('cancel')} className="btn-danger">
                <Icon name="xCircle" size={18} />
                {t('tx.reject')}
              </button>
            </div>
          )}

          {tx.status === 'accepted' && (
            <>
              <button type="button" onClick={runTransit} disabled={transit.pending} className="btn-primary w-full">
                {transit.pending ? <Spinner size={18} /> : <Icon name="truck" size={18} />}
                Start pickup
              </button>
              {transit.error && <InlineError message={transit.error.message} />}
              <button type="button" onClick={() => setSheet('handover')} className="btn-secondary w-full">
                <Icon name="handCoins" size={18} />
                {t('tx.handover')}
              </button>
              <button type="button" onClick={() => setSheet('cancel')} className="btn-danger w-full">
                <Icon name="xCircle" size={18} />
                {t('common.cancel')}
              </button>
            </>
          )}

          {tx.status === 'in_transit' && (
            <>
              <button type="button" onClick={() => setSheet('handover')} className="btn-primary w-full">
                <Icon name="handCoins" size={18} />
                {t('tx.handover')}
              </button>
              <button type="button" onClick={() => setSheet('cancel')} className="btn-danger w-full">
                <Icon name="xCircle" size={18} />
                {t('common.cancel')}
              </button>
            </>
          )}

          {tx.status === 'handed_over' && (
            <>
              <button type="button" onClick={runConfirm} disabled={confirm.pending} className="btn-primary w-full">
                {confirm.pending ? <Spinner size={18} /> : <Icon name="checkCircle" size={18} />}
                Confirm receipt
              </button>
              {confirm.error && <InlineError message={confirm.error.message} />}
              <p className="text-center text-xs text-ink-500">
                Confirms the material reached your facility and advances the deal.
              </p>
            </>
          )}

          {tx.status === 'confirmed' && (
            <button type="button" onClick={() => setSheet('complete')} className="btn-primary w-full">
              <Icon name="wallet" size={18} />
              {t('tx.markPaid')} & complete
            </button>
          )}
        </section>
      )}

      {tx.status === 'disputed' && (
        <div className="rounded-2xl bg-red-50 p-4 text-sm text-red-800 ring-1 ring-red-200">
          This deal is under dispute. An admin is reviewing it.
        </div>
      )}

      {/* ---------- Journey ---------- */}
      <section>
        <SectionHeader title={t('lot.timeline')} />
        {trace.loading ? (
          <LoadingBlock label={t('common.loading')} />
        ) : trace.data?.events?.length ? (
          <div className="card card-pad">
            <Timeline events={trace.data.events} progress={trace.data.progress} />
          </div>
        ) : Array.isArray(tx.status_history) && tx.status_history.length ? (
          <StatusHistory history={tx.status_history} t={t} />
        ) : null}
      </section>

      {tx.cancellation_reason && (
        <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">{tx.cancellation_reason}</p>
      )}

      {/* ---------- Action sheets ---------- */}
      {sheet === 'accept' && (
        <AcceptSheet tx={tx} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterMutation(); }} />
      )}
      {sheet === 'cancel' && (
        <CancelSheet id={id} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterMutation(); }} />
      )}
      {sheet === 'handover' && (
        <HandoverSheet id={id} tx={tx} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterMutation(); }} />
      )}
      {sheet === 'complete' && (
        <CompleteSheet tx={tx} onClose={() => setSheet(null)} onDone={() => { setSheet(null); afterMutation(); }} />
      )}
    </div>
  );
}

// ============================================================
// Accept — optional re-price + schedule
// ============================================================

function AcceptSheet({ tx, onClose, onDone }) {
  const { t } = useApp();
  const [finalPrice, setFinalPrice] = useState(
    tx.offered_price != null ? String(Number(tx.offered_price)) : ''
  );
  const [schedule, setSchedule] = useState('');
  const m = useMutation((body) => api.transactions.setStatus(tx.id, body));
  const fieldErrors = m.error?.fieldErrors || {};

  async function submit(e) {
    e.preventDefault();
    const body = { status: 'accepted' };
    if (finalPrice !== '') body.final_price = Number(finalPrice);
    if (schedule) body.pickup_scheduled_at = new Date(schedule).toISOString();
    try {
      await m.run(body);
      onDone();
    } catch {
      /* surfaced via m.error */
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={t('tx.accept')}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="accept-form" disabled={m.pending} className="btn-primary flex-1">
            {m.pending ? <Spinner size={18} /> : <Icon name="checkCircle" size={18} />}
            {t('tx.accept')}
          </button>
        </div>
      }
    >
      <form id="accept-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="ac-price">
            Price you will pay <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <input
            id="ac-price"
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={finalPrice}
            onChange={(e) => setFinalPrice(e.target.value)}
            className={`input tabular ${fieldErrors.final_price ? 'input-error' : ''}`}
            placeholder={String(Number(tx.offered_price || 0))}
          />
          <p className="field-hint">Leave as-is to accept the collector's asking price of {money(tx.offered_price)}.</p>
          {fieldErrors.final_price && <p className="field-error">{fieldErrors.final_price}</p>}
        </div>

        <div>
          <label className="label" htmlFor="ac-schedule">
            Schedule pickup <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <input
            id="ac-schedule"
            type="datetime-local"
            value={schedule}
            onChange={(e) => setSchedule(e.target.value)}
            className={`input ${fieldErrors.pickup_scheduled_at ? 'input-error' : ''}`}
          />
          {fieldErrors.pickup_scheduled_at && <p className="field-error">{fieldErrors.pickup_scheduled_at}</p>}
        </div>

        {m.error && <InlineError message={m.error.message} />}
      </form>
    </Sheet>
  );
}

// ============================================================
// Cancel / reject — reason required
// ============================================================

function CancelSheet({ id, onClose, onDone }) {
  const { t } = useApp();
  const [reason, setReason] = useState('');
  const m = useMutation((r) => api.transactions.setStatus(id, { status: 'cancelled', cancellation_reason: r }));
  const fieldErrors = m.error?.fieldErrors || {};

  async function submit(e) {
    e.preventDefault();
    try {
      await m.run(reason.trim());
      onDone();
    } catch {
      /* surfaced via m.error */
    }
  }

  return (
    <Sheet
      open
      onClose={() => (m.pending ? null : onClose())}
      title={t('common.cancel')}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={m.pending}>
            {t('common.close')}
          </button>
          <button
            type="submit"
            form="cancel-form"
            disabled={m.pending || !reason.trim()}
            className="btn-danger flex-1"
          >
            {m.pending ? <Spinner size={18} /> : <Icon name="xCircle" size={18} />}
            {t('common.cancel')}
          </button>
        </div>
      }
    >
      <form id="cancel-form" onSubmit={submit}>
        <label className="label" htmlFor="cancel-reason">
          Reason <span className="font-normal text-ink-400">({t('common.required')})</span>
        </label>
        <textarea
          id="cancel-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className={`input ${fieldErrors.cancellation_reason ? 'input-error' : ''}`}
          placeholder="Why are you cancelling this deal?"
        />
        {fieldErrors.cancellation_reason && <p className="field-error">{fieldErrors.cancellation_reason}</p>}
        {m.error && <InlineError className="mt-3" message={m.error.message} />}
      </form>
    </Sheet>
  );
}

// ============================================================
// Handover — the weigh-in that mints the reference
// ============================================================

function HandoverSheet({ id, tx, onClose, onDone }) {
  const { t } = useApp();
  const [actualWeight, setActualWeight] = useState(
    tx.lot?.approximate_weight != null ? String(Number(tx.lot.approximate_weight)) : ''
  );
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState([]);
  const geo = useGeolocation();
  const m = useMutation((fd) => api.transactions.handover(id, fd));
  const fieldErrors = m.error?.fieldErrors || {};

  function pickFiles(e) {
    setFiles(Array.from(e.target.files || []).slice(0, 5));
  }

  async function submit(e) {
    e.preventDefault();
    const fd = new FormData();
    fd.append('actual_weight', actualWeight);
    if (notes.trim()) fd.append('notes', notes.trim());
    if (geo.position) {
      fd.append('handover_location_lat', geo.position.lat);
      fd.append('handover_location_lng', geo.position.lng);
    }
    files.forEach((f) => fd.append('photos', f));
    try {
      await m.run(fd);
      onDone();
    } catch {
      /* surfaced via m.error */
    }
  }

  const weightNum = Number(actualWeight);
  const weightValid = actualWeight !== '' && Number.isFinite(weightNum) && weightNum > 0;

  return (
    <Sheet
      open
      onClose={() => (m.pending ? null : onClose())}
      title={t('tx.handover')}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={m.pending}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="handover-form"
            disabled={m.pending || !weightValid}
            className="btn-primary flex-1"
          >
            {m.pending ? <Spinner size={18} /> : <Icon name="handCoins" size={18} />}
            {t('tx.handover')}
          </button>
        </div>
      }
    >
      <form id="handover-form" onSubmit={submit} className="space-y-4">
        <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-800 ring-1 ring-brand-200">
          Recording the handover mints the verifiable reference number and marks the material received.
        </p>

        <div>
          <label className="label" htmlFor="ho-weight">
            {t('tx.actualWeight')} (kg) <span className="font-normal text-ink-400">({t('common.required')})</span>
          </label>
          <input
            id="ho-weight"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={actualWeight}
            onChange={(e) => setActualWeight(e.target.value)}
            className={`input tabular ${fieldErrors.actual_weight ? 'input-error' : ''}`}
            placeholder="0.00"
          />
          <p className="field-hint">Weighed at your facility. Declared: {weight(tx.lot?.approximate_weight)}.</p>
          {fieldErrors.actual_weight && <p className="field-error">{fieldErrors.actual_weight}</p>}
        </div>

        <div>
          <label className="label" htmlFor="ho-photos">
            Photos <span className="font-normal text-ink-400">({t('common.optional')}, up to 5)</span>
          </label>
          <input
            id="ho-photos"
            type="file"
            accept="image/*"
            multiple
            onChange={pickFiles}
            className="input"
          />
          {files.length > 0 && (
            <p className="field-hint">{files.length} photo{files.length > 1 ? 's' : ''} selected.</p>
          )}
          {fieldErrors.photos && <p className="field-error">{fieldErrors.photos}</p>}
        </div>

        <div>
          <label className="label">
            Handover location <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <button
            type="button"
            onClick={() => geo.request()}
            disabled={geo.loading}
            className="btn-secondary btn-sm"
          >
            {geo.loading ? <Spinner size={16} /> : <Icon name="location" size={16} />}
            {geo.position ? 'Location captured' : t('lot.useMyLocation')}
          </button>
          {geo.position && (
            <p className="field-hint tabular">
              {geo.position.lat.toFixed(5)}, {geo.position.lng.toFixed(5)}
            </p>
          )}
          {geo.error && <p className="field-error">{geo.error}</p>}
        </div>

        <div>
          <label className="label" htmlFor="ho-notes">
            {t('lot.notes')} <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <textarea
            id="ho-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="input"
            placeholder="Anything worth recording about this handover"
          />
        </div>

        {m.error && <InlineError message={m.error.message} />}
      </form>
    </Sheet>
  );
}

// ============================================================
// Complete — settle payment
// ============================================================

function CompleteSheet({ tx, onClose, onDone }) {
  const { t } = useApp();
  const [method, setMethod] = useState('cash');
  const [finalPrice, setFinalPrice] = useState(
    (tx.final_price ?? tx.offered_price) != null ? String(Number(tx.final_price ?? tx.offered_price)) : ''
  );
  const m = useMutation((body) => api.transactions.setStatus(tx.id, body));
  const fieldErrors = m.error?.fieldErrors || {};

  async function submit(e) {
    e.preventDefault();
    const body = { status: 'completed', payment_status: 'completed', payment_method: method };
    if (finalPrice !== '') body.final_price = Number(finalPrice);
    try {
      await m.run(body);
      onDone();
    } catch {
      /* surfaced via m.error */
    }
  }

  return (
    <Sheet
      open
      onClose={() => (m.pending ? null : onClose())}
      title={`${t('tx.markPaid')} & complete`}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={m.pending}>
            {t('common.cancel')}
          </button>
          <button type="submit" form="complete-form" disabled={m.pending} className="btn-primary flex-1">
            {m.pending ? <Spinner size={18} /> : <Icon name="check" size={18} />}
            {t('tx.markPaid')}
          </button>
        </div>
      }
    >
      <form id="complete-form" onSubmit={submit} className="space-y-4">
        <p className="rounded-xl bg-brand-50 px-3 py-2.5 text-sm text-brand-800 ring-1 ring-brand-200">
          This records payment and completes the deal. Make sure you have confirmed receipt first.
        </p>

        <div>
          <label className="label" htmlFor="cp-method">
            Payment method
          </label>
          <select
            id="cp-method"
            value={method}
            onChange={(e) => setMethod(e.target.value)}
            className={`input ${fieldErrors.payment_method ? 'input-error' : ''}`}
          >
            {PAYMENT_METHODS.map((pm) => (
              <option key={pm.value} value={pm.value}>
                {pm.label}
              </option>
            ))}
          </select>
          {fieldErrors.payment_method && <p className="field-error">{fieldErrors.payment_method}</p>}
        </div>

        <div>
          <label className="label" htmlFor="cp-price">
            Amount paid <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <input
            id="cp-price"
            type="number"
            inputMode="decimal"
            min="0"
            step="1"
            value={finalPrice}
            onChange={(e) => setFinalPrice(e.target.value)}
            className={`input tabular ${fieldErrors.final_price ? 'input-error' : ''}`}
            placeholder={String(Number(tx.final_price ?? tx.offered_price ?? 0))}
          />
          {fieldErrors.final_price && <p className="field-error">{fieldErrors.final_price}</p>}
        </div>

        {m.error && <InlineError message={m.error.message} />}
      </form>
    </Sheet>
  );
}

// ============================================================
// Shared bits
// ============================================================

function Metric({ label, value, tone = 'default' }) {
  const tones = { default: 'text-ink-900', money: 'text-brand-700' };
  return (
    <div className="card card-pad">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular ${tones[tone] || tones.default}`}>{value}</p>
    </div>
  );
}

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-ink-800">{value}</dd>
    </div>
  );
}

function StatusHistory({ history, t }) {
  return (
    <ol className="card divide-y divide-ink-100">
      {history.map((h, i) => (
        <li key={`${h.status}-${i}`} className="flex items-start gap-3 px-4 py-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-100 text-brand-700">
            <Icon name="check" size={14} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-900">{t(`tx.status.${h.status}`)}</p>
            {h.note && <p className="text-xs text-ink-500">{h.note}</p>}
          </div>
          {h.timestamp && (
            <time className="shrink-0 text-xs text-ink-500 tabular" dateTime={h.timestamp}>
              {dateTime(h.timestamp)}
            </time>
          )}
        </li>
      ))}
    </ol>
  );
}
