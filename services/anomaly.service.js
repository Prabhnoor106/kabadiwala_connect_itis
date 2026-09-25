/**
 * Anomaly Service
 * Flags abnormal transaction values using simple statistical detection,
 * with optional delegation to the AI service for smarter analysis.
 */
const prisma = require('../config/db');
const aiService = require('./ai.service');
const logger = require('../utils/logger');

/**
 * Check if a transaction's values are anomalous.
 * Uses a simple Z-score approach against recent price history as a fallback.
 *
 * @param {Object} params
 * @param {string} params.category_id
 * @param {number} params.weight
 * @param {number} params.price
 * @param {string} [params.location]
 * @returns {Promise<{ is_anomaly: boolean, confidence: number, reason: string }>}
 */
async function checkTransaction({ category_id, weight, price, location }) {
  // 1. Try the AI service first
  const aiResult = await aiService.detectAnomaly({ category_id, weight, price, location });
  if (aiResult) {
    return aiResult;
  }

  // 2. Fallback: simple statistical outlier detection
  return fallbackCheck({ category_id, weight, price, location });
}

/**
 * Simple statistical anomaly check.
 * Flags transactions where price_per_kg is > 2 standard deviations from the mean.
 */
async function fallbackCheck({ category_id, weight, price }) {
  if (!weight || weight <= 0) {
    return { is_anomaly: true, confidence: 0.9, reason: 'Invalid weight (zero or negative)' };
  }

  const pricePerKg = price / weight;

  // Get recent price history for this category
  const since = new Date();
  since.setDate(since.getDate() - 30);

  const history = await prisma.price_history.findMany({
    where: {
      category_id,
      recorded_at: { gte: since },
    },
    select: { buying_price: true },
  });

  if (history.length < 3) {
    // Not enough data to detect anomalies
    logger.info('Insufficient price history for anomaly detection', { category_id, count: history.length });
    return { is_anomaly: false, confidence: 0, reason: 'Insufficient data for anomaly detection' };
  }

  // Compute mean and standard deviation
  const prices = history.map((h) => Number(h.buying_price));
  const mean = prices.reduce((a, b) => a + b, 0) / prices.length;
  const variance = prices.reduce((sum, p) => sum + (p - mean) ** 2, 0) / prices.length;
  const stdDev = Math.sqrt(variance);

  // Z-score of the transaction's price_per_kg
  const zScore = stdDev > 0 ? Math.abs(pricePerKg - mean) / stdDev : 0;

  if (zScore > 3) {
    return {
      is_anomaly: true,
      confidence: Math.min(0.95, 0.5 + zScore * 0.1),
      reason: `Price ₹${pricePerKg.toFixed(2)}/kg is ${zScore.toFixed(1)} std devs from mean ₹${mean.toFixed(2)}/kg`,
    };
  }

  if (zScore > 2) {
    return {
      is_anomaly: true,
      confidence: Math.min(0.8, 0.3 + zScore * 0.1),
      reason: `Price ₹${pricePerKg.toFixed(2)}/kg is ${zScore.toFixed(1)} std devs from mean ₹${mean.toFixed(2)}/kg (borderline)`,
    };
  }

  return { is_anomaly: false, confidence: 0, reason: 'Within normal range' };
}

module.exports = { checkTransaction };
