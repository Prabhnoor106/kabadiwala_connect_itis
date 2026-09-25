/**
 * Database Verification
 * Confirms the connection works, the schema is complete, the additive
 * migration landed, and reports row counts per table.
 *
 *   npm run db:verify
 *
 * Read-only: writes nothing.
 */
require('dotenv').config();

const prisma = require('../config/db');

const TABLES = [
  ['collectors', () => prisma.collectors.count()],
  ['material_categories', () => prisma.material_categories.count()],
  ['lots', () => prisma.lots.count()],
  ['recyclers', () => prisma.recyclers.count()],
  ['recycler_materials', () => prisma.recycler_materials.count()],
  ['price_history', () => prisma.price_history.count()],
  ['transactions', () => prisma.transactions.count()],
  ['traceability', () => prisma.traceability.count()],
  ['traceability_photos', () => prisma.traceability_photos.count()],
  ['ai_training_samples', () => prisma.ai_training_samples.count()],
  ['ml_feedback', () => prisma.ml_feedback.count()],
  ['sync_log', () => prisma.sync_log.count()],
  ['admins', () => prisma.admins.count()],
];

async function main() {
  const url = process.env.DATABASE_URL || '';
  let host = 'unknown';
  try {
    host = new URL(url).host;
  } catch {
    /* leave as unknown — never print the raw URL */
  }

  console.log(`\n🔍 Verifying database at ${host}\n`);

  // 1. Connectivity
  const started = Date.now();
  await prisma.$queryRaw`SELECT 1`;
  console.log(`✅ Connection OK (${Date.now() - started} ms)\n`);

  // 2. Schema completeness + row counts
  console.log('Table                    Rows');
  console.log('─'.repeat(38));

  let failures = 0;
  let totalRows = 0;

  for (const [name, count] of TABLES) {
    try {
      const n = await count();
      totalRows += n;
      console.log(`${name.padEnd(24)} ${String(n).padStart(6)}`);
    } catch (err) {
      failures++;
      console.log(`${name.padEnd(24)} ${'ERROR'.padStart(6)}  ${err.message.split('\n')[0]}`);
    }
  }

  console.log('─'.repeat(38));
  console.log(`${'total'.padEnd(24)} ${String(totalRows).padStart(6)}\n`);

  // 3. Additive migration checks
  const checks = [];

  const [{ count: disputedOk }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'transaction_status' AND e.enumlabel = 'disputed'`;
  checks.push(['transaction_status has `disputed`', disputedOk === 1]);

  const newColumns = await prisma.$queryRaw`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'recyclers'  AND column_name IN ('password_hash', 'email_verified'))
        OR (table_name = 'collectors' AND column_name = 'pin_hash')
      )`;
  const has = (t, c) => newColumns.some((r) => r.table_name === t && r.column_name === c);
  checks.push(['recyclers.password_hash', has('recyclers', 'password_hash')]);
  checks.push(['recyclers.email_verified', has('recyclers', 'email_verified')]);
  checks.push(['collectors.pin_hash', has('collectors', 'pin_hash')]);

  const [{ count: adminsOk }] = await prisma.$queryRaw`
    SELECT COUNT(*)::int AS count FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'admins'`;
  checks.push(['admins table', adminsOk === 1]);

  console.log('Additive migration');
  console.log('─'.repeat(38));
  for (const [label, ok] of checks) {
    console.log(`${ok ? '✅' : '✖ '} ${label}`);
    if (!ok) failures++;
  }
  console.log('');

  // 4. Referential sanity — catch orphaned rows early.
  // The FKs are NOT NULL and DB-enforced, so orphans should be impossible; we
  // assert it with a real anti-join (a child whose parent row is missing)
  // rather than a null-FK filter, which Prisma rejects for a required relation.
  const [{ orphans }] = await prisma.$queryRaw`
    SELECT (
      (SELECT count(*) FROM lots l          LEFT JOIN collectors   c ON c.id = l.collector_id   WHERE c.id IS NULL) +
      (SELECT count(*) FROM transactions t  LEFT JOIN lots         l ON l.id = t.lot_id          WHERE l.id IS NULL) +
      (SELECT count(*) FROM traceability tr LEFT JOIN transactions t ON t.id = tr.transaction_id WHERE t.id IS NULL)
    )::int AS orphans`;
  console.log(`${orphans === 0 ? '✅' : '⚠ '} Referential integrity: ${orphans} orphaned row(s)\n`);

  if (failures > 0) {
    console.error(`✖ Verification found ${failures} problem(s). Run: npm run db:setup\n`);
    process.exit(1);
  }

  const seeded = totalRows > 0;
  console.log(
    seeded
      ? '✅ Database verified and populated.\n'
      : '✅ Database verified but empty. Run: npm run db:seed\n'
  );
}

main()
  .catch((err) => {
    console.error('\n✖ Verification failed:', err.message);
    if (err.message.includes('Environment variable not found')) {
      console.error('   Set DATABASE_URL in .env\n');
    } else if (/Can't reach database|ECONNREFUSED|ENOTFOUND/i.test(err.message)) {
      console.error('   The database host is unreachable. Check DATABASE_URL and connectivity.\n');
    } else if (/does not exist|relation .* does not exist/i.test(err.message)) {
      console.error('   Schema not applied yet. Run: npm run db:setup\n');
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
