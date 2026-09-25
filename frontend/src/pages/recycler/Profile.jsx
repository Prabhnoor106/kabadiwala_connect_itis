/**
 * Recycler profile & availability.
 *
 * Two concerns, two forms: the facility's identity (name, registration, contact,
 * address) and its logistics (whether it collects, how far it travels, when it's
 * open). Both are editable before authorization — this is where a pending
 * recycler gets set up while an admin reviews the registration.
 */
import { useState } from 'react';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useMutation, useGeolocation, useTitle } from '../../lib/hooks';
import { date, phone as fmtPhone } from '../../lib/format';
import {
  StatusBadge,
  SectionHeader,
  ErrorState,
  InlineError,
  SuccessNote,
  Spinner,
  SkeletonCards,
} from '../../components/ui';
import Icon from '../../components/Icon';

const AUTH_NOTE = {
  authorized: null,
  pending: 'An admin is reviewing your registration. You can publish rates and accept lots once verified.',
  suspended: 'Your account is suspended. Contact the platform admin to restore it.',
  revoked: 'Your authorization has been revoked. Contact the platform admin for details.',
};

export default function RecyclerProfile() {
  const { t } = useApp();
  useTitle(t('nav.profile'));

  const { data: profile, loading, error, refetch } = useQuery(() => api.recyclers.profile(), []);

  if (loading) {
    return (
      <div className="page space-y-5">
        <div className="skeleton h-24 w-full rounded-2xl" />
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

  const status = profile.authorization_status || 'pending';
  const note = AUTH_NOTE[status];

  return (
    <div className="page space-y-6">
      {/* ---------- Identity header ---------- */}
      <section className="card card-pad">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-ink-900">{profile.business_name}</h1>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-ink-600">
              <Icon name="tag" size={14} />
              {profile.contact_email}
              {profile.email_verified ? (
                <span className="badge bg-brand-50 text-brand-700 ring-1 ring-brand-200">
                  <Icon name="check" size={12} /> verified
                </span>
              ) : (
                <span className="badge bg-amber-50 text-amber-700 ring-1 ring-amber-200">unverified</span>
              )}
            </p>
            <p className="mt-1 text-xs text-ink-500">Member since {date(profile.created_at)}</p>
          </div>
          <StatusBadge status={status} kind="authorization" />
        </div>

        {note && (
          <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2.5 text-sm text-amber-800 ring-1 ring-amber-200">
            {note}
          </p>
        )}
      </section>

      <DetailsForm profile={profile} onSaved={refetch} />
      <AvailabilityForm profile={profile} onSaved={refetch} />
    </div>
  );
}

// ============================================================
// Facility details
// ============================================================

function DetailsForm({ profile, onSaved }) {
  const { t } = useApp();
  const [form, setForm] = useState({
    business_name: profile.business_name || '',
    registration_number: profile.registration_number || '',
    contact_phone: profile.contact_phone || '',
    address: profile.address || '',
  });
  const [loc, setLoc] = useState(
    profile.location_lat != null && profile.location_lng != null
      ? { lat: Number(profile.location_lat), lng: Number(profile.location_lng) }
      : null
  );

  const geo = useGeolocation();
  const m = useMutation((body) => api.recyclers.updateProfile(body));
  const fieldErrors = m.error?.fieldErrors || {};
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  async function captureLocation() {
    const pos = await geo.request();
    if (pos) setLoc({ lat: pos.lat, lng: pos.lng });
  }

  async function submit(e) {
    e.preventDefault();
    const body = {
      business_name: form.business_name.trim(),
      registration_number: form.registration_number.trim(),
      contact_phone: form.contact_phone.trim(),
      address: form.address.trim(),
    };
    if (loc) {
      body.location_lat = loc.lat;
      body.location_lng = loc.lng;
    }
    try {
      await m.run(body);
      onSaved();
    } catch {
      /* surfaced via m.error */
    }
  }

  const nameValid = form.business_name.trim().length >= 2;

  return (
    <section>
      <SectionHeader title="Facility details" />
      <form onSubmit={submit} className="card card-pad space-y-4">
        <div>
          <label className="label" htmlFor="pf-name">
            Business name <span className="font-normal text-ink-400">({t('common.required')})</span>
          </label>
          <input
            id="pf-name"
            value={form.business_name}
            onChange={set('business_name')}
            className={`input ${fieldErrors.business_name ? 'input-error' : ''}`}
            placeholder="GreenTech E-Waste Solutions Pvt. Ltd."
          />
          {fieldErrors.business_name && <p className="field-error">{fieldErrors.business_name}</p>}
        </div>

        <div>
          <label className="label" htmlFor="pf-reg">
            CPCB registration number <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <input
            id="pf-reg"
            value={form.registration_number}
            onChange={set('registration_number')}
            className={`input ${fieldErrors.registration_number ? 'input-error' : ''}`}
            placeholder="CPCB/REC/2025/001"
          />
          <p className="field-hint">An admin verifies this before you can accept lots.</p>
          {fieldErrors.registration_number && <p className="field-error">{fieldErrors.registration_number}</p>}
        </div>

        <div>
          <label className="label" htmlFor="pf-phone">
            {t('recycler.call')} number <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <input
            id="pf-phone"
            type="tel"
            inputMode="numeric"
            value={form.contact_phone}
            onChange={set('contact_phone')}
            className={`input tabular ${fieldErrors.contact_phone ? 'input-error' : ''}`}
            placeholder="98765 43210"
          />
          {fieldErrors.contact_phone && <p className="field-error">{fieldErrors.contact_phone}</p>}
        </div>

        <div>
          <label className="label" htmlFor="pf-addr">
            {t('lot.address')} <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <textarea
            id="pf-addr"
            rows={2}
            value={form.address}
            onChange={set('address')}
            className={`input ${fieldErrors.address ? 'input-error' : ''}`}
            placeholder="Plot 45, MIDC Industrial Area, Navi Mumbai"
          />
          {fieldErrors.address && <p className="field-error">{fieldErrors.address}</p>}
        </div>

        <div>
          <label className="label">{t('lot.location')}</label>
          <button type="button" onClick={captureLocation} disabled={geo.loading} className="btn-secondary btn-sm">
            {geo.loading ? <Spinner size={16} /> : <Icon name="location" size={16} />}
            {loc ? 'Update location' : t('lot.useMyLocation')}
          </button>
          {loc && (
            <p className="field-hint tabular">
              {loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}
            </p>
          )}
          {geo.error && <p className="field-error">{geo.error}</p>}
        </div>

        {m.error && <InlineError message={m.error.message} />}
        {m.success && !m.error && <SuccessNote message="Facility details saved." />}

        <button type="submit" disabled={m.pending || !nameValid} className="btn-primary w-full">
          {m.pending ? <Spinner size={18} /> : <Icon name="check" size={18} />}
          {t('common.save')}
        </button>
      </form>
    </section>
  );
}

// ============================================================
// Availability & logistics
// ============================================================

function AvailabilityForm({ profile, onSaved }) {
  const { t } = useApp();
  const [pickup, setPickup] = useState(Boolean(profile.pickup_available));
  const [distance, setDistance] = useState(
    profile.max_pickup_distance_km != null ? String(Number(profile.max_pickup_distance_km)) : ''
  );
  const [hours, setHours] = useState(profile.operating_hours || '');

  const m = useMutation((body) => api.recyclers.setAvailability(body));
  const fieldErrors = m.error?.fieldErrors || {};

  async function submit(e) {
    e.preventDefault();
    const body = { pickup_available: pickup, operating_hours: hours.trim() };
    if (distance !== '') body.max_pickup_distance_km = Number(distance);
    try {
      await m.run(body);
      onSaved();
    } catch {
      /* surfaced via m.error */
    }
  }

  return (
    <section>
      <SectionHeader title="Availability & logistics" />
      <form onSubmit={submit} className="card card-pad space-y-4">
        {/* Pickup toggle */}
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold text-ink-900">{t('recycler.pickup')}</p>
            <p className="text-sm text-ink-500">
              {pickup ? 'You collect from the collector.' : 'Collectors drop off at your facility.'}
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={pickup}
            onClick={() => setPickup((v) => !v)}
            className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
              pickup ? 'bg-brand-600' : 'bg-ink-300'
            }`}
          >
            <span
              className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${
                pickup ? 'translate-x-5' : 'translate-x-0.5'
              }`}
            />
          </button>
        </div>

        <div>
          <label className="label" htmlFor="av-dist">
            Service radius (km) <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <input
            id="av-dist"
            type="number"
            inputMode="numeric"
            min="1"
            step="1"
            value={distance}
            onChange={(e) => setDistance(e.target.value)}
            disabled={!pickup}
            className={`input tabular ${fieldErrors.max_pickup_distance_km ? 'input-error' : ''} ${
              !pickup ? 'bg-ink-50 text-ink-400' : ''
            }`}
            placeholder="25"
          />
          <p className="field-hint">How far you travel for a pickup. Only used when pickup is on.</p>
          {fieldErrors.max_pickup_distance_km && <p className="field-error">{fieldErrors.max_pickup_distance_km}</p>}
        </div>

        <div>
          <label className="label" htmlFor="av-hours">
            Operating hours <span className="font-normal text-ink-400">({t('common.optional')})</span>
          </label>
          <input
            id="av-hours"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            maxLength={100}
            className={`input ${fieldErrors.operating_hours ? 'input-error' : ''}`}
            placeholder="Mon–Sat, 9am–6pm"
          />
          {fieldErrors.operating_hours && <p className="field-error">{fieldErrors.operating_hours}</p>}
        </div>

        {m.error && <InlineError message={m.error.message} />}
        {m.success && !m.error && <SuccessNote message="Availability saved." />}

        <button type="submit" disabled={m.pending} className="btn-primary w-full">
          {m.pending ? <Spinner size={18} /> : <Icon name="check" size={18} />}
          {t('common.save')}
        </button>
      </form>
    </section>
  );
}
