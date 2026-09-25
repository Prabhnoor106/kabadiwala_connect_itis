/**
 * Ledger Controller
 * Collector earnings ledger — always derived from transactions, never stored.
 */
const { getCollectorLedger, getCollectorDashboard } = require('../services/ledger.service');
const { success, error } = require('../utils/response');
const { ROLES } = require('../config/constants');

/**
 * GET /collectors/:id/ledger
 * Earnings, payments and pending dues.
 */
async function getLedger(req, res, next) {
  try {
    const { id } = req.params;

    if (req.user.role === ROLES.COLLECTOR && req.user.id !== id) {
      return error(res, { message: 'Not authorized to view this ledger', statusCode: 403 });
    }
    if (req.user.role === ROLES.RECYCLER) {
      return error(res, { message: 'Not authorized to view collector ledgers', statusCode: 403 });
    }

    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
    // The rest of the API paginates with page/limit; accept that here too,
    // while still honouring an explicit skip for any existing caller.
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const skip =
      req.query.skip !== undefined
        ? Math.max(parseInt(req.query.skip, 10) || 0, 0)
        : (page - 1) * limit;

    const ledger = await getCollectorLedger(id, { skip, take: limit });
    return success(res, { data: ledger });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /collectors/me/dashboard
 * The collector home screen in one call: earnings, live lots, recent activity.
 */
async function getDashboard(req, res, next) {
  try {
    if (req.user.role !== ROLES.COLLECTOR) {
      return error(res, { message: 'Collector account required', statusCode: 403 });
    }

    const data = await getCollectorDashboard(req.user.id);
    return success(res, { data });
  } catch (err) {
    next(err);
  }
}

module.exports = { getLedger, getDashboard };
