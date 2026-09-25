/**
 * Sync Service
 * Applies batched offline-queued writes, resolves conflicts.
 * Core service for offline-first support.
 *
 * Every operation is replayed through the SAME service layer the online API
 * uses, so an offline-queued write can never do what a live request could not:
 * the recycler-authorization rule, the transaction state machine, the
 * actor-role checks and server-side valuation all still apply. A write that
 * breaks a rule throws and is recorded as a conflict rather than silently
 * corrupting state.
 */
const SyncLog = require('../models/SyncLog');
const Material = require('../models/Material');
const transactionService = require('./transaction.service');
const { estimateLotValue } = require('./pricing.service');
const { SYNC_OPERATION, LOT_STATUS, ROLES } = require('../config/constants');
const logger = require('../utils/logger');

function httpError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

/**
 * Process a batch of offline-queued writes.
 * Each entry has: { idempotency_key, operation, payload, client_timestamp }
 *
 * @param {string} collector_id - The collector submitting the batch
 * @param {Array<Object>} entries - Array of offline write entries
 * @returns {Promise<{ applied: number, duplicates: number, conflicts: number, results: Array }>}
 */
async function processBatch(collector_id, entries) {
  const results = [];
  let applied = 0;
  let duplicates = 0;
  let conflicts = 0;

  // The offline queue is a collector-app feature (SyncLog is keyed by
  // collector_id), so replays act with the collector's authority. The service
  // layer enforces what that role may actually do.
  const user = { id: collector_id, role: ROLES.COLLECTOR };

  // Process entries in order (by client_timestamp)
  const sorted = [...entries].sort(
    (a, b) => new Date(a.client_timestamp) - new Date(b.client_timestamp)
  );

  for (const entry of sorted) {
    // 1. Log the sync entry (with idempotency check). Kept out of the apply
    // try/catch below so a genuine apply failure is marked on the record we
    // just created, rather than a phantom re-insert that reads as a duplicate.
    let record;
    try {
      const logged = await SyncLog.create({
        collector_id,
        idempotency_key: entry.idempotency_key,
        operation: entry.operation,
        payload: entry.payload,
        client_timestamp: entry.client_timestamp,
      });

      if (logged.duplicate) {
        duplicates++;
        results.push({
          idempotency_key: entry.idempotency_key,
          status: 'duplicate',
          sync_log_id: logged.record.id,
        });
        continue;
      }
      record = logged.record;
    } catch (err) {
      // Could not even persist the log entry — report it, but keep going.
      conflicts++;
      logger.warn('Sync log write failed', {
        idempotency_key: entry.idempotency_key,
        operation: entry.operation,
        error: err.message,
      });
      results.push({
        idempotency_key: entry.idempotency_key,
        status: 'conflict',
        error: err.message,
      });
      continue;
    }

    // 2. Apply the operation through the online service layer.
    try {
      const applyResult = await applyOperation(user, entry.operation, entry.payload);

      await SyncLog.markApplied(record.id);
      applied++;

      results.push({
        idempotency_key: entry.idempotency_key,
        status: 'applied',
        sync_log_id: record.id,
        result: applyResult,
      });
    } catch (err) {
      conflicts++;
      logger.warn('Sync conflict', {
        idempotency_key: entry.idempotency_key,
        operation: entry.operation,
        error: err.message,
      });

      await SyncLog.markConflict(record.id, err.message).catch(() => {
        // The conflict is already reported below; a failed status write here
        // must not abort the rest of the batch.
      });

      results.push({
        idempotency_key: entry.idempotency_key,
        status: 'conflict',
        sync_log_id: record.id,
        error: err.message,
      });
    }
  }

  return { applied, duplicates, conflicts, results };
}

/**
 * Apply a single sync operation by replaying it through the online service
 * layer, so all business rules and role checks still hold.
 *
 * @param {{id: string, role: string}} user - the authenticated collector
 * @param {string} operation
 * @param {Object} payload
 * @returns {Promise<Object>} Result of the operation
 */
async function applyOperation(user, operation, payload) {
  switch (operation) {
    case SYNC_OPERATION.CREATE_LOT: {
      // Value the lot server-side with the documented rule — never trust a
      // client-supplied estimate that arrived over an offline queue.
      const valuation = await estimateLotValue({
        category_id: payload.sub_category_id || payload.category_id,
        fallback_category_id: payload.category_id,
        weight: payload.approximate_weight,
        condition: payload.condition,
        location: payload.collection_address,
      });

      return Material.createLot({
        collector_id: user.id,
        category_id: payload.category_id,
        sub_category_id: payload.sub_category_id || null,
        image_url: payload.image_url,
        approximate_weight: payload.approximate_weight,
        condition: payload.condition || 'mixed',
        source_type: payload.source_type || 'household',
        estimated_value: valuation.estimated_value,
        status: payload.status || LOT_STATUS.ACTIVE,
        collection_location_lat: payload.collection_location_lat ?? null,
        collection_location_lng: payload.collection_location_lng ?? null,
        collection_address: payload.collection_address || null,
        notes: payload.notes || null,
      });
    }

    case SYNC_OPERATION.UPDATE_LOT_STATUS: {
      const lot = await Material.findLotById(payload.lot_id);
      if (!lot) throw httpError('Lot not found.', 404);
      if (lot.collector_id !== user.id) throw httpError('You do not own this lot.', 403);

      // Statuses beyond 'active' are owned by the transaction lifecycle;
      // letting a replay set them by hand would desync lot and transaction.
      const collectorSettable = [LOT_STATUS.DRAFT, LOT_STATUS.ACTIVE, LOT_STATUS.EXPIRED];
      if (!collectorSettable.includes(payload.status)) {
        throw httpError(
          `Lot status '${payload.status}' is set by the transaction flow.`,
          403
        );
      }
      if (lot.status === LOT_STATUS.IN_TRANSACTION) {
        throw httpError('This lot has an active transaction. Cancel it first.', 409);
      }

      return Material.updateLotStatus(payload.lot_id, payload.status);
    }

    case SYNC_OPERATION.CREATE_TRANSACTION: {
      return transactionService.createTransaction(
        {
          lot_id: payload.lot_id,
          recycler_id: payload.recycler_id,
          offered_price: payload.offered_price,
          pickup_scheduled_at: payload.pickup_scheduled_at,
        },
        user
      );
    }

    case SYNC_OPERATION.UPDATE_TRANSACTION_STATUS: {
      return transactionService.transitionStatus(
        payload.transaction_id,
        payload.status,
        payload.extra || {},
        user
      );
    }

    case SYNC_OPERATION.CREATE_HANDOVER: {
      return transactionService.createHandover(
        payload.transaction_id,
        {
          actual_weight: payload.actual_weight,
          handover_location_lat: payload.handover_location_lat,
          handover_location_lng: payload.handover_location_lng,
          notes: payload.notes,
          photo_urls: payload.photo_urls || [],
        },
        user
      );
    }

    default:
      throw new Error(`Unknown sync operation: ${operation}`);
  }
}

module.exports = { processBatch };
