/**
 * Material Controller
 * Material categories + lot lifecycle.
 */
const Material = require('../models/Material');
const { estimateLotValue } = require('../services/pricing.service');
const { uploadFile } = require('../config/cloudStorage');
const { success, created, error, parsePagination } = require('../utils/response');
const { LOT_STATUS, ROLES } = require('../config/constants');
const prisma = require('../config/db');

/**
 * GET /categories
 * Material catalogue. Includes each category's current indicative rate so the
 * "add lot" screen can show a value before anything is typed.
 */
async function listCategories(req, res, next) {
  try {
    const includeChildren = req.query.include_children !== 'false';
    const categories = await Material.getAllCategories({ includeChildren });

    // Latest price per top-level category, for the picker.
    const latestPrices = await prisma.price_history.groupBy({
      by: ['category_id'],
      _max: { recorded_at: true },
    });
    const priceRows = await prisma.price_history.findMany({
      where: {
        OR: latestPrices.map((p) => ({
          category_id: p.category_id,
          recorded_at: p._max.recorded_at,
        })),
      },
      select: { category_id: true, buying_price: true, recorded_at: true },
    });
    const priceMap = new Map(priceRows.map((p) => [p.category_id, Number(p.buying_price)]));

    return success(res, {
      data: categories.map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        description: c.description,
        icon_url: c.icon_url,
        hazard_level: c.hazard_level,
        current_price: priceMap.get(c.id) ?? null,
        children: c.children?.map((ch) => ({
          id: ch.id,
          name: ch.name,
          code: ch.code,
          hazard_level: ch.hazard_level,
          current_price: priceMap.get(ch.id) ?? null,
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /lots
 * Create a lot and value it immediately.
 */
async function createLot(req, res, next) {
  try {
    if (req.user.role !== ROLES.COLLECTOR) {
      return error(res, { message: 'Only collectors can create lots.', statusCode: 403 });
    }

    const {
      category_id,
      sub_category_id,
      approximate_weight,
      condition,
      source_type,
      collection_location_lat,
      collection_location_lng,
      collection_address,
      notes,
      status,
    } = req.body;

    // Validate the category exists before spending an upload on it.
    const category = await prisma.material_categories.findUnique({
      where: { id: category_id },
      select: { id: true, name: true, code: true },
    });
    if (!category) {
      return error(res, { message: 'Material category not found', statusCode: 404 });
    }

    if (sub_category_id) {
      const sub = await prisma.material_categories.findUnique({
        where: { id: sub_category_id },
        select: { id: true, parent_id: true },
      });
      if (!sub) {
        return error(res, { message: 'Sub-category not found', statusCode: 404 });
      }
      if (sub.parent_id && sub.parent_id !== category_id) {
        return error(res, {
          message: 'Sub-category does not belong to the selected category',
          statusCode: 400,
        });
      }
    }

    let image_url = null;
    if (req.file) {
      image_url = await uploadFile(req.file);
    } else if (req.body.image_url) {
      // Offline replays and the two-step upload flow send a URL directly.
      image_url = req.body.image_url;
    }

    // Transparent, rule-based valuation. No model is consulted; the response
    // states exactly how the number was reached.
    const valuation = await estimateLotValue({
      category_id: sub_category_id || category_id,
      fallback_category_id: category_id,
      weight: approximate_weight,
      condition,
      location: collection_address,
    });

    const lot = await Material.createLot({
      collector_id: req.user.id,
      category_id,
      sub_category_id: sub_category_id || null,
      image_url,
      approximate_weight,
      condition: condition || 'mixed',
      source_type: source_type || 'household',
      estimated_value: valuation.estimated_value,
      status: status || LOT_STATUS.ACTIVE,
      collection_location_lat: collection_location_lat ?? null,
      collection_location_lng: collection_location_lng ?? null,
      collection_address: collection_address || null,
      notes: notes || null,
    });

    return created(res, {
      message: 'Lot created',
      data: { ...lot, valuation },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /lots/:id
 */
async function getLot(req, res, next) {
  try {
    const lot = await Material.findLotById(req.params.id);
    if (!lot) {
      return error(res, { message: 'Lot not found', statusCode: 404 });
    }

    if (req.user.role === ROLES.COLLECTOR && lot.collector_id !== req.user.id) {
      return error(res, { message: 'Not authorized to view this lot', statusCode: 403 });
    }
    if (req.user.role === ROLES.RECYCLER) {
      const involved = await prisma.transactions.findFirst({
        where: { lot_id: lot.id, recycler_id: req.user.id },
        select: { id: true },
      });
      if (!involved) {
        return error(res, { message: 'Not authorized to view this lot', statusCode: 403 });
      }
    }

    return success(res, { data: lot });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /lots
 * Collectors see their own lots; admins can filter across everyone.
 */
async function listLots(req, res, next) {
  try {
    const { status, category_id } = req.query;

    const effectiveCollectorId =
      req.user.role === ROLES.COLLECTOR ? req.user.id : req.query.collector_id;

    const where = {};
    if (effectiveCollectorId) where.collector_id = effectiveCollectorId;
    if (status) where.status = status;
    if (category_id) where.category_id = category_id;

    const totalCount = await prisma.lots.count({ where });
    const pagination = parsePagination(req.query, totalCount);

    const { data } = await Material.findLots({
      collector_id: effectiveCollectorId,
      status,
      category_id,
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
 * PATCH /lots/:id/status
 */
async function updateLotStatus(req, res, next) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const lot = await Material.findLotById(id);
    if (!lot) {
      return error(res, { message: 'Lot not found', statusCode: 404 });
    }

    if (req.user.role === ROLES.COLLECTOR && lot.collector_id !== req.user.id) {
      return error(res, { message: 'Not authorized to modify this lot', statusCode: 403 });
    }

    // Lot status past in_transaction is driven by the transaction lifecycle —
    // letting a collector set it by hand would desync the two.
    const collectorSettable = [LOT_STATUS.DRAFT, LOT_STATUS.ACTIVE, LOT_STATUS.EXPIRED];
    if (req.user.role === ROLES.COLLECTOR && !collectorSettable.includes(status)) {
      return error(res, {
        message:
          `Lot status '${status}' is set by the transaction flow. ` +
          `You can set: ${collectorSettable.join(', ')}.`,
        statusCode: 403,
      });
    }

    if (lot.status === LOT_STATUS.IN_TRANSACTION && req.user.role === ROLES.COLLECTOR) {
      return error(res, {
        message: 'This lot has an active transaction. Cancel it first to change the lot.',
        statusCode: 409,
      });
    }

    const updated = await Material.updateLotStatus(id, status);
    return success(res, { message: 'Lot status updated', data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /lots/:id
 * Edit a lot that hasn't entered a transaction yet. Weight or category changes
 * re-run the valuation so the estimate never goes stale.
 */
async function updateLot(req, res, next) {
  try {
    const { id } = req.params;

    const lot = await Material.findLotById(id);
    if (!lot) return error(res, { message: 'Lot not found', statusCode: 404 });

    if (req.user.role === ROLES.COLLECTOR && lot.collector_id !== req.user.id) {
      return error(res, { message: 'Not authorized to modify this lot', statusCode: 403 });
    }

    const editable = [LOT_STATUS.DRAFT, LOT_STATUS.ACTIVE, LOT_STATUS.MATCHED];
    if (!editable.includes(lot.status)) {
      return error(res, {
        message: `A lot with status '${lot.status}' can no longer be edited.`,
        statusCode: 409,
      });
    }

    const data = { ...req.body };

    if (req.file) {
      data.image_url = await uploadFile(req.file);
    }

    // Re-value when the inputs that drive value change.
    const weightChanged = data.approximate_weight !== undefined;
    const categoryChanged = data.category_id !== undefined || data.sub_category_id !== undefined;
    if (weightChanged || categoryChanged || data.condition !== undefined) {
      const valuation = await estimateLotValue({
        category_id: data.sub_category_id || data.category_id || lot.category_id,
        fallback_category_id: data.category_id || lot.category_id,
        weight: data.approximate_weight ?? Number(lot.approximate_weight),
        condition: data.condition || lot.condition,
        location: data.collection_address || lot.collection_address,
      });
      data.estimated_value = valuation.estimated_value;
    }

    const updated = await Material.updateLot(id, data);
    return success(res, { message: 'Lot updated', data: updated });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /lots/:id
 * Only draft lots with no transaction history can be removed.
 */
async function deleteLot(req, res, next) {
  try {
    const lot = await Material.findLotById(req.params.id);
    if (!lot) return error(res, { message: 'Lot not found', statusCode: 404 });

    if (req.user.role === ROLES.COLLECTOR && lot.collector_id !== req.user.id) {
      return error(res, { message: 'Not authorized to delete this lot', statusCode: 403 });
    }

    const txCount = await prisma.transactions.count({ where: { lot_id: lot.id } });
    if (txCount > 0) {
      return error(res, {
        message: 'This lot has transaction history and cannot be deleted. Mark it expired instead.',
        statusCode: 409,
      });
    }

    await prisma.lots.delete({ where: { id: lot.id } });
    return success(res, { message: 'Lot deleted' });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /lots/estimate
 * Value a hypothetical lot without saving it — powers the live estimate on the
 * add-lot form.
 */
async function estimateOnly(req, res, next) {
  try {
    const { category_id, sub_category_id, approximate_weight, condition, location } = req.body;

    const valuation = await estimateLotValue({
      category_id: sub_category_id || category_id,
      fallback_category_id: category_id,
      weight: approximate_weight,
      condition,
      location,
    });

    return success(res, { data: valuation });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  listCategories,
  createLot,
  getLot,
  listLots,
  updateLotStatus,
  updateLot,
  deleteLot,
  estimateOnly,
};
