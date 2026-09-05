/**
 * api.js — fetch wrapper for the Campus Bites backend.
 *
 * - Central base URL (auto-detects same-origin when served from the API server).
 * - Attaches `Authorization: Bearer <token>` from localStorage.
 * - Throws a friendly Error containing the backend's error message.
 */

// Use the same origin whenever the site is served over HTTP(S). This works for
// Express locally and for the Vercel rewrite in production. A local fallback
// remains for opening the HTML files directly from disk.
const API_BASE = (() => {
  try {
    if (window.location.protocol === 'http:' || window.location.protocol === 'https:') {
      return window.location.origin; // same server — no CORS needed
    }
  } catch { /* file:// etc */ }
  return 'http://localhost:5000';
})();

const TOKEN_KEY = 'campus_bites_token';
const USER_KEY = 'campus_bites_user';

/* ---------- token / user helpers ---------- */
function getToken() {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}
function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch { /* ignore */ }
}
function getStoredUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}
function setStoredUser(user) {
  try {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
  } catch { /* ignore */ }
}
function clearAuth() {
  setToken(null);
  setStoredUser(null);
}

/**
 * Core request wrapper.
 * @param {string} method  GET | POST | PUT | DELETE
 * @param {string} path    e.g. '/api/auth/login'
 * @param {object} opts    { body, auth (bool, default true), query }
 * @returns {Promise<object>} parsed JSON on success
 * @throws {Error} with `status` and backend `error` message
 */
async function api(method, path, opts = {}) {
  const { body, auth = true, query } = opts;

  let url = API_BASE + path;
  if (query) {
    const qs = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString();
    if (qs) url += '?' + qs;
  }

  const headers = {};
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // FormData (file uploads): let the browser set the multipart boundary —
  // never set Content-Type manually, or the upload breaks.
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData;
  if (!isForm && body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? (isForm ? body : JSON.stringify(body)) : undefined,
  });

  let data = null;
  try { data = await res.json(); } catch { /* non-JSON response */ }

  if (!res.ok) {
    const message =
      (data && (data.error || data.message)) ||
      `Request failed (${res.status})`;
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/* Convenience helpers */
const apiGet = (path, opts) => api('GET', path, opts);
const apiPost = (path, body, opts) => api('POST', path, { ...opts, body });
const apiPut = (path, body, opts) => api('PUT', path, { ...opts, body });
const apiDelete = (path, opts) => api('DELETE', path, opts);

/* ---------- money formatting ---------- */
function formatMoney(n) {
  const num = Number(n) || 0;
  return '₦' + num.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

window.CampusBites = {
  API_BASE,
  api, apiGet, apiPost, apiPut, apiDelete,
  getToken, setToken, getStoredUser, setStoredUser, clearAuth,
  formatMoney,
};
