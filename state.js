console.log("[WQP] state.js loaded");

(function initRuntimeState() {
  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  if (typeof DEFAULT_SETTINGS === 'undefined') {
    throw new Error('DEFAULT_SETTINGS missing. config.js must load before state.js');
  }
  if (typeof DEFAULT_QUOTE_STATE === 'undefined') {
    throw new Error('DEFAULT_QUOTE_STATE missing. config.js must load before state.js');
  }
  if (typeof DEFAULT_SERVICES === 'undefined') {
    throw new Error('DEFAULT_SERVICES missing. config.js must load before state.js');
  }
  if (typeof DEFAULT_PRO_STATE === 'undefined') {
    throw new Error('DEFAULT_PRO_STATE missing. config.js must load before state.js');
  }

  if (!window.settings || typeof window.settings !== 'object') {
    window.settings = clone(DEFAULT_SETTINGS);
  } else {
    window.settings = { ...clone(DEFAULT_SETTINGS), ...window.settings };
  }

  if (!window.quoteState || typeof window.quoteState !== 'object') {
    window.quoteState = clone(DEFAULT_QUOTE_STATE);
  } else {
    window.quoteState = {
      ...clone(DEFAULT_QUOTE_STATE),
      ...window.quoteState,
      upstairsCounts: {
        ...clone(DEFAULT_QUOTE_STATE).upstairsCounts,
        ...(window.quoteState.upstairsCounts || {})
      }
    };
  }

  if (!Array.isArray(window.services) || !window.services.length) {
    window.services = clone(DEFAULT_SERVICES);
  } else {
    const defaults = clone(DEFAULT_SERVICES);
    window.services = defaults.map(def => {
      const existing = window.services.find(s => s && s.id === def.id) || {};
      return { ...def, ...existing };
    });
  }

  if (!window.proState || typeof window.proState !== 'object') {
    window.proState = clone(DEFAULT_PRO_STATE);
  } else {
    window.proState = { ...clone(DEFAULT_PRO_STATE), ...window.proState };
    if (!Array.isArray(window.proState.jobs)) window.proState.jobs = [];
  }

  if (!window.subscriptionState || typeof window.subscriptionState !== 'object') {
    window.subscriptionState = {
      subscription_plan: 'free',
      subscription_status: 'free',
      entitlementSource: null
    };
  } else {
    window.subscriptionState = {
      subscription_plan: window.subscriptionState.subscription_plan || 'free',
      subscription_status: window.subscriptionState.subscription_status || 'free',
      entitlementSource: window.subscriptionState.entitlementSource || null
    };
  }

  if (typeof window.supabaseClient === 'undefined') window.supabaseClient = null;
  if (typeof window.realtimeChannel === 'undefined') window.realtimeChannel = null;
  if (typeof window.authMode === 'undefined') window.authMode = 'signin';

  const storedInvite = localStorage.getItem('pending_invite') || null;
  if (typeof window.pendingInviteCode === 'undefined' || window.pendingInviteCode === null) {
    window.pendingInviteCode = storedInvite;
  }

  if (typeof window.jobFilter === 'undefined') window.jobFilter = 'quoted';
  if (typeof window.currentJobId === 'undefined') window.currentJobId = null;
  if (typeof window.currentInvoiceJobId === 'undefined') window.currentInvoiceJobId = null;
  if (typeof window.currentPaymentJobId === 'undefined') window.currentPaymentJobId = null;
  if (typeof window.currentCompletionJobId === 'undefined') window.currentCompletionJobId = null;
  if (typeof window.currentRebookingJobId === 'undefined') window.currentRebookingJobId = null;
})();
