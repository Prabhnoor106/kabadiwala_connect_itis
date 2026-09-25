/**
 * Sync Controller
 * Receives batched offline-queued writes from the mobile app.
 */
const { processBatch } = require('../services/sync.service');
const { success, error } = require('../utils/response');

/**
 * POST /sync/batch
 * Accept an array of offline-queued writes and apply them.
 * Each entry: { idempotency_key, operation, payload, client_timestamp }
 */
async function syncBatch(req, res, next) {
  try {
    const { entries } = req.body;

    if (!Array.isArray(entries) || entries.length === 0) {
      return error(res, {
        message: 'entries must be a non-empty array',
        statusCode: 400,
      });
    }

    // Validate each entry has required fields
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (!entry.idempotency_key || !entry.operation || !entry.payload || !entry.client_timestamp) {
        return error(res, {
          message: `Entry at index ${i} is missing required fields (idempotency_key, operation, payload, client_timestamp)`,
          statusCode: 400,
        });
      }
    }

    const result = await processBatch(req.user.id, entries);

    return success(res, {
      message: `Batch processed: ${result.applied} applied, ${result.duplicates} duplicates, ${result.conflicts} conflicts`,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = { syncBatch };
