/**
 * Seed Script
 * Realistic development data covering every table and every lifecycle state,
 * so the UI has something meaningful to render on first run.
 *
 *   npm run db:seed
 *
 * Idempotent: re-running upserts reference data and skips demo lots/
 * transactions if they already exist. Pass --fresh to wipe transactional data
 * (lots, transactions, traceability, samples, sync log) and rebuild it.
 */
require('dotenv').config();

const prisma = require('../config/db');
const { hashPassword } = require('../services/password.service');
const { generateReference } = require('../utils/generateReference');

const FRESH = process.argv.includes('--fresh');

/** Deterministic pseudo-random so repeated seeds produce comparable data. */
let seedState = 42;
function rand() {
  seedState = (seedState * 1103515245 + 12345) & 0x7fffffff;
  return seedState / 0x7fffffff;
}
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const between = (min, max) => Math.round((min + rand() * (max - min)) * 100) / 100;
const daysAgo = (n) => new Date(Date.now() - n * 24 * 60 * 60 * 1000);

// ============================================================
// Reference data
// ============================================================

const CATEGORIES = [
  { name: 'Printed Circuit Boards', code: 'PCB', description: 'Circuit boards from computers, phones and consumer electronics', hazard_level: 2, icon_url: '/icons/pcb.svg' },
  { name: 'Batteries', code: 'BAT', description: 'Li-ion, lead-acid, NiCd and other battery types', hazard_level: 3, icon_url: '/icons/battery.svg' },
  { name: 'CRT Monitors/TVs', code: 'CRT', description: 'Cathode ray tube displays containing lead and phosphors', hazard_level: 3, icon_url: '/icons/crt.svg' },
  { name: 'LCD/LED Panels', code: 'LCD', description: 'Flat panel displays, some with mercury backlights', hazard_level: 2, icon_url: '/icons/lcd.svg' },
  { name: 'Cables & Wires', code: 'CBL', description: 'Copper and aluminium wiring, data cables, power cords', hazard_level: 1, icon_url: '/icons/cable.svg' },
  { name: 'Plastic Casings', code: 'PLS', description: 'ABS/PC plastic housings from electronics', hazard_level: 1, icon_url: '/icons/plastic.svg' },
  { name: 'Hard Drives', code: 'HDD', description: 'Hard disk drives and SSDs', hazard_level: 1, icon_url: '/icons/hdd.svg' },
  { name: 'Mobile Phones', code: 'MOB', description: 'Complete or partial mobile handsets', hazard_level: 2, icon_url: '/icons/mobile.svg' },
  { name: 'Refrigerant Equipment', code: 'REF', description: 'AC units and refrigerators containing CFCs/HCFCs', hazard_level: 3, icon_url: '/icons/fridge.svg' },
  { name: 'Motors & Magnet Assemblies', code: 'MOT', description: 'Electric motors and neodymium magnet-bearing assemblies', hazard_level: 1, icon_url: '/icons/motor.svg' },
  { name: 'Copper Parts', code: 'COP', description: 'Pure copper components, transformers, windings', hazard_level: 0, icon_url: '/icons/copper.svg' },
  { name: 'Aluminium Parts', code: 'ALU', description: 'Aluminium heat sinks, chassis and frames', hazard_level: 0, icon_url: '/icons/aluminium.svg' },
];

const SUB_CATEGORIES = [
  { parent: 'BAT', name: 'Lithium-ion', code: 'BAT-LI', description: 'Li-ion and Li-Po cells and packs', hazard_level: 3 },
  { parent: 'BAT', name: 'Lead-acid', code: 'BAT-PB', description: 'UPS and automotive lead-acid batteries', hazard_level: 3 },
  { parent: 'BAT', name: 'Alkaline', code: 'BAT-ALK', description: 'AA/AAA alkaline cells', hazard_level: 1 },
  { parent: 'PCB', name: 'Motherboards', code: 'PCB-MB', description: 'Computer and server motherboards — highest gold content', hazard_level: 2 },
  { parent: 'PCB', name: 'Low-grade boards', code: 'PCB-LG', description: 'Power supply and appliance boards', hazard_level: 2 },
  { parent: 'CBL', name: 'Copper wire', code: 'CBL-CU', description: 'High-copper-content insulated wire', hazard_level: 1 },
  { parent: 'MOT', name: 'Neodymium assemblies', code: 'MOT-ND', description: 'Hard drive and speaker magnet assemblies', hazard_level: 1 },
];

const RECYCLERS = [
  {
    business_name: 'GreenTech E-Waste Solutions Pvt. Ltd.',
    registration_number: 'CPCB/REC/2024/001',
    authorization_status: 'authorized',
    contact_phone: '9876543210',
    contact_email: 'ops@greentech-ewaste.in',
    address: 'Plot 45, MIDC Industrial Area, Taloja, Navi Mumbai, Maharashtra 410208',
    location_lat: 19.0644, location_lng: 73.1198,
    pickup_available: true, max_pickup_distance_km: 100,
    operating_hours: 'Mon-Sat 9:00-18:00',
    city: 'Navi Mumbai',
  },
  {
    business_name: 'EcoRecycle India',
    registration_number: 'CPCB/REC/2024/002',
    authorization_status: 'authorized',
    contact_phone: '9123456789',
    contact_email: 'contact@ecorecycle.in',
    address: 'C-88, Sector 63, Noida, Uttar Pradesh 201301',
    location_lat: 28.6271, location_lng: 77.3726,
    pickup_available: true, max_pickup_distance_km: 75,
    operating_hours: 'Mon-Fri 10:00-17:00',
    city: 'Noida',
  },
  {
    business_name: 'MetalRecover Corp',
    registration_number: 'CPCB/REC/2024/003',
    authorization_status: 'authorized',
    contact_phone: '9988776655',
    contact_email: 'ops@metalrecover.in',
    address: '12th Cross, Peenya Industrial Area, Bengaluru, Karnataka 560058',
    location_lat: 13.0312, location_lng: 77.5199,
    pickup_available: false, max_pickup_distance_km: 50,
    operating_hours: 'Mon-Sat 8:00-17:00',
    city: 'Bengaluru',
  },
  {
    business_name: 'Pune Urban Mining Co.',
    registration_number: 'CPCB/REC/2024/004',
    authorization_status: 'authorized',
    contact_phone: '9765432109',
    contact_email: 'desk@puneurbanmining.in',
    address: 'Gate 7, Bhosari MIDC, Pune, Maharashtra 411026',
    location_lat: 18.6298, location_lng: 73.8371,
    pickup_available: true, max_pickup_distance_km: 60,
    operating_hours: 'Mon-Sat 9:30-18:30',
    city: 'Pune',
  },
  {
    business_name: 'Sahyadri Metals & Recycling',
    registration_number: 'CPCB/REC/2025/019',
    authorization_status: 'pending',
    contact_phone: '9822334455',
    contact_email: 'info@sahyadrimetals.in',
    address: 'Survey 210, Chakan MIDC Phase II, Pune, Maharashtra 410501',
    location_lat: 18.7606, location_lng: 73.8636,
    pickup_available: true, max_pickup_distance_km: 45,
    operating_hours: 'Mon-Sat 10:00-18:00',
    city: 'Pune',
  },
  {
    business_name: 'Deccan Scrap Processors',
    registration_number: 'CPCB/REC/2023/077',
    authorization_status: 'suspended',
    contact_phone: '9700112233',
    contact_email: 'admin@deccanscrap.in',
    address: 'Unit 4, Jeedimetla Industrial Estate, Hyderabad, Telangana 500055',
    location_lat: 17.5074, location_lng: 78.4498,
    pickup_available: false, max_pickup_distance_km: 40,
    operating_hours: 'Mon-Fri 9:00-17:00',
    city: 'Hyderabad',
  },
];

/** Base ₹/kg per category — anchors both rates and price history. */
const BASE_RATES = {
  PCB: 250, 'PCB-MB': 420, 'PCB-LG': 130,
  BAT: 48, 'BAT-LI': 95, 'BAT-PB': 62, 'BAT-ALK': 12,
  CRT: 8, LCD: 22, CBL: 125, 'CBL-CU': 195,
  PLS: 15, HDD: 38, MOB: 180, REF: 28,
  MOT: 85, 'MOT-ND': 145, COP: 455, ALU: 98,
};

/** Which recycler buys what, as a multiplier on the base rate. */
const RATE_PLAN = [
  { idx: 0, codes: ['PCB', 'PCB-MB', 'PCB-LG', 'BAT', 'BAT-LI', 'CRT', 'CBL', 'CBL-CU', 'COP', 'MOB', 'MOT'], factor: 1.02 },
  { idx: 1, codes: ['PCB', 'BAT', 'BAT-PB', 'HDD', 'PLS', 'ALU', 'LCD', 'MOB'], factor: 0.96 },
  { idx: 2, codes: ['COP', 'ALU', 'PCB', 'PCB-MB', 'CBL', 'MOT', 'MOT-ND', 'HDD'], factor: 1.06 },
  { idx: 3, codes: ['PCB', 'BAT', 'BAT-LI', 'CBL', 'COP', 'ALU', 'PLS', 'REF', 'MOT'], factor: 1.0 },
  { idx: 4, codes: ['CBL', 'COP', 'ALU', 'PLS'], factor: 0.92 },
  { idx: 5, codes: ['CRT', 'PLS', 'ALU'], factor: 0.85 },
];

const COLLECTORS = [
  { phone: '9812345670', preferred_language: 'hi', location_lat: 19.0760, location_lng: 72.8777, is_verified: true, area: 'Dharavi, Mumbai', pin: '1234' },
  { phone: '9812345671', preferred_language: 'mr', location_lat: 18.5204, location_lng: 73.8567, is_verified: true, area: 'Kothrud, Pune', pin: '4321' },
  { phone: '9812345672', preferred_language: 'hi', location_lat: 28.6139, location_lng: 77.2090, is_verified: true, area: 'Seelampur, Delhi', pin: null },
  { phone: '9812345673', preferred_language: 'mr', location_lat: 19.9975, location_lng: 73.7898, is_verified: true, area: 'Nashik', pin: null },
  { phone: '9812345674', preferred_language: 'en', location_lat: 12.9716, location_lng: 77.5946, is_verified: false, area: 'Bengaluru', pin: null },
];

const DEMO_ADMIN = {
  email: 'admin@kabadiwala.local',
  password: 'admin1234',
  full_name: 'Platform Operations',
};

/** Same password for every demo recycler account — dev only. */
const DEMO_RECYCLER_PASSWORD = 'recycler1234';

const SOURCE_TYPES = ['household', 'commercial', 'industrial', 'institutional'];
const CONDITIONS = ['working', 'non_working', 'damaged', 'mixed'];
const CONDITION_FACTORS = { working: 1.15, mixed: 1.0, non_working: 0.9, damaged: 0.75 };

// ============================================================

async function seed() {
  console.log('\n🌱 Seeding Kabadiwala Connect\n' + '─'.repeat(52));

  if (FRESH) {
    console.log('\n🧹 --fresh: clearing transactional data');
    // Order matters: children before parents.
    await prisma.ml_feedback.deleteMany({});
    await prisma.ai_training_samples.deleteMany({});
    await prisma.traceability_photos.deleteMany({});
    await prisma.traceability.deleteMany({});
    await prisma.transactions.deleteMany({});
    await prisma.sync_log.deleteMany({});
    await prisma.lots.deleteMany({});
    console.log('   cleared lots, transactions, traceability, samples, sync log');
  }

  // ---------- 1. Material categories ----------
  console.log('\n📦 Material categories');
  const catByCode = {};

  for (const cat of CATEGORIES) {
    const created = await prisma.material_categories.upsert({
      where: { code: cat.code },
      create: cat,
      update: { name: cat.name, description: cat.description, hazard_level: cat.hazard_level, icon_url: cat.icon_url },
    });
    catByCode[cat.code] = created;
  }
  console.log(`   ${CATEGORIES.length} top-level categories`);

  for (const sub of SUB_CATEGORIES) {
    const parent = catByCode[sub.parent];
    const created = await prisma.material_categories.upsert({
      where: { code: sub.code },
      create: {
        name: sub.name, code: sub.code, description: sub.description,
        hazard_level: sub.hazard_level, parent_id: parent.id,
        icon_url: parent.icon_url,
      },
      update: { name: sub.name, description: sub.description, hazard_level: sub.hazard_level, parent_id: parent.id },
    });
    catByCode[sub.code] = created;
  }
  console.log(`   ${SUB_CATEGORIES.length} sub-categories`);

  // ---------- 2. Admin ----------
  console.log('\n🛡  Admin account');
  const existingAdmin = await prisma.admins.findUnique({ where: { email: DEMO_ADMIN.email } });
  if (existingAdmin) {
    console.log(`   exists: ${DEMO_ADMIN.email}`);
  } else {
    await prisma.admins.create({
      data: {
        email: DEMO_ADMIN.email,
        password_hash: await hashPassword(DEMO_ADMIN.password),
        full_name: DEMO_ADMIN.full_name,
      },
    });
    console.log(`   created: ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`);
  }

  // ---------- 3. Recyclers ----------
  console.log('\n♻️  Recyclers');
  const recyclerPasswordHash = await hashPassword(DEMO_RECYCLER_PASSWORD);
  const recyclers = [];

  for (const rec of RECYCLERS) {
    const { city, ...data } = rec;
    const created = await prisma.recyclers.upsert({
      where: { registration_number: rec.registration_number },
      create: { ...data, password_hash: recyclerPasswordHash, email_verified: true },
      update: { ...data, password_hash: recyclerPasswordHash, email_verified: true },
    });
    recyclers.push({ ...created, city });
    console.log(`   ${rec.authorization_status.padEnd(10)} ${rec.business_name}`);
  }
  console.log(`   login password for all: ${DEMO_RECYCLER_PASSWORD}`);

  // ---------- 4. Recycler rates ----------
  console.log('\n💰 Recycler rates');
  let rateCount = 0;

  for (const plan of RATE_PLAN) {
    const recycler = recyclers[plan.idx];
    for (const code of plan.codes) {
      const category = catByCode[code];
      const base = BASE_RATES[code];
      if (!category || !base) continue;

      // ±4% spread per recycler on top of their factor.
      const price = Math.round(base * plan.factor * (0.96 + rand() * 0.08) * 100) / 100;

      await prisma.recycler_materials.upsert({
        where: { recycler_id_category_id: { recycler_id: recycler.id, category_id: category.id } },
        create: {
          recycler_id: recycler.id, category_id: category.id,
          buying_price: price, unit: 'kg',
          min_quantity: pick([0, 0, 1, 2, 5]),
        },
        update: { buying_price: price, last_updated: new Date() },
      });
      rateCount++;
    }
  }
  console.log(`   ${rateCount} rates across ${RATE_PLAN.length} recyclers`);

  // ---------- 5. Price history ----------
  console.log('\n📊 Price history');
  const existingPrices = await prisma.price_history.count();

  if (existingPrices > 500 && !FRESH) {
    console.log(`   ${existingPrices} observations already present — skipping`);
  } else {
    if (FRESH) await prisma.price_history.deleteMany({});

    const LOCATIONS = ['all', 'Mumbai', 'Pune', 'Delhi', 'Bengaluru'];
    const rows = [];

    for (const [code, base] of Object.entries(BASE_RATES)) {
      const category = catByCode[code];
      if (!category) continue;

      // 90 days of observations, with a slow drift plus daily noise, so trend
      // charts and moving averages have something real to show.
      const drift = (rand() - 0.5) * 0.25;

      for (let d = 90; d >= 0; d--) {
        const trendFactor = 1 + drift * ((90 - d) / 90);
        const noise = 0.95 + rand() * 0.1;
        const buying = Math.round(base * trendFactor * noise * 100) / 100;

        rows.push({
          category_id: category.id,
          location: 'all',
          buying_price: buying,
          selling_price: Math.round(buying * (1.12 + rand() * 0.13) * 100) / 100,
          source: d === 0 ? 'recycler_update' : 'market_survey',
          recorded_at: daysAgo(d),
        });

        // City-level observations twice a week, for location filtering.
        if (d % 3 === 0) {
          const city = pick(LOCATIONS.slice(1));
          const cityPrice = Math.round(buying * (0.93 + rand() * 0.14) * 100) / 100;
          rows.push({
            category_id: category.id,
            location: city,
            buying_price: cityPrice,
            selling_price: Math.round(cityPrice * 1.15 * 100) / 100,
            source: 'market_survey',
            recorded_at: daysAgo(d),
          });
        }
      }
    }

    // Chunked to stay well inside parameter limits.
    for (let i = 0; i < rows.length; i += 500) {
      await prisma.price_history.createMany({ data: rows.slice(i, i + 500) });
    }
    console.log(`   ${rows.length} observations over 90 days`);
  }

  // ---------- 6. Collectors ----------
  console.log('\n👷 Collectors');
  const collectors = [];

  for (const c of COLLECTORS) {
    const { area, pin, ...data } = c;
    const created = await prisma.collectors.upsert({
      where: { phone: c.phone },
      create: { ...data, pin_hash: pin ? await hashPassword(pin) : null },
      update: { ...data, ...(pin ? { pin_hash: await hashPassword(pin) } : {}) },
    });
    collectors.push({ ...created, area, pin });
    console.log(`   ${c.phone}  ${c.preferred_language}  ${area}${pin ? `  PIN ${pin}` : ''}`);
  }

  // ---------- 7. Lots + transactions across every lifecycle state ----------
  console.log('\n📋 Lots & transactions');
  const existingLots = await prisma.lots.count();

  if (existingLots > 0 && !FRESH) {
    console.log(`   ${existingLots} lots already present — skipping (use --fresh to rebuild)`);
  } else {
    // Each scenario produces one lot and drives its transaction to a target
    // state, so every screen and status badge has real data behind it.
    const SCENARIOS = [
      { code: 'PCB', weight: 12.5, target: 'completed', collector: 0, recycler: 0, days: 28, condition: 'mixed', source: 'commercial' },
      { code: 'COP', weight: 8.0, target: 'completed', collector: 0, recycler: 0, days: 24, condition: 'working', source: 'industrial' },
      { code: 'CBL', weight: 22.0, target: 'completed', collector: 1, recycler: 3, days: 21, condition: 'mixed', source: 'household' },
      { code: 'BAT-LI', weight: 6.5, target: 'completed', collector: 1, recycler: 3, days: 17, condition: 'non_working', source: 'household' },
      { code: 'HDD', weight: 15.0, target: 'completed', collector: 2, recycler: 1, days: 14, condition: 'non_working', source: 'institutional' },
      { code: 'PCB-MB', weight: 4.2, target: 'completed', collector: 3, recycler: 3, days: 11, condition: 'damaged', source: 'commercial' },
      { code: 'ALU', weight: 30.0, target: 'confirmed', collector: 1, recycler: 3, days: 6, condition: 'mixed', source: 'industrial' },
      { code: 'MOB', weight: 3.8, target: 'handed_over', collector: 0, recycler: 0, days: 4, condition: 'non_working', source: 'household' },
      { code: 'MOT', weight: 18.5, target: 'in_transit', collector: 3, recycler: 3, days: 3, condition: 'working', source: 'commercial' },
      { code: 'LCD', weight: 26.0, target: 'accepted', collector: 2, recycler: 1, days: 2, condition: 'damaged', source: 'household' },
      { code: 'CRT', weight: 45.0, target: 'quoted', collector: 0, recycler: 0, days: 1, condition: 'non_working', source: 'household' },
      { code: 'PLS', weight: 35.0, target: 'quoted', collector: 1, recycler: 3, days: 1, condition: 'mixed', source: 'commercial' },
      { code: 'BAT-PB', weight: 40.0, target: 'cancelled', collector: 2, recycler: 1, days: 9, condition: 'damaged', source: 'commercial' },
      { code: 'REF', weight: 55.0, target: 'disputed', collector: 3, recycler: 3, days: 7, condition: 'non_working', source: 'household' },
      // Lots with no transaction yet — the "active, awaiting a match" state.
      { code: 'CBL-CU', weight: 9.5, target: null, collector: 0, days: 0, condition: 'mixed', source: 'household' },
      { code: 'MOT-ND', weight: 2.4, target: null, collector: 1, days: 0, condition: 'working', source: 'commercial' },
      { code: 'PCB-LG', weight: 14.0, target: null, collector: 4, days: 1, condition: 'mixed', source: 'household' },
      { code: 'BAT-ALK', weight: 5.0, target: 'draft', collector: 4, days: 0, condition: 'mixed', source: 'household' },
    ];

    let lotCount = 0;
    let txCount = 0;
    let handoverCount = 0;

    for (const s of SCENARIOS) {
      const category = catByCode[s.code];
      if (!category) continue;

      const collector = collectors[s.collector];
      const parentCode = SUB_CATEGORIES.find((sc) => sc.code === s.code)?.parent;
      const parentCategory = parentCode ? catByCode[parentCode] : null;

      // Value the lot the same way the running app does.
      const base = BASE_RATES[s.code] || 50;
      const estimated = Math.round(base * s.weight * (CONDITION_FACTORS[s.condition] || 1) * 100) / 100;

      // Scatter collection points a few km around the collector's base.
      const jitter = () => (rand() - 0.5) * 0.08;

      const lotStatus =
        s.target === 'draft' ? 'draft'
        : s.target === null ? 'active'
        : s.target === 'completed' ? 'completed'
        : s.target === 'cancelled' ? 'active'
        : 'in_transaction';

      const lot = await prisma.lots.create({
        data: {
          collector_id: collector.id,
          category_id: parentCategory ? parentCategory.id : category.id,
          sub_category_id: parentCategory ? category.id : null,
          image_url: `/uploads/samples/${s.code.toLowerCase()}-lot.jpg`,
          approximate_weight: s.weight,
          condition: s.condition,
          source_type: s.source,
          estimated_value: estimated,
          status: lotStatus,
          collection_location_lat: Number(collector.location_lat) + jitter(),
          collection_location_lng: Number(collector.location_lng) + jitter(),
          collection_address: `${pick(['Shop', 'Godown', 'Yard', 'Unit'])} ${Math.floor(rand() * 90 + 10)}, ${collector.area}`,
          notes: pick([
            'Collected over three days from nearby households',
            'Bulk pickup from an office clearance',
            'Sorted and weighed on a shop scale',
            null,
          ]),
          created_at: daysAgo(s.days),
          updated_at: daysAgo(Math.max(0, s.days - 1)),
        },
      });
      lotCount++;

      if (s.target === null || s.target === 'draft') continue;

      // Quote from the matched recycler's actual listed rate.
      const recycler = recyclers[s.recycler];
      const rate = await prisma.recycler_materials.findFirst({
        where: { recycler_id: recycler.id, category_id: parentCategory ? parentCategory.id : category.id },
        select: { buying_price: true },
      });
      const ratePerKg = rate ? Number(rate.buying_price) : base;
      const offered = Math.round(ratePerKg * s.weight * 100) / 100;

      // Replay the status history so timelines show real timestamps.
      const path = {
        quoted: ['quoted'],
        accepted: ['quoted', 'accepted'],
        in_transit: ['quoted', 'accepted', 'in_transit'],
        handed_over: ['quoted', 'accepted', 'in_transit', 'handed_over'],
        confirmed: ['quoted', 'accepted', 'in_transit', 'handed_over', 'confirmed'],
        completed: ['quoted', 'accepted', 'in_transit', 'handed_over', 'confirmed', 'completed'],
        cancelled: ['quoted', 'accepted', 'cancelled'],
        disputed: ['quoted', 'accepted', 'in_transit', 'handed_over', 'disputed'],
      }[s.target];

      const actorFor = (st) =>
        ({ quoted: 'collector', accepted: 'recycler', in_transit: 'collector',
           handed_over: 'collector', confirmed: 'recycler', completed: 'recycler',
           cancelled: 'recycler', disputed: 'collector' }[st] || 'system');

      const noteFor = (st) =>
        ({ quoted: 'Pickup requested at quoted price',
           accepted: 'Recycler accepted the request',
           in_transit: 'Material on the way to the facility',
           handed_over: 'Handover recorded with weight and photos',
           confirmed: 'Recycler confirmed receipt of material',
           completed: 'Payment settled in cash',
           cancelled: 'Recycler could not take this material this week',
           disputed: 'Weight at the facility differed from the declared weight' }[st] || st);

      const statusHistory = path.map((st, i) => ({
        status: st,
        timestamp: daysAgo(s.days - i * (s.days / (path.length + 1))).toISOString(),
        actor: actorFor(st),
        note: noteFor(st),
      }));

      const settled = ['completed'].includes(s.target);
      const weighed = ['handed_over', 'confirmed', 'completed', 'disputed'].includes(s.target);
      // Real handovers rarely match the estimate exactly.
      const actualWeight = weighed
        ? Math.round(s.weight * (s.target === 'disputed' ? 0.78 : 0.94 + rand() * 0.1) * 100) / 100
        : null;
      const finalPrice = settled ? Math.round(ratePerKg * actualWeight * 100) / 100 : null;

      const tx = await prisma.transactions.create({
        data: {
          lot_id: lot.id,
          collector_id: collector.id,
          recycler_id: recycler.id,
          offered_price: offered,
          final_price: finalPrice,
          final_weight: actualWeight,
          status: s.target,
          payment_status: settled ? 'completed' : s.target === 'disputed' ? 'pending' : 'pending',
          payment_method: settled ? pick(['cash', 'cash', 'upi']) : null,
          status_history: statusHistory,
          pickup_scheduled_at: path.includes('accepted') ? daysAgo(Math.max(0, s.days - 1)) : null,
          completed_at: settled ? daysAgo(Math.max(0, s.days - 5)) : null,
          cancelled_at: s.target === 'cancelled' ? daysAgo(Math.max(0, s.days - 2)) : null,
          cancellation_reason:
            s.target === 'cancelled' ? 'Recycler at capacity for lead-acid this week' : null,
          created_at: daysAgo(s.days),
          updated_at: daysAgo(Math.max(0, s.days - path.length)),
        },
      });
      txCount++;

      // Handover record for anything that physically moved.
      if (weighed) {
        const handoverDay = Math.max(0, s.days - 3);
        const trace = await prisma.traceability.create({
          data: {
            transaction_id: tx.id,
            handover_reference_number: generateReference(),
            actual_weight: actualWeight,
            handover_location_lat: Number(recycler.location_lat),
            handover_location_lng: Number(recycler.location_lng),
            handover_timestamp: daysAgo(handoverDay),
            collector_confirmed: true,
            collector_confirmed_at: daysAgo(handoverDay),
            recycler_confirmed: ['confirmed', 'completed'].includes(s.target),
            recycler_confirmed_at: ['confirmed', 'completed'].includes(s.target)
              ? daysAgo(Math.max(0, handoverDay - 1))
              : null,
            notes:
              s.target === 'disputed'
                ? 'Facility scale read materially lower than the declared weight — under review'
                : 'Weighed on the facility platform scale in the collector’s presence',
            created_at: daysAgo(handoverDay),
            photos: {
              create: [
                { photo_url: `/uploads/samples/${s.code.toLowerCase()}-handover-1.jpg`, photo_type: 'handover' },
                { photo_url: `/uploads/samples/${s.code.toLowerCase()}-weighbridge.jpg`, photo_type: 'weighbridge' },
              ],
            },
          },
        });
        handoverCount++;

        // Completed deals become AI training ground truth.
        if (settled) {
          await prisma.ai_training_samples.create({
            data: {
              image_url: lot.image_url,
              category_id: lot.category_id,
              weight: actualWeight,
              price: finalPrice,
              location: recyclers[s.recycler].city,
              source: 'transaction',
              lot_id: lot.id,
              quality_notes: 'Verified weight and settled price from a completed handover',
              created_at: daysAgo(Math.max(0, s.days - 5)),
            },
          });
        }
        void trace;
      }
    }

    console.log(`   ${lotCount} lots, ${txCount} transactions, ${handoverCount} handover records`);
  }

  // ---------- 8. ML feedback ----------
  console.log('\n🤖 AI/ML dataset');
  const samples = await prisma.ai_training_samples.findMany({ take: 3, select: { id: true, category_id: true, weight: true, price: true } });
  let feedbackAdded = 0;

  for (const sample of samples) {
    const already = await prisma.ml_feedback.count({ where: { training_sample_id: sample.id } });
    if (already > 0) continue;

    await prisma.ml_feedback.create({
      data: {
        training_sample_id: sample.id,
        corrected_category: sample.category_id,
        corrected_weight: sample.weight ? Number(sample.weight) : null,
        corrected_price: sample.price ? Math.round(Number(sample.price) * 1.04 * 100) / 100 : null,
        feedback_source: 'collector',
        notes: 'Collector reported the settled price was slightly above the platform estimate',
        applied_to_model: false,
      },
    });
    feedbackAdded++;
  }

  const sampleTotal = await prisma.ai_training_samples.count();
  console.log(`   ${sampleTotal} training samples, ${feedbackAdded} new feedback records`);
  console.log('   note: no trained model — valuation is rule-based (price × weight × condition)');

  // ---------- 9. Offline sync log ----------
  console.log('\n📴 Offline sync log');
  const syncExisting = await prisma.sync_log.count();

  if (syncExisting > 0 && !FRESH) {
    console.log(`   ${syncExisting} entries already present — skipping`);
  } else {
    const c0 = collectors[0];
    const anyCategory = catByCode.PCB;

    await prisma.sync_log.createMany({
      data: [
        {
          collector_id: c0.id,
          idempotency_key: 'seed-offline-lot-001',
          operation: 'create_lot',
          payload: { category_id: anyCategory.id, approximate_weight: 7.5, condition: 'mixed', source_type: 'household' },
          client_timestamp: daysAgo(2),
          status: 'applied',
          resolved_at: daysAgo(2),
        },
        {
          collector_id: c0.id,
          idempotency_key: 'seed-offline-lot-002',
          operation: 'create_lot',
          payload: { category_id: anyCategory.id, approximate_weight: 3.2, condition: 'damaged', source_type: 'household' },
          client_timestamp: daysAgo(1),
          status: 'pending',
        },
        {
          collector_id: collectors[1].id,
          idempotency_key: 'seed-offline-status-003',
          operation: 'update_transaction_status',
          payload: { transaction_id: '00000000-0000-0000-0000-000000000000', status: 'accepted' },
          client_timestamp: daysAgo(1),
          status: 'conflict',
          conflict_detail: 'Transaction not found — created on a device that never synced its parent lot',
        },
      ],
      skipDuplicates: true,
    });
    console.log('   3 entries (applied / pending / conflict)');
  }

  // ---------- Summary ----------
  const counts = {
    categories: await prisma.material_categories.count(),
    collectors: await prisma.collectors.count(),
    recyclers: await prisma.recyclers.count(),
    rates: await prisma.recycler_materials.count(),
    prices: await prisma.price_history.count(),
    lots: await prisma.lots.count(),
    transactions: await prisma.transactions.count(),
    handovers: await prisma.traceability.count(),
    photos: await prisma.traceability_photos.count(),
    samples: await prisma.ai_training_samples.count(),
    admins: await prisma.admins.count(),
  };

  console.log('\n' + '─'.repeat(52));
  console.log('✅ Seed complete\n');
  for (const [k, v] of Object.entries(counts)) {
    console.log(`   ${k.padEnd(14)} ${String(v).padStart(5)}`);
  }

  console.log('\n🔑 Demo logins');
  console.log(`   Admin      ${DEMO_ADMIN.email} / ${DEMO_ADMIN.password}`);
  console.log(`   Recycler   ops@greentech-ewaste.in / ${DEMO_RECYCLER_PASSWORD}`);
  console.log(`   Collector  9812345670  (OTP is printed by the API in dev; PIN 1234)`);
  console.log('');
}

seed()
  .catch((err) => {
    console.error('\n✖ Seeding failed:', err.message);
    if (err.code === 'P2021' || /does not exist/i.test(err.message)) {
      console.error('   The schema is not applied. Run: npm run db:setup\n');
    } else {
      console.error(err.stack?.split('\n').slice(0, 5).join('\n'), '\n');
    }
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
