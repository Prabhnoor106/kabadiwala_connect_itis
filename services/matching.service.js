/**
 * Matching Service
 * Ranks authorized recyclers for a lot.
 *
 * This is a deterministic weighted score, not a learned model. The weights are
 * declared as constants and every result carries a per-factor breakdown, so a
 * collector can see why one recycler outranks another — and disagree.
 *
 * Factors, out of 100:
 *   40  price offered for the material (what the collector actually earns)
 *   30  proximity to the collection point (travel cost and effort)
 *   20  pickup availability (a pickup removes transport cost entirely)
 *   10  authorization standing
 *
 * Price leads because these collectors operate on thin margins; distance
 * matters second because they usually move material by hand or hand-cart.
 * Only `authorized` recyclers are considered at all — that filter is the point
 * of the platform, not a ranking factor.
 */
const Recycler = require('../models/Recycler');
const { haversineDistance } = require('../utils/geo.util');
const logger = require('../utils/logger');

const WEIGHTS = Object.freeze({
  price: 40,
  distance: 30,
  pickup: 20,
  authorization: 10,
});

/** Beyond this, distance scores zero regardless of the recycler's own radius. */
const MAX_USEFUL_DISTANCE_KM = 150;

/**
 * Score and rank recyclers for a lot.
 *
 * @param {Object} lot - Lot with category_id, weight and collection location
 * @param {Object} [options]
 * @param {number} [options.topN=5]
 * @param {boolean} [options.includeOutOfRange=true] - Keep recyclers outside their pickup radius, ranked lower
 * @returns {Promise<Array<Object>>}
 */
async function rankRecyclersForLot(lot, { topN = 5, includeOutOfRange = true } = {}) {
  // Match on the sub-category when the collector chose one, since rates differ
  // sharply between, say, motherboards and low-grade boards.
  const categoryIds = [lot.sub_category_id, lot.category_id].filter(Boolean);

  let recyclers = [];
  let matchedCategoryId = null;

  for (const categoryId of categoryIds) {
    recyclers = await Recycler.findAuthorizedForCategory(categoryId);
    if (recyclers.length) {
      matchedCategoryId = categoryId;
      break;
    }
  }

  if (!recyclers.length) {
    logger.info('No authorized recyclers accept this material', {
      category_id: lot.category_id,
      sub_category_id: lot.sub_category_id,
    });
    return [];
  }

  const lotLat = lot.collection_location_lat ? Number(lot.collection_location_lat) : null;
  const lotLng = lot.collection_location_lng ? Number(lot.collection_location_lng) : null;
  const hasLotLocation = Number.isFinite(lotLat) && Number.isFinite(lotLng);
  const weight = Number(lot.approximate_weight) || 0;

  // Rates across the candidate set, so price can be scored relatively rather
  // than against an arbitrary ceiling.
  const rates = recyclers
    .map((r) => Number(r.recycler_materials[0]?.buying_price))
    .filter((n) => Number.isFinite(n) && n > 0);

  const bestRate = rates.length ? Math.max(...rates) : 0;
  const worstRate = rates.length ? Math.min(...rates) : 0;
  const rateSpread = bestRate - worstRate;

  const scored = recyclers.map((recycler) => {
    const breakdown = {};
    const reasons = [];
    let score = 0;

    // ---- Price (40) ----
    const materialRate = recycler.recycler_materials[0];
    let offered_rate = null;
    let estimated_payout = null;
    let meets_min_quantity = true;

    if (materialRate) {
      offered_rate = Number(materialRate.buying_price);
      estimated_payout = round2(offered_rate * weight);

      // Best rate in the set gets full marks; the rest scale down from it.
      const priceScore =
        rateSpread > 0
          ? WEIGHTS.price * ((offered_rate - worstRate) / rateSpread)
          : WEIGHTS.price;

      score += priceScore;
      breakdown.price = round1(priceScore);
      reasons.push(`₹${offered_rate}/${materialRate.unit || 'kg'}`);

      const minQty = Number(materialRate.min_quantity) || 0;
      if (minQty > 0 && weight < minQty) {
        meets_min_quantity = false;
        // A minimum this lot can't meet is a real obstacle, not a preference.
        score -= 15;
        breakdown.min_quantity_penalty = -15;
        reasons.push(`needs at least ${minQty} kg`);
      }
    } else {
      breakdown.price = 0;
      reasons.push('no rate listed');
    }

    // ---- Distance (30) ----
    let distance_km = null;
    let within_pickup_range = null;

    if (hasLotLocation && recycler.location_lat && recycler.location_lng) {
      distance_km = round1(
        haversineDistance(lotLat, lotLng, Number(recycler.location_lat), Number(recycler.location_lng))
      );

      const radius = recycler.max_pickup_distance_km || 50;
      within_pickup_range = distance_km <= radius;

      // Decay against the smaller of the recycler's radius and a practical cap.
      const reference = Math.min(radius, MAX_USEFUL_DISTANCE_KM);
      const proximity = Math.max(0, 1 - distance_km / reference);
      const distanceScore = WEIGHTS.distance * proximity;

      score += distanceScore;
      breakdown.distance = round1(distanceScore);
      reasons.push(
        within_pickup_range
          ? `${distance_km} km away`
          : `${distance_km} km away — outside their ${radius} km pickup range`
      );
    } else {
      breakdown.distance = 0;
      reasons.push('distance unknown');
    }

    // ---- Pickup availability (20) ----
    // Only worth full credit if they'll actually come to this lot.
    if (recycler.pickup_available && within_pickup_range !== false) {
      score += WEIGHTS.pickup;
      breakdown.pickup = WEIGHTS.pickup;
      reasons.push('pickup available');
    } else if (recycler.pickup_available && within_pickup_range === false) {
      score += WEIGHTS.pickup * 0.25;
      breakdown.pickup = round1(WEIGHTS.pickup * 0.25);
      reasons.push('pickup offered but you are outside their range');
    } else {
      breakdown.pickup = 0;
      reasons.push('drop-off only');
    }

    // ---- Authorization (10) ----
    if (recycler.authorization_status === 'authorized') {
      score += WEIGHTS.authorization;
      breakdown.authorization = WEIGHTS.authorization;
      reasons.push('CPCB authorized');
    }

    return {
      recycler: {
        id: recycler.id,
        business_name: recycler.business_name,
        registration_number: recycler.registration_number,
        authorization_status: recycler.authorization_status,
        contact_phone: recycler.contact_phone,
        address: recycler.address,
        pickup_available: recycler.pickup_available,
        max_pickup_distance_km: recycler.max_pickup_distance_km,
        operating_hours: recycler.operating_hours,
        location_lat: recycler.location_lat,
        location_lng: recycler.location_lng,
      },
      score: round1(Math.max(0, score)),
      distance_km,
      within_pickup_range,
      offered_rate,
      unit: materialRate?.unit || 'kg',
      min_quantity: materialRate ? Number(materialRate.min_quantity) : null,
      meets_min_quantity,
      estimated_payout,
      score_breakdown: breakdown,
      reasons,
    };
  });

  const eligible = includeOutOfRange
    ? scored
    : scored.filter((s) => s.within_pickup_range !== false);

  // Highest score wins; ties break toward the better rate, then the shorter trip.
  eligible.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if ((b.offered_rate || 0) !== (a.offered_rate || 0)) {
      return (b.offered_rate || 0) - (a.offered_rate || 0);
    }
    return (a.distance_km ?? Infinity) - (b.distance_km ?? Infinity);
  });

  const ranked = eligible.slice(0, topN).map((m, i) => ({ ...m, rank: i + 1 }));

  if (ranked.length && matchedCategoryId !== lot.sub_category_id && lot.sub_category_id) {
    logger.info('Matched on parent category — no recycler lists the sub-category', {
      lot_id: lot.id,
      sub_category_id: lot.sub_category_id,
    });
  }

  return ranked;
}

const round1 = (n) => Math.round(Number(n) * 10) / 10;
const round2 = (n) => Math.round(Number(n) * 100) / 100;

module.exports = { rankRecyclersForLot, WEIGHTS };
