/**
 * Recycler buying rates.
 *
 * The prices this facility will pay per material. Collectors see these when
 * choosing where to sell, so they are effectively the recycler's shopfront.
 * Publishing is gated on authorization — only a verified facility may quote.
 */
import { useState } from 'react';
import api from '../../lib/api';
import { useApp } from '../../context/AppContext';
import { useQuery, useMutation, useTitle } from '../../lib/hooks';
import { money, rate as fmtRate, weight, relative } from '../../lib/format';
import {
  SectionHeader,
  HazardBadge,
  Sheet,
  EmptyState,
  ErrorState,
  InlineError,
  Spinner,
  SkeletonCards,
} from '../../components/ui';
import Icon from '../../components/Icon';

/** Flatten the category tree (parents + children) into a lookup-friendly list. */
function flattenCategories(list = []) {
  const out = [];
  for (const c of list) {
    out.push({ id: c.id, name: c.name, code: c.code, hazard_level: c.hazard_level, current_price: c.current_price });
    for (const child of c.children || []) {
      out.push({
        id: child.id,
        name: child.name,
        code: child.code,
        hazard_level: child.hazard_level,
        current_price: child.current_price,
        parent: c.name,
      });
    }
  }
  return out;
}

export default function Rates() {
  const { t, lang, isAuthorizedRecycler } = useApp();
  useTitle(t('nav.rates'));

  const [editing, setEditing] = useState(null); // { rate } | { create: true }
  const [removing, setRemoving] = useState(null); // rate row

  const rates = useQuery(() => api.recyclers.myRates(), []);
  const cats = useQuery(() => api.categories.list(), []);

  const allCats = flattenCategories(cats.data || []);
  const catById = Object.fromEntries(allCats.map((c) => [c.id, c]));
  const list = rates.data || [];
  const pricedIds = new Set(list.map((r) => r.category_id));
  const available = allCats.filter((c) => !pricedIds.has(c.id));

  const remove = useMutation((categoryId) => api.recyclers.removeRate(categoryId));

  async function confirmRemove() {
    try {
      await remove.run(removing.category_id);
      setRemoving(null);
      rates.refetch();
    } catch {
      /* surfaced via remove.error */
    }
  }

  return (
    <div className="page space-y-6">
      <SectionHeader
        title={t('nav.rates')}
        action={
          isAuthorizedRecycler && available.length > 0 ? (
            <button type="button" onClick={() => setEditing({ create: true })} className="btn-primary btn-sm">
              <Icon name="plus" size={16} />
              Add rate
            </button>
          ) : null
        }
      />

      {!isAuthorizedRecycler && (
        <div className="rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-200">
          <div className="flex items-start gap-3">
            <Icon name="alert" size={20} className="mt-0.5 text-amber-700" />
            <div>
              <p className="font-semibold text-amber-900">Verification required to publish rates</p>
              <p className="mt-1 text-sm text-amber-800">
                An admin must authorize your facility before your buying rates go live for collectors.
                Any rates below are shown for reference only.
              </p>
            </div>
          </div>
        </div>
      )}

      {rates.loading ? (
        <SkeletonCards count={4} />
      ) : rates.error ? (
        <ErrorState error={rates.error} onRetry={rates.refetch} />
      ) : list.length === 0 ? (
        <EmptyState
          icon="tag"
          title="No rates published yet"
          description="Set a buying price for each material you accept so collectors can find you."
          action={
            isAuthorizedRecycler && available.length > 0 ? (
              <button type="button" onClick={() => setEditing({ create: true })} className="btn-primary btn-sm">
                <Icon name="plus" size={16} />
                Add your first rate
              </button>
            ) : null
          }
        />
      ) : (
        <div className="space-y-3">
          {list.map((r) => {
            const market = catById[r.category_id]?.current_price ?? null;
            const yours = Number(r.buying_price);
            const delta = market != null ? yours - Number(market) : null;

            return (
              <div key={r.id} className="card card-pad">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-ink-900">{r.category?.name || 'Material'}</p>
                      <HazardBadge level={r.category?.hazard_level} />
                    </div>
                    <p className="mt-1 text-2xl font-bold text-brand-700 tabular">
                      {fmtRate(r.buying_price, r.unit || 'kg')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-ink-500">
                      {r.min_quantity ? <span>Min {weight(r.min_quantity)}</span> : null}
                      {market != null && (
                        <span className="tabular">
                          Market {money(market)}
                          {delta != null && delta !== 0 && (
                            <span className={delta > 0 ? 'text-brand-600' : 'text-amber-600'}>
                              {' '}({delta > 0 ? '+' : ''}{money(delta)})
                            </span>
                          )}
                        </span>
                      )}
                      {r.last_updated && <span>Updated {relative(r.last_updated, lang)}</span>}
                    </div>
                  </div>

                  {isAuthorizedRecycler && (
                    <div className="flex shrink-0 gap-1.5">
                      <button
                        type="button"
                        onClick={() => setEditing({ rate: r })}
                        className="rounded-lg p-2 text-ink-500 hover:bg-ink-100"
                        aria-label="Edit rate"
                      >
                        <Icon name="edit" size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { remove.reset(); setRemoving(r); }}
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                        aria-label="Remove rate"
                      >
                        <Icon name="trash" size={18} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ---------- Add / edit ---------- */}
      {editing && (
        <RateSheet
          key={editing.rate ? editing.rate.id : 'create'}
          rate={editing.rate}
          available={available}
          catById={catById}
          onClose={() => setEditing(null)}
          onDone={() => { setEditing(null); rates.refetch(); }}
        />
      )}

      {/* ---------- Remove confirmation ---------- */}
      <Sheet
        open={Boolean(removing)}
        onClose={() => (remove.pending ? null : setRemoving(null))}
        title="Remove rate"
        footer={
          <div className="flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setRemoving(null)} disabled={remove.pending}>
              {t('common.close')}
            </button>
            <button type="button" className="btn-danger flex-1" onClick={confirmRemove} disabled={remove.pending}>
              {remove.pending ? <Spinner size={18} /> : <Icon name="trash" size={18} />}
              Remove
            </button>
          </div>
        }
      >
        <p className="text-sm text-ink-700">
          Remove your buying rate for{' '}
          <span className="font-semibold text-ink-900">{removing?.category?.name}</span>? Collectors will
          no longer see a price from you for this material.
        </p>
        {remove.error && <InlineError className="mt-3" message={remove.error.message} />}
      </Sheet>
    </div>
  );
}

// ============================================================
// Rate editor — create or update (PUT upserts by category)
// ============================================================

function RateSheet({ rate, available, catById, onClose, onDone }) {
  const { t } = useApp();
  const isEdit = Boolean(rate);

  const [categoryId, setCategoryId] = useState(rate?.category_id || available[0]?.id || '');
  const [price, setPrice] = useState(rate?.buying_price != null ? String(Number(rate.buying_price)) : '');
  const [unit, setUnit] = useState(rate?.unit || 'kg');
  const [minQty, setMinQty] = useState(rate?.min_quantity != null ? String(Number(rate.min_quantity)) : '');

  const m = useMutation((body) => api.recyclers.setRate(body));
  const fieldErrors = m.error?.fieldErrors || {};

  const market = categoryId ? catById[categoryId]?.current_price ?? null : null;
  const priceNum = Number(price);
  const priceValid = price !== '' && Number.isFinite(priceNum) && priceNum > 0;

  async function submit(e) {
    e.preventDefault();
    const body = { category_id: categoryId, buying_price: priceNum };
    if (unit.trim()) body.unit = unit.trim();
    if (minQty !== '') body.min_quantity = Number(minQty);
    try {
      await m.run(body);
      onDone();
    } catch {
      /* surfaced via m.error */
    }
  }

  return (
    <Sheet
      open
      onClose={() => (m.pending ? null : onClose())}
      title={isEdit ? `Edit rate · ${rate.category?.name}` : 'Add buying rate'}
      footer={
        <div className="flex gap-2">
          <button type="button" className="btn-secondary flex-1" onClick={onClose} disabled={m.pending}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            form="rate-form"
            disabled={m.pending || !categoryId || !priceValid}
            className="btn-primary flex-1"
          >
            {m.pending ? <Spinner size={18} /> : <Icon name="check" size={18} />}
            {t('common.save')}
          </button>
        </div>
      }
    >
      <form id="rate-form" onSubmit={submit} className="space-y-4">
        <div>
          <label className="label" htmlFor="rt-cat">
            {t('lot.material')}
          </label>
          {isEdit ? (
            <input id="rt-cat" value={rate.category?.name || ''} disabled className="input bg-ink-50 text-ink-500" />
          ) : (
            <select
              id="rt-cat"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className={`input ${fieldErrors.category_id ? 'input-error' : ''}`}
            >
              {available.length === 0 && <option value="">All materials already priced</option>}
              {available.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.parent ? `${c.parent} · ${c.name}` : c.name}
                </option>
              ))}
            </select>
          )}
          {fieldErrors.category_id && <p className="field-error">{fieldErrors.category_id}</p>}
        </div>

        <div>
          <label className="label" htmlFor="rt-price">
            Buying price (₹) <span className="font-normal text-ink-400">({t('common.required')})</span>
          </label>
          <input
            id="rt-price"
            type="number"
            inputMode="decimal"
            min="0"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            className={`input tabular ${fieldErrors.buying_price ? 'input-error' : ''}`}
            placeholder="0.00"
          />
          {market != null && <p className="field-hint tabular">Current market rate: {money(market)}.</p>}
          {fieldErrors.buying_price && <p className="field-error">{fieldErrors.buying_price}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="rt-unit">
              Unit
            </label>
            <select
              id="rt-unit"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className={`input ${fieldErrors.unit ? 'input-error' : ''}`}
            >
              <option value="kg">per kg</option>
              <option value="piece">per piece</option>
              <option value="unit">per unit</option>
              <option value="litre">per litre</option>
            </select>
            {fieldErrors.unit && <p className="field-error">{fieldErrors.unit}</p>}
          </div>

          <div>
            <label className="label" htmlFor="rt-min">
              Min qty <span className="font-normal text-ink-400">({t('common.optional')})</span>
            </label>
            <input
              id="rt-min"
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              value={minQty}
              onChange={(e) => setMinQty(e.target.value)}
              className={`input tabular ${fieldErrors.min_quantity ? 'input-error' : ''}`}
              placeholder="0"
            />
            {fieldErrors.min_quantity && <p className="field-error">{fieldErrors.min_quantity}</p>}
          </div>
        </div>

        {m.error && <InlineError message={m.error.message} />}
      </form>
    </Sheet>
  );
}
