/**
 * Lot detail.
 *
 * The single view of one collected lot: what it is, what it's worth, where it
 * is in its journey, and the one next step — find a recycler, or open the deal
 * already in motion. Draft lots can still be deleted here.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useMutation, useTitle } from '../../lib/hooks';
import { money, weight, date, dateTime } from '../../lib/format';
import {
  StatusBadge,
  HazardBadge,
  SectionHeader,
  Thumb,
  ErrorState,
  LoadingBlock,
  SkeletonCards,
  InlineError,
  Spinner,
  Sheet,
} from '../../components/ui';
import Icon from '../../components/Icon';
import Timeline from '../../components/Timeline';

export default function LotDetail() {
  const { id } = useParams();
  const { t, lang } = useApp();
  const navigate = useNavigate();
  useTitle(t('lot.myLots'));

  const [confirmDelete, setConfirmDelete] = useState(false);

  const { data: lot, loading, error, refetch } = useQuery(() => api.lots.one(id), [id]);
  const trace = useQuery(() => api.lots.traceability(id, lang), [id, lang]);
  const remove = useMutation(() => api.lots.remove(id));

  if (loading) {
    return (
      <div className="page space-y-5">
        <div className="card card-pad">
          <div className="flex gap-4">
            <div className="skeleton h-20 w-20 rounded-xl" />
            <div className="flex-1 space-y-2">
              <div className="skeleton h-5 w-2/5" />
              <div className="skeleton h-4 w-3/5" />
              <div className="skeleton h-6 w-24 rounded-full" />
            </div>
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

  // The active (non-cancelled) transaction, when one exists. The traceability
  // endpoint already resolves which transaction is the live one.
  const tx =
    trace.data?.transaction && trace.data.transaction.status !== 'cancelled'
      ? trace.data.transaction
      : null;

  const canMatch = !tx && ['draft', 'active', 'matched'].includes(lot.status);
  const isDraft = lot.status === 'draft';

  async function handleDelete() {
    try {
      await remove.run();
      navigate('/app/lots', { replace: true });
    } catch {
      /* surfaced via remove.error */
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

      {/* ---------- Lot summary ---------- */}
      <section className="card card-pad">
        <div className="flex gap-4">
          <Thumb src={lot.image_url} alt={lot.category?.name} icon="package" size="lg" />
          <div className="min-w-0 flex-1">
            <h1 className="page-title truncate">{lot.category?.name}</h1>
            {lot.sub_category?.name && (
              <p className="text-sm text-ink-600">{lot.sub_category.name}</p>
            )}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <StatusBadge status={lot.status} kind="lot" />
              <HazardBadge level={lot.category?.hazard_level} />
            </div>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <Field label={t('lot.weight')} value={weight(lot.approximate_weight)} strong />
          <Field label={t('lot.estimate')} value={money(lot.estimated_value)} tone="money" strong />
          <Field label={t('lot.condition')} value={t(`condition.${lot.condition}`)} />
          <Field label={t('lot.source')} value={t(`source.${lot.source_type}`)} />
          {lot.collection_address && (
            <Field
              className="col-span-2"
              label={t('lot.address')}
              value={
                <span className="inline-flex items-start gap-1.5">
                  <Icon name="location" size={15} className="mt-0.5 shrink-0 text-ink-400" />
                  {lot.collection_address}
                </span>
              }
            />
          )}
          <Field
            className="col-span-2"
            label={t('price.updated')}
            value={dateTime(lot.created_at)}
          />
        </dl>

        {lot.notes && (
          <p className="mt-3 rounded-xl bg-ink-50 px-3 py-2 text-sm italic text-ink-600">
            {lot.notes}
          </p>
        )}
      </section>

      {/* ---------- Primary next step ---------- */}
      {tx && (
        <Link to={`/app/transactions/${tx.id}`} className="btn-primary w-full">
          <Icon name="handCoins" size={18} />
          {t('tx.myDeals')}
          <StatusBadge
            status={tx.status}
            label={t(`tx.status.${tx.status}`)}
            showIcon={false}
            className="bg-white/20 text-white"
          />
        </Link>
      )}

      {canMatch && (
        <Link to={`/app/lots/${id}/matches`} className="btn-primary w-full">
          <Icon name="factory" size={18} />
          {t('lot.findRecyclers')}
        </Link>
      )}

      {lot.status === 'completed' && (
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-3 text-sm font-semibold text-brand-700 ring-1 ring-brand-200">
          <Icon name="checkCircle" size={18} />
          {t('tx.status.completed')}
        </div>
      )}

      {/* ---------- Lot journey ---------- */}
      <section>
        <SectionHeader title={t('lot.timeline')} />
        {trace.loading ? (
          <LoadingBlock label={t('common.loading')} />
        ) : trace.error ? (
          <ErrorState error={trace.error} onRetry={trace.refetch} />
        ) : trace.data?.events?.length ? (
          <div className="card card-pad">
            <Timeline events={trace.data.events} progress={trace.data.progress} />
          </div>
        ) : null}
      </section>

      {/* ---------- Delete (drafts only) ---------- */}
      {isDraft && (
        <section className="pt-2">
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="btn-danger w-full"
          >
            <Icon name="trash" size={18} />
            {t('common.cancel')}
          </button>
        </section>
      )}

      <Sheet
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title={t('common.cancel')}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="btn-secondary flex-1"
              disabled={remove.pending}
            >
              {t('common.close')}
            </button>
            <button
              type="button"
              onClick={handleDelete}
              className="btn-danger flex-1"
              disabled={remove.pending}
            >
              {remove.pending ? <Spinner size={18} /> : <Icon name="trash" size={18} />}
              {t('common.cancel')}
            </button>
          </div>
        }
      >
        <p className="text-sm text-ink-700">
          {lot.category?.name} · {weight(lot.approximate_weight)} ({date(lot.created_at)})
        </p>
        <p className="mt-2 text-sm text-ink-600">
          This draft lot will be permanently removed. This cannot be undone.
        </p>
        {remove.error && <InlineError className="mt-3" message={remove.error.message} />}
      </Sheet>
    </div>
  );
}

function Field({ label, value, strong = false, tone = 'default', className = '' }) {
  const tones = { default: 'text-ink-800', money: 'text-brand-700' };
  return (
    <div className={className}>
      <dt className="text-xs font-semibold uppercase tracking-wide text-ink-500">{label}</dt>
      <dd className={`mt-0.5 ${strong ? 'font-bold' : ''} ${tones[tone] || tones.default} tabular`}>
        {value}
      </dd>
    </div>
  );
}
