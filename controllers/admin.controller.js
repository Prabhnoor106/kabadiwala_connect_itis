/**
 * Admin Controller
 * Platform oversight: analytics, user management, verification, monitoring.
 * Every route behind this controller is admin-only.
 */
const adminService = require('../services/admin.service');
const Collector = require('../models/Collector');
const Admin = require('../models/Admin');
const Price = require('../models/Price');
const { success, error, parsePagination } = require('../utils/response');
const prisma = require('../config/db');

/**
 * GET /admin/stats
 */
async function getStats(req, res, next) {
  try {
    const data = await adminService.getPlatformStats();
    return success(res, { data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/analytics
 * Everything the dashboard charts need in one round trip.
 */
async function getAnalytics(req, res, next) {
  try {
    const days = Math.min(parseInt(req.query.days, 10) || 30, 365);

    const [stats, categories, trend, leaderboard] = await Promise.all([
      adminService.getPlatformStats(),
      adminService.getCategoryBreakdown(),
      adminService.getActivityTrend(days),
      adminService.getRecyclerLeaderboard({ take: 10 }),
    ]);

    return success(res, {
      data: { window_days: days, stats, categories, trend, recycler_leaderboard: leaderboard },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/attention
 * Disputes, stale quotes, unconfirmed handovers, pending verifications.
 */
async function getAttention(req, res, next) {
  try {
    const data = await adminService.getAttentionQueue();
    return success(res, { data });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/collectors
 */
async function listCollectors(req, res, next) {
  try {
    const is_verified =
      req.query.is_verified === undefined ? undefined : req.query.is_verified === 'true';

    const totalCount = await prisma.collectors.count({
      where: is_verified === undefined ? {} : { is_verified },
    });
    const pagination = parsePagination(req.query, totalCount);

    const { data } = await Collector.findMany({
      is_verified,
      skip: pagination.skip,
      take: pagination.limit,
    });

    return success(res, {
      data: data.map((c) => ({
        id: c.id,
        phone: c.phone,
        preferred_language: c.preferred_language,
        is_verified: c.is_verified,
        location_lat: c.location_lat,
        location_lng: c.location_lng,
        created_at: c.created_at,
        lot_count: c._count.lots,
        transaction_count: c._count.transactions,
      })),
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
 * GET /admin/collectors/:id
 * One collector's full picture — lots, transactions, derived earnings.
 */
async function getCollectorDetail(req, res, next) {
  try {
    const { id } = req.params;

    const collector = await prisma.collectors.findUnique({
      where: { id },
      select: {
        id: true,
        phone: true,
        preferred_language: true,
        is_verified: true,
        location_lat: true,
        location_lng: true,
        created_at: true,
      },
    });
    if (!collector) return error(res, { message: 'Collector not found', statusCode: 404 });

    const [lots, transactions, earnings] = await Promise.all([
      prisma.lots.findMany({
        where: { collector_id: id },
        select: {
          id: true,
          status: true,
          approximate_weight: true,
          estimated_value: true,
          image_url: true,
          created_at: true,
          category: { select: { name: true, code: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      prisma.transactions.findMany({
        where: { collector_id: id },
        select: {
          id: true,
          status: true,
          payment_status: true,
          offered_price: true,
          final_price: true,
          created_at: true,
          completed_at: true,
          recycler: { select: { id: true, business_name: true } },
        },
        orderBy: { created_at: 'desc' },
        take: 50,
      }),
      prisma.transactions.aggregate({
        where: { collector_id: id, status: 'completed' },
        _sum: { final_price: true, final_weight: true },
        _count: { _all: true },
      }),
    ]);

    return success(res, {
      data: {
        collector,
        lots,
        transactions,
        earnings: {
          total: earnings._sum.final_price ? Number(earnings._sum.final_price) : 0,
          total_weight_kg: earnings._sum.final_weight ? Number(earnings._sum.final_weight) : 0,
          completed_transactions: earnings._count._all,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /admin/collectors/:id/verification
 * Manual verification override for field-onboarded collectors.
 */
async function setCollectorVerification(req, res, next) {
  try {
    const updated = await prisma.collectors.update({
      where: { id: req.params.id },
      data: { is_verified: req.body.is_verified },
      select: { id: true, phone: true, is_verified: true },
    });
    return success(res, { message: 'Verification updated', data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/lots
 * Platform-wide lot monitoring.
 */
async function listAllLots(req, res, next) {
  try {
    const { status, category_id, collector_id } = req.query;

    const where = {};
    if (status) where.status = status;
    if (category_id) where.category_id = category_id;
    if (collector_id) where.collector_id = collector_id;

    const totalCount = await prisma.lots.count({ where });
    const pagination = parsePagination(req.query, totalCount);

    const data = await prisma.lots.findMany({
      where,
      select: {
        id: true,
        status: true,
        approximate_weight: true,
        estimated_value: true,
        condition: true,
        source_type: true,
        image_url: true,
        collection_address: true,
        created_at: true,
        category: { select: { id: true, name: true, code: true, hazard_level: true } },
        collector: { select: { id: true, phone: true } },
        transactions: {
          select: { id: true, status: true, offered_price: true, final_price: true },
          orderBy: { created_at: 'desc' },
          take: 1,
        },
      },
      orderBy: { created_at: 'desc' },
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
 * GET /admin/admins
 */
async function listAdmins(req, res, next) {
  try {
    const totalCount = await Admin.count();
    const pagination = parsePagination(req.query, totalCount);
    const { data } = await Admin.findMany({ skip: pagination.skip, take: pagination.limit });

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
 * POST /admin/prices
 * Record a market-survey price observation (append-only).
 */
async function recordPrice(req, res, next) {
  try {
    const entry = await Price.record({
      category_id: req.body.category_id,
      location: req.body.location || 'all',
      buying_price: req.body.buying_price,
      selling_price: req.body.selling_price,
      source: req.body.source || 'admin_entry',
    });
    return success(res, { statusCode: 201, message: 'Price recorded', data: entry });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /admin/datasets
 * Dataset health — the problem statement asks for datasets that visibly grow
 * through field use, so surface how each one is being generated.
 */
async function getDatasetHealth(req, res, next) {
  try {
    const [
      samplesBySource,
      feedbackCount,
      unappliedFeedback,
      pricesBySource,
      photoCount,
      syncByStatus,
      oldestPrice,
      newestPrice,
      lotsWithImages,
      lotsTotal,
    ] = await Promise.all([
      prisma.ai_training_samples.groupBy({ by: ['source'], _count: { _all: true } }),
      prisma.ml_feedback.count(),
      prisma.ml_feedback.count({ where: { applied_to_model: false } }),
      prisma.price_history.groupBy({ by: ['source'], _count: { _all: true } }),
      prisma.traceability_photos.count(),
      prisma.sync_log.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.price_history.findFirst({ orderBy: { recorded_at: 'asc' }, select: { recorded_at: true } }),
      prisma.price_history.findFirst({ orderBy: { recorded_at: 'desc' }, select: { recorded_at: true } }),
      prisma.lots.count({ where: { image_url: { not: null } } }),
      prisma.lots.count(),
    ]);

    const asMap = (rows, key) =>
      rows.reduce((acc, r) => {
        acc[r[key]] = r._count._all;
        return acc;
      }, {});

    const sampleMap = asMap(samplesBySource, 'source');
    const totalSamples = Object.values(sampleMap).reduce((a, b) => a + b, 0);

    return success(res, {
      data: {
        material_dataset: {
          lots_total: lotsTotal,
          lots_with_images: lotsWithImages,
          image_coverage_percent: lotsTotal ? Math.round((lotsWithImages / lotsTotal) * 1000) / 10 : 0,
        },
        price_dataset: {
          observations: Object.values(asMap(pricesBySource, 'source')).reduce((a, b) => a + b, 0),
          by_source: asMap(pricesBySource, 'source'),
          earliest: oldestPrice?.recorded_at || null,
          latest: newestPrice?.recorded_at || null,
        },
        traceability_dataset: {
          handover_photos: photoCount,
        },
        ai_training_dataset: {
          total_samples: totalSamples,
          by_source: sampleMap,
          feedback_records: feedbackCount,
          feedback_awaiting_retrain: unappliedFeedback,
          // Honest statement of maturity — no model is claimed to exist.
          model_status: 'no_trained_model',
          valuation_method: 'rule_based_price_x_weight',
        },
        offline_sync: {
          by_status: asMap(syncByStatus, 'status'),
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getStats,
  getAnalytics,
  getAttention,
  listCollectors,
  getCollectorDetail,
  setCollectorVerification,
  listAllLots,
  listAdmins,
  recordPrice,
  getDatasetHealth,
};
