// client/src/lib/api.js
// FIX (Jul 2026):
// 1) The old response interceptor force-logged-out and hard-redirected
//    (window.location.href = '/login') on ANY 401, including the login request's own
//    401 for a wrong password. That full-page redirect fired before Login.jsx's catch
//    block could show the toast with the real message, so a mistyped password looked
//    like a silent, unexplained failure ("logs out the user... for some time then it
//    allows them to log in") rather than a clear "Invalid credentials" message. We now
//    skip the auto-logout/redirect for the /auth/login request itself and let the
//    caller (Login.jsx) handle displaying that error normally.
// 2) Added a small automatic retry with backoff for transient network failures / 429s
//    on safe (GET) requests. Several dropdowns (branches, persons, notifications, etc.)
//    previously failed silently and permanently if a single request happened to be
//    rate-limited or hit a network blip, leaving screens stuck on "No branches yet".
//    Now a couple of quick retries happen automatically before giving up.

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  headers: { 'Content-Type': 'application/json' },
});

// Attach token to every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('rekker_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const isLoginRequest = (config) => Boolean(config?.url && config.url.replace(/^\/+/, '') === 'auth/login');

const isRetryableError = (err) => {
  // No response at all = network error / CORS preflight failure / timeout.
  if (!err.response) return true;
  // Too Many Requests — worth a short backoff-and-retry rather than failing outright.
  if (err.response.status === 429) return true;
  // Transient upstream/server hiccups.
  if (err.response.status >= 500) return true;
  return false;
};

// Handle 401 globally + auto-retry transient failures on safe (GET) requests
api.interceptors.response.use(
  (res) => res,
  async (err) => {
    const config = err.config || {};

    if (err.response?.status === 401) {
      // Don't force a logout/redirect for the login request's own 401 (e.g. wrong
      // password) — that's a normal, expected failure the login form already displays.
      if (!isLoginRequest(config)) {
        localStorage.removeItem('rekker_token');
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
      return Promise.reject(err);
    }

    // Auto-retry transient failures (network error / 429 / 5xx) up to 2 times,
    // but only for idempotent GET requests and never for the login request.
    const method = (config.method || 'get').toLowerCase();
    if (method === 'get' && !isLoginRequest(config) && isRetryableError(err)) {
      config.__retryCount = config.__retryCount || 0;
      if (config.__retryCount < 2) {
        config.__retryCount += 1;
        await sleep(500 * config.__retryCount); // 500ms, then 1000ms
        return api(config);
      }
    }

    return Promise.reject(err);
  }
);

export default api;
