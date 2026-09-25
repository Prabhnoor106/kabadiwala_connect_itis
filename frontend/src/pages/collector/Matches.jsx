/**
 * Recycler matches for one lot.
 *
 * The ranked shortlist of authorized recyclers who will take this material,
 * best offer first. A collector picks one and requests a pickup — that single
 * tap creates the transaction and moves the lot into a deal.
 */
import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useMutation, useTitle } from '../../lib/hooks';
import { money, rate, distance, weight } from '../../lib/format';
import {
  StatusBadge,
  SectionHeader,
  Thumb,
  Sheet,
  EmptyState,
  ErrorState,
  InlineError,
  SkeletonCards,
  Spinner,
} from '../../components/ui';
import Icon from '../../components/Icon';

export default function Matches() {
  const { id } = useParams();
  const { t } = useApp();
  const navigate = useNavigate();
  useTitle(t('lot.findRecyclers'));

  const [selected, setSelected] = useState(null);

  const { data, loading, error, refetch } = useQuery(() => api.lots.matches(id, 8), [id]);
  const lotQ = useQuery(() => api.lots.one(id), [id]);
  const request = useMutation((recyclerId, offeredPrice) =>
    api.transactions.create({ lot_id: id, recycler_id: recyclerId, offered_price: offeredPrice })
  );

  const lot = lotQ.data;
  const matches = data?.matches ?? [];

  async function handleRequest() {
    if (!selected) return;
    try {
      const tx = await request.run(selected.recycler.id, selected.estimated_payout);
      navigate(`/app/transactions/${tx.id}`, { replace: true });
    } catch {
      /* surfaced via request.error inside the sheet */
    }
  }

  function openConfirm(match) {
    request.reset();
    setSelected(match);
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

      {/* ---------- Lot context ---------- */}
      {lot && (
        <div className="card card-pad flex items-center gap-3">
          <Thumb src={lot.image_url} alt={lot.category?.name} size="md" />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink-900">{lot.category?.name}</p>
            <p className="text-sm text-ink-600 tabular">
              {weight(lot.approximate_weight)}
              {lot.estimated_value != null && <> · {money(lot.estimated_value)}</>}
            </p>
          </div>
          <StatusBadge status={lot.status} kind="lot" />
        </div>
      )}

      {/* Lot already committed elsewhere — requesting will be refused, so point back. */}
      {lot && !['draft', 'active', 'matched'].includes(lot.status) && (
        <Link
          to={`/app/lots/${id}`}
          className="flex items-center gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200"
        >
          <Icon name="info" size={18} />
          <span className="flex-1">{t('tx.myDeals')}</span>
          <Icon name="chevronRight" size={16} />
        </Link>
      )}

      <SectionHeader title={t('lot.findRecyclers')} />

      {/* ---------- States ---------- */}
      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : matches.length === 0 ? (
        <EmptyState
          icon="factory"
          title={t('common.empty')}
          description="No authorized recyclers accept this material near you yet. Check back soon."
          action={
            <Link to="/app/lots" className="btn-secondary btn-sm">
              <Icon name="chevronLeft" size={16} />
              {t('common.back')}
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {matches.map((m) => (
            <MatchCard key={m.recycler.id} match={m} onRequest={() => openConfirm(m)} />
          ))}
        </div>
      )}

      {/* ---------- Confirm request ---------- */}
      <Sheet
        open={!!selected}
        onClose={() => (request.pending ? null : setSelected(null))}
        title={t('recycler.request')}
        footer={
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="btn-secondary flex-1"
              disabled={request.pending}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleRequest}
              className="btn-primary flex-1"
              disabled={request.pending}
            >
              {request.pending ? <Spinner size={18} /> : <Icon name="truck" size={18} />}
              {t('recycler.request')}
            </button>
          </div>
        }
      >
        {selected && (
          <div className="space-y-4">
            <div>
              <p className="font-semibold text-ink-900">{selected.recycler.business_name}</p>
              <div className="mt-1">
                <StatusBadge status={selected.recycler.authorization_status} kind="authorization" />
              </div>
            </div>

            <div className="rounded-xl bg-brand-50 px-4 py-3 ring-1 ring-brand-200">
              <p className="text-sm font-medium text-brand-700">{t('recycler.youGet')}</p>
              <p className="text-3xl font-bold text-brand-800 tabular">
                {money(selected.estimated_payout)}
              </p>
              {selected.offered_rate != null && (
                <p className="mt-0.5 text-sm text-brand-700 tabular">{rate(selected.offered_rate)}</p>
              )}
            </div>

            {!selected.meets_min_quantity && selected.min_quantity != null && (
              <InlineError
                message={`This recycler needs at least ${weight(selected.min_quantity)}. Your lot may be too small.`}
              />
            )}

            {request.error && <InlineError message={request.error.message} />}
          </div>
        )}
      </Sheet>
    </div>
  );
}

function MatchCard({ match, onRequest }) {
  const { t } = useApp();
  const { recycler } = match;
  const isBest = match.rank === 1;
  const willPickup = recycler.pickup_available && match.within_pickup_range !== false;
  const canRequest = typeof match.estimated_payout === 'number' && match.estimated_payout > 0;

  return (
    <div
      className={`card card-pad ${
        isBest ? 'ring-2 ring-brand-500' : ''
      }`}
    >
      {isBest && (
        <div className="mb-2 inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-brand-700">
          <Icon name="checkCircle" size={13} />
          {t('recycler.bestMatch')}
        </div>
      )}

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-ink-900">{recycler.business_name}</p>
          <div className="mt-1">
            <StatusBadge status={recycler.authorization_status} kind="authorization" />
          </div>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-ink-500">{t('recycler.youGet')}</p>
          <p className="text-xl font-bold text-brand-700 tabular">{money(match.estimated_payout)}</p>
          {match.offered_rate != null && (
            <p className="text-xs text-ink-500 tabular">{rate(match.offered_rate)}</p>
          )}
        </div>
      </div>

      {/* Logistics chips — icon-led for quick scanning */}
      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <span className="inline-flex items-center gap-1 rounded-lg bg-ink-50 px-2.5 py-1 font-medium text-ink-700">
          <Icon name={willPickup ? 'truck' : 'location'} size={15} className="text-ink-500" />
          {willPickup ? t('recycler.pickup') : t('recycler.dropOff')}
        </span>
        {match.distance_km != null && (
          <span className="inline-flex items-center gap-1 rounded-lg bg-ink-50 px-2.5 py-1 font-medium text-ink-700 tabular">
            <Icon name="location" size={15} className="text-ink-500" />
            {distance(match.distance_km)}
          </span>
        )}
      </div>

      {!match.meets_min_quantity && match.min_quantity != null && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-amber-700">
          <Icon name="alert" size={13} />
          Min {weight(match.min_quantity)}
        </p>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={onRequest}
          disabled={!canRequest}
          className="btn-primary flex-1"
        >
          <Icon name="truck" size={18} />
          {t('recycler.request')}
        </button>
        {recycler.contact_phone && (
          <a
            href={`tel:${recycler.contact_phone}`}
            className="btn-secondary shrink-0"
            aria-label={t('recycler.call')}
          >
            <Icon name="phone" size={18} />
          </a>
        )}
      </div>
    </div>
  );
}
