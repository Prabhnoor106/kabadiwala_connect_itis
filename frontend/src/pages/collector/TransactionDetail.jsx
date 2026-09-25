/**
 * Transaction detail.
 *
 * One deal, end to end: what's being sold, to whom, for how much, and where it
 * sits in the lifecycle. The verifiable handover reference is given pride of
 * place — it's the receipt a collector can show anyone. The full journey is
 * drawn from the traceability timeline, with the raw status history as a
 * fallback.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useMutation, useTitle } from '../../lib/hooks';
import { money, weight, dateTime, reference } from '../../lib/format';
import {
  StatusBadge,
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

export default function TransactionDetail() {
  const { id } = useParams();
  const { t, lang } = useApp();
  const navigate = useNavigate();
  useTitle(t('tx.myDeals'));

  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  const { data: tx, loading, error, refetch } = useQuery(() => api.transactions.one(id), [id]);

  const lotId = tx?.lot_id ?? tx?.lot?.id ?? null;
  const trace = useQuery(() => api.lots.traceability(lotId, lang), [lotId, lang], {
    enabled: !!lotId,
  });

  const confirm = useMutation(() => api.transactions.confirmHandover(tx.traceability.id));
  const cancel = useMutation((r) =>
    api.transactions.setStatus(id, { status: 'cancelled', cancellation_reason: r })
  );

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

  const handover = tx.traceability;
  const ref = handover?.handover_reference_number;
  const canCancel = ['quoted', 'accepted'].includes(tx.status);
  // The backend auto-confirms the collector side at handover and rejects a
  // collector confirmation with 403 — so this only renders in the (unusual)
  // case the collector side is somehow still unconfirmed.
  const canConfirm = tx.status === 'handed_over' && handover && !handover.collector_confirmed;

  async function handleConfirm() {
    try {
      await confirm.run();
      refetch();
      trace.refetch();
    } catch {
      /* surfaced via confirm.error */
    }
  }

  async function handleCancel() {
    try {
      await cancel.run(reason.trim());
      setCancelOpen(false);
      setReason('');
      refetch();
      trace.refetch();
    } catch {
      /* surfaced via cancel.error */
    }
  }

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
          <Thumb src={tx.lot?.image_url} alt={tx.lot?.category?.name} size="lg" />
          <div className="min-w-0 flex-1">
            {lotId ? (
              <Link to={`/app/lots/${lotId}`} className="truncate font-bold text-ink-900 underline">
                {tx.lot?.category?.name}
              </Link>
            ) : (
              <p className="truncate font-bold text-ink-900">{tx.lot?.category?.name}</p>
            )}
            <p className="truncate text-sm text-ink-600">{tx.recycler?.business_name}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={tx.status} label={t(`tx.status.${tx.status}`)} />
              <StatusBadge status={tx.payment_status} kind="payment" />
            </div>
          </div>
        </div>

        {tx.recycler?.contact_phone && (
          <a href={`tel:${tx.recycler.contact_phone}`} className="btn-secondary mt-4 w-full">
            <Icon name="phone" size={18} />
            {t('recycler.call')}
          </a>
        )}
      </section>

      {/* ---------- Handover reference — the receipt ---------- */}
      {ref && (
        <Link
          to={`/verify/${ref}`}
          className="block rounded-2xl bg-brand-600 p-5 text-white shadow-lift"
        >
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium text-brand-100">{t('tx.reference')}</p>
            <Icon name="shield" size={18} className="text-brand-100" />
          </div>
          <div className="mt-1 flex items-center justify-between">
            <p className="text-2xl font-bold tabular">{reference(ref)}</p>
            <Icon name="chevronRight" size={20} className="text-brand-100" />
          </div>
        </Link>
      )}

      {/* ---------- Money & weight ---------- */}
      <section className="grid grid-cols-2 gap-3">
        <Metric
          label={t('recycler.youGet')}
          value={money(tx.final_price ?? tx.offered_price)}
          tone="money"
        />
        {(tx.final_weight != null || handover?.actual_weight != null) && (
          <Metric
            label={t('lot.weight')}
            value={weight(tx.final_weight ?? handover?.actual_weight)}
          />
        )}
      </section>

      {/* ---------- Actions ---------- */}
      {(canConfirm || canCancel) && (
        <section className="space-y-3">
          {canConfirm && (
            <>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={confirm.pending}
                className="btn-primary w-full"
              >
                {confirm.pending ? <Spinner size={18} /> : <Icon name="checkCircle" size={18} />}
                {t('tx.confirm')}
              </button>
              {confirm.error && <InlineError message={confirm.error.message} />}
            </>
          )}

          {canCancel && (
            <button
              type="button"
              onClick={() => {
                cancel.reset();
                setCancelOpen(true);
              }}
              className="btn-danger w-full"
            >
              <Icon name="xCircle" size={18} />
              {t('common.cancel')}
            </button>
          )}
        </section>
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
        <p className="rounded-xl bg-ink-50 px-4 py-3 text-sm text-ink-600">
          {tx.cancellation_reason}
        </p>
      )}

      {/* ---------- Cancel confirmation ---------- */}
      <Sheet
        open={cancelOpen}
        onClose={() => (cancel.pending ? null : setCancelOpen(false))}
        title={t('common.cancel')}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setCancelOpen(false)}
              className="btn-secondary flex-1"
              disabled={cancel.pending}
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={handleCancel}
              disabled={cancel.pending || !reason.trim()}
              className="btn-danger flex-1"
            >
              {cancel.pending ? <Spinner size={18} /> : <Icon name="xCircle" size={18} />}
              {t('common.cancel')}
            </button>
          </div>
        }
      >
        <label className="label" htmlFor="cancel-reason">
          {t('lot.notes')}
        </label>
        <textarea
          id="cancel-reason"
          rows={3}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          className="input"
          placeholder="Why are you cancelling?"
        />
        {cancel.error && <InlineError className="mt-3" message={cancel.error.message} />}
      </Sheet>
    </div>
  );
}

function Metric({ label, value, tone = 'default' }) {
  const tones = { default: 'text-ink-900', money: 'text-brand-700' };
  return (
    <div className="card card-pad">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular ${tones[tone] || tones.default}`}>{value}</p>
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
            <p className="text-sm font-semibold text-ink-900">
              {t(`tx.status.${h.status}`)}
            </p>
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
