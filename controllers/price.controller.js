/**
 * Price Controller
 * Price board + trends. Payloads stay lean and numeric — the collector UI is
 * built for low literacy, so it shows figures and arrows, not prose.
 */
const {
  getPriceBoard,
  getFullPriceBoard,
  getPriceTrend,
} = require('../services/pricing.service');
const Price = require('../models/Price');
const { success, error } = require('../utils/response');
const prisma = require('../config/db');

/**
 * GET /prices?category_id=&location=
 */
async function getPrices(req, res, next) {
  try {
    const { category_id, location } = req.query;
    const board = await getPriceBoard(category_id, location || null);
    return success(res, { data: board });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /prices/board?location=
 * The whole board, one call — this is the collector's home screen.
 */
async function getPriceBoardAll(req, res, next) {
  try {
    const board = await getFullPriceBoard(req.query.location || null);
    return success(res, {
      data: board,
      message: `${board.length} material rates`,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /prices/trend?category_id=&days=&location=
 */
async function getTrend(req, res, next) {
  try {
    const { category_id, location } = req.query;
    const days = Math.min(parseInt(req.query.days, 10) || 30, 365);

    const category = await prisma.material_categories.findUnique({
      where: { id: category_id },
      select: { id: true, name: true, code: true },
    });
    if (!category) {
      return error(res, { message: 'Material category not found', statusCode: 404 });
    }

    const trend = await getPriceTrend(category_id, { days, location: location || null });
    return success(res, { data: { category, ...trend } });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /prices
 * Record a price observation (admin only — price_history is append-only).
 */
async function recordPrice(req, res, next) {
  try {
    const { category_id, location, buying_price, selling_price, source } = req.body;

    const entry = await Price.record({
      category_id,
      location: location || 'all',
      buying_price,
      selling_price,
      source: source || 'admin_entry',
    });

    return success(res, { statusCode: 201, message: 'Price recorded', data: entry });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /prices/speak?category_id=&lang=
 * Text for the spoken price readout the problem statement asks for.
 *
 * The server returns the phrase; the client speaks it with the device's
 * built-in TTS. No audio is generated or shipped — that keeps the app small
 * enough for entry-level Android handsets and works offline once cached.
 */
async function getSpokenPrice(req, res, next) {
  try {
    const { category_id } = req.query;
    const lang = ['hi', 'mr', 'en'].includes(req.query.lang) ? req.query.lang : 'hi';

    const category = await prisma.material_categories.findUnique({
      where: { id: category_id },
      select: { id: true, name: true, code: true },
    });
    if (!category) {
      return error(res, { message: 'Material category not found', statusCode: 404 });
    }

    const board = await getPriceBoard(category_id, req.query.location || null);

    if (board.current_price === null) {
      const noData = {
        hi: `${category.name} का भाव अभी उपलब्ध नहीं है।`,
        mr: `${category.name} चा दर सध्या उपलब्ध नाही.`,
        en: `No current rate available for ${category.name}.`,
      };
      return success(res, {
        data: { lang, text: noData[lang], speech_locale: SPEECH_LOCALE[lang], has_price: false },
      });
    }

    const price = Math.round(board.current_price);
    const trendWord = {
      hi: { up: 'भाव बढ़ रहा है', down: 'भाव घट रहा है', stable: 'भाव स्थिर है' },
      mr: { up: 'दर वाढत आहे', down: 'दर कमी होत आहे', stable: 'दर स्थिर आहे' },
      en: { up: 'prices are rising', down: 'prices are falling', stable: 'prices are steady' },
    }[lang][board.trend];

    const phrases = {
      hi: `${category.name} का आज का भाव ${price} रुपये प्रति किलो है। ${trendWord}।`,
      mr: `${category.name} चा आजचा दर ${price} रुपये प्रति किलो आहे. ${trendWord}.`,
      en: `Today's rate for ${category.name} is ${price} rupees per kilogram. Currently ${trendWord}.`,
    };

    return success(res, {
      data: {
        lang,
        text: phrases[lang],
        speech_locale: SPEECH_LOCALE[lang],
        has_price: true,
        price,
        trend: board.trend,
      },
    });
  } catch (err) {
    next(err);
  }
}

/** BCP-47 tags for the Web Speech API / Android TTS. */
const SPEECH_LOCALE = Object.freeze({ hi: 'hi-IN', mr: 'mr-IN', en: 'en-IN' });

module.exports = {
  getPrices,
  getPriceBoardAll,
  getTrend,
  recordPrice,
  getSpokenPrice,
};
