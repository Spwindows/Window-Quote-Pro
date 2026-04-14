let pendingInviteCode = null;

(function checkInviteFromURL() {
  const params = new URLSearchParams(window.location.search);
  const invite = params.get('invite');

  if (invite) {
    pendingInviteCode = invite;
    localStorage.setItem('pending_invite', invite);
  } else {
    pendingInviteCode = localStorage.getItem('pending_invite');
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