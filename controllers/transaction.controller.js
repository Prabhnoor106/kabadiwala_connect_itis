/**
 * Transaction Controller
 * Thin HTTP layer over transaction.service — the service owns the state
 * machine, actor rules and ownership checks.
 */
const Transaction = require('../models/Transaction');
const Traceability = require('../models/Traceability');
const txService = require('../services/transaction.service');
const { uploadFile } = require('../config/cloudStorage');
const { success, created, error, parsePagination } = require('../utils/response');
const { ROLES } = require('../config/constants');
const prisma = require('../config/db');

/**
 * POST /transactions
 * Collector requests a pickup from a chosen recycler at a quoted price.
 */
async function createTransaction(req, res, next) {
  try {
    const transaction = await txService.createTransaction(req.body, req.user);
    return created(res, { message: 'Pickup request created', data: transaction });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /transactions/:id
 * Visible only to the two parties and admins.
 */
async function getTransaction(req, res, next) {
  try {
    const tx = await Transaction.findById(req.params.id);
    if (!tx) {
      return error(res, { message: 'Transaction not found', statusCode: 404 });
    }

    txService.assertParty(tx, req.user);

    return success(res, { data: tx });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /transactions
 * Always scoped to the caller: collectors see their own, recyclers see theirs,
 * admins see everything (optionally filtered).
 */
async function listTransactions(req, res, next) {
  try {
    const { status } = req.query;

    const where = {};
    if (req.user.role === ROLES.COLLECTOR) {
      where.collector_id = req.user.id;
    } else if (req.user.role === ROLES.RECYCLER) {
      where.recycler_id = req.user.id;
    } else {
      if (req.query.collector_id) where.collector_id = req.query.collector_id;
      if (req.query.recycler_id) where.recycler_id = req.query.recycler_id;
    }
    if (status) where.status = status;

    const totalCount = await prisma.transactions.count({ where });
    const pagination = parsePagination(req.query, totalCount);

    const { data } = await Transaction.findMany({
      collector_id: where.collector_id,
      recycler_id: where.recycler_id,
      status,
      skip: pagination.skip,
      take: pagination.limit,
    });

    return success(res, {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalCount: pagination.totalCount,
        totalPages: pagination.totalPages,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /transactions/:id/status
 * Drives the lifecycle. Legality and actor permissions are enforced in the service.
 */
async function updateTransactionStatus(req, res, next) {
  try {
    const { status, ...payload } = req.body;
    const updated = await txService.transitionStatus(req.params.id, status, payload, req.user);
    return success(res, { message: `Transaction is now '${status}'`, data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /transactions/:id/handover
 * Records the verifiable handover: weight, GPS, timestamp, photos, reference.
 */
async function createHandover(req, res, next) {
  try {
    const photo_urls = [];
    if (req.files?.length) {
      for (const file of req.files) {
        photo_urls.push(await uploadFile(file));
      }
    }
    // Allow already-uploaded URLs too (offline queue replays send URLs, not files).
    if (req.body.photo_urls) {
      const extra = Array.isArray(req.body.photo_urls)
        ? req.body.photo_urls
        : [req.body.photo_urls];
      photo_urls.push(...extra.filter(Boolean));
    }

    const handover = await txService.createHandover(
      req.params.id,
      {
        actual_weight: req.body.actual_weight,
        handover_location_lat: req.body.handover_location_lat,
        handover_location_lng: req.body.handover_location_lng,
        notes: req.body.notes,
        photo_urls,
      },
      req.user
    );

    return created(res, {
      message: `Handover recorded — reference ${handover.handover_reference_number}`,
      data: handover,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /transactions/traceability/:id/confirm
 * Recycler confirms receipt, advancing the transaction to `confirmed`.
 */
async function confirmHandover(req, res, next) {
  try {
    const confirmed = await txService.confirmHandover(req.params.id, req.user);
    return success(res, { message: 'Handover confirmed', data: confirmed });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /transactions/:id/handover
 * Fetch the handover record for a transaction.
 */
async function getHandover(req, res, next) {
  try {
    const tx = await prisma.transactions.findUnique({
      where: { id: req.params.id },
      select: { id: true, collector_id: true, recycler_id: true },
    });
    if (!tx) return error(res, { message: 'Transaction not found', statusCode: 404 });

    txService.assertParty(tx, req.user);

    const handover = await Traceability.findByTransactionId(req.params.id);
    if (!handover) {
      return error(res, { message: 'No handover recorded for this transaction yet', statusCode: 404 });
    }

    return success(res, { data: handover });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  createTransaction,
  getTransaction,
  listTransactions,
  updateTransactionStatus,
  createHandover,
  confirmHandover,
  getHandover,
};
