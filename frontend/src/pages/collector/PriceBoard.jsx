/**
 * Today's rates board.
 *
 * A scannable list of buying rates the collector can trust at a glance: big
 * number, an up/down arrow, the market range recyclers are actually offering,
 * and how fresh the figure is. Every row can be read aloud (many users read
 * slowly) and tapped to see the 30-day trend.
 */
import { useState } from 'react';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useTitle, useSpeech } from '../../lib/hooks';
import { money, rate, relative } from '../../lib/format';
import {
  TrendIndicator,
  HazardBadge,
  Sheet,
  EmptyState,
  ErrorState,
  SkeletonCards,
  LoadingBlock,
  Spinner,
} from '../../components/ui';
import Icon from '../../components/Icon';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const SPEECH_LOCALE = { hi: 'hi-IN', mr: 'mr-IN', en: 'en-IN' };
const shortDay = (d) => {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function PriceBoard() {
  const { t, lang } = useApp();
  useTitle(t('price.board'));
  const speech = useSpeech();

  const { data, loading, error, refetch } = useQuery(() => api.prices.board(), []);
  const [active, setActive] = useState(null); // row selected for the trend sheet
  const [speakingId, setSpeakingId] = useState(null);

  async function handleSpeak(row) {
    setSpeakingId(row.category_id);
    try {
      const res = await api.prices.speak(row.category_id, lang);
      const locale = res?.speech_locale || SPEECH_LOCALE[lang] || 'en-IN';
      if (res?.text) speech.speak(res.text, locale);
    } catch {
      /* speaking is a nicety — never block the board on it */
    } finally {
      setSpeakingId(null);
    }
  }

  if (loading) {
    return (
      <div className="page space-y-5">
        <div className="skeleton h-7 w-40" />
        <SkeletonCards count={6} />
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

  const rows = data || [];

  return (
    <div className="page space-y-5">
      <header>
        <h1 className="page-title">{t('price.board')}</h1>
        <p className="mt-1 text-sm text-ink-600">{t('price.perKg')}</p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon="tag"
          title={t('common.empty')}
          description="Rates appear here as recyclers publish their buying prices."
        />
      ) : (
        <div className="space-y-3">
          {rows.map((row) => (
            <PriceRow
              key={row.category_id}
              row={row}
              onOpen={() => setActive(row)}
              onSpeak={() => handleSpeak(row)}
              canSpeak={speech.supported}
              speaking={speakingId === row.category_id}
            />
          ))}
        </div>
      )}

      <Sheet open={Boolean(active)} onClose={() => setActive(null)} title={active?.category_name}>
        {active && <TrendPanel row={active} />}
      </Sheet>
    </div>
  );
}

// ------------------------------------------------------------
// One material rate
// ------------------------------------------------------------

function PriceRow({ row, onOpen, onSpeak, canSpeak, speaking }) {
  const { t, lang } = useApp();
  const hasPrice = row.current_price !== null && row.current_price !== undefined;
  const headline = hasPrice ? row.current_price : row.best_offer;

  return (
    <div className="card card-pad">
      <div className="flex items-stretch gap-3">
        {/* Main tappable area → trend sheet */}
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <p className="truncate text-lg font-bold text-ink-900">{row.category_name}</p>
            <HazardBadge level={row.hazard_level} />
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-brand-700 tabular">
              {rate(headline, row.unit)}
            </span>
            <TrendIndicator trend={row.trend} changePercent={row.change_percent} />
          </div>

          {!hasPrice && row.best_offer != null && (
            <p className="text-xs font-semibold text-ink-500">{t('price.best')}</p>
          )}

          {row.market_range && (
            <p className="mt-1 text-sm text-ink-600">
              {t('price.range')}:{' '}
              <span className="tabular font-semibold text-ink-800">
                {money(row.market_range.min)}–{money(row.market_range.max)}
              </span>
            </p>
          )}

          {row.last_updated && (
            <p className="mt-1 text-xs text-ink-500">
              {t('price.updated')} {relative(row.last_updated, lang)}
            </p>
          )}
        </button>

        {/* Actions */}
        <div className="flex flex-col items-end justify-between gap-2">
          {canSpeak && (
            <button
              type="button"
              onClick={onSpeak}
              disabled={speaking}
              className="btn-secondary btn-sm"
              aria-label={t('price.listen')}
            >
              {speaking ? <Spinner size={16} /> : <Icon name="speaker" size={18} />}
            </button>
          )}
          <button
            type="button"
            onClick={onOpen}
            className="text-ink-400 hover:text-ink-600"
            aria-label={t('price.trend30')}
          >
            <Icon name="chart" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// 30-day trend (inside the sheet)
// ------------------------------------------------------------

function TrendPanel({ row }) {
  const { t } = useApp();
  const { data, loading, error, refetch } = useQuery(
    () => api.prices.trend(row.category_id, 30),
    [row.category_id]
  );

  if (loading) return <LoadingBlock label={t('common.loading')} />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const series = data?.series || [];
  const summary = data?.summary;

  if (series.length === 0) {
    return (
      <EmptyState
        icon="chart"
        title={t('common.empty')}
        description="No recorded price history for the last 30 days."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">
            {t('price.trend30')}
          </p>
          <p className="mt-0.5 text-2xl font-bold text-ink-900 tabular">
            {rate(summary?.period_avg, row.unit)}
          </p>
        </div>
        {summary && (
          <TrendIndicator trend={summary.direction} changePercent={summary.change_percent} />
        )}
      </div>

      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={shortDay}
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={{ stroke: '#e2e8f0' }}
              minTickGap={24}
            />
            <YAxis
              tick={{ fontSize: 11, fill: '#64748b' }}
              tickLine={false}
              axisLine={false}
              width={44}
              tickFormatter={(v) => `₹${v}`}
            />
            <Tooltip
              formatter={(value) => [money(value), t('lot.estimate')]}
              labelFormatter={shortDay}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
            />
            <Line
              type="monotone"
              dataKey="avg_price"
              stroke="#16a34a"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {summary && (
        <div className="grid grid-cols-3 gap-2 text-center">
          <TrendStat label="Low" value={rate(summary.period_low, row.unit)} />
          <TrendStat label="Average" value={rate(summary.period_avg, row.unit)} />
          <TrendStat label="High" value={rate(summary.period_high, row.unit)} />
        </div>
      )}
    </div>
  );
}

function TrendStat({ label, value }) {
  return (
    <div className="rounded-xl bg-ink-50 px-2 py-2.5">
      <p className="text-xs font-medium text-ink-500">{label}</p>
      <p className="mt-0.5 text-sm font-bold text-ink-900 tabular">{value}</p>
    </div>
  );
}
