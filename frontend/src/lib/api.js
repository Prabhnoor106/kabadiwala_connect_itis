/**
 * API client.
 *
 * One place that knows how to talk to the backend: base URL, auth header,
 * envelope unwrapping and error shaping. Components never call fetch directly.
 */

const BASE = import.meta.env.VITE_API_BASE_URL || '/api';
const TOKEN_KEY = 'kc_token';
const ROLE_KEY = 'kc_role';

// Origin the API is served from, derived from BASE by stripping a trailing
// `/api`. Empty in local dev (BASE === '/api'), so media paths stay relative
// and the Vite proxy handles them.
const API_ORIGIN = BASE.replace(/\/api\/?$/, '');

/**
 * Resolve a media path returned by the API into a loadable URL.
 *
 * Absolute URLs (ImageKit/S3, `data:`) pass through untouched. A backend
 * relative path like `/uploads/x.jpg` is resolved against the API origin so
 * images load when the frontend (Vercel) and backend (Render) are on
 * different hosts. In local dev API_ORIGIN is empty, so the path is returned
 * unchanged and the Vite proxy forwards it to the backend.
 */
export function mediaUrl(src) {
  if (!src) return src;
  if (/^(https?:)?\/\//i.test(src) || src.startsWith('data:')) return src;
  if (src.startsWith('/uploads')) return `${API_ORIGIN}${src}`;
  return src;
}

/** Thrown for any non-2xx response. Carries status and field errors. */
export class ApiError extends Error {
  constructor(message, { status, errors = null, body = null } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.errors = errors;
    this.body = body;
  }

  /** True when the session is gone and the user must sign in again. */
  get isAuthError() {
    return this.status === 401;
  }

  get isForbidden() {
    return this.status === 403;
  }

  get isNotFound() {
    return this.status === 404;
  }

  /** Field-keyed messages for inline form errors. */
  get fieldErrors() {
    if (!Array.isArray(this.errors)) return {};
    return this.errors.reduce((acc, e) => {
      if (e?.field) acc[e.field] = e.message;
      return acc;
    }, {});
  }
}

// ---------- Token storage ----------

export const auth = {
  get token() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  },
  get role() {
    try {
      return localStorage.getItem(ROLE_KEY);
    } catch {
      return null;
    }
  },
  save(token, role) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      if (role) localStorage.setItem(ROLE_KEY, role);
    } catch {
      /* private mode — the session simply won't persist */
    }
  },
  clear() {
    try {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(ROLE_KEY);
    } catch {
      /* ignore */
    }
  },
};

/** Notified on 401 so the app can drop to the login screen. */
let onUnauthorized = null;
export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

// ---------- Core request ----------

async function request(path, { method = 'GET', body, params, isForm = false, signal } = {}) {
  let url = `${BASE}${path}`;

  if (params) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') qs.append(k, v);
    }
    const query = qs.toString();
    if (query) url += `?${query}`;
  }

  const headers = {};
  const token = auth.token;
  if (token) headers.Authorization = `Bearer ${token}`;
  // FormData sets its own multipart boundary — never override it.
  if (body && !isForm) headers['Content-Type'] = 'application/json';

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    // fetch only rejects on network failure, so this is genuinely offline.
    throw new ApiError(
      'Cannot reach the server. Check your connection and try again.',
      { status: 0 }
    );
  }

  if (response.status === 204) return null;

  let payload = null;
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    if (response.status === 401) {
      auth.clear();
      onUnauthorized?.();
    }
    throw new ApiError(payload?.message || `Request failed (${response.status})`, {
      status: response.status,
      errors: payload?.errors,
      body: payload,
    });
  }

  // The API wraps everything as { success, message, data, pagination }.
  // Return data, but keep pagination reachable when present.
  if (payload && typeof payload === 'object' && 'data' in payload) {
    if (payload.pagination) {
      return { items: payload.data, pagination: payload.pagination, message: payload.message };
    }
    return payload.data;
  }
  return payload;
}

const get = (path, params, opts) => request(path, { ...opts, params });
const post = (path, body, opts) => request(path, { ...opts, method: 'POST', body });
const patch = (path, body, opts) => request(path, { ...opts, method: 'PATCH', body });
const put = (path, body, opts) => request(path, { ...opts, method: 'PUT', body });
const del = (path, opts) => request(path, { ...opts, method: 'DELETE' });
const postForm = (path, formData, opts) =>
  request(path, { ...opts, method: 'POST', body: formData, isForm: true });

// ---------- Endpoints ----------

export const api = {
  health: () => get('/health'),

  auth: {
    sendOtp: (phone) => post('/auth/send-otp', { phone }),
    verifyOtp: (phone, otp) => post('/auth/verify-otp', { phone, otp }),
    loginPin: (phone, pin) => post('/auth/collector/login-pin', { phone, pin }),
    setPin: (pin) => put('/auth/collector/pin', { pin }),
    clearPin: () => del('/auth/collector/pin'),

    recyclerRegister: (payload) => post('/auth/recycler/register', payload),
    recyclerLogin: (contact_email, password) =>
      post('/auth/recycler/login', { contact_email, password }),

    adminRegister: (payload) => post('/auth/admin/register', payload),
    adminLogin: (email, password) => post('/auth/admin/login', { email, password }),

    me: () => get('/auth/me'),
    setLanguage: (preferred_language) => patch('/auth/language', { preferred_language }),
    setLocation: (location_lat, location_lng) =>
      patch('/auth/location', { location_lat, location_lng }),
  },

  categories: {
    list: () => get('/categories'),
  },

  prices: {
    board: (location) => get('/prices/board', { location }),
    one: (category_id, location) => get('/prices', { category_id, location }),
    trend: (category_id, days = 30, location) =>
      get('/prices/trend', { category_id, days, location }),
    speak: (category_id, lang = 'hi') => get('/prices/speak', { category_id, lang }),
  },

  lots: {
    list: (params) => get('/lots', params),
    one: (id) => get(`/lots/${id}`),
    create: (formData) => postForm('/lots', formData),
    update: (id, body) => patch(`/lots/${id}`, body),
    setStatus: (id, status) => patch(`/lots/${id}/status`, { status }),
    remove: (id) => del(`/lots/${id}`),
    estimate: (payload) => post('/lots/estimate', payload),
    matches: (id, top = 8) => get(`/lots/${id}/matches`, { top }),
    traceability: (id, lang) => get(`/lots/${id}/traceability`, { lang }),
  },

  recyclers: {
    list: (params) => get('/recyclers', params),
    one: (id) => get(`/recyclers/${id}`),
    rates: (id) => get(`/recyclers/${id}/rates`),

    // Self-service
    dashboard: () => get('/recyclers/me/dashboard'),
    profile: () => get('/recyclers/me/profile'),
    updateProfile: (body) => patch('/recyclers/me/profile', body),
    setAvailability: (body) => patch('/recyclers/me/availability', body),
    myRates: () => get('/recyclers/me/rates'),
    setRate: (body) => put('/recyclers/me/rates', body),
    removeRate: (category_id) => del(`/recyclers/me/rates/${category_id}`),
    incoming: (params) => get('/recyclers/me/incoming', params),

    // Admin
    create: (body) => post('/recyclers', body),
    setAuthorization: (id, authorization_status) =>
      patch(`/recyclers/${id}/authorization`, { authorization_status }),
    remove: (id) => del(`/recyclers/${id}`),
  },

  transactions: {
    list: (params) => get('/transactions', params),
    one: (id) => get(`/transactions/${id}`),
    create: (body) => post('/transactions', body),
    setStatus: (id, body) => patch(`/transactions/${id}/status`, body),
    handover: (id, formData) => postForm(`/transactions/${id}/handover`, formData),
    getHandover: (id) => get(`/transactions/${id}/handover`),
    confirmHandover: (traceabilityId) =>
      post(`/transactions/traceability/${traceabilityId}/confirm`),
  },

  collector: {
    dashboard: () => get('/collectors/me/dashboard'),
    ledger: (params) => get('/collectors/me/ledger', params),
  },

  traceability: {
    verify: (reference) => get(`/traceability/verify/${reference}`),
  },

  admin: {
    stats: () => get('/admin/stats'),
    analytics: (days = 30) => get('/admin/analytics', { days }),
    attention: () => get('/admin/attention'),
    datasets: () => get('/admin/datasets'),
    collectors: (params) => get('/admin/collectors', params),
    collector: (id) => get(`/admin/collectors/${id}`),
    setCollectorVerification: (id, is_verified) =>
      patch(`/admin/collectors/${id}/verification`, { is_verified }),
    lots: (params) => get('/admin/lots', params),
    admins: (params) => get('/admin/admins', params),
    recordPrice: (body) => post('/admin/prices', body),
  },

  safety: {
    guidance: (category_code, lang = 'hi') =>
      get('/safety/guidance', { category_code, lang }),
  },
};

export default api;
