/**
 * MLFeedback Model — thin Prisma wrapper
 * Ground-truth corrections for AI model retraining.
 * Table: ml_feedback (§7 addition, not in original 01_schema.sql)
 */
const prisma = require('../config/db');

const MLFeedback = {
  /**
   * Submit a correction/feedback for a training sample.
   */
  async create({
    training_sample_id,
    corrected_category,
    corrected_weight,
    corrected_price,
    feedback_source = 'collector',
    notes,
  }) {
    return prisma.ml_feedback.create({
      data: {
        training_sample_id,
        corrected_category,
        corrected_weight,
        corrected_price,
        feedback_source,
        notes,
      },
    });
  },

  /**
   * Get all unapplied feedback (for the retrain job to consume).
   */
  async getUnapplied() {
    return prisma.ml_feedback.findMany({
      where: { applied_to_model: false },
      include: {
        training_sample: true,
      },
      orderBy: { created_at: 'asc' },
    });
  },

  /**
   * Mark feedback as applied after retraining.
   */
  async markApplied(ids) {
    return prisma.ml_feedback.updateMany({
      where: { id: { in: ids } },
      data: { applied_to_model: true },
    });
  },

  /**
   * Get feedback for a specific training sample.
   */
  async findBySampleId(training_sample_id) {
    return prisma.ml_feedback.findMany({
      where: { training_sample_id },
      orderBy: { created_at: 'desc' },
    });
  },
};

module.exports = MLFeedback;
