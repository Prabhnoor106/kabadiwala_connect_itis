/**
 * Model Retrain Job
 * Triggers external AI service retraining when enough new training data exists.
 */
const cron = require('node-cron');
const MLFeedback = require('../models/MLFeedback');
const { triggerRetrain, getTrainingSamples } = require('../services/ai.service');
const logger = require('../utils/logger');

/**
 * Check for unapplied feedback and trigger retraining if threshold met.
 */
async function checkAndRetrain() {
  logger.info('🕐 Model retrain job started');

  try {
    // Get unapplied feedback count
    const unapplied = await MLFeedback.getUnapplied();
    const feedbackCount = unapplied.length;

    // Get recent training samples count
    const samples = await getTrainingSamples({ limit: 1000 });
    const sampleCount = samples.length;

    const RETRAIN_THRESHOLD = parseInt(process.env.RETRAIN_THRESHOLD, 10) || 50;

    logger.info('Model retrain check', {
      unapplied_feedback: feedbackCount,
      total_samples: sampleCount,
      threshold: RETRAIN_THRESHOLD,
    });

    if (feedbackCount >= RETRAIN_THRESHOLD || sampleCount >= RETRAIN_THRESHOLD * 2) {
      logger.info('🔄 Triggering model retrain...');

      const result = await triggerRetrain();

      if (result) {
        // Mark feedback as applied
        const feedbackIds = unapplied.map((f) => f.id);
        if (feedbackIds.length > 0) {
          await MLFeedback.markApplied(feedbackIds);
          logger.info(`✅ Marked ${feedbackIds.length} feedback entries as applied`);
        }
        logger.info('✅ Model retrain triggered successfully', { job_id: result.job_id });
      } else {
        logger.warn('⚠️ Model retrain trigger returned null — AI service may be unavailable');
      }
    } else {
      logger.info('📊 Retrain threshold not met — skipping');
    }
  } catch (err) {
    logger.error('❌ Model retrain job failed', { error: err.message });
  }
}

/**
 * Schedule the model retrain job.
 * Runs daily at 2 AM by default.
 */
function scheduleModelRetrainJob() {
  const schedule = process.env.MODEL_RETRAIN_CRON || '0 2 * * *';
  cron.schedule(schedule, checkAndRetrain);
  logger.info(`🤖 Model retrain job scheduled: ${schedule}`);
}

module.exports = { scheduleModelRetrainJob, checkAndRetrain };
