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

/* ===== Centralized Plans / Paywall Modal ===== */
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

/* ===== Desktop PDF Email Modal (FIX 1) ===== */
function openDesktopEmailModal(email, subject) {
  const modal = el('desktop-email-modal');
  if (!modal) return;
  /* Store data for the button handler */
  modal.dataset.email = email || '';
  modal.dataset.subject = subject || '';
  modal.classList.remove('hidden');
}

function closeDesktopEmailModal() {
  const modal = el('desktop-email-modal');
  if (modal) modal.classList.add('hidden');
}

/**
 * FIX 1: Desktop email open — uses ONLY mailto:EMAIL?subject=SUBJECT&body=BODY
 * NO attachment, attach, or blob URL parameters whatsoever.
 * Body tells recipient the PDF is attached (user attaches manually).
 */
function desktopEmailOpen() {
  const modal = el('desktop-email-modal');
  const email = (modal && modal.dataset.email) || '';
  const subject = (modal && modal.dataset.subject) || '';
  const body = 'Hi,\n\nPlease find the PDF document attached.\n\nThank you.';
  const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  window.open(mailto, '_blank');
  closeDesktopEmailModal();
}

/* ===== Invoice Due Date Modal (FIX 2) ===== */
let _invoiceDueDateCallback = null;

function openInvoiceDueDateModal(callback) {
  _invoiceDueDateCallback = callback;
  const modal = el('invoice-duedate-modal');
  if (!modal) {
    /* Fallback: if modal not in DOM, just call with 14-day default */
    if (callback) callback('14_days');
    return;
  }
  /* Reset form */
  const sel = el('invoice-terms-select');
  if (sel) sel.value = '14_days';
  const customWrap = el('invoice-custom-date-wrap');
  if (customWrap) customWrap.classList.add('hidden');
  const customInput = el('invoice-custom-date');
  if (customInput) customInput.value = '';
  modal.classList.remove('hidden');
}

function closeInvoiceDueDateModal() {
  const modal = el('invoice-duedate-modal');
  if (modal) modal.classList.add('hidden');
  _invoiceDueDateCallback = null;
}

function confirmInvoiceDueDate() {
  const sel = el('invoice-terms-select');
  const terms = sel ? sel.value : '14_days';
  const customInput = el('invoice-custom-date');

  let dueDate;
  const today = new Date();

  switch (terms) {
    case 'on_receipt':
      dueDate = today;
      break;
    case '7_days':
      dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 7);
      break;
    case '14_days':
      dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 14);
      break;
    case '30_days':
      dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 30);
      break;
    case 'custom':
      if (customInput && customInput.value) {
        dueDate = new Date(customInput.value + 'T00:00:00');
      } else {
        showToast('Please select a custom date', 'error');
        return;
      }
      break;
    default:
      dueDate = new Date(today);
      dueDate.setDate(dueDate.getDate() + 14);
  }

  closeInvoiceDueDateModal();
  if (_invoiceDueDateCallback) {
    _invoiceDueDateCallback(terms, dueDate);
    _invoiceDueDateCallback = null;
  }
}
