/**
 * Display formatting helpers.
 *
 * Currency and dates are formatted for an Indian audience: rupee symbol,
 * lakh/crore grouping, and relative dates in the user's language where it
 * helps comprehension.
 */

/** ₹1,23,456 — Indian digit grouping, no decimals unless asked. */
export function money(value, { decimals = 0, blank = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return blank;
  return `₹${Number(value).toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Compact money for tiles: ₹1.2L, ₹45.3K. */
export function moneyCompact(value, { blank = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return blank;
  const n = Number(value);
  if (Math.abs(n) >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`;
  if (Math.abs(n) >= 1_000) return `₹${(n / 1_000).toFixed(1)}K`;
  return money(n);
}

/** 12.5 kg */
export function weight(value, { blank = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return blank;
  const n = Number(value);
  return `${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })} kg`;
}

/** ₹250/kg */
export function rate(value, unit = 'kg', { blank = '—' } = {}) {
  if (value === null || value === undefined) return blank;
  return `${money(value, { decimals: Number(value) % 1 === 0 ? 0 : 2 })}/${unit}`;
}

/** 4.2 km */
export function distance(km, { blank = '—' } = {}) {
  if (km === null || km === undefined) return blank;
  const n = Number(km);
  if (n < 1) return `${Math.round(n * 1000)} m`;
  return `${n.toFixed(1)} km`;
}

/** 5 Sep 2026 */
export function date(value, { blank = '—' } = {}) {
  if (!value) return blank;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return blank;
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** 5 Sep 2026, 2:30 pm */
export function dateTime(value, { blank = '—' } = {}) {
  if (!value) return blank;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return blank;
  return d.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const RELATIVE = {
  en: { now: 'just now', min: 'm ago', hour: 'h ago', day: 'd ago', yesterday: 'yesterday' },
  hi: { now: 'अभी', min: ' मिनट पहले', hour: ' घंटे पहले', day: ' दिन पहले', yesterday: 'कल' },
  mr: { now: 'आत्ताच', min: ' मिनिटांपूर्वी', hour: ' तासांपूर्वी', day: ' दिवसांपूर्वी', yesterday: 'काल' },
};

/** "2h ago" / "2 घंटे पहले" — falls back to an absolute date past a week. */
export function relative(value, lang = 'en', { blank = '—' } = {}) {
  if (!value) return blank;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return blank;

  const t = RELATIVE[lang] || RELATIVE.en;
  const seconds = Math.floor((Date.now() - d.getTime()) / 1000);

  if (seconds < 60) return t.now;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}${t.min}`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}${t.hour}`;
  if (seconds < 172800) return t.yesterday;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}${t.day}`;
  return date(value);
}

/** in_transaction → In transaction */
export function humanize(value, { blank = '—' } = {}) {
  if (!value) return blank;
  const s = String(value).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Mask a phone for display: 98123•••70 */
export function phone(value, { mask = false } = {}) {
  if (!value) return '—';
  const digits = String(value).replace(/\D/g, '').slice(-10);
  if (digits.length !== 10) return value;
  if (mask) return `${digits.slice(0, 5)}•••${digits.slice(8)}`;
  return `${digits.slice(0, 5)} ${digits.slice(5)}`;
}

/** +12.4% / -3.1% */
export function percent(value, { signed = true, decimals = 1, blank = '—' } = {}) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return blank;
  const n = Number(value);
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

/** Truncate with an ellipsis. */
export function truncate(text, max = 60) {
  if (!text) return '';
  const s = String(text);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** HRN-20260905-A3F7 → HRN‑2026 0905‑A3F7 (visually chunked, non-breaking hyphens) */
export function reference(ref, { blank = '—' } = {}) {
  if (!ref) return blank;
  return String(ref).replace(/-/g, '‑');
}
