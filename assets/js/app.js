console.log("config loaded");
console.log("state loaded");
console.log("helpers loaded");
console.log("quote loaded");
console.log("settings loaded");
console.log("subscription loaded");
console.log("pro loaded");
console.log("app loaded");document.addEventListener('DOMContentLoaded', async () => {
 console.log("START DOMContentLoaded");

console.log("1");
loadLocalSettings();

console.log("2");
renderSteppers();

console.log("3");
syncSettingsForm();

console.log("4");
renderSettingsGrids();

console.log("5");
updateQuoteDisplay();

console.log("6");
await bootPro();

console.log("FINISHED"); 
  loadLocalSettings();
  renderSteppers();
  syncSettingsForm();
  renderSettingsGrids();
  updateQuoteDisplay();
  await bootPro();

  if (!localStorage.getItem('wqp-onboarding-done')) {
    showOnboarding();
  }

  bindClick('auth-signin-tab', () => {
    authMode = 'signin';

    const signinTab = el('auth-signin-tab');
    const signupTab = el('auth-signup-tab');
    const nameField = el('auth-name-field');
    const submitBtn = el('auth-submit-btn');

    if (signinTab) signinTab.classList.add('active');
    if (signupTab) signupTab.classList.remove('active');
    if (nameField) nameField.classList.add('hidden');
    if (submitBtn) submitBtn.textContent = 'Sign In';
  });

  bindClick('auth-signup-tab', () => {
    authMode = 'signup';

    const signupTab = el('auth-signup-tab');
    const signinTab = el('auth-signin-tab');
    const nameField = el('auth-name-field');
    const submitBtn = el('auth-submit-btn');

    if (signupTab) signupTab.classList.add('active');
    if (signinTab) signinTab.classList.remove('active');
    if (nameField) nameField.classList.remove('hidden');
    if (submitBtn) submitBtn.textContent = 'Create Account';
  });

  bindClick('auth-submit-btn', handleAuth);
  bindClick('pro-signout-btn', handleSignOut);
  bindClick('create-team-btn', createTeam);
  bindClick('join-team-btn', joinTeam);
  bindClick('save-team-job-btn', saveTeamJob);
  bindClick('share-quote-btn', openShareModal);

  bindClick('clear-counts-btn', () => {
    services.forEach(s => { s.count = 0; });
    renderSteppers();
    updateQuoteDisplay();
  });

  bindClick('global-reset-btn', () => {
    if (!confirm('Reset this quote?')) return;

    services.forEach(s => { s.count = 0; });
    quoteState.externalOnly = false;

    const setVal = (id, v) => {
      const e = el(id);
      if (e) e.value = v;
    };

    setVal('q-name', '');
    setVal('q-phone', '');
    setVal('q-email', '');
    setVal('q-address', '');

    const extToggle = el('external-only-toggle');
    if (extToggle) extToggle.checked = false;

    renderSteppers();
    updateQuoteDisplay();
  });

  const extToggle = el('external-only-toggle');
  if (extToggle) {
    extToggle.onchange = e => {
      quoteState.externalOnly = e.target.checked;
      updateQuoteDisplay();
    };
  }

  bindClick('save-settings-btn', async () => {
    const getVal = id => {
      const e = el(id);
      return e ? e.value : '';
    };

    const getChecked = id => {
      const e = el(id);
      return e ? e.checked : false;
    };

    settings.businessName = getVal('s-bizname');
    settings.contactName = getVal('s-contact');
    settings.businessPhone = getVal('s-phone');
    settings.businessEmail = getVal('s-email');
    settings.customMessage = getVal('s-message');
    settings.pricingMode = getVal('settings-pricing-mode');
    settings.hourlyRate = safeNum(getVal('settings-hourly-rate'), settings.hourlyRate);
    settings.externalOnlyPercent = safeNum(getVal('settings-external-percent'), settings.externalOnlyPercent);
    settings.travelFee = safeNum(getVal('settings-travel-fee'), settings.travelFee);
    settings.discount = safeNum(getVal('settings-discount'), settings.discount);
    settings.gstEnabled = getChecked('settings-gst-enabled');
    settings.gstRate = safeNum(getVal('settings-gst-rate'), settings.gstRate);

    saveLocalSettings();
    await saveSettingsToServer();
    updateQuoteDisplay();
  });

  bindClick('reset-all-btn', resetAllData);

  bindClick('copy-invite-btn', async () => {
    if (!proState.inviteCode) {
      showToast('No invite code available', 'error');
      return;
    }

    try {
      await navigator.clipboard.writeText(proState.inviteCode);
      showToast('Copied!', 'success');
    } catch (e) {
      showToast('Copy failed', 'error');
    }
  });

  bindClick('share-invite-btn', async () => {
    if (!proState.inviteCode) {
      showToast('No invite code available', 'error');
      return;
    }

    const joinUrl = `${window.location.origin}${window.location.pathname}?invite=${encodeURIComponent(proState.inviteCode)}`;
    const msg = `Join my Window Quote Pro team.\nInvite Code: ${proState.inviteCode}\nOpen this link: ${joinUrl}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'Join Team', text: msg, url: joinUrl });
      } else {
        await navigator.clipboard.writeText(msg);
        showToast('Join message copied!', 'success');
      }
    } catch (e) {
      showToast('Share cancelled', 'error');
    }
  });

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    });
  }
});
