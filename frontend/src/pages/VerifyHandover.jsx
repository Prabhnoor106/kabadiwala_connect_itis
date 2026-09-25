/**
 * Public handover verification.
 *
 * A standalone, unauthenticated page (mounted outside the app shell). Anyone
 * holding a handover slip can type its reference and confirm that the material
 * really did reach a CPCB-authorized recycler — the whole promise of the
 * platform, made checkable by an outsider.
 *
 * The API (GET /traceability/verify/:reference) returns a flat verified record,
 * not an event stream, so the "chain of custody" here is derived from that
 * record's own confirmation flags rather than a timeline feed.
 */
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../lib/api';
import { useQuery, useTitle } from '../lib/hooks';
import { money, weight, dateTime, reference as fmtRef } from '../lib/format';
import { StatusBadge, Spinner, Thumb } from '../components/ui';
import Icon from '../components/Icon';

const REF_RE = /^HRN-\d{8}-[A-Z0-9]{4}$/;
const PHOTO_LABEL = {
  before_weighing: 'Before weighing',
  after_weighing: 'After weighing',
  weighing_scale: 'On the scale',
  material: 'Material',
  receipt: 'Receipt',
};

export default function VerifyHandover() {
  const { reference } = useParams();
  useTitle('Verify a handover');

  return (
    <div className="min-h-screen bg-gradient-to-b from-brand-50 via-ink-50 to-ink-50">
      <div className="mx-auto max-w-xl px-4 py-8">
        <header className="mb-6 text-center">
          <span className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lift">
            <Icon name="shield" size={28} />
          </span>
          <h1 className="text-2xl font-bold text-ink-900">Handover verification</h1>
          <p className="mt-1.5 text-sm text-ink-600">
            Confirm that collected material reached an authorized recycler.
          </p>
        </header>

        {reference ? <Receipt reference={reference} /> : <LookupForm />}

        <p className="mt-6 text-center text-xs text-ink-500">
          <Link to="/" className="font-semibold text-brand-700 underline">
            Back to Kabadiwala Connect
          </Link>
        </p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------
// Reference lookup
// ------------------------------------------------------------

function LookupForm({ initial = '', tone = 'default' }) {
  const navigate = useNavigate();
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);

  const normalized = value.trim().toUpperCase();
  const valid = REF_RE.test(normalized);

  function submit(e) {
    e.preventDefault();
    setTouched(true);
    if (valid) navigate(`/verify/${normalized}`);
  }

  return (
    <div className="card card-pad">
      <form onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="ref">
            Reference number
          </label>
          <input
            id="ref"
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => setTouched(true)}
            placeholder="HRN-20260905-A3F7"
            className={`input text-center text-lg tabular uppercase tracking-wide ${
              touched && value && !valid ? 'input-error' : ''
            }`}
            autoComplete="off"
            spellCheck={false}
          />
          {touched && value && !valid ? (
            <p className="field-error">Format looks like HRN-20260905-A3F7.</p>
          ) : (
            <p className="field-hint">Printed on the handover slip, starting with “HRN-”.</p>
          )}
        </div>

        <button type="submit" disabled={!valid} className="btn-primary w-full">
          <Icon name="search" size={18} />
          Verify
        </button>
      </form>

      {tone === 'default' && (
        <div className="mt-5 border-t border-ink-100 pt-4">
          <p className="flex items-start gap-2 text-xs text-ink-500">
            <Icon name="info" size={15} className="mt-0.5 shrink-0" />
            Each handover is recorded with GPS, a timestamp and photos when a collector hands
            material to a recycler. This page reads that record straight from the source.
          </p>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Verified receipt
// ------------------------------------------------------------

function Receipt({ reference }) {
  const { data, loading, error, refetch } = useQuery(
    () => api.traceability.verify(reference),
    [reference]
  );

  if (loading) {
    return (
      <div className="card card-pad flex flex-col items-center gap-3 py-12 text-center">
        <Spinner size={28} className="text-brand-600" />
        <p className="text-sm font-medium text-ink-600">Verifying {fmtRef(reference)}…</p>
      </div>
    );
  }

  if (error) return <NotVerified reference={reference} error={error} onRetry={refetch} />;
  if (!data) return <NotVerified reference={reference} error={{ status: 404 }} onRetry={refetch} />;

  const { material, recycler, transaction, photos = [] } = data;
  const authorized = recycler?.authorization_status === 'authorized';

  // Chain of custody, derived from the flat record's confirmation flags.
  const steps = [
    {
      key: 'collected',
      label: 'Material collected',
      done: true,
      when: material?.collected_at,
      detail: material?.collection_address,
      icon: 'package',
    },
    {
      key: 'handover',
      label: 'Handed to recycler',
      done: Boolean(data.handover_timestamp),
      when: data.handover_timestamp,
      detail: data.collector_confirmed ? 'Confirmed by collector' : null,
      icon: 'handCoins',
    },
    {
      key: 'confirmed',
      label: 'Confirmed by recycler',
      done: Boolean(data.recycler_confirmed),
      when: data.recycler_confirmed_at,
      detail: data.recycler_confirmed ? null : 'Awaiting recycler confirmation',
      icon: 'shield',
    },
  ];

  return (
    <div className="space-y-4">
      {/* Verified banner */}
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lift">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/20">
            <Icon name="checkCircle" size={28} />
          </span>
          <div>
            <p className="text-lg font-bold">Verified handover</p>
            <p className="text-sm text-brand-100">This is a genuine platform record.</p>
          </div>
        </div>
        <div className="mt-4 rounded-xl bg-white/15 px-3 py-2.5">
          <p className="text-xs font-medium text-brand-100">Reference number</p>
          <p className="text-lg font-bold tabular">{fmtRef(data.reference_number)}</p>
        </div>
      </div>

      {/* Recycler — the trust anchor */}
      <section className="card card-pad">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-ink-100 text-ink-600">
              <Icon name="factory" size={22} />
            </span>
            <div className="min-w-0">
              <p className="font-bold text-ink-900">{recycler?.business_name || 'Recycler'}</p>
              {recycler?.registration_number && (
                <p className="text-xs text-ink-500 tabular">CPCB {recycler.registration_number}</p>
              )}
            </div>
          </div>
          {recycler?.authorization_status && (
            <StatusBadge status={recycler.authorization_status} kind="authorization" />
          )}
        </div>
        <p className={`mt-3 flex items-center gap-1.5 text-sm font-medium ${authorized ? 'text-brand-700' : 'text-amber-700'}`}>
          <Icon name={authorized ? 'checkCircle' : 'alert'} size={16} />
          {authorized
            ? 'Authorized recycler — cleared to process this material.'
            : 'This recycler is not currently authorized.'}
        </p>
      </section>

      {/* Chain of custody */}
      <section className="card card-pad">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Chain of custody</p>
        <ol className="relative">
          {steps.map((step, i) => {
            const last = i === steps.length - 1;
            return (
              <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                      step.done ? 'bg-brand-600 text-white ring-4 ring-brand-100' : 'bg-white text-ink-400 ring-1 ring-ink-300'
                    }`}
                  >
                    <Icon name={step.done ? 'check' : step.icon} size={17} />
                  </span>
                  {!last && <span className={`mt-1 w-0.5 flex-1 rounded ${step.done ? 'bg-brand-300' : 'bg-ink-200'}`} />}
                </div>
                <div className="min-w-0 flex-1 pt-1">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <p className={`text-sm font-semibold ${step.done ? 'text-ink-900' : 'text-ink-400'}`}>
                      {step.label}
                    </p>
                    {step.when && (
                      <time className="text-xs text-ink-500 tabular" dateTime={step.when}>
                        {dateTime(step.when)}
                      </time>
                    )}
                  </div>
                  {step.detail && <p className="mt-0.5 text-xs text-ink-500">{step.detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {/* Material & weights */}
      <section className="card card-pad">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">Material</p>
        <p className="text-lg font-bold text-ink-900">{material?.category || '—'}</p>
        {material?.category_code && (
          <p className="text-xs text-ink-500 tabular">{material.category_code}</p>
        )}
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <WeightBox label="Declared" value={weight(material?.declared_weight_kg)} />
          <WeightBox label="Weighed at handover" value={weight(data.actual_weight_kg)} strong />
        </dl>
        {material?.collection_address && (
          <p className="mt-3 flex items-start gap-1.5 text-sm text-ink-600">
            <Icon name="location" size={16} className="mt-0.5 shrink-0 text-ink-400" />
            {material.collection_address}
          </p>
        )}
      </section>

      {/* Photos */}
      {photos.length > 0 && (
        <section className="card card-pad">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-ink-500">
            Handover photos ({data.photo_count ?? photos.length})
          </p>
          <div className="flex flex-wrap gap-3">
            {photos.map((p, i) => (
              <figure key={p.photo_url || i} className="text-center">
                <Thumb src={p.photo_url} alt={p.photo_type} size="lg" icon="camera" />
                {p.photo_type && (
                  <figcaption className="mt-1 text-[11px] text-ink-500">
                    {PHOTO_LABEL[p.photo_type] || p.photo_type}
                  </figcaption>
                )}
              </figure>
            ))}
          </div>
        </section>
      )}

      {/* Transaction outcome */}
      {transaction && (
        <section className="card card-pad">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-ink-500">Transaction</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <StatusBadge status={transaction.status} kind="transaction" />
                {transaction.payment_status && (
                  <StatusBadge status={transaction.payment_status} kind="payment" />
                )}
              </div>
            </div>
            {transaction.final_price != null && (
              <div className="text-right">
                <p className="text-xs text-ink-500">Settled</p>
                <p className="text-xl font-bold text-brand-700 tabular">{money(transaction.final_price)}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {/* Verify another */}
      <div className="pt-1 text-center">
        <Link to="/verify" className="text-sm font-semibold text-brand-700 underline">
          Verify another reference
        </Link>
      </div>
    </div>
  );
}

function WeightBox({ label, value, strong = false }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${strong ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-ink-50'}`}>
      <p className="text-xs text-ink-500">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular ${strong ? 'text-brand-700' : 'text-ink-900'}`}>{value}</p>
    </div>
  );
}

// ------------------------------------------------------------
// Not verified / errors
// ------------------------------------------------------------

function NotVerified({ reference, error, onRetry }) {
  const status = error?.status;
  const offline = status === 0;
  const invalid = status === 400;
  const notFound = status === 404;

  let title = 'Could not verify this reference';
  let message = error?.message || 'Something went wrong. Please try again.';
  if (offline) {
    title = 'You appear to be offline';
    message = 'Check your connection and try again.';
  } else if (invalid) {
    title = 'That reference looks malformed';
    message = 'A valid reference looks like HRN-20260905-A3F7.';
  } else if (notFound) {
    title = 'No matching handover found';
    message = 'We have no record for that reference number. Check the slip and try again.';
  }

  return (
    <div className="space-y-4">
      <div className="card card-pad flex flex-col items-center gap-3 py-8 text-center">
        <span
          className={`flex h-14 w-14 items-center justify-center rounded-full ${
            offline ? 'bg-amber-100 text-amber-600' : 'bg-red-100 text-red-600'
          }`}
        >
          <Icon name={offline ? 'wifiOff' : 'xCircle'} size={28} />
        </span>
        <div>
          <p className="font-bold text-ink-900">{title}</p>
          <p className="mt-1 text-sm text-ink-600">{message}</p>
          <p className="mt-2 text-xs text-ink-400 tabular">{fmtRef(reference)}</p>
        </div>
        {offline && onRetry && (
          <button type="button" onClick={onRetry} className="btn-secondary btn-sm">
            <Icon name="refresh" size={16} />
            Try again
          </button>
        )}
      </div>

      <LookupForm initial={reference} tone="retry" />
    </div>
  );
}
