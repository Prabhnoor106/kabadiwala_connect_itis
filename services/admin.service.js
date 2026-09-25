/**
 * Admin Service
 * Platform-wide analytics and oversight queries.
 *
 * Everything here is derived from the operational tables — no metrics are
 * stored or cached, so the numbers can never drift from the records they
 * describe.
 */
const prisma = require('../config/db');
const { TRANSACTION_STATUS, LOT_STATUS } = require('../config/constants');

/**
 * Headline platform statistics for the admin dashboard.
 */
async function getPlatformStats() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    collectorCount,
    verifiedCollectors,
    newCollectors30d,
    recyclersByStatus,
    lotsByStatus,
    txByStatus,
    settled,
    settled30d,
    handovers,
    confirmedHandovers,
    categoryCount,
    trainingSamples,
    priceObservations,
    activeCollectors7d,
  ] = await Promise.all([
    prisma.collectors.count(),
    prisma.collectors.count({ where: { is_verified: true } }),
    prisma.collectors.count({ where: { created_at: { gte: monthAgo } } }),
    prisma.recyclers.groupBy({ by: ['authorization_status'], _count: { _all: true } }),
    prisma.lots.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.transactions.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.transactions.aggregate({
      where: { status: TRANSACTION_STATUS.COMPLETED },
      _sum: { final_price: true, final_weight: true },
      _count: { _all: true },
      _avg: { final_price: true },
    }),
    prisma.transactions.aggregate({
      where: { status: TRANSACTION_STATUS.COMPLETED, completed_at: { gte: monthAgo } },
      _sum: { final_price: true, final_weight: true },
      _count: { _all: true },
    }),
    prisma.traceability.count(),
    prisma.traceability.count({ where: { recycler_confirmed: true } }),
    prisma.material_categories.count(),
    prisma.ai_training_samples.count(),
    prisma.price_history.count(),
    prisma.lots.findMany({
      where: { created_at: { gte: weekAgo } },
      select: { collector_id: true },
      distinct: ['collector_id'],
    }),
  ]);

  const toMap = (rows, key) =>
    rows.reduce((acc, r) => {
      acc[r[key]] = r._count._all;
      return acc;
    }, {});

  const recyclerMap = toMap(recyclersByStatus, 'authorization_status');
  const lotMap = toMap(lotsByStatus, 'status');
  const txMap = toMap(txByStatus, 'status');

  const totalTx = Object.values(txMap).reduce((a, b) => a + b, 0);
  const completedTx = txMap[TRANSACTION_STATUS.COMPLETED] || 0;

  return {
    collectors: {
      total: collectorCount,
      verified: verifiedCollectors,
      unverified: collectorCount - verifiedCollectors,
      new_last_30d: newCollectors30d,
      active_last_7d: activeCollectors7d.length,
    },
    recyclers: {
      total: Object.values(recyclerMap).reduce((a, b) => a + b, 0),
      authorized: recyclerMap.authorized || 0,
      pending: recyclerMap.pending || 0,
      suspended: recyclerMap.suspended || 0,
      revoked: recyclerMap.revoked || 0,
    },
    lots: {
      total: Object.values(lotMap).reduce((a, b) => a + b, 0),
      draft: lotMap[LOT_STATUS.DRAFT] || 0,
      active: lotMap[LOT_STATUS.ACTIVE] || 0,
      matched: lotMap[LOT_STATUS.MATCHED] || 0,
      in_transaction: lotMap[LOT_STATUS.IN_TRANSACTION] || 0,
      completed: lotMap[LOT_STATUS.COMPLETED] || 0,
      expired: lotMap[LOT_STATUS.EXPIRED] || 0,
    },
    transactions: {
      total: totalTx,
      quoted: txMap[TRANSACTION_STATUS.QUOTED] || 0,
      accepted: txMap[TRANSACTION_STATUS.ACCEPTED] || 0,
      in_transit: txMap[TRANSACTION_STATUS.IN_TRANSIT] || 0,
      handed_over: txMap[TRANSACTION_STATUS.HANDED_OVER] || 0,
      confirmed: txMap[TRANSACTION_STATUS.CONFIRMED] || 0,
      completed: completedTx,
      cancelled: txMap[TRANSACTION_STATUS.CANCELLED] || 0,
      disputed: txMap[TRANSACTION_STATUS.DISPUTED] || 0,
      completion_rate_percent: totalTx ? Math.round((completedTx / totalTx) * 1000) / 10 : 0,
    },
    value: {
      total_settled: settled._sum.final_price ? Number(settled._sum.final_price) : 0,
      total_weight_kg: settled._sum.final_weight ? Number(settled._sum.final_weight) : 0,
      avg_transaction_value: settled._avg.final_price ? Number(settled._avg.final_price) : 0,
      settled_last_30d: settled30d._sum.final_price ? Number(settled30d._sum.final_price) : 0,
      weight_last_30d_kg: settled30d._sum.final_weight ? Number(settled30d._sum.final_weight) : 0,
      transactions_last_30d: settled30d._count._all,
    },
    traceability: {
      handover_records: handovers,
      recycler_confirmed: confirmedHandovers,
      awaiting_confirmation: handovers - confirmedHandovers,
      confirmation_rate_percent: handovers
        ? Math.round((confirmedHandovers / handovers) * 1000) / 10
        : 0,
    },
    datasets: {
      material_categories: categoryCount,
      ai_training_samples: trainingSamples,
      price_observations: priceObservations,
    },
  };
}

/**
 * Volume + value per material category, for the admin analytics charts.
 */
async function getCategoryBreakdown() {
  const categories = await prisma.material_categories.findMany({
    where: { parent_id: null },
    select: { id: true, name: true, code: true, hazard_level: true },
    orderBy: { name: 'asc' },
  });

  return Promise.all(
    categories.map(async (cat) => {
      const [lots, completed, latestPrice] = await Promise.all([
        prisma.lots.aggregate({
          where: { category_id: cat.id },
          _count: { _all: true },
          _sum: { approximate_weight: true },
        }),
        prisma.transactions.aggregate({
          where: { status: TRANSACTION_STATUS.COMPLETED, lot: { category_id: cat.id } },
          _count: { _all: true },
          _sum: { final_price: true, final_weight: true },
        }),
        prisma.price_history.findFirst({
          where: { category_id: cat.id },
          orderBy: { recorded_at: 'desc' },
          select: { buying_price: true, recorded_at: true },
        }),
      ]);

      return {
        category_id: cat.id,
        name: cat.name,
        code: cat.code,
        hazard_level: cat.hazard_level,
        lot_count: lots._count._all,
        declared_weight_kg: lots._sum.approximate_weight ? Number(lots._sum.approximate_weight) : 0,
        completed_transactions: completed._count._all,
        settled_value: completed._sum.final_price ? Number(completed._sum.final_price) : 0,
        settled_weight_kg: completed._sum.final_weight ? Number(completed._sum.final_weight) : 0,
        current_price: latestPrice ? Number(latestPrice.buying_price) : null,
        price_updated_at: latestPrice?.recorded_at || null,
      };
    })
  );
}

/**
 * Daily lot/transaction/value counts over a window, for trend charts.
 *
 * @param {number} [days=30]
 */
async function getActivityTrend(days = 30) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  since.setHours(0, 0, 0, 0);

  const [lots, completions] = await Promise.all([
    prisma.lots.findMany({
      where: { created_at: { gte: since } },
      select: { created_at: true, approximate_weight: true },
    }),
    prisma.transactions.findMany({
      where: { status: TRANSACTION_STATUS.COMPLETED, completed_at: { gte: since } },
      select: { completed_at: true, final_price: true, final_weight: true },
    }),
  ]);

  // Pre-seed every day in the window so charts have no gaps.
  const buckets = new Map();
  for (let i = days; i >= 0; i--) {
    const d = new Date(since);
    d.setDate(since.getDate() + (days - i));
    buckets.set(d.toISOString().slice(0, 10), {
      date: d.toISOString().slice(0, 10),
      lots: 0,
      lot_weight_kg: 0,
      completed: 0,
      value: 0,
      settled_weight_kg: 0,
    });
  }

  for (const lot of lots) {
    const key = lot.created_at.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) {
      b.lots += 1;
      b.lot_weight_kg += Number(lot.approximate_weight || 0);
    }
  }

  for (const tx of completions) {
    const key = tx.completed_at.toISOString().slice(0, 10);
    const b = buckets.get(key);
    if (b) {
      b.completed += 1;
      b.value += Number(tx.final_price || 0);
      b.settled_weight_kg += Number(tx.final_weight || 0);
    }
  }

  return Array.from(buckets.values()).map((b) => ({
    ...b,
    lot_weight_kg: Math.round(b.lot_weight_kg * 100) / 100,
    value: Math.round(b.value * 100) / 100,
    settled_weight_kg: Math.round(b.settled_weight_kg * 100) / 100,
  }));
}

/**
 * Recyclers ranked by settled volume — who is actually absorbing material.
 */
async function getRecyclerLeaderboard({ take = 10 } = {}) {
  const recyclers = await prisma.recyclers.findMany({
    where: { authorization_status: 'authorized' },
    select: {
      id: true,
      business_name: true,
      address: true,
      pickup_available: true,
      _count: { select: { transactions: true, recycler_materials: true } },
    },
  });

  const enriched = await Promise.all(
    recyclers.map(async (r) => {
      const settled = await prisma.transactions.aggregate({
        where: { recycler_id: r.id, status: TRANSACTION_STATUS.COMPLETED },
        _sum: { final_price: true, final_weight: true },
        _count: { _all: true },
      });

      return {
        recycler_id: r.id,
        business_name: r.business_name,
        address: r.address,
        pickup_available: r.pickup_available,
        materials_accepted: r._count.recycler_materials,
        total_transactions: r._count.transactions,
        completed_transactions: settled._count._all,
        settled_value: settled._sum.final_price ? Number(settled._sum.final_price) : 0,
        settled_weight_kg: settled._sum.final_weight ? Number(settled._sum.final_weight) : 0,
      };
    })
  );

  enriched.sort((a, b) => b.settled_value - a.settled_value);
  return enriched.slice(0, take);
}

/**
 * Transactions flagged as anomalous or stuck — the admin's attention queue.
 */
async function getAttentionQueue() {
  const staleCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

  const [disputed, unconfirmedHandovers, staleQuotes, pendingRecyclers] = await Promise.all([
    prisma.transactions.findMany({
      where: { status: TRANSACTION_STATUS.DISPUTED },
      select: {
        id: true,
        status: true,
        offered_price: true,
        final_price: true,
        created_at: true,
        updated_at: true,
        collector: { select: { id: true, phone: true } },
        recycler: { select: { id: true, business_name: true } },
        lot: { select: { id: true, category: { select: { name: true, code: true } } } },
      },
      orderBy: { updated_at: 'desc' },
      take: 25,
    }),
    prisma.traceability.findMany({
      where: { recycler_confirmed: false, handover_timestamp: { lt: staleCutoff } },
      select: {
        id: true,
        handover_reference_number: true,
        handover_timestamp: true,
        actual_weight: true,
        transaction: {
          select: {
            id: true,
            status: true,
            recycler: { select: { id: true, business_name: true } },
            collector: { select: { id: true, phone: true } },
          },
        },
      },
      orderBy: { handover_timestamp: 'asc' },
      take: 25,
    }),
    prisma.transactions.findMany({
      where: { status: TRANSACTION_STATUS.QUOTED, created_at: { lt: staleCutoff } },
      select: {
        id: true,
        offered_price: true,
        created_at: true,
        recycler: { select: { id: true, business_name: true } },
        lot: { select: { id: true, category: { select: { name: true, code: true } } } },
      },
      orderBy: { created_at: 'asc' },
      take: 25,
    }),
    prisma.recyclers.findMany({
      where: { authorization_status: 'pending' },
      select: {
        id: true,
        business_name: true,
        registration_number: true,
        contact_email: true,
        contact_phone: true,
        address: true,
        created_at: true,
      },
      orderBy: { created_at: 'asc' },
      take: 25,
    }),
  ]);

  return {
    disputed_transactions: disputed,
    unconfirmed_handovers: unconfirmedHandovers,
    stale_quotes: staleQuotes,
    recyclers_awaiting_verification: pendingRecyclers,
    counts: {
      disputed: disputed.length,
      unconfirmed_handovers: unconfirmedHandovers.length,
      stale_quotes: staleQuotes.length,
      pending_verification: pendingRecyclers.length,
    },
  };
}

module.exports = {
  getPlatformStats,
  getCategoryBreakdown,
  getActivityTrend,
  getRecyclerLeaderboard,
  getAttentionQueue,
};
