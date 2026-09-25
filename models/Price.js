/**
 * Price Model — thin Prisma wrapper
 * Covers price_history table. Enforces INSERT-only (no UPDATE).
 */
const prisma = require('../config/db');

const Price = {
  /**
   * Record a new price entry (append-only — never update existing rows).
   */
  async record({ category_id, location, buying_price, selling_price, source }) {
    return prisma.price_history.create({
      data: { category_id, location, buying_price, selling_price, source },
    });
  },

  /**
   * Get the latest price for a category and optional location.
   */
  async getLatest(category_id, location = null) {
    const where = { category_id };
    if (location) where.location = location;

    return prisma.price_history.findFirst({
      where,
      orderBy: { recorded_at: 'desc' },
    });
  },

  /**
   * Get price history for trend computation.
   *
   * @param {string} category_id
   * @param {Object} options
   * @param {number} [options.days=30] - Number of days to look back
   * @param {string} [options.location]
   * @returns {Promise<Array>}
   */
  async getHistory(category_id, { days = 30, location = null } = {}) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = {
      category_id,
      recorded_at: { gte: since },
    };
    if (location) where.location = location;

    return prisma.price_history.findMany({
      where,
      orderBy: { recorded_at: 'asc' },
    });
  },

  /**
   * Compute the average buying price over a given number of days.
   */
  async getAveragePrice(category_id, { days = 7, location = null } = {}) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    const where = {
      category_id,
      recorded_at: { gte: since },
    };
    if (location) where.location = location;

    const result = await prisma.price_history.aggregate({
      where,
      _avg: { buying_price: true },
      _count: true,
    });

    return {
      average: result._avg.buying_price ? Number(result._avg.buying_price) : null,
      count: result._count,
    };
  },

  /**
   * BLOCKED: Updates are not allowed on price_history (append-only).
   */
  async update() {
    throw new Error('price_history is append-only. Updates are not permitted.');
  },

  /**
   * BLOCKED: Deletes are not allowed on price_history (append-only).
   */
  async delete() {
    throw new Error('price_history is append-only. Deletes are not permitted.');
  },
};

module.exports = Price;
