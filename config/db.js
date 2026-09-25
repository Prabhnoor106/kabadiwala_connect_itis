/**
 * Prisma Client Singleton
 * Prevents connection exhaustion during development with hot-reload.
 *
 * Resilience: this deployment reaches Postgres through a WebSocket tunnel
 * (scripts/pgProxy.js) because the host network firewalls the Postgres port.
 * Tunnelled connections are occasionally recycled by the relay, surfacing as a
 * transient "Server has closed the connection" (P1017). A thin client
 * extension transparently retries such errors for reads and idempotent writes,
 * so a dropped pooled connection never fails a user request. Non-idempotent
 * single-row writes (create/update/delete) are NOT retried, so interactive
 * transactions keep their all-or-nothing semantics.
 */
const { PrismaClient } = require('@prisma/client');

/** Operations that are safe to replay on a fresh connection. */
const RETRYABLE_OPERATIONS = new Set([
  'findMany', 'findFirst', 'findFirstOrThrow', 'findUnique', 'findUniqueOrThrow',
  'count', 'aggregate', 'groupBy',
  'createMany', 'upsert',
  '$queryRaw', '$queryRawUnsafe', '$executeRaw', '$executeRawUnsafe',
]);

const MAX_RETRIES = 5;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** True for transient connectivity failures worth retrying. */
function isTransientConnectionError(err) {
  const code = err && err.code;
  if (code === 'P1017' || code === 'P1001' || code === 'P1002') return true;
  const msg = (err && err.message) || '';
  return (
    /Server has closed the connection/i.test(msg) ||
    /kind:\s*Closed/i.test(msg) ||
    /Can't reach database server/i.test(msg) ||
    /Connection reset|ECONNRESET|EPIPE|socket hang up/i.test(msg)
  );
}

/** Wrap a base client with transparent retry of transient tunnel drops. */
function withRetry(base) {
  return base.$extends({
    name: 'tunnel-retry',
    query: {
      async $allOperations({ operation, args, query }) {
        if (!RETRYABLE_OPERATIONS.has(operation)) {
          return query(args);
        }
        let lastErr;
        for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
          try {
            return await query(args);
          } catch (err) {
            if (!isTransientConnectionError(err) || attempt === MAX_RETRIES) {
              throw err;
            }
            lastErr = err;
            await sleep(150 * (attempt + 1));
          }
        }
        throw lastErr;
      },
    },
  });
}

/** @type {PrismaClient} */
let prisma;

if (process.env.NODE_ENV === 'production') {
  prisma = withRetry(new PrismaClient({ log: ['error'] }));
} else {
  // Reuse the same client across hot-reloads in development
  if (!global.__prisma) {
    global.__prisma = withRetry(
      new PrismaClient({ log: ['warn', 'error'] })
    );
  }
  prisma = global.__prisma;
}

module.exports = prisma;
