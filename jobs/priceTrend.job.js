/**
 * Price Trend Job
 * Periodic computation and caching of price trends.
 * Runs via node-cron.
 */
const cron = require('node-cron');
const prisma = require('../config/db');
const Price = require('../models/Price');
const logger = require('../utils/logger');

/**
 * Aggregate recycler_materials rates into price_history.
 * This runs periodically to keep price_history current with recycler rates.
 */
async function aggregateRecyclerPrices() {
  logger.info('🕐 Price trend job started');

  try {
    // Get all recycler_materials grouped by category
    const rates = await prisma.recycler_materials.findMany({
      where: {
        recycler: {
          authorization_status: 'authorized',
        },
      },
      include: {
        category: { select: { id: true, code: true } },
        recycler: { select: { address: true } },
      },
    });

    if (!rates.length) {
      logger.info('No recycler rates found — skipping price trend aggregation');
      return;
    }

    // Group by category and compute average
    const categoryMap = new Map();
    for (const rate of rates) {
      if (!categoryMap.has(rate.category_id)) {
        categoryMap.set(rate.category_id, { sum: 0, count: 0, locations: new Set() });
      }
      const entry = categoryMap.get(rate.category_id);
      entry.sum += Number(rate.buying_price);
      entry.count += 1;
      if (rate.recycler?.address) {
        entry.locations.add(rate.recycler.address);
      }
    }

    // Write aggregated prices to price_history
    let recorded = 0;
    for (const [category_id, { sum, count }] of categoryMap) {
      const avgPrice = Math.round((sum / count) * 100) / 100;
      await Price.record({
        category_id,
        buying_price: avgPrice,
        source: 'recycler_aggregate',
        location: 'all',
      });
      recorded++;
    }

    logger.info(`✅ Price trend job completed: ${recorded} categories updated`);
  } catch (err) {
    logger.error('❌ Price trend job failed', { error: err.message });
  }
}

/**
 * Schedule the price trend job.
 * Runs every 6 hours by default.
 */
function schedulePriceTrendJob() {
  const schedule = process.env.PRICE_TREND_CRON || '0 */6 * * *';
  cron.schedule(schedule, aggregateRecyclerPrices);
  logger.info(`📊 Price trend job scheduled: ${schedule}`);
}

module.exports = { schedulePriceTrendJob, aggregateRecyclerPrices };
