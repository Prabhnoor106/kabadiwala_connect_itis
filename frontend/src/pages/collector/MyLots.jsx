/**
 * My lots.
 *
 * The collector's inventory: everything they've photographed, filterable by
 * where it is in its life — waiting for a recycler, in a deal, or done. Each
 * card is a tap into the lot's detail and next action.
 */
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useTitle } from '../../lib/hooks';
import { money, weight, humanize } from '../../lib/format';
import {
  SectionHeader,
  Segmented,
  StatusBadge,
  Thumb,
  Pagination,
  EmptyState,
  ErrorState,
  SkeletonCards,
} from '../../components/ui';
import Icon from '../../components/Icon';

const LIMIT = 10;
const STATUSES = ['', 'active', 'draft', 'matched', 'in_transaction', 'completed', 'expired'];

export default function MyLots() {
  const { t } = useApp();
  useTitle(t('lot.myLots'));

  const [searchParams, setSearchParams] = useSearchParams();
  const status = searchParams.get('status') || '';
  const [page, setPage] = useState(1);

  const { data, loading, error, refetch } = useQuery(
    () => api.lots.list({ status: status || undefined, page, limit: LIMIT }),
    [status, page]
  );

  function changeStatus(next) {
    setPage(1);
    setSearchParams(next ? { status: next } : {}, { replace: true });
  }

  function changePage(next) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  const lots = data?.items || [];
  const pagination = data?.pagination;

  const options = STATUSES.map((s) => ({
    value: s,
    label: s === '' ? t('common.viewAll') : humanize(s),
  }));

  return (
    <div className="page space-y-5">
      <SectionHeader
        title={t('lot.myLots')}
        action={
          <Link to="/app/lots/new" className="btn-primary btn-sm">
            <Icon name="plus" size={16} />
            {t('nav.addLot')}
          </Link>
        }
      />

      <Segmented options={options} value={status} onChange={changeStatus} />

      {loading ? (
        <SkeletonCards count={4} />
      ) : error ? (
        <ErrorState error={error} onRetry={refetch} />
      ) : lots.length === 0 ? (
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
        <>
          <div className="space-y-3">
            {lots.map((lot) => (
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

          {pagination && (
            <Pagination
              page={pagination.page}
              totalPages={pagination.totalPages}
              onChange={changePage}
            />
          )}
        </>
      )}
    </div>
  );
}
