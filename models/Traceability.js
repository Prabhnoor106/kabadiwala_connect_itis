/**
 * Traceability Model — thin Prisma wrapper
 * Covers traceability and traceability_photos tables.
 */
const prisma = require('../config/db');

const Traceability = {
  /**
   * Create a handover record with photos.
   */
  async createHandover({
    transaction_id,
    handover_reference_number,
    actual_weight,
    handover_location_lat,
    handover_location_lng,
    notes,
    photo_urls = [],
  }) {
    return prisma.traceability.create({
      data: {
        transaction_id,
        handover_reference_number,
        actual_weight,
        handover_location_lat,
        handover_location_lng,
        handover_timestamp: new Date(),
        collector_confirmed: true,
        collector_confirmed_at: new Date(),
        notes,
        photos: {
          create: photo_urls.map((url) => ({
            photo_url: url,
            photo_type: 'handover',
          })),
        },
      },
      include: { photos: true },
    });
  },

  /**
   * Find a traceability record by ID.
   */
  async findById(id) {
    return prisma.traceability.findUnique({
      where: { id },
      include: {
        photos: true,
        transaction: {
          include: {
            lot: {
              include: {
                category: { select: { id: true, name: true, code: true } },
              },
            },
            collector: { select: { id: true, phone: true } },
            recycler: { select: { id: true, business_name: true } },
          },
        },
      },
    });
  },

  /**
   * Find a traceability record by transaction ID.
   */
  async findByTransactionId(transaction_id) {
    return prisma.traceability.findUnique({
      where: { transaction_id },
      include: { photos: true },
    });
  },

  /**
   * Find a traceability record by handover reference number.
   */
  async findByReference(handover_reference_number) {
    return prisma.traceability.findUnique({
      where: { handover_reference_number },
      include: {
        photos: true,
        transaction: {
          include: {
            lot: true,
            collector: { select: { id: true, phone: true } },
            recycler: { select: { id: true, business_name: true } },
          },
        },
      },
    });
  },

  /**
   * Recycler-side confirmation of handover.
   */
  async confirmByRecycler(id) {
    return prisma.traceability.update({
      where: { id },
      data: {
        recycler_confirmed: true,
        recycler_confirmed_at: new Date(),
      },
    });
  },

  /**
   * Add additional photos to an existing traceability record.
   */
  async addPhotos(traceability_id, photo_urls) {
    return prisma.traceability_photos.createMany({
      data: photo_urls.map((url) => ({
        traceability_id,
        photo_url: url,
        photo_type: 'handover',
      })),
    });
  },
};

module.exports = Traceability;
