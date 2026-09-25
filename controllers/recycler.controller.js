/**
 * Recycler Controller
 * Public discovery + admin management + recycler self-service.
 */
const Recycler = require('../models/Recycler');
const Material = require('../models/Material');
const txService = require('../services/transaction.service');
const { rankRecyclersForLot } = require('../services/matching.service');
const { success, created, error, parsePagination } = require('../utils/response');
const { ROLES } = require('../config/constants');
const prisma = require('../config/db');

/**
 * Resolve which recycler the caller is acting on.
 * A recycler may only ever act on itself; an admin may act on any.
 */
function resolveTargetId(req) {
  const requested = req.params.id;

  if (req.user.role === ROLES.ADMIN) return requested || req.user.id;

  if (req.user.role === ROLES.RECYCLER) {
    if (requested && requested !== req.user.id) {
      throw Object.assign(new Error('You can only manage your own recycler account.'), {
        statusCode: 403,
      });
    }
    return req.user.id;
  }

  throw Object.assign(new Error('Recycler or admin account required.'), { statusCode: 403 });
}

// ==================== PUBLIC / COLLECTOR-FACING ====================

/**
 * GET /recyclers
 * Public directory. Collectors see only authorized facilities unless an admin
 * explicitly asks for another status — the authorization gate is the product.
 */
async function listRecyclers(req, res, next) {
  try {
    const { pickup_available, category_id, search } = req.query;

    let authorization_status = req.query.authorization_status;
    if (req.user?.role !== ROLES.ADMIN) {
      authorization_status = 'authorized';
    }

    const where = {};
    if (authorization_status) where.authorization_status = authorization_status;
    if (pickup_available !== undefined) where.pickup_available = pickup_available === 'true';
    if (category_id) where.recycler_materials = { some: { category_id } };
    if (search) where.business_name = { contains: search, mode: 'insensitive' };

    const totalCount = await prisma.recyclers.count({ where });
    const pagination = parsePagination(req.query, totalCount);

    const { data } = await Recycler.findMany({
      authorization_status,
      pickup_available: pickup_available !== undefined ? pickup_available === 'true' : undefined,
      category_id,
      search,
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
 * GET /recyclers/:id
 */
async function getRecycler(req, res, next) {
  try {
    const recycler = await Recycler.findById(req.params.id);
    if (!recycler) {
      return error(res, { message: 'Recycler not found', statusCode: 404 });
    }

    // Non-admins may only look up authorized facilities.
    if (req.user?.role !== ROLES.ADMIN && recycler.authorization_status !== 'authorized') {
      const isSelf = req.user?.role === ROLES.RECYCLER && req.user.id === recycler.id;
      if (!isSelf) {
        return error(res, { message: 'Recycler not found', statusCode: 404 });
      }
    }

    return success(res, { data: recycler });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /recyclers/:id/rates
 */
async function getRates(req, res, next) {
  try {
    const rates = await Recycler.getRates(req.params.id);
    return success(res, { data: rates });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /lots/:id/matches
 * Rank authorized recyclers for a lot.
 */
async function getMatches(req, res, next) {
  try {
    const lot = await Material.findLotById(req.params.id);
    if (!lot) {
      return error(res, { message: 'Lot not found', statusCode: 404 });
    }

    if (req.user.role === ROLES.COLLECTOR && lot.collector_id !== req.user.id) {
      return error(res, { message: 'Not authorized for this lot', statusCode: 403 });
    }

    const topN = Math.min(parseInt(req.query.top, 10) || 5, 25);
    const matches = await rankRecyclersForLot(lot, { topN });

    return success(res, {
      data: {
        lot_id: lot.id,
        category: lot.category?.code,
        category_name: lot.category?.name,
        weight: Number(lot.approximate_weight),
        estimated_value: lot.estimated_value ? Number(lot.estimated_value) : null,
        match_count: matches.length,
        matches,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ==================== ADMIN MANAGEMENT ====================

/**
 * POST /recyclers — admin creates a recycler on someone's behalf.
 */
async function createRecycler(req, res, next) {
  try {
    const recycler = await Recycler.create(req.body);
    return created(res, { message: 'Recycler created', data: recycler });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /recyclers/:id — profile update (admin, or the recycler itself).
 */
async function updateRecycler(req, res, next) {
  try {
    const targetId = resolveTargetId(req);
    const recycler = await Recycler.update(targetId, req.body);
    return success(res, { message: 'Recycler updated', data: recycler });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /recyclers/:id/authorization — admin-only CPCB verification outcome.
 */
async function setAuthorization(req, res, next) {
  try {
    const recycler = await Recycler.setAuthorizationStatus(
      req.params.id,
      req.body.authorization_status
    );
    return success(res, {
      message: `Authorization set to '${req.body.authorization_status}'`,
      data: recycler,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /recyclers/:id — admin only.
 */
async function deleteRecycler(req, res, next) {
  try {
    const txCount = await prisma.transactions.count({ where: { recycler_id: req.params.id } });
    if (txCount > 0) {
      return error(res, {
        message:
          `This recycler has ${txCount} transaction(s) and cannot be deleted — ` +
          'traceability records must be preserved. Suspend or revoke authorization instead.',
        statusCode: 409,
      });
    }

    await Recycler.delete(req.params.id);
    return success(res, { message: 'Recycler deleted' });
  } catch (err) {
    next(err);
  }
}

// ==================== RECYCLER SELF-SERVICE ====================

/**
 * GET /recyclers/me/profile
 */
async function getOwnProfile(req, res, next) {
  try {
    const recycler = await Recycler.findById(req.user.id);
    if (!recycler) return error(res, { message: 'Recycler not found', statusCode: 404 });
    return success(res, { data: recycler });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /recyclers/me/availability
 * Pickup toggle, service radius and operating hours — all feed matching.
 */
async function updateAvailability(req, res, next) {
  try {
    const recycler = await Recycler.setAvailability(req.user.id, req.body);
    return success(res, { message: 'Availability updated', data: recycler });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /recyclers/me/rates
 */
async function getOwnRates(req, res, next) {
  try {
    const rates = await Recycler.getRates(req.user.id);
    return success(res, { data: rates });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /recyclers/me/rates
 * Set the rate offered for one material category.
 *
 * Every rate change is also appended to price_history, which is how the
 * collector-facing price board stays current with what recyclers actually pay.
 */
async function upsertOwnRate(req, res, next) {
  try {
    const { category_id, buying_price, unit, min_quantity } = req.body;

    const category = await prisma.material_categories.findUnique({
      where: { id: category_id },
      select: { id: true, code: true },
    });
    if (!category) {
      return error(res, { message: 'Material category not found', statusCode: 404 });
    }

    const rate = await prisma.$transaction(async (trx) => {
      const upserted = await trx.recycler_materials.upsert({
        where: { recycler_id_category_id: { recycler_id: req.user.id, category_id } },
        create: {
          recycler_id: req.user.id,
          category_id,
          buying_price,
          unit: unit || 'kg',
          min_quantity: min_quantity ?? 0,
        },
        update: {
          buying_price,
          unit: unit || 'kg',
          min_quantity: min_quantity ?? 0,
          last_updated: new Date(),
        },
        include: { category: { select: { id: true, name: true, code: true } } },
      });

      // price_history is append-only: a rate change is a new observation.
      await trx.price_history.create({
        data: {
          category_id,
          buying_price,
          location: 'all',
          source: 'recycler_update',
        },
      });

      return upserted;
    });

    return success(res, { message: 'Rate updated', data: rate });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /recyclers/me/rates/:category_id
 */
async function deleteOwnRate(req, res, next) {
  try {
    const result = await Recycler.deleteRate(req.user.id, req.params.category_id);
    if (result.count === 0) {
      return error(res, { message: 'No rate found for this category', statusCode: 404 });
    }
    return success(res, { message: 'Rate removed' });
  } catch (err) {
    next(err);
  }
}

/**
 * PUT /recyclers/:id/rates — admin sets a rate on a recycler's behalf.
 */
async function upsertRate(req, res, next) {
  try {
    const { category_id, buying_price, unit, min_quantity } = req.body;
    const rate = await Recycler.upsertRate(req.params.id, category_id, {
      buying_price,
      unit,
      min_quantity,
    });
    return success(res, { message: 'Rate updated', data: rate });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /recyclers/me/incoming
 * The recycler's inbox: pickup requests and in-flight transactions.
 */
async function getIncoming(req, res, next) {
  try {
    const { status } = req.query;
    const pagination = parsePagination(req.query, 0);

    const { data, total } = await txService.getIncomingForRecycler(req.user.id, {
      status,
      skip: pagination.skip,
      take: pagination.limit,
    });

    return success(res, {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        totalCount: total,
        totalPages: Math.ceil(total / pagination.limit) || 1,
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /recyclers/me/dashboard
 * Headline counts and volumes for the recycler home screen.
 */
async function getDashboard(req, res, next) {
  try {
    const recycler_id = req.user.id;

    const [profile, byStatus, settled, pendingConfirm, rateCount, recentActivity] = await Promise.all([
      Recycler.findById(recycler_id),
      prisma.transactions.groupBy({
        by: ['status'],
        where: { recycler_id },
        _count: { _all: true },
      }),
      prisma.transactions.aggregate({
        where: { recycler_id, status: 'completed' },
        _sum: { final_price: true, final_weight: true },
        _count: { _all: true },
      }),
      prisma.traceability.count({
        where: { recycler_confirmed: false, transaction: { recycler_id } },
      }),
      prisma.recycler_materials.count({ where: { recycler_id } }),
      prisma.transactions.findMany({
        where: { recycler_id },
        select: {
          id: true,
          status: true,
          offered_price: true,
          final_price: true,
          created_at: true,
          lot: {
            select: {
              approximate_weight: true,
              category: { select: { name: true, code: true } },
            },
          },
        },
        orderBy: { updated_at: 'desc' },
        take: 8,
      }),
    ]);

    const counts = byStatus.reduce((acc, row) => {
      acc[row.status] = row._count._all;
      return acc;
    }, {});

    return success(res, {
      data: {
        profile: {
          id: profile?.id,
          business_name: profile?.business_name,
          authorization_status: profile?.authorization_status,
          pickup_available: profile?.pickup_available,
          max_pickup_distance_km: profile?.max_pickup_distance_km,
          operating_hours: profile?.operating_hours,
          materials_accepted: rateCount,
        },
        counts: {
          pending_requests: counts.quoted || 0,
          accepted: counts.accepted || 0,
          in_transit: counts.in_transit || 0,
          awaiting_confirmation: pendingConfirm,
          confirmed: counts.confirmed || 0,
          completed: counts.completed || 0,
          cancelled: counts.cancelled || 0,
          disputed: counts.disputed || 0,
        },
        totals: {
          completed_transactions: settled._count._all,
          total_paid: settled._sum.final_price ? Number(settled._sum.final_price) : 0,
          total_weight_kg: settled._sum.final_weight ? Number(settled._sum.final_weight) : 0,
        },
        recent_activity: recentActivity.map((t) => ({
          id: t.id,
          status: t.status,
          category: t.lot?.category?.name,
          category_code: t.lot?.category?.code,
          weight: t.lot?.approximate_weight ? Number(t.lot.approximate_weight) : null,
          amount: Number(t.final_price ?? t.offered_price),
          created_at: t.created_at,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listRecyclers,
  getRecycler,
  getRates,
  getMatches,
  createRecycler,
  updateRecycler,
  setAuthorization,
  deleteRecycler,
  getOwnProfile,
  updateAvailability,
  getOwnRates,
  upsertOwnRate,
  deleteOwnRate,
  upsertRate,
  getIncoming,
  getDashboard,
};
