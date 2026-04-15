console.log("[WQP] helpers.js loaded");
function el(id) {
  return document.getElementById(id) || null;
}
function safeNum(val, fallback) {
  if (val === undefined || val === null || val === '') return fallback;
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}
function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function bindClick(id, handler) {
  const element = el(id);
  if (element) element.onclick = handler;
}
function normalizeStatus(status) {
  const n = String(status || '').toLowerCase().trim().replaceAll(' ', '_');
  if (n === 'quote_sent') return 'quoted';
  if (n === 'active' || n === 'started') return 'in_progress';
  return n;
}
function displayStatus(status) {
  const map = {
    quoted: 'Quote Sent',
    accepted: 'Accepted',
    in_progress: 'Active',
    completed: 'Completed'
  };
  return map[normalizeStatus(status)] || String(status || '');
}
function canAccessSettings() {
  if (!proState.teamId) return true;
  return String(proState.teamRole || '').toLowerCase() === 'owner';
}

/* ---------------------------------------------------------------
 * Anti-double-click / re-entrancy guard utility.
 *
 * Usage:
 *   const guardedFn = asyncGuard(async () => { ... });
 *   button.onclick = guardedFn;
 *
 * While the wrapped async function is running, subsequent calls
 * are silently ignored. No UI changes — just prevents duplicate
 * network requests and state mutations.
 * --------------------------------------------------------------- */
const _activeGuards = new Set();
function asyncGuard(fn, key) {
  const guardKey = key || fn.name || String(Math.random());
  return async function (...args) {
    if (_activeGuards.has(guardKey)) {
      console.warn(`[Guard] Blocked re-entrant call: ${guardKey}`);
      return;
    }
    _activeGuards.add(guardKey);
    try {
      return await fn.apply(this, args);
    } finally {
      _activeGuards.delete(guardKey);
    }
  };
}
