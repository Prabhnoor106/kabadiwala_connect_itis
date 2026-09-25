/**
 * Prices administration.
 *
 * Two jobs on one screen: read the live rate board (GET /prices/board) and add
 * a new observation to it (POST /admin/prices). Tapping a row opens the 30-day
 * history (GET /prices/trend/:category_id) so an admin can sanity-check a rate
 * before recording against it.
 */
import { useState } from 'react';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useMutation, useTitle } from '../../lib/hooks';
import { money, rate, relative, date } from '../../lib/format';
import {
  TrendIndicator,
  HazardBadge,
  Sheet,
  EmptyState,
  ErrorState,
  InlineError,
  Spinner,
  LoadingBlock,
  SkeletonTable,
} from '../../components/ui';
import Icon from '../../components/Icon';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

const shortDay = (d) => {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function AdminPrices() {
  const { lang } = useApp();
  useTitle('Prices');

  const { data, loading, error, refetch } = useQuery(() => api.prices.board(), []);
  const [recording, setRecording] = useState(false);
  const [trendRow, setTrendRow] = useState(null);

  const rows = data || [];

  return (
    <div className="page space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Prices</h1>
          <p className="mt-1 text-sm text-ink-600">Live buying rates and the observations behind them.</p>
        </div>
        <button type="button" onClick={() => setRecording(true)} className="btn-primary">
          <Icon name="plus" size={18} />
          Record price
        </button>
      </div>

      {loading && <SkeletonTable rows={8} cols={6} />}

      {error && !loading && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && rows.length === 0 && (
        <EmptyState
          icon="tag"
          title="No prices yet"
          description="Record the first buying rate to seed the board."
          action={
            <button type="button" onClick={() => setRecording(true)} className="btn-primary btn-sm">
              <Icon name="plus" size={16} />
              Record price
            </button>
          }
        />
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="card table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Material</th>
                <th className="text-right">Current</th>
                <th className="text-right">7-day avg</th>
                <th className="text-right">30-day avg</th>
                <th>Trend</th>
                <th className="text-right">Samples 30d</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.category_id}
                  onClick={() => setTrendRow(row)}
                  className="cursor-pointer hover:bg-ink-50"
                >
                  <td>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-ink-900">{row.category_name}</span>
                      <HazardBadge level={row.hazard_level} />
                    </div>
                    {row.market_range && (
                      <p className="text-xs text-ink-500 tabular">
                        Market {money(row.market_range.min)}–{money(row.market_range.max)} · {row.market_range.recycler_count} recyclers
                      </p>
                    )}
                  </td>
                  <td className="text-right font-bold text-brand-700 tabular">
                    {row.current_price != null ? rate(row.current_price, row.unit) : '—'}
                  </td>
                  <td className="text-right text-ink-700 tabular">
                    {row.avg_7d != null ? money(row.avg_7d) : '—'}
                  </td>
                  <td className="text-right text-ink-700 tabular">
                    {row.avg_30d != null ? money(row.avg_30d) : '—'}
                  </td>
                  <td>
                    <TrendIndicator trend={row.trend} changePercent={row.change_percent} />
                  </td>
                  <td className="text-right text-ink-600 tabular">{row.sample_count_30d ?? 0}</td>
                  <td className="text-sm text-ink-600">
                    {row.last_updated ? relative(row.last_updated, lang) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Record a price */}
      <Sheet open={recording} onClose={() => setRecording(false)} title="Record a price">
        <RecordPriceForm
          onDone={() => {
            setRecording(false);
            refetch();
          }}
        />
      </Sheet>

      {/* 30-day history */}
      <Sheet open={Boolean(trendRow)} onClose={() => setTrendRow(null)} title={trendRow?.category_name}>
        {trendRow && <TrendPanel row={trendRow} />}
      </Sheet>
    </div>
  );
}

// ------------------------------------------------------------
// Record-price form
// ------------------------------------------------------------

function RecordPriceForm({ onDone }) {
  const { data: categories, loading: catLoading, error: catError, refetch } = useQuery(
    () => api.categories.list(),
    []
  );
  const save = useMutation((body) => api.admin.recordPrice(body));

  const [form, setForm] = useState({
    category_id: '',
    buying_price: '',
    selling_price: '',
    location: '',
    source: '',
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const buying = Number(form.buying_price);
  const buyingValid = form.buying_price !== '' && buying > 0 && buying <= 100000;
  const valid = form.category_id && buyingValid;

  const options = flattenCategories(categories || []);

  async function submit(e) {
    e.preventDefault();
    if (!valid) return;
    const body = {
      category_id: form.category_id,
      buying_price: buying,
      ...(form.selling_price !== '' ? { selling_price: Number(form.selling_price) } : {}),
      ...(form.location.trim() ? { location: form.location.trim() } : {}),
      ...(form.source.trim() ? { source: form.source.trim() } : {}),
    };
    try {
      await save.run(body);
      onDone();
    } catch {
      /* surfaced via save.error */
    }
  }

  if (catLoading) return <LoadingBlock label="Loading categories…" />;
  if (catError) return <ErrorState error={catError} onRetry={refetch} />;

  const fieldErrors = save.error?.fieldErrors || {};

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label" htmlFor="price-cat">Material</label>
        <select
          id="price-cat"
          value={form.category_id}
          onChange={set('category_id')}
          className={`select ${fieldErrors.category_id ? 'input-error' : ''}`}
        >
          <option value="">Select a material…</option>
          {options.map((o) => (
            <option key={o.id} value={o.id}>{o.label}</option>
          ))}
        </select>
        {fieldErrors.category_id && <p className="field-error">{fieldErrors.category_id}</p>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="buying">Buying price (₹/kg)</label>
          <input
            id="buying"
            type="number"
            inputMode="decimal"
            min="0"
            max="100000"
            step="0.5"
            value={form.buying_price}
            onChange={set('buying_price')}
            className={`input tabular ${fieldErrors.buying_price ? 'input-error' : ''}`}
            placeholder="0"
          />
          {fieldErrors.buying_price && <p className="field-error">{fieldErrors.buying_price}</p>}
        </div>
        <div>
          <label className="label" htmlFor="selling">
            Selling price <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <input
            id="selling"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={form.selling_price}
            onChange={set('selling_price')}
            className="input tabular"
            placeholder="—"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label" htmlFor="loc">
            Location <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <input
            id="loc"
            value={form.location}
            onChange={set('location')}
            className="input"
            placeholder="all"
          />
          <p className="field-hint">Leave blank for the platform-wide rate.</p>
        </div>
        <div>
          <label className="label" htmlFor="src">
            Source <span className="font-normal text-ink-400">(optional)</span>
          </label>
          <input
            id="src"
            value={form.source}
            onChange={set('source')}
            className="input"
            placeholder="e.g. market_survey"
          />
        </div>
      </div>

      {!buyingValid && form.buying_price !== '' && (
        <p className="field-hint text-amber-700">Buying price must be between ₹0 and ₹1,00,000.</p>
      )}

      {save.error && !Object.keys(fieldErrors).length && <InlineError message={save.error.message} />}

      <button type="submit" disabled={!valid || save.pending} className="btn-primary w-full">
        {save.pending ? <Spinner size={18} /> : <Icon name="check" size={18} />}
        Record price
      </button>
    </form>
  );
}

function flattenCategories(cats) {
  const out = [];
  for (const c of cats) {
    out.push({ id: c.id, label: c.name });
    for (const child of c.children || []) {
      out.push({ id: child.id, label: `${c.name} · ${child.name}` });
    }
  }
  return out;
}

// ------------------------------------------------------------
// 30-day price history
// ------------------------------------------------------------

function TrendPanel({ row }) {
  const { data, loading, error, refetch } = useQuery(
    () => api.prices.trend(row.category_id, 30),
    [row.category_id]
  );

  if (loading) return <LoadingBlock label="Loading history…" />;
  if (error) return <ErrorState error={error} onRetry={refetch} />;

  const series = data?.series || [];
  const summary = data?.summary;

  if (series.length === 0) {
    return <EmptyState icon="chart" title="No history" description="No recorded prices in the last 30 days." />;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">30-day average</p>
          <p className="mt-0.5 text-2xl font-bold text-ink-900 tabular">{rate(summary?.period_avg, row.unit)}</p>
        </div>
        {summary && <TrendIndicator trend={summary.direction} changePercent={summary.change_percent} />}
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
              formatter={(value) => [money(value), 'Avg price']}
              labelFormatter={shortDay}
              contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 13 }}
            />
            <Line type="monotone" dataKey="avg_price" stroke="#16a34a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
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

      <p className="text-center text-xs text-ink-500">
        {summary?.data_points ?? series.length} data points · since {date(series[0]?.date)}
      </p>
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
