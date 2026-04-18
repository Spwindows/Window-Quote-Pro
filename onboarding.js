console.log("[WQP] onboarding.js loaded");

function showOnboarding() {
  const m = el('onboarding-modal');
  if (!m) return;

  /* Pre-fill onboarding fields from settings (business data only, never quote/customer) */
  const setVal = (id, val) => { const e = el(id); if (e) e.value = val || ''; };
  setVal('onboarding-business-name', settings.businessName);
  setVal('onboarding-contact-name', settings.contactName);
  setVal('onboarding-business-phone', settings.businessPhone);
  setVal('onboarding-business-email', settings.businessEmail);
  setVal('onboarding-pricing-mode', settings.pricingMode);

  /* Sync GST button state */
  const yesBtn = el('gst-yes-btn');
  const noBtn = el('gst-no-btn');
  if (yesBtn) yesBtn.classList.toggle('gst-active', !!settings.gstEnabled);
  if (noBtn) noBtn.classList.toggle('gst-active', !settings.gstEnabled);

  m.classList.remove('hidden');
}

function skipOnboarding() {
  const m = el('onboarding-modal');
  if (m) m.classList.add('hidden');
  localStorage.setItem('wqp-onboarding-done', 'true');
}

function setOnboardingGST(enabled) {
  settings.gstEnabled = enabled;

  const yesBtn = el('gst-yes-btn');
  const noBtn = el('gst-no-btn');

  if (yesBtn) yesBtn.classList.toggle('gst-active', enabled);
  if (noBtn) noBtn.classList.toggle('gst-active', !enabled);
}

function completeOnboarding() {
  /* Read ONLY from onboarding fields — never from quote/customer inputs */
  settings.businessName  = (el('onboarding-business-name') || {}).value  || settings.businessName;
  settings.contactName   = (el('onboarding-contact-name') || {}).value   || settings.contactName;
  settings.businessPhone = (el('onboarding-business-phone') || {}).value || settings.businessPhone;
  settings.businessEmail = (el('onboarding-business-email') || {}).value || settings.businessEmail;
  settings.pricingMode   = (el('onboarding-pricing-mode') || {}).value   || settings.pricingMode;
  saveLocalSettings();
  skipOnboarding();
  syncSettingsForm();
  updateQuoteDisplay();
}
