/**
 * Collector Model — thin Prisma wrapper
 * Deliberately minimal — no name/address/ID-proof fields, ever.
 */
const prisma = require('../config/db');

const Collector = {
  /**
   * Find a collector by phone number.
   */
  async findByPhone(phone) {
    return prisma.collectors.findUnique({ where: { phone } });
  },

  /**
   * Find a collector by ID.
   */
  async findById(id) {
    return prisma.collectors.findUnique({ where: { id } });
  },

  /**
   * Create a new collector (phone-only registration).
   */
  async create({ phone, preferred_language = 'hi' }) {
    return prisma.collectors.create({
      data: { phone, preferred_language },
    });
  },

  /**
   * Update OTP fields for authentication.
   */
  async setOtp(id, { otp_secret, otp_expires_at }) {
    return prisma.collectors.update({
      where: { id },
      data: { otp_secret, otp_expires_at },
    });
  },

  /**
   * Mark collector as verified after successful OTP.
   */
  async verify(id) {
    return prisma.collectors.update({
      where: { id },
      data: {
        is_verified: true,
        otp_secret: null,
        otp_expires_at: null,
      },
    });
  },

  /**
   * Update collector's location.
   */
  async updateLocation(id, { location_lat, location_lng }) {
    return prisma.collectors.update({
      where: { id },
      data: { location_lat, location_lng },
    });
  },

  /**
   * Update preferred language.
   */
  async updateLanguage(id, preferred_language) {
    return prisma.collectors.update({
      where: { id },
      data: { preferred_language },
    });
  },

  /**
   * Set an optional login PIN (already hashed).
   * OTP remains the primary auth path — a PIN is a convenience only.
   */
  async setPinHash(id, pin_hash) {
    return prisma.collectors.update({
      where: { id },
      data: { pin_hash },
      select: { id: true, phone: true },
    });
  },

  /**
   * Remove a collector's PIN, forcing OTP login again.
   */
  async clearPin(id) {
    return prisma.collectors.update({
      where: { id },
      data: { pin_hash: null },
      select: { id: true },
    });
  },

  /**
   * List collectors (admin view) with lot/transaction counts.
   */
  async findMany({ skip = 0, take = 20, is_verified } = {}) {
    const where = {};
    if (is_verified !== undefined) where.is_verified = is_verified;

    const [data, total] = await Promise.all([
      prisma.collectors.findMany({
        where,
        select: {
          id: true,
          phone: true,
          preferred_language: true,
          is_verified: true,
          location_lat: true,
          location_lng: true,
          created_at: true,
          _count: { select: { lots: true, transactions: true } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      prisma.collectors.count({ where }),
    ]);

    return { data, total };
  },
};

module.exports = Collector;
