/**
 * Server Entry Point
 * Starts the HTTP server and initializes cron jobs.
 */
const app = require('./app');
const logger = require('./utils/logger');
const { schedulePriceTrendJob } = require('./jobs/priceTrend.job');
const { scheduleModelRetrainJob } = require('./jobs/modelRetrain.job');

const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => {
  logger.info(`🚀 Kabadiwala Connect API running on port ${PORT}`);
  logger.info(`📋 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🏥 Health check: http://localhost:${PORT}/api/health`);

  // Initialize cron jobs
  schedulePriceTrendJob();
  scheduleModelRetrainJob();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received. Shutting down gracefully...');
  process.exit(0);
});

// Unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection', { error: err.message, stack: err.stack });
});
