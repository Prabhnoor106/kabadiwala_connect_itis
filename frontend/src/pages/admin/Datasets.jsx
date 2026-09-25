/**
 * Datasets & model health.
 *
 * An honest window into how the platform makes decisions. Kabadiwala Connect
 * values material with a transparent rule-based formula and flags odd prices
 * with a statistical check — there is no black-box model in production by
 * default. This screen reports the datasets a future model would train on
 * (GET /admin/datasets), kept fully auditable. It is read-only: retraining is a
 * scheduled background job, not an HTTP action, so no trigger is exposed here.
 */
import api from '../../lib/api';
import { useQuery, useTitle } from '../../lib/hooks';
import { humanize, date, percent } from '../../lib/format';
import { StatTile, SectionHeader, ErrorState, SkeletonStats, SkeletonCards } from '../../components/ui';
import Icon from '../../components/Icon';

const MODEL_STATUS_LABEL = {
  no_trained_model: 'No trained model in use',
};

const VALUATION_LABEL = {
  rule_based_price_x_weight: 'Rule-based · price × weight × condition',
};

export default function AdminDatasets() {
  useTitle('Datasets');

  const { data, loading, error, refetch } = useQuery(() => api.admin.datasets(), []);

  return (
    <div className="page space-y-6">
      <header>
        <h1 className="page-title">Datasets & model health</h1>
        <p className="mt-1 text-sm text-ink-600">
          How the platform values material today, and the data a future model would learn from.
        </p>
      </header>

      {loading && (
        <div className="space-y-6">
          <SkeletonStats count={4} />
          <SkeletonCards count={3} />
        </div>
      )}

      {error && !loading && <ErrorState error={error} onRetry={refetch} />}

      {!loading && !error && data && <Health data={data} />}
    </div>
  );
}

function Health({ data }) {
  const { material_dataset: material, price_dataset: price, traceability_dataset: trace, ai_training_dataset: ai, offline_sync: sync } = data;

  return (
    <>
      {/* ---------- How valuation works ---------- */}
      <section className="card card-pad">
        <div className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
            <Icon name="shield" size={22} />
          </span>
          <div className="min-w-0">
            <h2 className="section-title">Live valuation method</h2>
            <p className="mt-1 text-sm text-ink-600">
              Every lot estimate is computed openly — no opaque model sits between the collector and their price.
            </p>
          </div>
        </div>

        <dl className="mt-4 grid gap-3 sm:grid-cols-2">
          <MethodRow
            icon="tag"
            label="Valuation"
            value={VALUATION_LABEL[ai.valuation_method] || humanize(ai.valuation_method)}
            note="Current buying rate multiplied by weight and a condition factor (working 1.15 → damaged 0.75)."
          />
          <MethodRow
            icon="alert"
            label="Anomaly detection"
            value="Statistical (Z-score)"
            note="Prices more than 2 standard deviations from the recent mean are flagged for review."
          />
          <MethodRow
            icon="chart"
            label="Model status"
            value={MODEL_STATUS_LABEL[ai.model_status] || humanize(ai.model_status)}
            note="No machine-learning model is served in production by default."
          />
          <MethodRow
            icon="refresh"
            label="Retraining"
            value="Scheduled background job"
            note="Runs automatically once enough feedback accumulates. There is no manual trigger."
          />
        </dl>
      </section>

      {/* ---------- Training pipeline counts ---------- */}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Training samples" value={ai.total_samples ?? 0} icon="chart" tone="muted" />
        <StatTile label="Feedback records" value={ai.feedback_records ?? 0} icon="edit" />
        <StatTile
          label="Awaiting retrain"
          value={ai.feedback_awaiting_retrain ?? 0}
          sub="unapplied feedback"
          icon="clock"
          tone={ai.feedback_awaiting_retrain > 0 ? 'warn' : 'default'}
        />
        <StatTile label="Price observations" value={price.observations ?? 0} icon="tag" />
      </section>

      {/* ---------- Dataset detail ---------- */}
      <section className="grid gap-4 lg:grid-cols-2">
        {/* Material dataset */}
        <div className="card card-pad">
          <SectionHeader title="Material dataset" />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Lots total" value={material.lots_total ?? 0} />
            <Metric label="With photos" value={material.lots_with_images ?? 0} />
          </div>
          <div className="mt-3">
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="font-medium text-ink-600">Image coverage</span>
              <span className="font-bold text-brand-700 tabular">
                {percent(material.image_coverage_percent, { signed: false })}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-ink-100">
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${clampPct(material.image_coverage_percent)}%` }}
              />
            </div>
            <p className="mt-1.5 text-xs text-ink-500">
              Photos are the raw material for any future image-based valuation model.
            </p>
          </div>
        </div>

        {/* Traceability dataset */}
        <div className="card card-pad">
          <SectionHeader title="Traceability dataset" />
          <div className="flex items-center gap-3">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Icon name="camera" size={24} />
            </span>
            <div>
              <p className="text-2xl font-bold text-ink-900 tabular">{trace.handover_photos ?? 0}</p>
              <p className="text-sm text-ink-500">handover photos on record</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-ink-500">
            Geo-tagged, timestamped handover evidence — the backbone of the public verification receipt.
          </p>
        </div>

        {/* Price dataset */}
        <div className="card card-pad">
          <SectionHeader title="Price dataset" />
          <div className="grid grid-cols-2 gap-3 text-sm">
            <Metric label="Observations" value={price.observations ?? 0} />
            <Metric label="Sources" value={Object.keys(price.by_source || {}).length} />
          </div>
          {(price.earliest || price.latest) && (
            <p className="mt-2 text-xs text-ink-500 tabular">
              {date(price.earliest)} → {date(price.latest)}
            </p>
          )}
          <div className="mt-3">
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">By source</p>
            <Breakdown data={price.by_source} empty="No price observations recorded yet." color="bg-rupee-500" />
          </div>
        </div>

        {/* AI training samples by source + offline sync */}
        <div className="card card-pad space-y-4">
          <div>
            <SectionHeader title="Training samples by source" />
            <Breakdown data={ai.by_source} empty="No training samples collected yet." color="bg-brand-500" />
          </div>
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-ink-500">Offline sync queue</p>
            <Breakdown data={sync.by_status} empty="No offline sync activity." color="bg-indigo-500" humanizeKeys />
          </div>
        </div>
      </section>
    </>
  );
}

// ------------------------------------------------------------
// Bits
// ------------------------------------------------------------

function MethodRow({ icon, label, value, note }) {
  return (
    <div className="rounded-xl bg-ink-50 p-3">
      <div className="flex items-center gap-2 text-ink-500">
        <Icon name={icon} size={15} />
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
      </div>
      <p className="mt-1 font-semibold text-ink-900">{value}</p>
      <p className="mt-0.5 text-xs text-ink-500">{note}</p>
    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div>
      <p className="text-xs text-ink-500">{label}</p>
      <p className="text-xl font-bold text-ink-900 tabular">{value}</p>
    </div>
  );
}

function Breakdown({ data, empty, color = 'bg-brand-500', humanizeKeys = true }) {
  const entries = Object.entries(data || {}).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return <p className="text-sm text-ink-500">{empty}</p>;
  const max = Math.max(...entries.map(([, v]) => Number(v) || 0), 1);

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div key={key}>
          <div className="flex items-center justify-between text-sm">
            <span className="text-ink-700">{humanizeKeys ? humanize(key) : key}</span>
            <span className="font-semibold text-ink-900 tabular">{value}</span>
          </div>
          <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-ink-100">
            <div className={`h-full rounded-full ${color}`} style={{ width: `${(Number(value) / max) * 100}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function clampPct(v) {
  const n = Number(v);
  if (Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(100, n));
}
