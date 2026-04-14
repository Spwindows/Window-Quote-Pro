console.log("[WQP] state.js loaded");

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
