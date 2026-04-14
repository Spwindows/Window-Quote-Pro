console.log("config loaded");
console.log("state loaded");
console.log("helpers loaded");
console.log("quote loaded");
console.log("settings loaded");
console.log("subscription loaded");
console.log("pro loaded");
console.log("app loaded");
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
