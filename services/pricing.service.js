/**
 * Pricing Service
 * Price board, trends, and the lot value estimator.
 *
 * ── On the estimator ─────────────────────────────────────────────────────────
 * There is no trained ML model in this system. The estimate is a transparent
 * arithmetic rule:
 *
 *     estimated_value = reference_price_per_kg × weight × condition_factor
 *
 * Every response carries the inputs, the formula, the sample size behind the
 * reference price, and a `method` field naming the rule that produced it. That
 * matters for two reasons: a collector deciding whether to accept an offer
 * deserves to know where the number came from, and an ML valuation model can
 * later be dropped in behind the same interface without any caller pretending
 * a heuristic was a prediction.
 *
 * `AI_VALUATION_ENABLED=true` routes estimates through the external model
 * service first (see ai.service.js); when it is off or unreachable, this rule
 * runs and says so.
 * ────────────────────────────────────────────────────────────────────────────
 */
const Price = require('../models/Price');
const prisma = require('../config/db');
const logger = require('../utils/logger');

/**
 * Condition multipliers applied to the reference rate.
 *
 * Rationale: working units carry component resale value above scrap; damaged
 * material loses recoverable mass to breakage and contamination. These are
 * documented field heuristics, not learned parameters — they are published in
 * every valuation response so nobody mistakes them for a model output.
 */
const CONDITION_FACTORS = Object.freeze({
  working: 1.15,
  mixed: 1.0,
  non_working: 0.9,
  damaged: 0.75,
});

/** Price observations newer than this are preferred as the reference. */
const REFERENCE_WINDOW_DAYS = 7;
const FALLBACK_WINDOW_DAYS = 30;

/**
 * Get the current price + short trend for one category.
 */
async function getPriceBoard(category_id, location = null) {
  const [latest, avg7, avg30] = await Promise.all([
    Price.getLatest(category_id, location),
    Price.getAveragePrice(category_id, { days: 7, location }),
    Price.getAveragePrice(category_id, { days: 30, location }),
  ]);

  const currentPrice = latest ? Number(latest.buying_price) : null;
  const avg7Price = avg7.average;
  const avg30Price = avg30.average;

  // Trend compares today's rate against the week's average.
  let trend = 'stable';
  let changePercent = 0;
  if (currentPrice !== null && avg7Price) {
    changePercent = ((currentPrice - avg7Price) / avg7Price) * 100;
    if (changePercent > 5) trend = 'up';
    else if (changePercent < -5) trend = 'down';
  }

  return {
    category_id,
    location: location || 'all',
    current_price: currentPrice,
    avg_7d: avg7Price ? round2(avg7Price) : null,
    avg_30d: avg30Price ? round2(avg30Price) : null,
    trend,
    change_percent: round1(changePercent),
    sample_count_7d: avg7.count,
    sample_count_30d: avg30.count,
    last_updated: latest?.recorded_at || null,
  };
}

/**
 * Price board across every category, with the market range recyclers actually
 * offer — the problem statement asks for an approximate market range alongside
 * the prevailing price.
 */
async function getFullPriceBoard(location = null) {
  const categories = await prisma.material_categories.findMany({
    select: { id: true, name: true, code: true, icon_url: true, hazard_level: true, parent_id: true },
    orderBy: { name: 'asc' },
  });

  const boards = await Promise.all(
    categories.map(async (cat) => {
      const [board, offers] = await Promise.all([
        getPriceBoard(cat.id, location),
        prisma.recycler_materials.findMany({
          where: { category_id: cat.id, recycler: { authorization_status: 'authorized' } },
          select: { buying_price: true, unit: true },
        }),
      ]);

      const rates = offers.map((o) => Number(o.buying_price)).sort((a, b) => a - b);

      return {
        category_id: cat.id,
        category_code: cat.code,
        category_name: cat.name,
        icon_url: cat.icon_url,
        hazard_level: cat.hazard_level,
        is_sub_category: Boolean(cat.parent_id),
        unit: offers[0]?.unit || 'kg',
        ...board,
        market_range:
          rates.length > 0
            ? { min: rates[0], max: rates[rates.length - 1], recycler_count: rates.length }
            : null,
        best_offer: rates.length ? rates[rates.length - 1] : null,
      };
    })
  );

  // A category with neither a recorded price nor a live offer has nothing to show.
  return boards.filter((b) => b.current_price !== null || b.market_range !== null);
}

/**
 * Estimate a lot's value using the documented rule above.
 *
 * @param {Object} params
 * @param {string} params.category_id - Sub-category when known, else category
 * @param {string} [params.fallback_category_id] - Parent category to fall back on
 * @param {number} params.weight - kg
 * @param {string} [params.condition] - lot_condition
 * @param {string} [params.location]
 * @returns {Promise<Object>} Valuation with its full derivation
 */
async function estimateLotValue({
  category_id,
  fallback_category_id = null,
  weight,
  condition = 'mixed',
  location = null,
}) {
  const w = Number(weight);
  if (!Number.isFinite(w) || w <= 0) {
    return {
      estimated_value: null,
      method: 'unavailable',
      reason: 'A positive weight is required to estimate value.',
    };
  }

  const conditionFactor = CONDITION_FACTORS[condition] ?? 1.0;

  // Reference price, most specific and most recent source first.
  const reference = await resolveReferencePrice({ category_id, fallback_category_id, location });

  if (reference.price === null) {
    return {
      estimated_value: null,
      method: 'unavailable',
      reason:
        'No price data exists for this material yet. A recycler rate or market survey is needed first.',
      inputs: { weight_kg: w, condition, condition_factor: conditionFactor },
    };
  }

  const estimated = reference.price * w * conditionFactor;

  return {
    estimated_value: round2(estimated),
    // Names the rule, never claims a prediction.
    method: 'rule_based_price_x_weight',
    formula: 'reference_price_per_kg × weight_kg × condition_factor',
    inputs: {
      reference_price_per_kg: round2(reference.price),
      weight_kg: w,
      condition,
      condition_factor: conditionFactor,
    },
    reference: {
      source: reference.source,
      basis: reference.basis,
      sample_count: reference.sampleCount,
      window_days: reference.windowDays,
      location: reference.location,
      as_of: reference.asOf,
    },
    // An honest band, not a confidence interval from a model.
    range: {
      low: round2(reference.low !== null ? reference.low * w * conditionFactor : estimated * 0.85),
      high: round2(reference.high !== null ? reference.high * w * conditionFactor : estimated * 1.15),
    },
    disclaimer:
      'Indicative estimate from recent market rates, not a guaranteed price. ' +
      'The final amount is agreed with the recycler at handover.',
  };
}

/**
 * Resolve the best available reference price per kg.
 *
 * Preference order — most specific and most current first:
 *   1. Live authorized-recycler offers for the exact category (the real market)
 *   2. 7-day average of recorded price history
 *   3. 30-day average of recorded price history
 *   4. The same chain against the parent category
 */
async function resolveReferencePrice({ category_id, fallback_category_id, location }) {
  const empty = {
    price: null, source: null, basis: null, sampleCount: 0,
    windowDays: null, location: location || 'all', asOf: null, low: null, high: null,
  };

  for (const catId of [category_id, fallback_category_id].filter(Boolean)) {
    const isFallback = catId === fallback_category_id && catId !== category_id;

    // 1. What authorized recyclers are offering right now.
    const offers = await prisma.recycler_materials.findMany({
      where: { category_id: catId, recycler: { authorization_status: 'authorized' } },
      select: { buying_price: true, last_updated: true },
    });

    if (offers.length > 0) {
      const rates = offers.map((o) => Number(o.buying_price));
      const mean = rates.reduce((a, b) => a + b, 0) / rates.length;
      const latest = offers.reduce(
        (acc, o) => (!acc || o.last_updated > acc ? o.last_updated : acc),
        null
      );

      return {
        price: mean,
        source: 'authorized_recycler_rates',
        basis: isFallback
          ? 'Mean rate offered by authorized recyclers for the parent category'
          : 'Mean rate offered by authorized recyclers for this material',
        sampleCount: rates.length,
        windowDays: null,
        location: location || 'all',
        asOf: latest,
        low: Math.min(...rates),
        high: Math.max(...rates),
      };
    }

    // 2 & 3. Recorded price history.
    for (const days of [REFERENCE_WINDOW_DAYS, FALLBACK_WINDOW_DAYS]) {
      const avg = await Price.getAveragePrice(catId, { days, location });
      if (avg.average) {
        const history = await Price.getHistory(catId, { days, location });
        const prices = history.map((h) => Number(h.buying_price));

        return {
          price: avg.average,
          source: 'price_history',
          basis: `${days}-day average of recorded buying prices${
            isFallback ? ' for the parent category' : ''
          }`,
          sampleCount: avg.count,
          windowDays: days,
          location: location || 'all',
          asOf: history.length ? history[history.length - 1].recorded_at : null,
          low: prices.length ? Math.min(...prices) : null,
          high: prices.length ? Math.max(...prices) : null,
        };
      }
    }
  }

  logger.warn('No price reference available for estimate', { category_id, location });
  return empty;
}

/**
 * Backwards-compatible thin wrapper.
 * Returns just the number, for callers that only need the figure.
 */
async function estimateValue(category_id, weight, location = null) {
  const result = await estimateLotValue({ category_id, weight, location });
  return result.estimated_value;
}

/**
 * Daily average price series for trend charts.
 */
async function getPriceTrend(category_id, { days = 30, location = null } = {}) {
  const history = await Price.getHistory(category_id, { days, location });

  const dailyMap = new Map();
  for (const entry of history) {
    const dateKey = entry.recorded_at.toISOString().slice(0, 10);
    if (!dailyMap.has(dateKey)) dailyMap.set(dateKey, { sum: 0, count: 0, min: Infinity, max: -Infinity });
    const day = dailyMap.get(dateKey);
    const price = Number(entry.buying_price);
    day.sum += price;
    day.count += 1;
    day.min = Math.min(day.min, price);
    day.max = Math.max(day.max, price);
  }

  const series = Array.from(dailyMap.entries())
    .map(([date, d]) => ({
      date,
      avg_price: round2(d.sum / d.count),
      min_price: round2(d.min),
      max_price: round2(d.max),
      sample_count: d.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));

  // Simple first-to-last direction over the window.
  let direction = 'stable';
  let changePercent = 0;
  if (series.length >= 2) {
    const first = series[0].avg_price;
    const last = series[series.length - 1].avg_price;
    if (first > 0) {
      changePercent = ((last - first) / first) * 100;
      if (changePercent > 5) direction = 'up';
      else if (changePercent < -5) direction = 'down';
    }
  }

  return {
    category_id,
    location: location || 'all',
    days,
    series,
    summary: {
      direction,
      change_percent: round1(changePercent),
      data_points: series.length,
      period_avg: series.length
        ? round2(series.reduce((a, s) => a + s.avg_price, 0) / series.length)
        : null,
      period_low: series.length ? round2(Math.min(...series.map((s) => s.min_price))) : null,
      period_high: series.length ? round2(Math.max(...series.map((s) => s.max_price))) : null,
    },
  };
}

const round2 = (n) => Math.round(Number(n) * 100) / 100;
const round1 = (n) => Math.round(Number(n) * 10) / 10;

module.exports = {
  getPriceBoard,
  getFullPriceBoard,
  estimateLotValue,
  estimateValue,
  getPriceTrend,
  CONDITION_FACTORS,
};
