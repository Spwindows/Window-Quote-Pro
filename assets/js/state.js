console.log("[WQP] state.js loaded");

(function initRuntimeState() {
  function clone(v) {
    return JSON.parse(JSON.stringify(v));
  }

  if (typeof DEFAULT_SETTINGS === "undefined") {
    throw new Error("DEFAULT_SETTINGS missing");
  }
  if (typeof DEFAULT_QUOTE_STATE === "undefined") {
    throw new Error("DEFAULT_QUOTE_STATE missing");
  }
  if (typeof DEFAULT_SERVICES === "undefined") {
    throw new Error("DEFAULT_SERVICES missing");
  }
  if (typeof DEFAULT_PRO_STATE === "undefined") {
    throw new Error("DEFAULT_PRO_STATE missing");
  }

  window.settings = {
    ...clone(DEFAULT_SETTINGS),
    ...(window.settings || {})
  };

  window.quoteState = {
    ...clone(DEFAULT_QUOTE_STATE),
    ...(window.quoteState || {})
  };

  window.services = clone(DEFAULT_SERVICES);

  window.proState = {
    ...clone(DEFAULT_PRO_STATE),
    ...(window.proState || {})
  };

  window.subscriptionState = window.subscriptionState || {
    plan: "free",
    status: "free"
  };

})();
