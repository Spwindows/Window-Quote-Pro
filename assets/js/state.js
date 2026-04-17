console.log("[WQP] state.js loaded");

let settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
let quoteState = JSON.parse(JSON.stringify(DEFAULT_QUOTE_STATE));
let services = JSON.parse(JSON.stringify(DEFAULT_SERVICES));
let proState = JSON.parse(JSON.stringify(DEFAULT_PRO_STATE));

let authMode = 'signin';
let pendingInviteCode = localStorage.getItem('pending_invite') || null;
let realtimeChannel = null;
let currentJobId = null;
let currentInvoiceJobId = null;
let currentPaymentJobId = null;
let currentCompletionJobId = null;
let currentRebookingJobId = null;
/* ---------------------------------------------------------------
 * One-time migration: remove legacy localStorage payment store.
 * The old key 'window-quote-pro-payments' was used before payment
 * data was moved to Supabase columns. Stale data in this key would
 * cause old cached JS (if served by SW) to show incorrect payment
 * state. Removing it here ensures a clean slate on every boot.
 * --------------------------------------------------------------- */
(function removeLegacyPaymentStore() {
  try {
    if (localStorage.getItem('window-quote-pro-payments') !== null) {
      localStorage.removeItem('window-quote-pro-payments');
      console.log('[WQP] Removed legacy payment localStorage key.');
    }
  } catch (e) {
    /* Silently ignore — storage may be unavailable in some contexts */
  }
})();

let pendingInviteCode = null;

function normalizeInviteCode(code) {
  return String(code || '').trim().toUpperCase();
}

function isValidInviteCodeFormat(code) {
  const normalized = normalizeInviteCode(code);
  if (!normalized) return false;
  return /^[A-Z0-9-]{4,16}$/.test(normalized);
}

(function checkInviteFromURL() {
  const params = new URLSearchParams(window.location.search);
  const inviteFromUrl = params.get('invite');

  if (inviteFromUrl) {
    const normalizedInvite = normalizeInviteCode(inviteFromUrl);

    if (isValidInviteCodeFormat(normalizedInvite)) {
      pendingInviteCode = normalizedInvite;
      localStorage.setItem('pending_invite', normalizedInvite);
    } else {
      console.warn('Invalid invite code from URL:', inviteFromUrl);
      localStorage.removeItem('pending_invite');
      pendingInviteCode = null;
    }
    return;
  }

  const storedInvite = normalizeInviteCode(localStorage.getItem('pending_invite'));

  if (isValidInviteCodeFormat(storedInvite)) {
    pendingInviteCode = storedInvite;
  } else {
    if (storedInvite) {
      console.warn('Stored invite code is invalid:', storedInvite);
    }
    localStorage.removeItem('pending_invite');
    pendingInviteCode = null;
  }
})();

let supabaseClient = null;
let realtimeChannel = null;
let authMode = 'signin';
let jobFilter = 'quoted';

let settings = { ...DEFAULT_SETTINGS };
let quoteState = { ...DEFAULT_QUOTE_STATE };
let services = DEFAULT_SERVICES.map(service => ({ ...service }));

let proState = { ...DEFAULT_PRO_STATE };

/* ---------------------------------------------------------------
 * Payment helpers — Supabase-backed (reads from proState.jobs,
 * writes to Supabase jobs table via setJobPayment).
 *
 * getJobPayment(jobId) — synchronous read from in-memory job object.
 * setJobPayment(jobId, patch) — async write to Supabase + in-memory.
 * --------------------------------------------------------------- */

/**
 * Returns the current payment state for a job by reading directly
 * from the in-memory proState.jobs array (which is always kept in
 * sync with Supabase via realtime + explicit fetches).
 *
 * Returns a safe default object if the job is not found.
 */
function getJobPayment(jobId) {
  const j = (proState.jobs || []).find(x => x.id === jobId);
  if (!j) {
    return {
      payment_status: 'unpaid',
      amount_paid: 0,
      amount_due: 0,
      paid_at: null,
      payment_method: '',
      payment_notes: ''
    };
  }
  return {
    payment_status: j.payment_status  || 'unpaid',
    amount_paid:    parseFloat(j.amount_paid)  || 0,
    amount_due:     parseFloat(j.amount_due)   || 0,
    paid_at:        j.paid_at         || null,
    payment_method: j.payment_method  || '',
    payment_notes:  j.payment_notes   || ''
  };
}

/**
 * Persists payment fields to Supabase and updates the in-memory job.
 * Only the 6 payment columns are written — no other job fields touched.
 *
 * @param {string} jobId
 * @param {object} paymentInfo  — partial or full payment fields
 * @returns {Promise<void>}
 */
async function setJobPayment(jobId, paymentInfo) {
  /* Merge with existing in-memory state */
  const existing = getJobPayment(jobId);
  const merged = { ...existing, ...paymentInfo };

  /* Clamp numeric values */
  merged.amount_paid = Math.max(0, parseFloat(merged.amount_paid) || 0);
  merged.amount_due  = Math.max(0, parseFloat(merged.amount_due)  || 0);

  /* Build the Supabase patch — only payment columns */
  const patch = {
    payment_status:  merged.payment_status,
    amount_paid:     merged.amount_paid,
    amount_due:      merged.amount_due,
    paid_at:         merged.paid_at,
    payment_method:  merged.payment_method,
    payment_notes:   merged.payment_notes
  };

  /* Update in-memory job immediately for responsive UI */
  const j = (proState.jobs || []).find(x => x.id === jobId);
  if (j) Object.assign(j, patch);

  /* Persist to Supabase */
  try {
    const sb = await getSb();
    if (!sb) throw new Error('Supabase not available');

    const { error } = await sb
      .from('jobs')
      .update(patch)
      .eq('id', jobId);

    if (error) throw error;
  } catch (e) {
    console.error('setJobPayment failed:', e);
    /* Re-throw so the caller (recordPayment) can show an error toast */
    throw e;
  }
}

/* ---------------------------------------------------------------
 * Quote / Invoice / Receipt number generators
 * These use localStorage counters for lightweight sequential IDs.
 * They are per-device but that is acceptable — numbers are
 * informational only and do not need to be globally unique.
 * --------------------------------------------------------------- */

function getNextQuoteNumber() {
  const key = 'wqp-quote-counter';
  let num = parseInt(localStorage.getItem(key) || '2000', 10);
  num++;
  localStorage.setItem(key, String(num));
  return `QTE-${num}`;
}

function getNextInvoiceNumber() {
  const key = 'wqp-invoice-counter';
  let num = parseInt(localStorage.getItem(key) || '1000', 10);
  num++;
  localStorage.setItem(key, String(num));
  return `INV-${num}`;
}

function getNextReceiptNumber() {
  const key = 'wqp-receipt-counter';
  let num = parseInt(localStorage.getItem(key) || '5000', 10);
  num++;
  localStorage.setItem(key, String(num));
  return `REC-${num}`;
}
