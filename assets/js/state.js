console.log("[WQP] state.js loaded");

let pendingInviteCode = null;

(function checkInviteFromURL() {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');

  if (invite) {
    // BUG FIX 2: Validate and normalize invite code from URL
    const normalizedInvite = (invite || '').trim().toUpperCase();
    if (isValidInviteCodeFormat(normalizedInvite)) {
      pendingInviteCode = normalizedInvite;
      localStorage.setItem('pending_invite', normalizedInvite);
    } else {
      console.warn('Invalid invite code from URL:', invite);
      localStorage.removeItem('pending_invite');
      pendingInviteCode = null;
    }
  } else {
    pendingInviteCode = localStorage.getItem('pending_invite');
    // Validate stored invite code
    if (pendingInviteCode && !isValidInviteCodeFormat(pendingInviteCode)) {
      console.warn('Stored invite code is invalid:', pendingInviteCode);
      localStorage.removeItem('pending_invite');
      pendingInviteCode = null;
    }
  }
})();

// BUG FIX 2: Helper function to validate invite code format
function isValidInviteCodeFormat(code) {
  if (!code || typeof code !== 'string') return false;
  // Invite codes should be alphanumeric with hyphens, typically 4-16 chars
  // Format: XXXX-XXXX or similar
  return /^[A-Z0-9\-]{4,16}$/.test(code.trim());
}

let supabaseClient = null;
let realtimeChannel = null;
let authMode = 'signin';
let jobFilter = 'quoted';

let settings = { ...DEFAULT_SETTINGS };
let quoteState = { ...DEFAULT_QUOTE_STATE };
let services = DEFAULT_SERVICES.map(service => ({ ...service }));

let proState = { ...DEFAULT_PRO_STATE };
