document.addEventListener('DOMContentLoaded', async () => {
  console.log("START DOMContentLoaded");

  loadLocalSettings();

  if (typeof services === 'undefined') {
    window.services = JSON.parse(JSON.stringify(DEFAULT_SERVICES));
  }

  renderSteppers();
  syncSecondStoreyUI();
  syncSettingsForm();
  renderSettingsGrids();
  updateQuoteDisplay();
  await bootPro();

  /* Handle return from Stripe Checkout (?checkout=success|cancel) */
  await handleCheckoutReturn();

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

  bindClick('invoice-upsell-btn', () => {
    if (hasProAccess()) {
      switchTab('pro');
      showToast('Invoices are managed from completed jobs in the Pro tab.', 'info');
      return;
    }
    openPlansModal('pro_solo', 'Invoicing');
  });

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

    setVal('cust-name', '');
    setVal('cust-phone', '');
    setVal('cust-address', '');

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

    settings.paymentAccountName   = (el('s-payment-account-name')   || {}).value || '';
    settings.paymentBankName      = (el('s-payment-bank-name')      || {}).value || '';
    settings.paymentBSB           = (el('s-payment-bsb')            || {}).value || '';
    settings.paymentAccountNumber = (el('s-payment-account-number') || {}).value || '';
    settings.paymentReference     = (el('s-payment-reference')      || {}).value || '';
    settings.paymentLink          = (el('s-payment-link')           || {}).value || '';

    saveLocalSettings();
    await saveSettingsToServer();
    updateQuoteDisplay();
  });

  bindClick('reset-all-btn', resetAllData);

  bindClick('copy-invite-btn', async () => {
    if (!proState.teamId) {
      if (!hasProAccess()) return openPlansModal('pro_team', 'Team Features');
      return showToast('Create a team first to get an invite code', 'info');
    }
    if (!proState.inviteCode) {
      if (!hasProAccess()) return openPlansModal('pro_team', 'Team Features');
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
      if (!hasProAccess()) return openPlansModal('pro_team', 'Team Features');
      return showToast('Create a team first to get an invite code', 'info');
    }
    if (!proState.inviteCode) {
      if (!hasProAccess()) return openPlansModal('pro_team', 'Team Features');
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

  bindClick('completion-invoice-btn', completionSendInvoice);
  bindClick('completion-payment-btn', completionRecordPayment);
  bindClick('completion-later-btn', completionDoLater);

  bindClick('payment-submit-btn', recordPayment);
  bindClick('payment-cancel-btn', closePaymentModal);

  bindClick('payconfirm-receipt-btn', paymentConfirmSendReceipt);
  bindClick('payconfirm-skip-btn', paymentConfirmSkip);

  bindClick('rebooking-submit-btn', submitRebookingModal);

  const logoInput = el('logo-file-input');
  if (logoInput) {
    logoInput.onchange = () => handleLogoUpload(logoInput);
  }
  bindClick('logo-remove-btn', removeLogo);

  bindClick('desktop-email-open-btn', desktopEmailOpen);
  bindClick('desktop-email-close-btn', closeDesktopEmailModal);

  bindClick('invoice-duedate-confirm-btn', confirmInvoiceDueDate);
  bindClick('invoice-duedate-cancel-btn', closeInvoiceDueDateModal);

  const termsSelect = el('invoice-terms-select');
  if (termsSelect) {
    termsSelect.onchange = function() {
      const customWrap = el('invoice-custom-date-wrap');
      if (customWrap) {
        customWrap.classList.toggle('hidden', this.value !== 'custom');
      }
    };
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    });
  }
});
