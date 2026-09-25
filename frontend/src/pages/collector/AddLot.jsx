/**
 * Add a lot — the core capture flow.
 *
 * Built as a short, forgiving sequence a collector can complete one-handed:
 * photograph the material, pick what it is, enter a rough weight, and watch the
 * estimated value update live. Everything below the weight is optional so the
 * common case stays two taps and a number.
 */
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useMutation, useTitle, useGeolocation, useDebounced } from '../../lib/hooks';
import { money, rate } from '../../lib/format';
import {
  SectionHeader,
  Segmented,
  HazardBadge,
  InlineError,
  Spinner,
  ErrorState,
  SkeletonCards,
} from '../../components/ui';
import Icon from '../../components/Icon';

const CONDITIONS = ['working', 'non_working', 'damaged', 'mixed'];
const SOURCES = [
  { value: 'household', icon: 'home' },
  { value: 'commercial', icon: 'tag' },
  { value: 'industrial', icon: 'factory' },
  { value: 'institutional', icon: 'users' },
];

export default function AddLot() {
  const { t } = useApp();
  const navigate = useNavigate();
  useTitle(t('lot.new'));

  const {
    data: categories,
    loading: loadingCats,
    error: catsError,
    refetch,
  } = useQuery(() => api.categories.list(), []);

  // ---------- Form state ----------
  const [categoryId, setCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [weightInput, setWeightInput] = useState('');
  const [condition, setCondition] = useState('mixed');
  const [sourceType, setSourceType] = useState('');
  const [address, setAddress] = useState('');
  const [coords, setCoords] = useState(null);
  const [notes, setNotes] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);

  const geo = useGeolocation();
  const create = useMutation((formData) => api.lots.create(formData));
  const fieldErrors = create.error?.fieldErrors || {};

  const selectedCategory = useMemo(
    () => (categories || []).find((c) => c.id === categoryId) || null,
    [categories, categoryId]
  );
  const children = selectedCategory?.children || [];

  const weightNum = Number(weightInput);
  const validWeight = Number.isFinite(weightNum) && weightNum > 0;
  const canEstimate = Boolean(categoryId) && validWeight;
  const canSubmit = canEstimate && !create.pending;

  // ---------- Live estimate (debounced) ----------
  const estimateKey = useDebounced(
    canEstimate ? `${categoryId}|${subCategoryId}|${weightNum}|${condition}` : '',
    500
  );
  const { data: estimate, loading: estimating } = useQuery(
    () =>
      api.lots.estimate({
        category_id: categoryId,
        ...(subCategoryId ? { sub_category_id: subCategoryId } : {}),
        approximate_weight: weightNum,
        ...(condition ? { condition } : {}),
      }),
    [estimateKey],
    { enabled: canEstimate && Boolean(estimateKey) }
  );

  function pickCategory(id) {
    setCategoryId((prev) => (prev === id ? '' : id));
    setSubCategoryId('');
  }

  function onImageChange(e) {
    const file = e.target.files?.[0];
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    if (file) {
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    } else {
      setImageFile(null);
      setImagePreview(null);
    }
  }

  async function useMyLocation() {
    const c = await geo.request();
    if (c) setCoords(c);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    const fd = new FormData();
    fd.append('category_id', categoryId);
    if (subCategoryId) fd.append('sub_category_id', subCategoryId);
    fd.append('approximate_weight', String(weightNum));
    if (condition) fd.append('condition', condition);
    if (sourceType) fd.append('source_type', sourceType);
    if (address.trim()) fd.append('collection_address', address.trim());
    if (coords) {
      fd.append('collection_location_lat', String(coords.lat));
      fd.append('collection_location_lng', String(coords.lng));
    }
    if (notes.trim()) fd.append('notes', notes.trim());
    if (imageFile) fd.append('image', imageFile);

    try {
      const created = await create.run(fd);
      if (imagePreview) URL.revokeObjectURL(imagePreview);
      navigate(`/app/lots/${created.id}`);
    } catch {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }

  if (loadingCats) {
    return (
      <div className="page space-y-5">
        <div className="skeleton h-7 w-44" />
        <SkeletonCards count={4} />
      </div>
    );
  }

  if (catsError) {
    return (
      <div className="page">
        <ErrorState error={catsError} onRetry={refetch} />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="page space-y-6">
      <header>
        <h1 className="page-title">{t('lot.new')}</h1>
      </header>

      {create.error && <InlineError message={create.error.message} />}

      {/* ---------- 1. Photo ---------- */}
      <section>
        <SectionHeader title={t('lot.photo')} />
        <label className="block cursor-pointer">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onImageChange}
            className="sr-only"
          />
          {imagePreview ? (
            <div className="relative overflow-hidden rounded-2xl border border-ink-200">
              <img src={imagePreview} alt="" className="h-56 w-full object-cover" />
              <span className="absolute bottom-3 right-3 inline-flex items-center gap-1.5 rounded-full bg-ink-900/70 px-3 py-1.5 text-sm font-semibold text-white">
                <Icon name="camera" size={16} />
                {t('lot.retake')}
              </span>
            </div>
          ) : (
            <div className="card flex flex-col items-center gap-2 py-10 text-ink-500">
              <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-100 text-brand-700">
                <Icon name="camera" size={26} />
              </span>
              <span className="font-semibold text-ink-700">{t('lot.photo')}</span>
              <span className="text-xs text-ink-400">{t('common.optional')}</span>
            </div>
          )}
        </label>
      </section>

      {/* ---------- 2. Material ---------- */}
      <section>
        <SectionHeader title={t('lot.material')} />
        <div className="grid grid-cols-2 gap-2.5">
          {(categories || []).map((cat) => {
            const activeCat = cat.id === categoryId;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => pickCategory(cat.id)}
                aria-pressed={activeCat}
                className={`flex flex-col gap-1 rounded-2xl border-2 p-3 text-left transition-colors ${
                  activeCat
                    ? 'border-brand-600 bg-brand-50'
                    : 'border-ink-200 bg-white hover:bg-ink-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-ink-900">{cat.name}</span>
                  <HazardBadge level={cat.hazard_level} />
                </span>
                <span className="text-sm text-ink-500 tabular">
                  {cat.current_price != null ? rate(cat.current_price) : '—'}
                </span>
              </button>
            );
          })}
        </div>
        {fieldErrors.category_id && <p className="field-error">{fieldErrors.category_id}</p>}

        {/* Sub-category (only when the chosen material has types) */}
        {children.length > 0 && (
          <div className="mt-4">
            <p className="label">{t('lot.subMaterial')}</p>
            <div className="flex flex-wrap gap-2">
              {children.map((ch) => {
                const activeSub = ch.id === subCategoryId;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => setSubCategoryId((prev) => (prev === ch.id ? '' : ch.id))}
                    aria-pressed={activeSub}
                    className={`rounded-full px-3.5 py-2 text-sm font-semibold transition-colors ${
                      activeSub
                        ? 'bg-brand-600 text-white'
                        : 'bg-white text-ink-600 ring-1 ring-ink-200 hover:bg-ink-50'
                    }`}
                  >
                    {ch.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </section>

      {/* ---------- 3. Weight ---------- */}
      <section>
        <SectionHeader title={t('lot.weight')} />
        <div className="relative">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="0.5"
            value={weightInput}
            onChange={(e) => setWeightInput(e.target.value)}
            placeholder="0"
            className={`input tabular pr-12 text-2xl font-bold ${
              fieldErrors.approximate_weight ? 'input-error' : ''
            }`}
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-ink-400">
            kg
          </span>
        </div>
        {fieldErrors.approximate_weight && (
          <p className="field-error">{fieldErrors.approximate_weight}</p>
        )}
      </section>

      {/* ---------- 4. Condition ---------- */}
      <section>
        <SectionHeader title={t('lot.condition')} />
        <Segmented
          options={CONDITIONS.map((c) => ({ value: c, label: t(`condition.${c}`) }))}
          value={condition}
          onChange={setCondition}
        />
      </section>

      {/* ---------- Live estimate ---------- */}
      <EstimatePanel canEstimate={canEstimate} estimating={estimating} estimate={estimate} />

      {/* ---------- 5. Source (optional) ---------- */}
      <section>
        <SectionHeader title={`${t('lot.source')} · ${t('common.optional')}`} />
        <div className="grid grid-cols-2 gap-2.5">
          {SOURCES.map((s) => {
            const activeSrc = s.value === sourceType;
            return (
              <button
                key={s.value}
                type="button"
                onClick={() => setSourceType((prev) => (prev === s.value ? '' : s.value))}
                aria-pressed={activeSrc}
                className={`flex items-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-colors ${
                  activeSrc
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-ink-200 bg-white text-ink-600 hover:bg-ink-50'
                }`}
              >
                <Icon name={s.icon} size={18} />
                {t(`source.${s.value}`)}
              </button>
            );
          })}
        </div>
      </section>

      {/* ---------- 6. Location (optional) ---------- */}
      <section>
        <SectionHeader title={`${t('lot.location')} · ${t('common.optional')}`} />
        <input
          type="text"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          placeholder={t('lot.address')}
          className="input"
        />
        <button
          type="button"
          onClick={useMyLocation}
          disabled={geo.loading}
          className="btn-secondary btn-sm mt-2.5"
        >
          {geo.loading ? <Spinner size={16} /> : <Icon name="location" size={16} />}
          {t('lot.useMyLocation')}
        </button>
        {coords && (
          <p className="mt-1.5 inline-flex items-center gap-1 text-sm font-medium text-brand-700">
            <Icon name="check" size={15} />
            <span className="tabular">
              {coords.lat.toFixed(4)}, {coords.lng.toFixed(4)}
            </span>
          </p>
        )}
        {geo.error && <p className="field-hint text-amber-700">{geo.error}</p>}
      </section>

      {/* ---------- 7. Notes (optional) ---------- */}
      <section>
        <SectionHeader title={`${t('lot.notes')} · ${t('common.optional')}`} />
        <textarea
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="input"
          placeholder="Anything a recycler should know"
        />
      </section>

      {/* ---------- Submit ---------- */}
      <button type="submit" disabled={!canSubmit} className="btn-primary w-full text-lg">
        {create.pending ? <Spinner size={20} /> : <Icon name="check" size={20} />}
        {t('lot.save')}
      </button>
    </form>
  );
}

// ------------------------------------------------------------
// Live estimate card
// ------------------------------------------------------------

function EstimatePanel({ canEstimate, estimating, estimate }) {
  const { t } = useApp();

  if (!canEstimate) {
    return (
      <div className="rounded-2xl border border-dashed border-ink-300 bg-ink-50 px-4 py-4 text-center text-sm text-ink-500">
        {t('lot.material')} + {t('lot.weight')} → {t('lot.estimate')}
      </div>
    );
  }

  const value = estimate?.estimated_value;
  const hasValue = value !== null && value !== undefined;
  const range = estimate?.range;

  return (
    <div className="rounded-2xl bg-gradient-to-br from-brand-600 to-brand-700 p-5 text-white shadow-lift">
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-brand-100">{t('lot.estimate')}</p>
        {estimating && <Spinner size={18} className="text-brand-100" />}
      </div>

      {hasValue ? (
        <>
          <p className="mt-1 text-4xl font-bold tabular">{money(value)}</p>
          {range && range.low != null && range.high != null && (
            <p className="mt-1 text-sm text-brand-100 tabular">
              {money(range.low)} – {money(range.high)}
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-sm text-brand-50">
          {estimate?.reason || 'No rate available for this material yet.'}
        </p>
      )}

      {hasValue && estimate?.disclaimer && (
        <p className="mt-3 text-xs leading-snug text-brand-100/90">{estimate.disclaimer}</p>
      )}
    </div>
  );
}
