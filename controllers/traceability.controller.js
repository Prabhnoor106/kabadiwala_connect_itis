/**
 * Traceability Controller
 * Lot timeline + public handover verification.
 */
const traceabilityService = require('../services/traceability.service');
const { success, error } = require('../utils/response');
const { ROLES } = require('../config/constants');
const prisma = require('../config/db');

/**
 * GET /lots/:id/traceability
 * Full collection → completion timeline for a lot.
 */
async function getLotTraceability(req, res, next) {
  try {
    const lang = ['hi', 'mr', 'en'].includes(req.query.lang) ? req.query.lang : 'en';

    const timeline = await traceabilityService.getLotTimeline(req.params.id, { lang });
    if (!timeline) {
      return error(res, { message: 'Lot not found', statusCode: 404 });
    }

    // Only the collector who owns it, the recycler in the deal, or an admin.
    if (req.user.role === ROLES.COLLECTOR && timeline.lot.collector_id !== req.user.id) {
      return error(res, { message: 'Not authorized to view this lot', statusCode: 403 });
    }
    if (req.user.role === ROLES.RECYCLER) {
      const involved = await prisma.transactions.findFirst({
        where: { lot_id: req.params.id, recycler_id: req.user.id },
        select: { id: true },
      });
      if (!involved) {
        return error(res, { message: 'Not authorized to view this lot', statusCode: 403 });
      }
    }

    return success(res, { data: timeline });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /traceability/verify/:reference
 * Public verification of a handover reference number (e.g. HRN-20260905-A3F7).
 *
 * Deliberately unauthenticated: the point of a reference number is that anyone
 * holding the paper slip — an auditor, a producer meeting EPR obligations, the
 * collector themself — can confirm the chain of custody. Only non-identifying
 * fields are returned.
 */
async function verifyReference(req, res, next) {
  try {
    const reference = String(req.params.reference).toUpperCase().trim();

    const record = await traceabilityService.verifyByReference(reference);
    if (!record) {
      return error(res, {
        message: 'No handover found with that reference number',
        statusCode: 404,
      });
    }

    return success(res, { message: 'Handover verified', data: record });
  } catch (err) {
    next(err);
  }
}

module.exports = { getLotTraceability, verifyReference };
