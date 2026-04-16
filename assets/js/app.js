document.addEventListener('DOMContentLoaded', async () => {
  console.log("START DOMContentLoaded");

  loadLocalSettings();
  renderSteppers();
  syncSecondStoreyUI();
  syncSettingsForm();
  renderSettingsGrids();
  updateQuoteDisplay();
  await bootPro();

  console.log("FINISHED");

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
    services.forEach(s => {
      s.count = 0;
    });

    quoteState.secondStoreyEnabled = false;
    quoteState.upstairsCounts = { sw: 0, lw: 0, sd: 0 };

    renderSteppers();
    syncSecondStoreyUI();
    updateQuoteDisplay();
  });

  bindClick('global-reset-btn', () => {
    if (!confirm('Reset this quote?')) return;

    services.forEach(s => {
      s.count = 0;
    });

    quoteState.externalOnly = false;
    quoteState.secondStoreyEnabled = false;
    quoteState.upstairsCounts = { sw: 0, lw: 0, sd: 0 };

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

    syncSecondStoreyUI();
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

  const secondStoreyToggle = el('second-storey-toggle');
  if (secondStoreyToggle) {
    secondStoreyToggle.checked = !!quoteState.secondStoreyEnabled;
    secondStoreyToggle.onchange = e => {
      quoteState.secondStoreyEnabled = !!e.target.checked;
      if (!quoteState.secondStoreyEnabled) {
        quoteState.upstairsCounts = { sw: 0, lw: 0, sd: 0 };
      }
      syncSecondStoreyUI();
      updateQuoteDisplay();
    };
  }

  ['sw', 'lw', 'sd'].forEach(id => {
    const input = el(`second-storey-${id}`);
    if (input) {
      input.oninput = e => {
        updateUpstairsCount(id, e.target.value);
      };
      input.onchange = e => {
        updateUpstairsCount(id, e.target.value);
      };
    }
  });

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
    settings.businessAbn = el('s-abn')?.value?.trim() || '';
settings.businessWebsite = el('s-website')?.value?.trim() || '';
settings.businessAddress = el('s-address')?.value?.trim() || '';
    settings.customMessage = getVal('s-message');
    settings.pricingMode = getVal('settings-pricing-mode');
    settings.hourlyRate = safeNum(
      getVal('settings-hourly-rate'),
      settings.hourlyRate
    );
    settings.externalOnlyPercent = safeNum(
      getVal('settings-external-percent'),
      settings.externalOnlyPercent
    );
    settings.travelFee = safeNum(
      getVal('settings-travel-fee'),
      settings.travelFee
    );
    settings.discount = safeNum(
      getVal('settings-discount'),
      settings.discount
    );
    settings.gstEnabled = getChecked('settings-gst-enabled');
    settings.gstRate = safeNum(
      getVal('settings-gst-rate'),
      settings.gstRate
    );
    settings.quoteFormat = getVal('settings-quote-format') || settings.quoteFormat || 'itemised';
    settings.secondStoreyPricingEnabled = getChecked('settings-second-storey-pricing-enabled');
    settings.secondStoreyMode = getVal('settings-second-storey-mode') || settings.secondStoreyMode || 'percent';
    settings.secondStoreyPercent = safeNum(getVal('settings-second-storey-percent'), settings.secondStoreyPercent);
    settings.secondStoreyFixedAmount = safeNum(getVal('settings-second-storey-fixed'), settings.secondStoreyFixedAmount);

    saveLocalSettings();
    await saveSettingsToServer();
    updateQuoteDisplay();
  });

  bindClick('reset-all-btn', resetAllData);

  bindClick('copy-invite-btn', async () => {
    if (!proState.teamId) {
      if (!hasProAccess()) return openUpsellModal();
      return showToast('Create a team first to get an invite code', 'info');
    }
    if (!proState.inviteCode) {
      if (!hasProAccess()) return openUpsellModal();
      return showToast('Create a team first to get an invite code', 'info');
    }

    try {
      await navigator.clipboard.writeText(proState.inviteCode);
      showToast('Copied!', 'success');
    } catch (e) {
      showToast('Copy failed', 'error');
    }
  });

  bindClick('share-invite-btn', async () => {
    if (!proState.teamId) {
      if (!hasProAccess()) return openUpsellModal();
      return showToast('Create a team first to get an invite code', 'info');
    }
    if (!proState.inviteCode) {
      if (!hasProAccess()) return openUpsellModal();
      return showToast('Create a team first to get an invite code', 'info');
    }

    const joinUrl =
      `${window.location.origin}${window.location.pathname}` +
      `?invite=${encodeURIComponent(proState.inviteCode)}`;

    const msg =
      `Join my Window Quote Pro team.\n` +
      `Invite Code: ${proState.inviteCode}\n` +
      `Open this link: ${joinUrl}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Join Team',
          text: msg,
          url: joinUrl
        });
      } else {
        await navigator.clipboard.writeText(msg);
        showToast('Join message copied!', 'success');
      }
    } catch (e) {
      showToast('Share cancelled', 'error');
    }
  });

  /* ===== New: Completion modal bindings ===== */
  bindClick('completion-invoice-btn', completionSendInvoice);
  bindClick('completion-payment-btn', completionRecordPayment);
  bindClick('completion-later-btn', completionDoLater);

  /* ===== New: Payment modal bindings ===== */
  bindClick('payment-submit-btn', recordPayment);
  bindClick('payment-cancel-btn', closePaymentModal);

  /* ===== New: Payment confirm modal bindings ===== */
  bindClick('payconfirm-receipt-btn', paymentConfirmSendReceipt);
  bindClick('payconfirm-skip-btn', paymentConfirmSkip);

  /* ===== New: Logo upload binding ===== */
  const logoInput = el('logo-file-input');
  if (logoInput) {
    logoInput.onchange = () => handleLogoUpload(logoInput);
  }
  bindClick('logo-remove-btn', removeLogo);

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    });
  }
});
