/**
 * Transaction Model — thin Prisma wrapper
 */
const prisma = require('../config/db');
const { TRANSACTION_TRANSITIONS } = require('../config/constants');

const Transaction = {
  /**
   * Create a new transaction.
   */
  async create(data) {
    return prisma.transactions.create({
      data: {
        ...data,
        status_history: [
          {
            status: 'quoted',
            timestamp: new Date().toISOString(),
            note: 'Transaction created',
          },
        ],
      },
      include: {
        lot: { select: { id: true, category_id: true, approximate_weight: true, status: true } },
        recycler: { select: { id: true, business_name: true } },
      },
    });
  },

  /**
   * Find a transaction by ID.
   */
  async findById(id) {
    return prisma.transactions.findUnique({
      where: { id },
      include: {
        lot: {
          include: {
            category: { select: { id: true, name: true, code: true } },
          },
        },
        collector: { select: { id: true, phone: true } },
        recycler: { select: { id: true, business_name: true, contact_phone: true } },
        traceability: {
          include: { photos: true },
        },
      },
    });
  },

  /**
   * List transactions with filtering and pagination.
   */
  async findMany({ collector_id, recycler_id, status, skip = 0, take = 20 } = {}) {
    const where = {};
    if (collector_id) where.collector_id = collector_id;
    if (recycler_id) where.recycler_id = recycler_id;
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      prisma.transactions.findMany({
        where,
        include: {
          // `select` and `include` cannot both be used on one relation —
          // Prisma throws. Use a single `select` and nest the relation in it.
          lot: {
            select: {
              id: true,
              category_id: true,
              approximate_weight: true,
              image_url: true,
              status: true,
              collection_address: true,
              category: { select: { code: true, name: true, icon_url: true } },
            },
          },
          collector: { select: { id: true, phone: true } },
          recycler: { select: { id: true, business_name: true, contact_phone: true } },
          traceability: {
            select: {
              id: true,
              handover_reference_number: true,
              actual_weight: true,
              recycler_confirmed: true,
              handover_timestamp: true,
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take,
      }),
      prisma.transactions.count({ where }),
    ]);

    return { data, total };
  },

  /**
   * Transition a transaction to a new status with validation.
   *
   * @param {string} id - Transaction ID
   * @param {string} newStatus - Target status
   * @param {Object} [extra] - Additional fields to update (final_price, cancellation_reason, etc.)
   * @returns {Promise<Object>}
   * @throws {Error} If the transition is not allowed
   */
  async transitionStatus(id, newStatus, extra = {}) {
    const current = await prisma.transactions.findUnique({
      where: { id },
      select: { status: true, status_history: true },
    });

    if (!current) {
      throw Object.assign(new Error('Transaction not found'), { statusCode: 404 });
    }

    const allowed = TRANSACTION_TRANSITIONS[current.status] || [];
    if (!allowed.includes(newStatus)) {
      throw Object.assign(
        new Error(`Cannot transition from '${current.status}' to '${newStatus}'. Allowed: [${allowed.join(', ')}]`),
        { statusCode: 400 }
      );
    }

    // Build the update payload
    const updateData = {
      status: newStatus,
      status_history: [
        ...(Array.isArray(current.status_history) ? current.status_history : []),
        {
          status: newStatus,
          timestamp: new Date().toISOString(),
          note: extra.note || `Status changed to ${newStatus}`,
        },
      ],
      ...extra,
    };

    // Set completion/cancellation timestamps
    if (newStatus === 'completed') {
      updateData.completed_at = new Date();
    } else if (newStatus === 'cancelled') {
      updateData.cancelled_at = new Date();
    }

    // Remove non-column fields
    delete updateData.note;

    return prisma.transactions.update({
      where: { id },
      data: updateData,
    });
  },
};

module.exports = Transaction;
