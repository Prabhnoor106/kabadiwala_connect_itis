/**
 * SyncLog Model — thin Prisma wrapper
 * Offline-write outbox and conflict tracker.
 * Table: sync_log (§7 addition, not in original 01_schema.sql)
 */
const prisma = require('../config/db');

const SyncLog = {
  /**
   * Record a sync entry. Uses idempotency_key to prevent duplicates.
   */
  async create({ collector_id, idempotency_key, operation, payload, client_timestamp }) {
    // Check for duplicate idempotency key
    const existing = await prisma.sync_log.findUnique({
      where: { idempotency_key },
    });

    if (existing) {
      return { duplicate: true, record: existing };
    }

    const record = await prisma.sync_log.create({
      data: {
        collector_id,
        idempotency_key,
        operation,
        payload,
        client_timestamp: new Date(client_timestamp),
        status: 'pending',
      },
    });

    return { duplicate: false, record };
  },

  /**
   * Mark a sync entry as applied.
   */
  async markApplied(id) {
    return prisma.sync_log.update({
      where: { id },
      data: { status: 'applied', resolved_at: new Date() },
    });
  },

  /**
   * Mark a sync entry as having a conflict.
   */
  async markConflict(id, conflict_detail) {
    return prisma.sync_log.update({
      where: { id },
      data: { status: 'conflict', conflict_detail },
    });
  },

  /**
   * Mark a sync entry as rejected.
   */
  async markRejected(id, conflict_detail) {
    return prisma.sync_log.update({
      where: { id },
      data: { status: 'rejected', conflict_detail, resolved_at: new Date() },
    });
  },

  /**
   * Get sync history for a collector.
   */
  async findByCollector(collector_id, { status, skip = 0, take = 50 } = {}) {
    const where = { collector_id };
    if (status) where.status = status;

    return prisma.sync_log.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip,
      take,
    });
  },

  /**
   * Get all pending sync entries (for admin review).
   */
  async getPending() {
    return prisma.sync_log.findMany({
      where: { status: 'pending' },
      orderBy: { client_timestamp: 'asc' },
    });
  },

  /**
   * Get all conflict entries (for admin review).
   */
  async getConflicts() {
    return prisma.sync_log.findMany({
      where: { status: 'conflict' },
      orderBy: { created_at: 'desc' },
      include: {
        collector: { select: { id: true, phone: true } },
      },
    });
  },
};

module.exports = SyncLog;
