/**
 * Ledger Service
 * Aggregates a collector's earnings from transactions + traceability.
 *
 * Nothing here is stored on the collector row. Earnings are always derived, so
 * a balance can never drift from the transactions that produced it — and the
 * collector's minimal profile stays minimal, as the problem statement requires.
 */
const prisma = require('../config/db');
const { TRANSACTION_STATUS, PAYMENT_STATUS, LOT_STATUS } = require('../config/constants');

/** Statuses where money is owed or already paid. */
const EARNING_STATUSES = [TRANSACTION_STATUS.CONFIRMED, TRANSACTION_STATUS.COMPLETED];

/**
 * A collector's full earnings ledger.
 *
 * @param {string} collector_id
 * @param {Object} [options]
 * @param {number} [options.skip=0]
 * @param {number} [options.take=20]
 */
async function getCollectorLedger(collector_id, { skip = 0, take = 20 } = {}) {
  const where = { collector_id, status: { in: EARNING_STATUSES } };

  const [transactions, total, earned, pending, paid, lifetime] = await Promise.all([
    prisma.transactions.findMany({
      where,
      select: {
        id: true,
        offered_price: true,
        final_price: true,
        final_weight: true,
        status: true,
        payment_status: true,
        payment_method: true,
        created_at: true,
        completed_at: true,
        lot: {
          select: {
            id: true,
            approximate_weight: true,
            image_url: true,
            category: { select: { code: true, name: true, icon_url: true } },
          },
        },
        recycler: { select: { id: true, business_name: true } },
        traceability: {
          select: {
            handover_reference_number: true,
            actual_weight: true,
            handover_timestamp: true,
            recycler_confirmed: true,
          },
        },
      },
      // Newest settled first; unsettled (null completed_at) sort last.
      orderBy: [{ completed_at: 'desc' }, { created_at: 'desc' }],
      skip,
      take,
    }),
    prisma.transactions.count({ where }),
    prisma.transactions.aggregate({
      where,
      _sum: { final_price: true, final_weight: true },
      _count: { _all: true },
    }),
    prisma.transactions.aggregate({
      where: {
        collector_id,
        status: { in: EARNING_STATUSES },
        payment_status: { in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PARTIAL] },
      },
      _sum: { final_price: true, offered_price: true },
      _count: { _all: true },
    }),
    prisma.transactions.aggregate({
      where: {
        collector_id,
        status: { in: EARNING_STATUSES },
        payment_status: PAYMENT_STATUS.COMPLETED,
      },
      _sum: { final_price: true, final_weight: true },
      _count: { _all: true },
    }),
    // Everything ever transacted, including in-flight deals, for context.
    prisma.transactions.aggregate({
      where: { collector_id },
      _count: { _all: true },
    }),
  ]);

  const entries = transactions.map((tx) => {
    const amount = num(tx.final_price) || num(tx.offered_price);
    return {
      transaction_id: tx.id,
      lot_id: tx.lot?.id,
      category_code: tx.lot?.category?.code,
      category_name: tx.lot?.category?.name,
      icon_url: tx.lot?.category?.icon_url,
      image_url: tx.lot?.image_url,
      weight: num(tx.traceability?.actual_weight) || num(tx.final_weight) || num(tx.lot?.approximate_weight),
      amount,
      is_settled: tx.payment_status === PAYMENT_STATUS.COMPLETED,
      payment_status: tx.payment_status,
      payment_method: tx.payment_method,
      transaction_status: tx.status,
      recycler: tx.recycler?.business_name,
      recycler_id: tx.recycler?.id,
      reference: tx.traceability?.handover_reference_number,
      handover_at: tx.traceability?.handover_timestamp,
      recycler_confirmed: tx.traceability?.recycler_confirmed ?? false,
      date: tx.completed_at || tx.created_at,
    };
  });

  // Pending dues use final_price when set, else the agreed quote.
  const pendingAmount =
    num(pending._sum.final_price) || num(pending._sum.offered_price);

  return {
    collector_id,
    summary: {
      total_earnings: num(earned._sum.final_price),
      total_weight_kg: num(earned._sum.final_weight),
      total_transactions: earned._count._all,
      paid_amount: num(paid._sum.final_price),
      paid_count: paid._count._all,
      pending_dues: pendingAmount,
      pending_count: pending._count._all,
      lifetime_transaction_count: lifetime._count._all,
      avg_per_transaction: earned._count._all
        ? round2(num(earned._sum.final_price) / earned._count._all)
        : 0,
      avg_rate_per_kg: num(earned._sum.final_weight)
        ? round2(num(earned._sum.final_price) / num(earned._sum.final_weight))
        : 0,
    },
    entries,
    pagination: {
      total,
      page: Math.floor(skip / take) + 1,
      limit: take,
      totalPages: Math.ceil(total / take) || 1,
    },
  };
}

/**
 * Collector home screen: earnings headline, live lots, in-flight deals,
 * monthly trend. One round trip so the app opens fast on a weak connection.
 */
async function getCollectorDashboard(collector_id) {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    lotsByStatus,
    earned,
    thisMonth,
    pending,
    activeLots,
    liveTransactions,
    recentCompleted,
    monthlySeries,
  ] = await Promise.all([
    prisma.lots.groupBy({
      by: ['status'],
      where: { collector_id },
      _count: { _all: true },
    }),
    prisma.transactions.aggregate({
      where: { collector_id, status: TRANSACTION_STATUS.COMPLETED },
      _sum: { final_price: true, final_weight: true },
      _count: { _all: true },
    }),
    prisma.transactions.aggregate({
      where: {
        collector_id,
        status: TRANSACTION_STATUS.COMPLETED,
        completed_at: { gte: monthAgo },
      },
      _sum: { final_price: true, final_weight: true },
      _count: { _all: true },
    }),
    prisma.transactions.aggregate({
      where: {
        collector_id,
        status: { in: EARNING_STATUSES },
        payment_status: { in: [PAYMENT_STATUS.PENDING, PAYMENT_STATUS.PARTIAL] },
      },
      _sum: { final_price: true, offered_price: true },
      _count: { _all: true },
    }),
    // Lots waiting for a recycler — the collector's to-do list.
    prisma.lots.findMany({
      where: { collector_id, status: { in: [LOT_STATUS.DRAFT, LOT_STATUS.ACTIVE, LOT_STATUS.MATCHED] } },
      select: {
        id: true,
        status: true,
        approximate_weight: true,
        estimated_value: true,
        image_url: true,
        condition: true,
        created_at: true,
        category: { select: { id: true, name: true, code: true, icon_url: true, hazard_level: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    }),
    // Deals in motion.
    prisma.transactions.findMany({
      where: {
        collector_id,
        status: {
          in: [
            TRANSACTION_STATUS.QUOTED,
            TRANSACTION_STATUS.ACCEPTED,
            TRANSACTION_STATUS.IN_TRANSIT,
            TRANSACTION_STATUS.HANDED_OVER,
            TRANSACTION_STATUS.CONFIRMED,
            TRANSACTION_STATUS.DISPUTED,
          ],
        },
      },
      select: {
        id: true,
        status: true,
        payment_status: true,
        offered_price: true,
        final_price: true,
        created_at: true,
        pickup_scheduled_at: true,
        recycler: { select: { id: true, business_name: true, contact_phone: true } },
        lot: {
          select: {
            id: true,
            approximate_weight: true,
            image_url: true,
            category: { select: { name: true, code: true, icon_url: true } },
          },
        },
        traceability: { select: { handover_reference_number: true, recycler_confirmed: true } },
      },
      orderBy: { created_at: 'desc' },
      take: 10,
    }),
    prisma.transactions.findMany({
      where: { collector_id, status: TRANSACTION_STATUS.COMPLETED },
      select: {
        id: true,
        final_price: true,
        final_weight: true,
        payment_method: true,
        completed_at: true,
        recycler: { select: { business_name: true } },
        lot: { select: { category: { select: { name: true, code: true } } } },
        traceability: { select: { handover_reference_number: true } },
      },
      orderBy: { completed_at: 'desc' },
      take: 5,
    }),
    prisma.transactions.findMany({
      where: {
        collector_id,
        status: TRANSACTION_STATUS.COMPLETED,
        completed_at: { gte: new Date(Date.now() - 180 * 24 * 60 * 60 * 1000) },
      },
      select: { completed_at: true, final_price: true, final_weight: true },
    }),
  ]);

  const lotCounts = lotsByStatus.reduce((acc, r) => {
    acc[r.status] = r._count._all;
    return acc;
  }, {});

  // Six-month earnings series for the ledger chart.
  const months = new Map();
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i, 1);
    const key = d.toISOString().slice(0, 7);
    months.set(key, { month: key, earnings: 0, weight_kg: 0, transactions: 0 });
  }
  for (const tx of monthlySeries) {
    const key = tx.completed_at.toISOString().slice(0, 7);
    const bucket = months.get(key);
    if (bucket) {
      bucket.earnings += num(tx.final_price);
      bucket.weight_kg += num(tx.final_weight);
      bucket.transactions += 1;
    }
  }

  return {
    earnings: {
      total: num(earned._sum.final_price),
      total_weight_kg: num(earned._sum.final_weight),
      completed_transactions: earned._count._all,
      last_30d: num(thisMonth._sum.final_price),
      last_30d_weight_kg: num(thisMonth._sum.final_weight),
      last_30d_transactions: thisMonth._count._all,
      pending_dues: num(pending._sum.final_price) || num(pending._sum.offered_price),
      pending_count: pending._count._all,
    },
    lots: {
      draft: lotCounts[LOT_STATUS.DRAFT] || 0,
      active: lotCounts[LOT_STATUS.ACTIVE] || 0,
      matched: lotCounts[LOT_STATUS.MATCHED] || 0,
      in_transaction: lotCounts[LOT_STATUS.IN_TRANSACTION] || 0,
      completed: lotCounts[LOT_STATUS.COMPLETED] || 0,
      total: Object.values(lotCounts).reduce((a, b) => a + b, 0),
    },
    active_lots: activeLots.map((l) => ({
      ...l,
      approximate_weight: num(l.approximate_weight),
      estimated_value: l.estimated_value === null ? null : num(l.estimated_value),
    })),
    live_transactions: liveTransactions.map((t) => ({
      ...t,
      offered_price: num(t.offered_price),
      final_price: t.final_price === null ? null : num(t.final_price),
      lot: t.lot
        ? { ...t.lot, approximate_weight: num(t.lot.approximate_weight) }
        : null,
    })),
    recent_completed: recentCompleted.map((t) => ({
      transaction_id: t.id,
      amount: num(t.final_price),
      weight_kg: num(t.final_weight),
      payment_method: t.payment_method,
      completed_at: t.completed_at,
      recycler: t.recycler?.business_name,
      category: t.lot?.category?.name,
      category_code: t.lot?.category?.code,
      reference: t.traceability?.handover_reference_number,
    })),
    monthly_trend: Array.from(months.values()).map((m) => ({
      ...m,
      earnings: round2(m.earnings),
      weight_kg: round2(m.weight_kg),
    })),
  };
}

/** Prisma Decimal | null → number. */
function num(v) {
  if (v === null || v === undefined) return 0;
  return Number(v);
}
const round2 = (n) => Math.round(Number(n) * 100) / 100;

module.exports = { getCollectorLedger, getCollectorDashboard };
