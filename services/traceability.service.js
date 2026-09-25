/**
 * Traceability Service
 * Builds the collection → matching → transaction → handover → payment →
 * completion timeline for a lot.
 *
 * The timeline is DERIVED, never stored: every event is reconstructed from
 * lots, transactions.status_history, traceability and its photos. That means
 * the chain can always be re-verified against the underlying records rather
 * than trusting a denormalized log.
 */
const prisma = require('../config/db');
const { TRANSACTION_STATUS } = require('../config/constants');

/**
 * Human-facing labels per timeline stage, in all three supported languages.
 * Kept here rather than in the frontend so SMS/print/audio paths reuse them.
 */
const STAGE_LABELS = {
  lot_created: {
    en: 'Lot created', hi: 'लॉट बनाया गया', mr: 'लॉट तयार केला',
  },
  recycler_matched: {
    en: 'Recycler matched', hi: 'रीसाइक्लर मिला', mr: 'रिसायकलर जुळला',
  },
  quoted: {
    en: 'Price quoted', hi: 'कीमत तय हुई', mr: 'किंमत ठरली',
  },
  accepted: {
    en: 'Recycler accepted', hi: 'रीसाइक्लर ने स्वीकारा', mr: 'रिसायकलरने स्वीकारले',
  },
  in_transit: {
    en: 'In transit', hi: 'रास्ते में', mr: 'वाटेत',
  },
  handed_over: {
    en: 'Material handed over', hi: 'सामान सौंपा गया', mr: 'माल सुपूर्द केला',
  },
  confirmed: {
    en: 'Recycler confirmed receipt', hi: 'रीसाइक्लर ने पुष्टि की', mr: 'रिसायकलरने पुष्टी केली',
  },
  payment: {
    en: 'Payment', hi: 'भुगतान', mr: 'पेमेंट',
  },
  completed: {
    en: 'Completed', hi: 'पूरा हुआ', mr: 'पूर्ण झाले',
  },
  cancelled: {
    en: 'Cancelled', hi: 'रद्द', mr: 'रद्द',
  },
  disputed: {
    en: 'Disputed', hi: 'विवादित', mr: 'वादग्रस्त',
  },
};

function label(key, lang = 'en') {
  return STAGE_LABELS[key]?.[lang] || STAGE_LABELS[key]?.en || key;
}

/**
 * Build the full traceability timeline for a lot.
 *
 * @param {string} lot_id
 * @param {Object} [options]
 * @param {string} [options.lang='en'] - hi | mr | en
 * @returns {Promise<Object|null>} Timeline document, or null when the lot is gone
 */
async function getLotTimeline(lot_id, { lang = 'en' } = {}) {
  const lot = await prisma.lots.findUnique({
    where: { id: lot_id },
    select: {
      id: true,
      collector_id: true,
      image_url: true,
      approximate_weight: true,
      condition: true,
      source_type: true,
      estimated_value: true,
      status: true,
      collection_location_lat: true,
      collection_location_lng: true,
      collection_address: true,
      notes: true,
      created_at: true,
      category: { select: { id: true, name: true, code: true, icon_url: true, hazard_level: true } },
      sub_category: { select: { id: true, name: true, code: true } },
      collector: { select: { id: true, phone: true, preferred_language: true } },
      transactions: {
        orderBy: { created_at: 'asc' },
        select: {
          id: true,
          offered_price: true,
          final_price: true,
          final_weight: true,
          status: true,
          payment_status: true,
          payment_method: true,
          status_history: true,
          pickup_scheduled_at: true,
          completed_at: true,
          cancelled_at: true,
          cancellation_reason: true,
          created_at: true,
          recycler: {
            select: {
              id: true,
              business_name: true,
              registration_number: true,
              authorization_status: true,
              contact_phone: true,
              address: true,
            },
          },
          traceability: {
            select: {
              id: true,
              handover_reference_number: true,
              actual_weight: true,
              handover_location_lat: true,
              handover_location_lng: true,
              handover_timestamp: true,
              collector_confirmed: true,
              collector_confirmed_at: true,
              recycler_confirmed: true,
              recycler_confirmed_at: true,
              notes: true,
              photos: {
                select: { id: true, photo_url: true, photo_type: true, uploaded_at: true },
              },
            },
          },
        },
      },
    },
  });

  if (!lot) return null;

  // The active transaction is the one that isn't cancelled; fall back to latest.
  const live = lot.transactions.find((t) => t.status !== TRANSACTION_STATUS.CANCELLED);
  const primary = live || lot.transactions[lot.transactions.length - 1] || null;

  const events = [];

  // ---- Stage 1: collection ----
  events.push({
    stage: 'lot_created',
    label: label('lot_created', lang),
    timestamp: lot.created_at,
    status: 'done',
    icon: 'package',
    detail: {
      category: lot.category?.name,
      category_code: lot.category?.code,
      sub_category: lot.sub_category?.name,
      weight_kg: num(lot.approximate_weight),
      condition: lot.condition,
      source_type: lot.source_type,
      estimated_value: num(lot.estimated_value),
      image_url: lot.image_url,
      location: {
        lat: num(lot.collection_location_lat),
        lng: num(lot.collection_location_lng),
        address: lot.collection_address,
      },
    },
  });

  // ---- Stage 2: recycler matched + quote ----
  if (primary) {
    events.push({
      stage: 'recycler_matched',
      label: label('recycler_matched', lang),
      timestamp: primary.created_at,
      status: 'done',
      icon: 'factory',
      detail: {
        recycler: primary.recycler?.business_name,
        recycler_id: primary.recycler?.id,
        registration_number: primary.recycler?.registration_number,
        authorization_status: primary.recycler?.authorization_status,
        address: primary.recycler?.address,
        contact_phone: primary.recycler?.contact_phone,
      },
    });

    events.push({
      stage: 'quoted',
      label: label('quoted', lang),
      timestamp: primary.created_at,
      status: 'done',
      icon: 'tag',
      detail: {
        transaction_id: primary.id,
        offered_price: num(primary.offered_price),
        estimated_value: num(lot.estimated_value),
      },
    });

    // ---- Stages 3-5: replay status_history for real timestamps ----
    const history = Array.isArray(primary.status_history) ? primary.status_history : [];
    const at = (status) => history.find((h) => h.status === status)?.timestamp || null;
    const noteFor = (status) => history.find((h) => h.status === status)?.note || null;

    const order = [
      TRANSACTION_STATUS.ACCEPTED,
      TRANSACTION_STATUS.IN_TRANSIT,
      TRANSACTION_STATUS.HANDED_OVER,
      TRANSACTION_STATUS.CONFIRMED,
    ];
    const reachedIdx = order.indexOf(primary.status);

    for (const [idx, status] of order.entries()) {
      const stamp = at(status);
      // A stage is done when it has a recorded timestamp, or when the
      // transaction has already progressed past it.
      const done = Boolean(stamp) || (reachedIdx > idx && reachedIdx !== -1);

      const event = {
        stage: status,
        label: label(status, lang),
        timestamp: stamp,
        status: done ? 'done' : primary.status === status ? 'current' : 'pending',
        icon: {
          accepted: 'check-circle',
          in_transit: 'truck',
          handed_over: 'hand-coins',
          confirmed: 'shield-check',
        }[status],
        detail: { note: noteFor(status) },
      };

      // Attach the verifiable handover record to its stage.
      if (status === TRANSACTION_STATUS.HANDED_OVER && primary.traceability) {
        const t = primary.traceability;
        event.timestamp = t.handover_timestamp || event.timestamp;
        event.status = 'done';
        event.detail = {
          ...event.detail,
          handover_reference_number: t.handover_reference_number,
          actual_weight_kg: num(t.actual_weight),
          declared_weight_kg: num(lot.approximate_weight),
          weight_variance_kg: num(t.actual_weight) - num(lot.approximate_weight),
          location: {
            lat: num(t.handover_location_lat),
            lng: num(t.handover_location_lng),
          },
          collector_confirmed: t.collector_confirmed,
          collector_confirmed_at: t.collector_confirmed_at,
          photos: t.photos,
          notes: t.notes,
        };
      }

      if (status === TRANSACTION_STATUS.CONFIRMED && primary.traceability?.recycler_confirmed) {
        event.status = 'done';
        event.timestamp = primary.traceability.recycler_confirmed_at || event.timestamp;
        event.detail = {
          ...event.detail,
          recycler_confirmed: true,
          recycler_confirmed_at: primary.traceability.recycler_confirmed_at,
        };
      }

      events.push(event);
    }

    // ---- Stage 6: payment ----
    const paid = primary.payment_status === 'completed';
    events.push({
      stage: 'payment',
      label: label('payment', lang),
      timestamp: paid ? primary.completed_at || at(TRANSACTION_STATUS.COMPLETED) : null,
      status: paid ? 'done' : primary.payment_status === 'partial' ? 'current' : 'pending',
      icon: 'wallet',
      detail: {
        payment_status: primary.payment_status,
        payment_method: primary.payment_method,
        amount: num(primary.final_price) || num(primary.offered_price),
        final_weight_kg: num(primary.final_weight),
      },
    });

    // ---- Stage 7: completion ----
    events.push({
      stage: 'completed',
      label: label('completed', lang),
      timestamp: primary.completed_at,
      status: primary.status === TRANSACTION_STATUS.COMPLETED ? 'done' : 'pending',
      icon: 'flag',
      detail: {
        final_price: num(primary.final_price),
        final_weight_kg: num(primary.final_weight),
      },
    });

    // ---- Terminal / exception states ----
    if (primary.status === TRANSACTION_STATUS.CANCELLED) {
      events.push({
        stage: 'cancelled',
        label: label('cancelled', lang),
        timestamp: primary.cancelled_at,
        status: 'cancelled',
        icon: 'x-circle',
        detail: { reason: primary.cancellation_reason },
      });
    }

    if (primary.status === TRANSACTION_STATUS.DISPUTED) {
      events.push({
        stage: 'disputed',
        label: label('disputed', lang),
        timestamp: at(TRANSACTION_STATUS.DISPUTED),
        status: 'disputed',
        icon: 'alert-triangle',
        detail: { note: noteFor(TRANSACTION_STATUS.DISPUTED) },
      });
    }
  }

  const doneCount = events.filter((e) => e.status === 'done').length;

  return {
    lot: {
      id: lot.id,
      collector_id: lot.collector_id,
      status: lot.status,
      category: lot.category,
      sub_category: lot.sub_category,
      image_url: lot.image_url,
      approximate_weight: num(lot.approximate_weight),
      estimated_value: num(lot.estimated_value),
      condition: lot.condition,
      source_type: lot.source_type,
      collection_address: lot.collection_address,
      created_at: lot.created_at,
      notes: lot.notes,
    },
    transaction: primary
      ? {
          id: primary.id,
          status: primary.status,
          payment_status: primary.payment_status,
          payment_method: primary.payment_method,
          offered_price: num(primary.offered_price),
          final_price: num(primary.final_price),
          final_weight: num(primary.final_weight),
          recycler: primary.recycler,
          created_at: primary.created_at,
          completed_at: primary.completed_at,
        }
      : null,
    handover: primary?.traceability
      ? {
          reference_number: primary.traceability.handover_reference_number,
          actual_weight: num(primary.traceability.actual_weight),
          handover_timestamp: primary.traceability.handover_timestamp,
          collector_confirmed: primary.traceability.collector_confirmed,
          recycler_confirmed: primary.traceability.recycler_confirmed,
          photos: primary.traceability.photos,
          location: {
            lat: num(primary.traceability.handover_location_lat),
            lng: num(primary.traceability.handover_location_lng),
          },
        }
      : null,
    // Superseded/cancelled attempts stay visible — traceability means showing
    // what actually happened, including failed matches.
    superseded_transactions: lot.transactions
      .filter((t) => primary && t.id !== primary.id)
      .map((t) => ({
        id: t.id,
        status: t.status,
        recycler: t.recycler?.business_name,
        offered_price: num(t.offered_price),
        created_at: t.created_at,
        cancelled_at: t.cancelled_at,
        cancellation_reason: t.cancellation_reason,
      })),
    events,
    progress: {
      completed_stages: doneCount,
      total_stages: events.length,
      percent: events.length ? Math.round((doneCount / events.length) * 100) : 0,
    },
  };
}

/**
 * Public verification of a handover by its reference number.
 * Returns only what is needed to confirm a chain of custody — no phone
 * numbers, no collector identity beyond the opaque ID.
 *
 * @param {string} reference - e.g. "HRN-20260905-A3F7"
 */
async function verifyByReference(reference) {
  const record = await prisma.traceability.findUnique({
    where: { handover_reference_number: reference },
    select: {
      handover_reference_number: true,
      actual_weight: true,
      handover_timestamp: true,
      collector_confirmed: true,
      recycler_confirmed: true,
      recycler_confirmed_at: true,
      photos: { select: { photo_url: true, photo_type: true } },
      transaction: {
        select: {
          id: true,
          status: true,
          payment_status: true,
          final_price: true,
          lot: {
            select: {
              id: true,
              approximate_weight: true,
              collection_address: true,
              created_at: true,
              category: { select: { name: true, code: true } },
            },
          },
          recycler: {
            select: {
              business_name: true,
              registration_number: true,
              authorization_status: true,
            },
          },
        },
      },
    },
  });

  if (!record) return null;

  return {
    verified: true,
    reference_number: record.handover_reference_number,
    handover_timestamp: record.handover_timestamp,
    actual_weight_kg: num(record.actual_weight),
    collector_confirmed: record.collector_confirmed,
    recycler_confirmed: record.recycler_confirmed,
    recycler_confirmed_at: record.recycler_confirmed_at,
    photo_count: record.photos.length,
    photos: record.photos,
    material: {
      category: record.transaction?.lot?.category?.name,
      category_code: record.transaction?.lot?.category?.code,
      declared_weight_kg: num(record.transaction?.lot?.approximate_weight),
      collected_at: record.transaction?.lot?.created_at,
      collection_address: record.transaction?.lot?.collection_address,
    },
    recycler: record.transaction?.recycler,
    transaction: {
      id: record.transaction?.id,
      status: record.transaction?.status,
      payment_status: record.transaction?.payment_status,
      final_price: num(record.transaction?.final_price),
    },
  };
}

/** Decimal | null → number (0 when absent). Prisma Decimals aren't JSON-safe. */
function num(v) {
  if (v === null || v === undefined) return 0;
  return Number(v);
}

module.exports = { getLotTimeline, verifyByReference, STAGE_LABELS };
