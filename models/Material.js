/**
 * Material Model — thin Prisma wrapper
 * Covers both material_categories and lots tables.
 */
const prisma = require('../config/db');

const Material = {
  // ==================== Categories ====================

  /**
   * Get all material categories (with optional hierarchy).
   */
  async getAllCategories({ includeChildren = false } = {}) {
    return prisma.material_categories.findMany({
      where: { parent_id: null },
      include: includeChildren ? { children: true } : undefined,
      orderBy: { name: 'asc' },
    });
  },

  /**
   * Get a single category by ID.
   */
  async getCategoryById(id) {
    return prisma.material_categories.findUnique({
      where: { id },
      include: { children: true },
    });
  },

  /**
   * Get a category by code.
   */
  async getCategoryByCode(code) {
    return prisma.material_categories.findUnique({
      where: { code },
    });
  },

  // ==================== Lots ====================

  /**
   * Create a new lot.
   */
  async createLot(data) {
    return prisma.lots.create({
      data,
      include: {
        category: { select: { id: true, name: true, code: true } },
        sub_category: { select: { id: true, name: true, code: true } },
      },
    });
  },

  /**
   * Find a lot by ID.
   */
  async findLotById(id) {
    return prisma.lots.findUnique({
      where: { id },
      include: {
        category: { select: { id: true, name: true, code: true, icon_url: true, hazard_level: true } },
        sub_category: { select: { id: true, name: true, code: true } },
        collector: { select: { id: true, phone: true, preferred_language: true } },
      },
    });
  },

  /**
   * List lots with filtering and pagination.
   */
  async findLots({ collector_id, status, category_id, skip = 0, take = 20 } = {}) {
    const where = {};
    if (collector_id) where.collector_id = collector_id;
    if (status) where.status = status;
    if (category_id) where.category_id = category_id;

    const [data, total] = await Promise.all([
      prisma.lots.findMany({
        where,
        include: {
          category: { select: { id: true, name: true, code: true, icon_url: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      prisma.lots.count({ where }),
    ]);

    return { data, total };
  },

  /**
   * Update lot status.
   */
  async updateLotStatus(id, status) {
    return prisma.lots.update({
      where: { id },
      data: { status },
    });
  },

  /**
   * Update lot fields.
   */
  async updateLot(id, data) {
    return prisma.lots.update({
      where: { id },
      data,
    });
  },
};

module.exports = Material;
