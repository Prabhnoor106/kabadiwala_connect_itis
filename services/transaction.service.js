/**
 * Transaction Service
 * Owns the transaction lifecycle:
 *   quoted → accepted → in_transit → handed_over → confirmed → completed
 *   (+ cancelled / disputed)
 *
 * Every transition is checked twice: the state machine says whether the move
 * is legal at all, and TRANSITION_ACTORS says whether this caller's role may
 * make it. Ownership is verified before either check.
 */
const prisma = require('../config/db');
const Transaction = require('../models/Transaction');
const Traceability = require('../models/Traceability');
const Material = require('../models/Material');
const { checkTransaction } = require('./anomaly.service');
const { saveTrainingSample } = require('./ai.service');
const { sendTransactionUpdate } = require('./notification.service');
const { generateReference } = require('../utils/generateReference');
const {
  LOT_STATUS,
  TRANSACTION_STATUS,
  TRANSACTION_TRANSITIONS,
  TRANSITION_ACTORS,
  PAYMENT_STATUS,
  ROLES,
} = require('../config/constants');
const logger = require('../utils/logger');

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Confirm the caller is a party to this transaction (or an admin).
 *
 * @param {Object} tx - transaction with collector_id / recycler_id
 * @param {Object} user - req.user
 * @returns {'collector'|'recycler'|'admin'} the caller's role in this deal
 */
function assertParty(tx, user) {
  if (user.role === ROLES.ADMIN) return ROLES.ADMIN;
  if (user.role === ROLES.COLLECTOR && tx.collector_id === user.id) return ROLES.COLLECTOR;
  if (user.role === ROLES.RECYCLER && tx.recycler_id === user.id) return ROLES.RECYCLER;
  throw httpError('You are not a party to this transaction.', 403);
}

/**
 * Create a transaction (a collector requesting pickup at a quoted price).
 *
 * The recycler must be authorized — the platform's entire value proposition is
 * that material reaches a CPCB-authorized facility, so an unauthorized
 * recycler can never be transacted with, even by direct ID.
 */
async function createTransaction({ lot_id, recycler_id, offered_price, pickup_scheduled_at }, user) {
  const lot = await Material.findLotById(lot_id);
  if (!lot) throw httpError('Lot not found.', 404);

  if (user.role === ROLES.COLLECTOR && lot.collector_id !== user.id) {
    throw httpError('You do not own this lot.', 403);
  }

  if (lot.status === LOT_STATUS.COMPLETED) {
    throw httpError('This lot is already completed.', 409);
  }

  // Block a second live transaction on the same lot.
  const openTx = await prisma.transactions.findFirst({
    where: {
      lot_id,
      status: { notIn: [TRANSACTION_STATUS.CANCELLED, TRANSACTION_STATUS.COMPLETED] },
    },
    select: { id: true, status: true },
  });
  if (openTx) {
    throw httpError(
      `This lot already has an active transaction (${openTx.status}). Cancel it before creating another.`,
      409
    );
  }

  const recycler = await prisma.recyclers.findUnique({
    where: { id: recycler_id },
    select: { id: true, business_name: true, authorization_status: true, contact_phone: true },
  });
  if (!recycler) throw httpError('Recycler not found.', 404);
  if (recycler.authorization_status !== 'authorized') {
    throw httpError(
      'That recycler is not authorized. Material may only be handed to CPCB-authorized recyclers.',
      422
    );
  }

  // Flag odd pricing but never block — the collector's judgment wins, and a
  // silently rejected request is worse than a warned-about one.
  const anomaly = await checkTransaction({
    category_id: lot.category_id,
    weight: Number(lot.approximate_weight),
    price: offered_price,
  });
  if (anomaly?.is_anomaly) {
    logger.warn('Anomalous transaction value', { lot_id, offered_price, reason: anomaly.reason });
  }

  const transaction = await prisma.$transaction(async (trx) => {
    const createdTx = await trx.transactions.create({
      data: {
        lot_id,
        collector_id: lot.collector_id,
        recycler_id,
        offered_price,
        pickup_scheduled_at: pickup_scheduled_at ? new Date(pickup_scheduled_at) : null,
        status_history: [
          {
            status: TRANSACTION_STATUS.QUOTED,
            timestamp: new Date().toISOString(),
            actor: user.role,
            note: 'Pickup requested at quoted price',
          },
        ],
      },
      include: {
        recycler: { select: { id: true, business_name: true, contact_phone: true } },
        lot: {
          select: {
            id: true,
            approximate_weight: true,
            estimated_value: true,
            category: { select: { code: true, name: true } },
          },
        },
      },
    });

    await trx.lots.update({
      where: { id: lot_id },
      data: { status: LOT_STATUS.IN_TRANSACTION },
    });

    return createdTx;
  });

  return {
    ...transaction,
    anomaly_warning: anomaly?.is_anomaly ? anomaly.reason : null,
  };
}

/**
 * Transition a transaction, enforcing the state machine, the actor rules and
 * the stage-specific preconditions.
 */
async function transitionStatus(id, targetStatus, payload, user) {
  const tx = await prisma.transactions.findUnique({
    where: { id },
    select: {
      id: true,
      lot_id: true,
      collector_id: true,
      recycler_id: true,
      status: true,
      status_history: true,
      offered_price: true,
      final_price: true,
      payment_status: true,
      collector: { select: { phone: true } },
      traceability: {
        select: { id: true, recycler_confirmed: true, handover_reference_number: true, actual_weight: true },
      },
    },
  });
  if (!tx) throw httpError('Transaction not found.', 404);

  const actorRole = assertParty(tx, user);

  // 1. Is the move legal from where we are?
  const allowed = TRANSACTION_TRANSITIONS[tx.status] || [];
  if (!allowed.includes(targetStatus)) {
    throw httpError(
      `Cannot go from '${tx.status}' to '${targetStatus}'.` +
        (allowed.length ? ` Allowed: ${allowed.join(', ')}.` : ' This transaction is final.'),
      400
    );
  }

  // 2. May this role make it?
  const actors = TRANSITION_ACTORS[targetStatus] || [];
  if (!actors.includes(actorRole)) {
    throw httpError(
      `A ${actorRole} cannot set status '${targetStatus}'. Permitted: ${actors.join(', ')}.`,
      403
    );
  }

  // 3. Stage-specific preconditions.
  if (targetStatus === TRANSACTION_STATUS.CONFIRMED && !tx.traceability) {
    throw httpError('Record the handover before confirming receipt.', 409);
  }
  if (targetStatus === TRANSACTION_STATUS.COMPLETED) {
    if (!tx.traceability?.recycler_confirmed) {
      throw httpError('The recycler must confirm the handover before completion.', 409);
    }
    const finalPrice = payload.final_price ?? Number(tx.final_price ?? tx.offered_price);
    if (!finalPrice || finalPrice <= 0) {
      throw httpError('A final price is required to complete a transaction.', 400);
    }
  }
  if (targetStatus === TRANSACTION_STATUS.CANCELLED && !payload.cancellation_reason) {
    throw httpError('A cancellation reason is required.', 400);
  }

  // Build the column updates.
  const data = {
    status: targetStatus,
    status_history: [
      ...(Array.isArray(tx.status_history) ? tx.status_history : []),
      {
        status: targetStatus,
        timestamp: new Date().toISOString(),
        actor: actorRole,
        note: payload.note || `Status changed to ${targetStatus}`,
      },
    ],
  };

  if (payload.final_price !== undefined) data.final_price = payload.final_price;
  if (payload.final_weight !== undefined) data.final_weight = payload.final_weight;
  if (payload.payment_status !== undefined) data.payment_status = payload.payment_status;
  if (payload.payment_method !== undefined) data.payment_method = payload.payment_method;
  if (payload.pickup_scheduled_at) data.pickup_scheduled_at = new Date(payload.pickup_scheduled_at);
  if (payload.cancellation_reason) data.cancellation_reason = payload.cancellation_reason;

  if (targetStatus === TRANSACTION_STATUS.COMPLETED) {
    data.completed_at = new Date();
    // Completion carries a price: default to the quote if none was supplied.
    if (data.final_price === undefined && tx.final_price === null) {
      data.final_price = tx.offered_price;
    }
    // Cash-in-hand is the norm for these collectors: completing without an
    // explicit payment state means the money changed hands.
    if (data.payment_status === undefined && tx.payment_status !== PAYMENT_STATUS.COMPLETED) {
      data.payment_status = PAYMENT_STATUS.COMPLETED;
    }
  }
  if (targetStatus === TRANSACTION_STATUS.CANCELLED) {
    data.cancelled_at = new Date();
  }

  const updated = await prisma.$transaction(async (trx) => {
    const result = await trx.transactions.update({ where: { id }, data });

    // Keep the lot's status coherent with its transaction.
    if (targetStatus === TRANSACTION_STATUS.COMPLETED) {
      await trx.lots.update({ where: { id: tx.lot_id }, data: { status: LOT_STATUS.COMPLETED } });
    } else if (targetStatus === TRANSACTION_STATUS.CANCELLED) {
      // Free the lot so the collector can approach another recycler.
      await trx.lots.update({ where: { id: tx.lot_id }, data: { status: LOT_STATUS.ACTIVE } });
    } else if (targetStatus === TRANSACTION_STATUS.ACCEPTED) {
      await trx.lots.update({ where: { id: tx.lot_id }, data: { status: LOT_STATUS.IN_TRANSACTION } });
    }

    return result;
  });

  // ---- Post-commit side effects (never block the transition) ----
  if (targetStatus === TRANSACTION_STATUS.COMPLETED) {
    await captureTrainingSample(id).catch((err) =>
      logger.error('Training sample capture failed', { transaction_id: id, error: err.message })
    );

    if (tx.collector?.phone) {
      await sendTransactionUpdate(tx.collector.phone, {
        status: 'completed',
        reference: tx.traceability?.handover_reference_number,
        amount: Number(updated.final_price ?? updated.offered_price),
      }).catch(() => {});
    }
  }

  return updated;
}

/**
 * Record a verifiable handover: weight, GPS, timestamp, photos and a unique
 * reference number the recycler can confirm against.
 */
async function createHandover(
  transaction_id,
  { actual_weight, handover_location_lat, handover_location_lng, notes, photo_urls = [] },
  user
) {
  const tx = await prisma.transactions.findUnique({
    where: { id: transaction_id },
    select: {
      id: true,
      collector_id: true,
      recycler_id: true,
      status: true,
      status_history: true,
      lot: { select: { approximate_weight: true, category_id: true } },
    },
  });
  if (!tx) throw httpError('Transaction not found.', 404);

  const actorRole = assertParty(tx, user);

  if (await Traceability.findByTransactionId(transaction_id)) {
    throw httpError('A handover has already been recorded for this transaction.', 409);
  }

  // A handover only makes sense once the deal is agreed and moving.
  const handoverReady = [TRANSACTION_STATUS.ACCEPTED, TRANSACTION_STATUS.IN_TRANSIT];
  if (!handoverReady.includes(tx.status)) {
    throw httpError(
      `Cannot record a handover while the transaction is '${tx.status}'. ` +
        'The recycler must accept it first.',
      409
    );
  }

  const reference = generateReference();

  const handover = await prisma.$transaction(async (trx) => {
    const record = await trx.traceability.create({
      data: {
        transaction_id,
        handover_reference_number: reference,
        actual_weight,
        handover_location_lat: handover_location_lat ?? null,
        handover_location_lng: handover_location_lng ?? null,
        handover_timestamp: new Date(),
        collector_confirmed: true,
        collector_confirmed_at: new Date(),
        notes: notes || null,
        photos: {
          create: photo_urls.map((url) => ({ photo_url: url, photo_type: 'handover' })),
        },
      },
      include: { photos: true },
    });

    await trx.transactions.update({
      where: { id: transaction_id },
      data: {
        status: TRANSACTION_STATUS.HANDED_OVER,
        final_weight: actual_weight,
        status_history: [
          ...(Array.isArray(tx.status_history) ? tx.status_history : []),
          {
            status: TRANSACTION_STATUS.HANDED_OVER,
            timestamp: new Date().toISOString(),
            actor: actorRole,
            note: `Handover recorded — ref ${reference}`,
          },
        ],
      },
    });

    return record;
  });

  const declared = Number(tx.lot?.approximate_weight ?? 0);
  const variance = declared ? ((actual_weight - declared) / declared) * 100 : 0;

  return {
    ...handover,
    declared_weight: declared,
    weight_variance_percent: Math.round(variance * 10) / 10,
  };
}

/**
 * Recycler-side confirmation of a handover, which advances the transaction to
 * `confirmed`. Only the receiving recycler (or an admin) may confirm.
 */
async function confirmHandover(traceability_id, user) {
  const record = await prisma.traceability.findUnique({
    where: { id: traceability_id },
    select: {
      id: true,
      recycler_confirmed: true,
      transaction_id: true,
      transaction: {
        select: { id: true, collector_id: true, recycler_id: true, status: true, status_history: true },
      },
    },
  });
  if (!record) throw httpError('Handover record not found.', 404);

  const actorRole = assertParty(record.transaction, user);
  if (actorRole === ROLES.COLLECTOR) {
    throw httpError('Only the receiving recycler can confirm a handover.', 403);
  }

  if (record.recycler_confirmed) {
    throw httpError('This handover has already been confirmed.', 409);
  }

  return prisma.$transaction(async (trx) => {
    const confirmed = await trx.traceability.update({
      where: { id: traceability_id },
      data: { recycler_confirmed: true, recycler_confirmed_at: new Date() },
      include: { photos: true },
    });

    // handed_over → confirmed. If the transaction is elsewhere (e.g. disputed),
    // leave its status alone and only record the confirmation.
    if (record.transaction.status === TRANSACTION_STATUS.HANDED_OVER) {
      await trx.transactions.update({
        where: { id: record.transaction_id },
        data: {
          status: TRANSACTION_STATUS.CONFIRMED,
          status_history: [
            ...(Array.isArray(record.transaction.status_history) ? record.transaction.status_history : []),
            {
              status: TRANSACTION_STATUS.CONFIRMED,
              timestamp: new Date().toISOString(),
              actor: actorRole,
              note: 'Recycler confirmed receipt of material',
            },
          ],
        },
      });
    }

    return confirmed;
  });
}

/**
 * Harvest a completed transaction into the AI training set.
 *
 * This is the dataset-generation path the problem statement asks for: real
 * field outcomes (image + category + weight + price + location) accumulate as
 * ground truth. No model is invoked here — only labelled data is stored.
 */
async function captureTrainingSample(transaction_id) {
  const tx = await prisma.transactions.findUnique({
    where: { id: transaction_id },
    select: {
      final_price: true,
      offered_price: true,
      final_weight: true,
      lot: {
        select: {
          id: true,
          image_url: true,
          category_id: true,
          approximate_weight: true,
          collection_address: true,
        },
      },
      traceability: { select: { actual_weight: true } },
    },
  });

  // Without an image there is nothing for a classifier to learn from.
  if (!tx?.lot?.image_url) return null;

  return saveTrainingSample({
    image_url: tx.lot.image_url,
    category_id: tx.lot.category_id,
    weight: Number(tx.traceability?.actual_weight ?? tx.final_weight ?? tx.lot.approximate_weight),
    price: Number(tx.final_price ?? tx.offered_price),
    location: tx.lot.collection_address,
    source: 'transaction',
    lot_id: tx.lot.id,
    quality_notes: 'Captured on transaction completion — verified weight and settled price',
  });
}

/**
 * Lots awaiting a recycler's response — the recycler dashboard inbox.
 */
async function getIncomingForRecycler(recycler_id, { status, skip = 0, take = 20 } = {}) {
  const where = { recycler_id };
  if (status) {
    where.status = status;
  } else {
    where.status = {
      in: [
        TRANSACTION_STATUS.QUOTED,
        TRANSACTION_STATUS.ACCEPTED,
        TRANSACTION_STATUS.IN_TRANSIT,
        TRANSACTION_STATUS.HANDED_OVER,
        TRANSACTION_STATUS.CONFIRMED,
        TRANSACTION_STATUS.DISPUTED,
      ],
    };
  }

  const [data, total] = await Promise.all([
    prisma.transactions.findMany({
      where,
      select: {
        id: true,
        status: true,
        payment_status: true,
        offered_price: true,
        final_price: true,
        final_weight: true,
        pickup_scheduled_at: true,
        created_at: true,
        collector: { select: { id: true, phone: true, preferred_language: true } },
        lot: {
          select: {
            id: true,
            image_url: true,
            approximate_weight: true,
            condition: true,
            source_type: true,
            estimated_value: true,
            collection_address: true,
            collection_location_lat: true,
            collection_location_lng: true,
            created_at: true,
            category: { select: { id: true, name: true, code: true, icon_url: true, hazard_level: true } },
          },
        },
        traceability: {
          select: {
            id: true,
            handover_reference_number: true,
            actual_weight: true,
            recycler_confirmed: true,
            handover_timestamp: true,
            photos: { select: { photo_url: true } },
          },
        },
      },
      orderBy: [{ created_at: 'desc' }],
      skip,
      take,
    }),
    prisma.transactions.count({ where }),
  ]);

  return { data, total };
}

module.exports = {
  createTransaction,
  transitionStatus,
  createHandover,
  confirmHandover,
  captureTrainingSample,
  getIncomingForRecycler,
  assertParty,
};
