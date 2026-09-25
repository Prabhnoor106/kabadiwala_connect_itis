/**
 * Recycler Model — thin Prisma wrapper
 * Covers recyclers and recycler_materials tables.
 */
const prisma = require('../config/db');

/** Fields safe to return to a client — never the password hash. */
const PUBLIC_FIELDS = {
  id: true,
  business_name: true,
  registration_number: true,
  authorization_status: true,
  contact_phone: true,
  contact_email: true,
  email_verified: true,
  address: true,
  location_lat: true,
  location_lng: true,
  pickup_available: true,
  max_pickup_distance_km: true,
  operating_hours: true,
  created_at: true,
  updated_at: true,
};

const Recycler = {
  // ==================== Recycler Profiles ====================

  /**
   * Create a new recycler.
   */
  async create(data) {
    return prisma.recyclers.create({ data, select: PUBLIC_FIELDS });
  },

  // ==================== Authentication ====================

  /**
   * Find a recycler by login email, INCLUDING the password hash.
   * Only the auth controller should call this.
   */
  async findByEmailWithSecret(contact_email) {
    return prisma.recyclers.findUnique({
      where: { contact_email: String(contact_email).toLowerCase().trim() },
    });
  },

  /**
   * Set or replace a recycler's password hash.
   */
  async setPasswordHash(id, password_hash) {
    return prisma.recyclers.update({
      where: { id },
      data: { password_hash },
      select: PUBLIC_FIELDS,
    });
  },

  /**
   * Find a recycler by ID.
   */
  async findById(id) {
    return prisma.recyclers.findUnique({
      where: { id },
      select: {
        ...PUBLIC_FIELDS,
        recycler_materials: {
          select: {
            id: true,
            category_id: true,
            buying_price: true,
            unit: true,
            min_quantity: true,
            last_updated: true,
            category: { select: { id: true, name: true, code: true, icon_url: true } },
          },
          orderBy: { category: { name: 'asc' } },
        },
      },
    });
  },

  /**
   * List recyclers with filtering and pagination.
   */
  async findMany({ authorization_status, pickup_available, category_id, search, skip = 0, take = 20 } = {}) {
    const where = {};
    if (authorization_status) where.authorization_status = authorization_status;
    if (pickup_available !== undefined) where.pickup_available = pickup_available;
    if (category_id) where.recycler_materials = { some: { category_id } };
    if (search) where.business_name = { contains: search, mode: 'insensitive' };

    const [data, total] = await Promise.all([
      prisma.recyclers.findMany({
        where,
        select: {
          ...PUBLIC_FIELDS,
          recycler_materials: {
            select: {
              category_id: true,
              buying_price: true,
              unit: true,
              category: { select: { code: true, name: true } },
            },
          },
        },
        orderBy: { business_name: 'asc' },
        skip,
        take,
      }),
      prisma.recyclers.count({ where }),
    ]);

    return { data, total };
  },

  /**
   * Update a recycler. Strips auth-sensitive fields so a profile update can
   * never overwrite a password hash or self-grant authorization.
   */
  async update(id, data) {
    const { password_hash, email_verified, authorization_status, ...safe } = data;
    return prisma.recyclers.update({
      where: { id },
      data: safe,
      select: PUBLIC_FIELDS,
    });
  },

  /**
   * Admin-only: set authorization status (CPCB verification outcome).
   */
  async setAuthorizationStatus(id, authorization_status) {
    return prisma.recyclers.update({
      where: { id },
      data: { authorization_status },
      select: PUBLIC_FIELDS,
    });
  },

  /**
   * Recycler-managed pickup availability + service radius.
   */
  async setAvailability(id, { pickup_available, max_pickup_distance_km, operating_hours }) {
    const data = {};
    if (pickup_available !== undefined) data.pickup_available = pickup_available;
    if (max_pickup_distance_km !== undefined) data.max_pickup_distance_km = max_pickup_distance_km;
    if (operating_hours !== undefined) data.operating_hours = operating_hours;

    return prisma.recyclers.update({
      where: { id },
      data,
      select: PUBLIC_FIELDS,
    });
  },

  /**
   * Delete a recycler.
   */
  async delete(id) {
    return prisma.recyclers.delete({ where: { id } });
  },

  // ==================== Recycler Materials (Rates) ====================

  /**
   * Set or update a recycler's rate for a material category.
   */
  async upsertRate(recycler_id, category_id, { buying_price, unit = 'kg', min_quantity = 0 }) {
    return prisma.recycler_materials.upsert({
      where: {
        recycler_id_category_id: { recycler_id, category_id },
      },
      create: {
        recycler_id,
        category_id,
        buying_price,
        unit,
        min_quantity,
      },
      update: {
        buying_price,
        unit,
        min_quantity,
        last_updated: new Date(),
      },
    });
  },

  /**
   * Get all rates for a recycler.
   */
  async getRates(recycler_id) {
    return prisma.recycler_materials.findMany({
      where: { recycler_id },
      include: {
        category: { select: { id: true, name: true, code: true, icon_url: true, hazard_level: true } },
      },
      orderBy: { category: { name: 'asc' } },
    });
  },

  /**
   * Remove a recycler's rate for one category (stops matching on it).
   */
  async deleteRate(recycler_id, category_id) {
    return prisma.recycler_materials.deleteMany({
      where: { recycler_id, category_id },
    });
  },

  /**
   * Find authorized recyclers that handle a given material category.
   * Used by matching service.
   */
  async findAuthorizedForCategory(category_id) {
    return prisma.recyclers.findMany({
      where: {
        authorization_status: 'authorized',
        recycler_materials: {
          some: { category_id },
        },
      },
      include: {
        recycler_materials: {
          where: { category_id },
        },
      },
    });
  },

  PUBLIC_FIELDS,
};

module.exports = Recycler;
