/**
 * Admin overview.
 *
 * The whole platform in one screen: headline counts, where money and material
 * are flowing, and which facilities are absorbing it. Everything is derived
 * live from the operational tables (GET /admin/analytics), so the numbers can
 * never drift from the records they describe.
 */
import { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../lib/api';
import { useQuery, useTitle } from '../../lib/hooks';
import { money, moneyCompact, weight, humanize, percent } from '../../lib/format';
import {
  StatTile,
  SectionHeader,
  Segmented,
  EmptyState,
  ErrorState,
  SkeletonStats,
  SkeletonCards,
} from '../../components/ui';
import Icon from '../../components/Icon';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

const GRID = '#e2e8f0';
const AXIS = '#64748b';

/** Status colours mirror the StatusBadge palette so charts and pills agree. */
const TX_COLORS = {
  quoted: '#f59e0b',
  accepted: '#2563eb',
  in_transit: '#6366f1',
  handed_over: '#8b5cf6',
  confirmed: '#14b8a6',
  completed: '#16a34a',
  cancelled: '#94a3b8',
  disputed: '#dc2626',
};

const CATEGORY_BARS = ['#16a34a', '#2563eb', '#8b5cf6', '#14b8a6', '#f59e0b', '#6366f1', '#d97706', '#dc2626'];

const WINDOWS = [
  { value: 7, label: '7 days' },
  { value: 30, label: '30 days' },
  { value: 90, label: '90 days' },
];

const shortDay = (d) => {
  const dt = new Date(d);
  return Number.isNaN(dt.getTime()) ? d : dt.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};

export default function AdminOverview() {
  useTitle('Overview');

  const [days, setDays] = useState(30);
  const { data, loading, error, refetch } = useQuery(() => api.admin.analytics(days), [days]);

  return (
    <div className="page space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="page-title">Platform overview</h1>
          <p className="mt-1 text-sm text-ink-600">Live metrics across collectors, recyclers and material flow.</p>
        </div>
        <Segmented options={WINDOWS} value={days} onChange={setDays} />
      </div>

      {loading && (
        <div className="space-y-6">
          <SkeletonStats count={8} />
          <SkeletonCards count={3} />
        </div>
      )}

      {error && !loading && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && data && <Dashboard data={data} days={days} />}
    </div>
  );
}

function Dashboard({ data, days }) {
  const { stats, trend = [], categories = [], recycler_leaderboard: leaderboard = [] } = data;
  const { collectors, recyclers, lots, transactions, value, traceability } = stats;

  // Transaction status breakdown → pie slices (drop empty statuses).
  const statusOrder = [
    'quoted', 'accepted', 'in_transit', 'handed_over', 'confirmed', 'completed', 'cancelled', 'disputed',
  ];
  const statusPie = statusOrder
    .map((k) => ({ key: k, name: humanize(k), value: transactions[k] || 0 }))
    .filter((s) => s.value > 0);

  // Top materials by settled value.
  const topCategories = [...categories]
    .filter((c) => c.settled_value > 0 || c.lot_count > 0)
    .sort((a, b) => b.settled_value - a.settled_value)
    .slice(0, 8)
    .map((c) => ({ name: c.name, value: c.settled_value, lots: c.lot_count }));

  const trendHasData = trend.some((d) => d.lots > 0 || d.completed > 0 || d.value > 0);

  return (
    <>
      {/* ---------- Headline counts ---------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Collectors"
          value={collectors.total}
          sub={`${collectors.verified} verified · ${collectors.active_last_7d} active 7d`}
          icon="users"
        />
        <StatTile
          label="Recyclers authorized"
          value={recyclers.authorized}
          sub={`${recyclers.pending} pending · ${recyclers.total} total`}
          icon="factory"
          tone={recyclers.pending > 0 ? 'warn' : 'default'}
        />
        <StatTile
          label="Lots"
          value={lots.total}
          sub={`${lots.active} active · ${lots.completed} completed`}
          icon="package"
        />
        <StatTile
          label="Transactions"
          value={transactions.total}
          sub={`${percent(transactions.completion_rate_percent, { signed: false })} completed`}
          icon="handCoins"
        />
        <StatTile
          label="Settled value (GMV)"
          value={moneyCompact(value.total_settled)}
          sub={`${moneyCompact(value.settled_last_30d)} last 30d`}
          icon="wallet"
          tone="money"
        />
        <StatTile
          label="Material settled"
          value={weight(value.total_weight_kg)}
          sub={`${weight(value.weight_last_30d_kg)} last 30d`}
          icon="chart"
          tone="muted"
        />
        <StatTile
          label="Avg deal value"
          value={money(value.avg_transaction_value)}
          sub={`${value.transactions_last_30d} deals last 30d`}
          icon="tag"
          tone="money"
        />
        <StatTile
          label="Handovers verified"
          value={traceability.handover_records}
          sub={`${percent(traceability.confirmation_rate_percent, { signed: false })} confirmed by recycler`}
          icon="shield"
          tone={traceability.awaiting_confirmation > 0 ? 'warn' : 'default'}
        />
      </section>

      {/* ---------- Attention strip ---------- */}
      {(recyclers.pending > 0 || transactions.disputed > 0 || traceability.awaiting_confirmation > 0) && (
        <section className="flex flex-wrap gap-3">
          {recyclers.pending > 0 && (
            <Link to="/admin/recyclers" className="flex items-center gap-2 rounded-xl bg-amber-50 px-3.5 py-2.5 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
              <Icon name="clock" size={16} />
              {recyclers.pending} recycler{recyclers.pending === 1 ? '' : 's'} awaiting verification
              <Icon name="chevronRight" size={15} />
            </Link>
          )}
          {transactions.disputed > 0 && (
            <span className="flex items-center gap-2 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700 ring-1 ring-red-200">
              <Icon name="alert" size={16} />
              {transactions.disputed} disputed transaction{transactions.disputed === 1 ? '' : 's'}
            </span>
          )}
          {traceability.awaiting_confirmation > 0 && (
            <span className="flex items-center gap-2 rounded-xl bg-violet-50 px-3.5 py-2.5 text-sm font-semibold text-violet-700 ring-1 ring-violet-200">
              <Icon name="handCoins" size={16} />
              {traceability.awaiting_confirmation} handover{traceability.awaiting_confirmation === 1 ? '' : 's'} awaiting confirmation
            </span>
          )}
        </section>
      )}

      {/* ---------- Activity + status ---------- */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card card-pad lg:col-span-2">
          <SectionHeader title={`Daily activity · last ${days} days`} />
          {trendHasData ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trend} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tickFormatter={shortDay} tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={28} />
                  <YAxis tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={false} width={36} allowDecimals={false} />
                  <Tooltip labelFormatter={shortDay} contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="lots" name="New lots" stroke="#16a34a" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                  <Line type="monotone" dataKey="completed" name="Completed deals" stroke="#2563eb" strokeWidth={2.5} dot={false} activeDot={{ r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon="chart" title="No activity yet" description="Lots and completed deals will chart here as the platform is used." />
          )}
        </div>

        <div className="card card-pad">
          <SectionHeader title="Transaction status" />
          {statusPie.length > 0 ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={statusPie} dataKey="value" nameKey="name" innerRadius={48} outerRadius={82} paddingAngle={2}>
                    {statusPie.map((s) => (
                      <Cell key={s.key} fill={TX_COLORS[s.key] || '#94a3b8'} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 13 }} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState icon="handCoins" title="No transactions yet" />
          )}
        </div>
      </section>

      {/* ---------- Top materials ---------- */}
      <section className="card card-pad">
        <SectionHeader title="Top materials by settled value" />
        {topCategories.length > 0 ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topCategories} layout="vertical" margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v) => moneyCompact(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12, fill: '#334155' }} tickLine={false} axisLine={false} width={130} />
                <Tooltip formatter={(v) => [money(v), 'Settled value']} contentStyle={{ borderRadius: 12, border: `1px solid ${GRID}`, fontSize: 13 }} />
                <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={26}>
                  {topCategories.map((c, i) => (
                    <Cell key={c.name} fill={CATEGORY_BARS[i % CATEGORY_BARS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptyState icon="package" title="No material data yet" />
        )}
      </section>

      {/* ---------- Recycler leaderboard ---------- */}
      <section>
        <SectionHeader
          title="Recycler leaderboard"
          action={
            <Link to="/admin/recyclers" className="text-sm font-semibold text-brand-700 underline">
              Manage recyclers
            </Link>
          }
        />
        {leaderboard.length === 0 ? (
          <EmptyState icon="factory" title="No authorized recyclers yet" description="Authorized facilities ranked by settled volume will appear here." />
        ) : (
          <div className="card table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Facility</th>
                  <th className="text-right">Completed</th>
                  <th className="text-right">Settled value</th>
                  <th className="text-right">Volume</th>
                  <th className="text-right">Materials</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((r, i) => (
                  <tr key={r.recycler_id}>
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink-100 text-xs font-bold text-ink-600 tabular">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-ink-900">{r.business_name}</p>
                          {r.address && <p className="truncate text-xs text-ink-500">{r.address}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="text-right tabular">{r.completed_transactions}</td>
                    <td className="text-right font-semibold text-brand-700 tabular">{money(r.settled_value)}</td>
                    <td className="text-right tabular">{weight(r.settled_weight_kg)}</td>
                    <td className="text-right tabular">{r.materials_accepted}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---------- Dataset footnote ---------- */}
      <p className="flex items-center gap-2 text-xs text-ink-500">
        <Icon name="info" size={14} />
        {stats.datasets.material_categories} material categories · {stats.datasets.price_observations} price observations · {stats.datasets.ai_training_samples} training samples.
        <Link to="/admin/datasets" className="font-semibold text-brand-700 underline">Dataset health</Link>
      </p>
    </>
  );
}
