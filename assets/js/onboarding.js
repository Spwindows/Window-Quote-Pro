console.log("[WQP] onboarding.js loaded");

function showOnboarding() {
  const m = el('onboarding-modal');
  if (m) m.classList.remove('hidden');
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
  settings.businessName = (el('onboarding-business-name') || {}).value || settings.businessName;
  settings.pricingMode = (el('onboarding-pricing-mode') || {}).value || settings.pricingMode;
  saveLocalSettings();
  skipOnboarding();
  updateQuoteDisplay();
}
