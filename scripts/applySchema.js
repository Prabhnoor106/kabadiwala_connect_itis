/**
 * Database Setup
 * Applies 01_schema.sql then 02_migration_additive.sql over the DATABASE_URL
 * connection, using the `pg` driver so no local psql binary is required.
 *
 *   npm run db:setup
 *
 * Both files are written to be idempotent (IF NOT EXISTS / ADD VALUE IF NOT
 * EXISTS), so re-running is safe. Statements that fail because an object
 * already exists are reported and skipped rather than aborting the run.
 */
require('dotenv').config();

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = ['01_schema.sql', '02_migration_additive.sql'];

/** Postgres error codes that mean "already there" — safe to skip. */
const ALREADY_EXISTS = new Set([
  '42710', // duplicate_object (type, etc.)
  '42P07', // duplicate_table
  '42701', // duplicate_column
  '42P06', // duplicate_schema
  '42723', // duplicate_function
]);

/**
 * Split a SQL file into individual statements.
 *
 * Splitting on ';' is only safe because these files contain no functions,
 * triggers or dollar-quoted bodies. It does respect string literals and
 * comments so a semicolon inside them doesn't split a statement.
 */
function splitStatements(sql) {
  const statements = [];
  let current = '';
  let inSingle = false;
  let inLineComment = false;
  let inBlockComment = false;

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    const next = sql[i + 1];

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      continue;
    }
    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i++;
        inBlockComment = false;
      }
      continue;
    }
    if (!inSingle && ch === '-' && next === '-') {
      inLineComment = true;
      current += ch;
      continue;
    }
    if (!inSingle && ch === '/' && next === '*') {
      inBlockComment = true;
      current += ch;
      continue;
    }
    if (ch === "'") {
      inSingle = !inSingle;
      current += ch;
      continue;
    }
    if (ch === ';' && !inSingle) {
      statements.push(current);
      current = '';
      continue;
    }
    current += ch;
  }

  if (current.trim()) statements.push(current);

  // Drop entries that are only comments/whitespace.
  return statements
    .map((s) => s.trim())
    .filter((s) => s && !s.split('\n').every((line) => !line.trim() || line.trim().startsWith('--')));
}

/** One-line summary of a statement, for log output. */
function describe(stmt) {
  const meaningful = stmt
    .split('\n')
    .filter((l) => l.trim() && !l.trim().startsWith('--'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
  return meaningful.length > 78 ? `${meaningful.slice(0, 75)}...` : meaningful;
}

async function main() {
  const url = process.env.DATABASE_URL;

  if (!url) {
    console.error('\n✖ DATABASE_URL is not set. Add it to .env first.\n');
    process.exit(1);
  }
  if (!/^postgres(ql)?:\/\//.test(url)) {
    console.error(
      `\n✖ DATABASE_URL must be a PostgreSQL connection string.\n` +
        `  Found: ${url.split(':')[0]}:...\n` +
        `  Expected: postgresql://user:password@host:5432/database\n`
    );
    process.exit(1);
  }

  let Client;
  try {
    ({ Client } = require('pg'));
  } catch {
    console.error('\n✖ The `pg` package is required. Run: npm install\n');
    process.exit(1);
  }

  // Supabase and most hosted Postgres require TLS; their certs are not in
  // Node's default trust store, hence rejectUnauthorized: false.
  const needsSsl = /supabase|neon|render|amazonaws|azure|heroku/i.test(url) ||
    process.env.PGSSLMODE === 'require';

  const client = new Client({
    connectionString: url,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  });

  // Never print credentials.
  const safeHost = (() => {
    try {
      return new URL(url).host;
    } catch {
      return 'configured host';
    }
  })();

  console.log(`\n🔌 Connecting to ${safeHost} ...`);
  await client.connect();

  const version = await client.query('SELECT version()');
  console.log(`✅ Connected — ${version.rows[0].version.split(',')[0]}\n`);

  // pgcrypto backs gen_random_uuid() on older servers; PG13+ has it built in.
  try {
    await client.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
  } catch (err) {
    console.log(`   (pgcrypto not enabled: ${err.message} — continuing)`);
  }

  let totalRun = 0;
  let totalSkipped = 0;

  for (const file of FILES) {
    const filePath = path.join(ROOT, file);
    if (!fs.existsSync(filePath)) {
      console.log(`⚠  ${file} not found — skipping`);
      continue;
    }

    const statements = splitStatements(fs.readFileSync(filePath, 'utf8'));
    console.log(`📄 ${file} — ${statements.length} statements`);

    for (const stmt of statements) {
      try {
        await client.query(stmt);
        totalRun++;
        console.log(`   ✅ ${describe(stmt)}`);
      } catch (err) {
        if (ALREADY_EXISTS.has(err.code)) {
          totalSkipped++;
          console.log(`   ⏭  exists — ${describe(stmt)}`);
        } else {
          console.error(`\n   ✖ Failed: ${describe(stmt)}`);
          console.error(`     ${err.code || ''} ${err.message}\n`);
          await client.end();
          process.exit(1);
        }
      }
    }
    console.log('');
  }

  // Confirm the expected shape actually landed.
  const { rows: tables } = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name`
  );
  const { rows: statuses } = await client.query(
    `SELECT enumlabel FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
     WHERE t.typname = 'transaction_status'
     ORDER BY e.enumsortorder`
  );

  console.log('─'.repeat(60));
  console.log(`Applied: ${totalRun} statements, skipped ${totalSkipped} existing`);
  console.log(`Tables (${tables.length}): ${tables.map((t) => t.table_name).join(', ')}`);
  console.log(`transaction_status: ${statuses.map((s) => s.enumlabel).join(', ')}`);
  console.log('─'.repeat(60));

  const expected = [
    'admins', 'ai_training_samples', 'collectors', 'lots', 'material_categories',
    'ml_feedback', 'price_history', 'recycler_materials', 'recyclers', 'sync_log',
    'traceability', 'traceability_photos', 'transactions',
  ];
  const missing = expected.filter((t) => !tables.some((r) => r.table_name === t));

  if (missing.length) {
    console.error(`\n✖ Missing tables: ${missing.join(', ')}\n`);
    await client.end();
    process.exit(1);
  }
  if (!statuses.some((s) => s.enumlabel === 'disputed')) {
    console.error('\n✖ transaction_status is missing the `disputed` value.\n');
    await client.end();
    process.exit(1);
  }

  console.log('\n✅ Schema ready. Next: npx prisma generate && npm run db:seed\n');
  await client.end();
}

main().catch((err) => {
  console.error('\n✖ Schema setup failed:', err.message);
  if (err.code) console.error(`   Postgres code: ${err.code}`);
  process.exit(1);
});
