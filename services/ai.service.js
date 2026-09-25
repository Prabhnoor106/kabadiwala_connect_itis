/**
 * AI Service
 * Integration seam for a future ML model service. Contains no inline ML code
 * and no simulated predictions.
 *
 * ── Current state ────────────────────────────────────────────────────────────
 * No trained model exists in this project. Every AI entry point here is
 * DISABLED by default and returns null, which makes callers fall through to the
 * documented rule-based paths:
 *
 *   valuation           → pricing.service.estimateLotValue (price × weight × condition)
 *   anomaly detection   → anomaly.service statistical Z-score check
 *   classification      → not available; the collector picks the category
 *
 * Nothing in this file ever fabricates a confidence score or a class label.
 * A caller either gets a real answer from a real model service or it gets null
 * and says so in its own response.
 *
 * ── Enabling a real model later ───────────────────────────────────────────────
 * Set AI_SERVICE_ENABLED=true and AI_SERVICE_BASE_URL to a service exposing:
 *
 *   POST /api/classify        { image_url, weight?, location? }
 *                             → { category_code, confidence, estimated_value? }
 *   POST /api/anomaly/detect  { category_id, weight, price, location? }
 *                             → { is_anomaly, confidence, reason }
 *   POST /api/retrain         → { job_id, status }
 *
 * Training data accrues regardless: saveTrainingSample() records every
 * completed transaction as labelled ground truth (image + category + verified
 * weight + settled price + location), which is the dataset such a model would
 * be trained on. See GET /api/admin/datasets for its growth.
 * ────────────────────────────────────────────────────────────────────────────
 */
const axios = require('axios');
const prisma = require('../config/db');
const logger = require('../utils/logger');

const AI_BASE_URL = process.env.AI_SERVICE_BASE_URL || 'http://localhost:8000';
const AI_API_KEY = process.env.AI_SERVICE_API_KEY || '';

/**
 * Whether a model service is configured. Off unless explicitly enabled, so a
 * fresh checkout never waits on a service that isn't running.
 */
const AI_ENABLED = process.env.AI_SERVICE_ENABLED === 'true';

/**
 * Report what the AI layer can actually do right now.
 * Surfaced through the admin dataset endpoint so the platform's ML maturity is
 * stated rather than implied.
 */
function getCapabilities() {
  return {
    enabled: AI_ENABLED,
    base_url: AI_ENABLED ? AI_BASE_URL : null,
    model_status: AI_ENABLED ? 'external_service_configured' : 'no_trained_model',
    features: {
      material_classification: AI_ENABLED ? 'delegated_to_service' : 'unavailable_user_selects_category',
      valuation: AI_ENABLED ? 'delegated_to_service' : 'rule_based_price_x_weight',
      anomaly_detection: AI_ENABLED ? 'delegated_to_service' : 'statistical_zscore',
      recycler_matching: 'deterministic_weighted_score',
    },
    training_data_collection: 'active',
  };
}

/**
 * Create an axios instance configured for the AI service.
 */
const aiClient = axios.create({
  baseURL: AI_BASE_URL,
  timeout: Number(process.env.AI_SERVICE_TIMEOUT_MS) || 8000,
  headers: {
    'Content-Type': 'application/json',
    ...(AI_API_KEY && { 'X-API-Key': AI_API_KEY }),
  },
});

/**
 * Classify an image and estimate value via the AI service.
 *
 * @param {Object} params
 * @param {string} params.image_url - URL of the image to classify
 * @param {number} [params.weight] - Approximate weight
 * @param {string} [params.location] - Location for price context
 * @returns {Promise<{ category_code, confidence, estimated_value } | null>}
 */
async function classifyAndEstimate({ image_url, weight, location }) {
  // No model configured — return null so the caller uses its documented rule
  // instead. Never invent a category or a confidence score here.
  if (!AI_ENABLED) return null;

  try {
    const response = await aiClient.post('/api/classify', { image_url, weight, location });

    // Only trust a well-formed answer; a malformed one is no answer.
    const { category_code, confidence } = response.data || {};
    if (!category_code || typeof confidence !== 'number') {
      logger.warn('AI classify returned an unusable payload — ignoring', { image_url });
      return null;
    }

    return { ...response.data, source: 'external_model_service' };
  } catch (err) {
    logger.warn('AI classification unavailable, using rule-based valuation', {
      error: err.message,
      image_url,
    });
    return null;
  }
}

/**
 * Detect anomalies in a transaction via the AI service.
 *
 * @param {Object} params
 * @param {string} params.category_id
 * @param {number} params.weight
 * @param {number} params.price
 * @param {string} [params.location]
 * @returns {Promise<{ is_anomaly, confidence, reason } | null>}
 */
async function detectAnomaly({ category_id, weight, price, location }) {
  // Falls through to the statistical check in anomaly.service.
  if (!AI_ENABLED) return null;

  try {
    const response = await aiClient.post('/api/anomaly/detect', {
      category_id,
      weight,
      price,
      location,
    });

    const { is_anomaly } = response.data || {};
    if (typeof is_anomaly !== 'boolean') {
      logger.warn('AI anomaly service returned an unusable payload — ignoring');
      return null;
    }

    return { ...response.data, source: 'external_model_service' };
  } catch (err) {
    logger.warn('AI anomaly detection unavailable, using statistical check', {
      error: err.message,
    });
    return null;
  }
}

/**
 * Trigger model retraining on the AI service.
 *
 * @returns {Promise<{ job_id, status } | null>}
 */
async function triggerRetrain() {
  if (!AI_ENABLED) {
    logger.info('Retrain skipped — no model service configured (AI_SERVICE_ENABLED is not true)');
    return null;
  }

  try {
    const response = await aiClient.post('/api/retrain');
    logger.info('Model retrain triggered', { job_id: response.data?.job_id });
    return response.data;
  } catch (err) {
    logger.error('Failed to trigger model retrain', { error: err.message });
    return null;
  }
}

/**
 * Save a completed lot/transaction as a training sample.
 *
 * @param {Object} params
 * @param {string} params.image_url
 * @param {string} [params.category_id]
 * @param {number} [params.weight]
 * @param {number} [params.price]
 * @param {string} [params.location]
 * @param {string} [params.source='lot_completion']
 * @param {string} [params.quality_notes]
 * @param {string} [params.lot_id]
 */
async function saveTrainingSample({
  image_url,
  category_id,
  weight,
  price,
  location,
  source = 'lot_completion',
  quality_notes,
  lot_id,
}) {
  try {
    return await prisma.ai_training_samples.create({
      data: {
        image_url,
        category_id,
        weight,
        price,
        location,
        source,
        quality_notes,
        lot_id,
      },
    });
  } catch (err) {
    logger.error('Failed to save training sample', { error: err.message });
    return null;
  }
}

/**
 * Get training samples for export to the AI service.
 */
async function getTrainingSamples({ limit = 100, source } = {}) {
  const where = {};
  if (source) where.source = source;

  return prisma.ai_training_samples.findMany({
    where,
    orderBy: { created_at: 'desc' },
    take: limit,
  });
}

module.exports = {
  classifyAndEstimate,
  detectAnomaly,
  triggerRetrain,
  saveTrainingSample,
  getTrainingSamples,
  getCapabilities,
  AI_ENABLED,
};
