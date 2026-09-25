/**
 * Traceability timeline.
 *
 * Renders the derived event chain from GET /lots/:id/traceability as a vertical
 * timeline: collection → recycler matched → quote → accepted → in transit →
 * handover → confirmation → payment → completion.
 *
 * Each stage carries its own detail block, because the whole point of
 * traceability is that a collector (or an auditor) can see the evidence at each
 * step, not just a tick.
 */
import Icon from './Icon';
import { money, weight, dateTime, reference as fmtRef } from '../lib/format';
import { Thumb } from './ui';

const STAGE_STYLE = {
  done: {
    dot: 'bg-brand-600 text-white ring-4 ring-brand-100',
    line: 'bg-brand-300',
    label: 'text-ink-900',
  },
  current: {
    dot: 'bg-blue-600 text-white ring-4 ring-blue-100 animate-pulse-soft',
    line: 'bg-ink-200',
    label: 'text-blue-800 font-bold',
  },
  pending: {
    dot: 'bg-white text-ink-400 ring-1 ring-ink-300',
    line: 'bg-ink-200',
    label: 'text-ink-400',
  },
  cancelled: {
    dot: 'bg-ink-500 text-white ring-4 ring-ink-100',
    line: 'bg-ink-200',
    label: 'text-ink-600',
  },
  disputed: {
    dot: 'bg-red-600 text-white ring-4 ring-red-100',
    line: 'bg-red-200',
    label: 'text-red-800 font-bold',
  },
};

/** Maps the API's icon names onto this project's icon set. */
const ICON_MAP = {
  package: 'package',
  factory: 'factory',
  tag: 'tag',
  'check-circle': 'checkCircle',
  truck: 'truck',
  'hand-coins': 'handCoins',
  'shield-check': 'shield',
  wallet: 'wallet',
  flag: 'flag',
  'x-circle': 'xCircle',
  'alert-triangle': 'alert',
};

export default function Timeline({ events = [], progress, className = '' }) {
  if (!events.length) return null;

  return (
    <div className={className}>
      {progress && (
        <div className="mb-5">
          <div className="mb-1.5 flex items-center justify-between text-sm">
            <span className="font-semibold text-ink-700">
              {progress.completed_stages} of {progress.total_stages} steps done
            </span>
            <span className="font-bold text-brand-700 tabular">{progress.percent}%</span>
          </div>
          <div
            className="h-2 overflow-hidden rounded-full bg-ink-200"
            role="progressbar"
            aria-valuenow={progress.percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${progress.percent}%` }}
            />
          </div>
        </div>
      )}

      <ol className="relative">
        {events.map((event, i) => {
          const style = STAGE_STYLE[event.status] || STAGE_STYLE.pending;
          const isLast = i === events.length - 1;

          return (
            <li key={`${event.stage}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
              {/* Rail */}
              <div className="flex flex-col items-center">
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${style.dot}`}
                >
                  <Icon name={ICON_MAP[event.icon] || 'info'} size={17} />
                </span>
                {!isLast && <span className={`mt-1 w-0.5 flex-1 rounded ${style.line}`} />}
              </div>

              {/* Body */}
              <div className="min-w-0 flex-1 pt-1">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <p className={`text-sm ${style.label}`}>{event.label}</p>
                  {event.timestamp && (
                    <time className="text-xs text-ink-500 tabular" dateTime={event.timestamp}>
                      {dateTime(event.timestamp)}
                    </time>
                  )}
                </div>

                <StageDetail stage={event.stage} detail={event.detail} status={event.status} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

/** Per-stage evidence block. Only renders what the stage actually carries. */
function StageDetail({ stage, detail, status }) {
  if (!detail) return null;

  // ---------- Collection ----------
  if (stage === 'lot_created') {
    return (
      <div className="mt-2 flex gap-3">
        <Thumb src={detail.image_url} alt={detail.category} size="md" />
        <dl className="min-w-0 flex-1 space-y-0.5 text-sm">
          <Row label="Material" value={detail.sub_category ? `${detail.category} · ${detail.sub_category}` : detail.category} />
          <Row label="Weight" value={weight(detail.weight_kg)} />
          <Row label="Estimate" value={money(detail.estimated_value)} />
          {detail.location?.address && <Row label="Place" value={detail.location.address} />}
        </dl>
      </div>
    );
  }

  // ---------- Recycler matched ----------
  if (stage === 'recycler_matched') {
    return (
      <dl className="mt-2 space-y-0.5 text-sm">
        <Row label="Facility" value={detail.recycler} strong />
        {detail.registration_number && <Row label="CPCB reg." value={detail.registration_number} mono />}
        {detail.address && <Row label="Address" value={detail.address} />}
        {detail.authorization_status && (
          <Row
            label="Status"
            value={
              <span
                className={
                  detail.authorization_status === 'authorized'
                    ? 'font-semibold text-brand-700'
                    : 'font-semibold text-amber-700'
                }
              >
                {detail.authorization_status}
              </span>
            }
          />
        )}
      </dl>
    );
  }

  // ---------- Quote ----------
  if (stage === 'quoted') {
    return (
      <dl className="mt-2 space-y-0.5 text-sm">
        <Row label="Quoted" value={money(detail.offered_price)} strong />
        {detail.estimated_value ? (
          <Row label="Platform estimate" value={money(detail.estimated_value)} />
        ) : null}
      </dl>
    );
  }

  // ---------- Handover — the verifiable record ----------
  if (stage === 'handed_over' && detail.handover_reference_number) {
    const variance = Number(detail.weight_variance_kg || 0);
    const varianceMatters = Math.abs(variance) >= 0.05;

    return (
      <div className="mt-2 space-y-2">
        <div className="rounded-xl bg-brand-50 px-3 py-2 ring-1 ring-brand-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">
            Handover reference
          </p>
          <p className="font-bold text-brand-900 tabular">
            {fmtRef(detail.handover_reference_number)}
          </p>
        </div>

        <dl className="space-y-0.5 text-sm">
          <Row label="Weighed" value={weight(detail.actual_weight_kg)} strong />
          <Row label="Declared" value={weight(detail.declared_weight_kg)} />
          {varianceMatters && (
            <Row
              label="Difference"
              value={
                <span className={variance < 0 ? 'font-semibold text-amber-700' : 'font-semibold text-brand-700'}>
                  {variance > 0 ? '+' : ''}
                  {variance.toFixed(2)} kg
                </span>
              }
            />
          )}
          {detail.location?.lat ? (
            <Row
              label="GPS"
              value={`${Number(detail.location.lat).toFixed(5)}, ${Number(detail.location.lng).toFixed(5)}`}
              mono
            />
          ) : null}
          {detail.collector_confirmed && <Row label="Collector" value="Confirmed" />}
        </dl>

        {detail.photos?.length > 0 && (
          <div className="flex gap-2">
            {detail.photos.map((p) => (
              <Thumb key={p.id || p.photo_url} src={p.photo_url} alt={p.photo_type} size="md" icon="camera" />
            ))}
          </div>
        )}

        {detail.notes && <p className="text-sm italic text-ink-600">{detail.notes}</p>}
      </div>
    );
  }

  // ---------- Payment ----------
  if (stage === 'payment') {
    return (
      <dl className="mt-2 space-y-0.5 text-sm">
        <Row label="Amount" value={money(detail.amount)} strong />
        <Row
          label="Status"
          value={
            <span
              className={
                detail.payment_status === 'completed'
                  ? 'font-semibold text-brand-700'
                  : 'font-semibold text-amber-700'
              }
            >
              {detail.payment_status === 'completed' ? 'Paid' : 'Not paid yet'}
            </span>
          }
        />
        {detail.payment_method && <Row label="Method" value={detail.payment_method} />}
      </dl>
    );
  }

  // ---------- Completion ----------
  if (stage === 'completed' && status === 'done') {
    return (
      <dl className="mt-2 space-y-0.5 text-sm">
        <Row label="Final price" value={money(detail.final_price)} strong />
        <Row label="Final weight" value={weight(detail.final_weight_kg)} />
      </dl>
    );
  }

  // ---------- Cancellation / dispute ----------
  if (detail.reason) {
    return <p className="mt-1.5 text-sm text-ink-600">{detail.reason}</p>;
  }
  if (detail.recycler_confirmed_at) {
    return (
      <p className="mt-1.5 text-sm text-ink-600">
        Confirmed {dateTime(detail.recycler_confirmed_at)}
      </p>
    );
  }
  if (detail.note) {
    return <p className="mt-1.5 text-sm text-ink-600">{detail.note}</p>;
  }

  return null;
}

function Row({ label, value, strong = false, mono = false }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex justify-between gap-3">
      <dt className="shrink-0 text-ink-500">{label}</dt>
      <dd
        className={`min-w-0 truncate text-right ${strong ? 'font-bold text-ink-900' : 'text-ink-700'} ${
          mono ? 'tabular' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
