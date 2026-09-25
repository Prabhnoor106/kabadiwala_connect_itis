/**
 * Express Application Setup
 * Middleware stack, route mounting, and error handler.
 */
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const compression = require('compression');
const path = require('path');

const errorHandler = require('./middleware/errorHandler.middleware');
const logger = require('./utils/logger');

// Route imports
const authRoutes = require('./routes/auth.routes');
const materialRoutes = require('./routes/material.routes');
const priceRoutes = require('./routes/price.routes');
const recyclerRoutes = require('./routes/recycler.routes');
const transactionRoutes = require('./routes/transaction.routes');
const ledgerRoutes = require('./routes/ledger.routes');
const adminRoutes = require('./routes/admin.routes');
const traceabilityRoutes = require('./routes/traceability.routes');
const syncRoutes = require('./routes/sync.routes');
const safetyRoutes = require('./routes/safety.routes');
const uploadRoutes = require('./routes/upload.routes');

// Matching handler (mounted as a lot sub-resource)
const { getMatches } = require('./controllers/recycler.controller');
const { authenticate } = require('./middleware/auth.middleware');

const app = express();

// ======================== MIDDLEWARE STACK ========================

// Security headers. crossOriginResourcePolicy is relaxed so the Vite dev
// server on another port can display images served from /uploads.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
  })
);

// CORS — comma-separated allowlist in CORS_ORIGIN, or '*' in development.
const corsOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: corsOrigins.length ? corsOrigins : '*',
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Response compression
app.use(compression());

// Request logging
app.use(
  morgan('dev', {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for local uploads (dev fallback when ImageKit is off)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ======================== HEALTH CHECK ========================

app.get('/api/health', async (req, res) => {
  const prisma = require('./config/db');

  let database = 'unknown';
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = 'connected';
  } catch (err) {
    database = 'unreachable';
    logger.error('Health check: database unreachable', { error: err.message });
  }

  const healthy = database === 'connected';

  res.status(healthy ? 200 : 503).json({
    success: healthy,
    message: 'Kabadiwala Connect API',
    database,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
  });
});

// ======================== ROUTES ========================

app.use('/api/auth', authRoutes);
app.use('/api', materialRoutes); // /api/categories, /api/lots/*
app.use('/api/prices', priceRoutes);
app.use('/api/recyclers', recyclerRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/collectors', ledgerRoutes); // /api/collectors/:id/ledger
app.use('/api/admin', adminRoutes);
app.use('/api/traceability', traceabilityRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/safety', safetyRoutes);
app.use('/api/upload', uploadRoutes);

// Recycler matching — logically a lot sub-resource
app.get('/api/lots/:id/matches', authenticate, getMatches);

// ======================== 404 HANDLER ========================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route not found: ${req.method} ${req.originalUrl}`,
  });
});

// ======================== ERROR HANDLER (must be last) ========================

app.use(errorHandler);

module.exports = app;
