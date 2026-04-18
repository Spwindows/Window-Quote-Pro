console.log("[WQP] state.js loaded");

var settings = JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
var quoteState = JSON.parse(JSON.stringify(DEFAULT_QUOTE_STATE));
var services = JSON.parse(JSON.stringify(DEFAULT_SERVICES));
var proState = JSON.parse(JSON.stringify(DEFAULT_PRO_STATE));
var supabaseClient = null;

var realtimeChannel = null;
var authMode = 'signin';
var pendingInviteCode = localStorage.getItem('pending_invite') || null;
var jobFilter = 'quoted';

var currentJobId = null;
var currentInvoiceJobId = null;
var currentPaymentJobId = null;
var currentCompletionJobId = null;
var currentRebookingJobId = null;

/* ---------------------------------------------------------------
 * One-time migration: remove legacy localStorage payment store.
 * --------------------------------------------------------------- */
(function removeLegacyPaymentStore() {
  try {
    if (localStorage.getItem('window-quote-pro-payments') !== null) {
      localStorage.removeItem('window-quote-pro-payments');
      console.log('[WQP] Removed legacy payment localStorage key.');
    }
  } catch (e) {
    /* ignore */
  }
})();

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

/* ---------------------------------------------------------------
 * Payment helpers — Supabase-backed
 * --------------------------------------------------------------- */

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
    payment_status: j.payment_status || 'unpaid',
    amount_paid: parseFloat(j.amount_paid) || 0,
    amount_due: parseFloat(j.amount_due) || 0,
    paid_at: j.paid_at || null,
    payment_method: j.payment_method || '',
    payment_notes: j.payment_notes || ''
  };
}

async function setJobPayment(jobId, paymentInfo) {
  const existing = getJobPayment(jobId);
  const merged = { ...existing, ...paymentInfo };

  merged.amount_paid = Math.max(0, parseFloat(merged.amount_paid) || 0);
  merged.amount_due = Math.max(0, parseFloat(merged.amount_due) || 0);

  const patch = {
    payment_status: merged.payment_status,
    amount_paid: merged.amount_paid,
    amount_due: merged.amount_due,
    paid_at: merged.paid_at,
    payment_method: merged.payment_method,
    payment_notes: merged.payment_notes
  };

  const j = (proState.jobs || []).find(x => x.id === jobId);
  if (j) Object.assign(j, patch);

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
    throw e;
  }
}

/* ---------------------------------------------------------------
 * Number generators
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
