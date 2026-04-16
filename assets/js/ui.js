console.log("[WQP] ui.js loaded");

function showToast(message, type = '') {
  const container = el('toast-container');
  if (!container) return;

  const toastEl = document.createElement('div');
  toastEl.className = `toast ${type}`;
  toastEl.textContent = String(message || '');
  container.appendChild(toastEl);

  setTimeout(() => {
    if (toastEl.parentNode) toastEl.remove();
  }, 3000);
}

function switchTab(t) {
  document.querySelectorAll('[id^="tab-"]').forEach(tabEl => {
    if (tabEl.id.startsWith('tab-') && !tabEl.id.endsWith('-btn')) {
      tabEl.classList.add('hidden');
    }
  });

  const target = el(`tab-${t}`);
  if (target) target.classList.remove('hidden');

  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  const btn = el(`tab-${t}-btn`);
  if (btn) btn.classList.add('active');

  const footer = el('quote-footer');
  if (footer) footer.classList.toggle('hidden', t !== 'quote');
}

/* ===== Upsell Modal Helpers ===== */
function openUpsellModal() {
  const modal = el('upsell-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeUpsellModal() {
  const modal = el('upsell-modal');
  if (modal) modal.classList.add('hidden');
}


function openPlansModal(targetPlan = 'pro', feature = '') {
  const modal = el('plans-modal');
  const title = el('plans-title');
  const subtitle = el('plans-subtitle');
  const kicker = el('plans-kicker');
  const proCard = el('plan-card-pro');
  const teamCard = el('plan-card-team');

  if (kicker) kicker.textContent = feature ? `${feature} is a premium feature` : 'Upgrade Your Business Tools';
  if (title) title.textContent = feature ? `Unlock ${feature}` : 'Unlock Pro Features';
  if (subtitle) subtitle.textContent = feature
    ? `Upgrade to access ${feature.toLowerCase()} and the rest of the business tools built for serious operators.`
    : 'Quotes get you work. Pro tools help you run the business and get paid.';

  if (proCard) proCard.classList.remove('plan-card-dim');
  if (teamCard) teamCard.classList.remove('plan-card-dim');
  if (targetPlan === 'team') {
    if (proCard) proCard.classList.add('plan-card-dim');
  } else {
    if (teamCard) teamCard.classList.add('plan-card-dim');
  }

  if (modal) modal.classList.remove('hidden');
}

function closePlansModal() {
  const modal = el('plans-modal');
  if (modal) modal.classList.add('hidden');
}
