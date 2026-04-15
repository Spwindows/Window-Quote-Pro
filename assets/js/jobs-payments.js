console.log("[WQP] jobs-payments.js loaded");

/* ===== Completion Next-Step Modal ===== */
let _completionJobId = null;

function showCompletionModal(jobId) {
  _completionJobId = jobId;
  const modal = el('completion-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeCompletionModal() {
  const modal = el('completion-modal');
  if (modal) modal.classList.add('hidden');
  _completionJobId = null;
}

function completionSendInvoice() {
  const jobId = _completionJobId;
  closeCompletionModal();
  if (jobId) openInvoiceForJob(jobId);
}

function completionRecordPayment() {
  const jobId = _completionJobId;
  closeCompletionModal();
  if (jobId) openPaymentModal(jobId);
}

function completionDoLater() {
  closeCompletionModal();
  showToast(
    'Job completed! You can invoice or record payment later from the Done tab.'
  );
}

/* ===== Payment Recording Modal ===== */
let _paymentJobId = null;

function openPaymentModal(jobId) {
  _paymentJobId = jobId;
  const j = proState.jobs.find(x => x.id === jobId);
  if (!j) return;

  /* Read payment state from job row columns */
  const amountPaid = parseFloat(j.amount_paid) || 0;
  const quoted     = parseFloat(j.quoted_price) || 0;
  const due        = Math.max(0, quoted - amountPaid);

  const amtEl    = el('pay-amount');
  const methodEl = el('pay-method');
  const notesEl  = el('pay-notes');
  const dueEl    = el('pay-due-display');

  if (amtEl)    amtEl.value    = due.toFixed(2);
  if (methodEl) methodEl.value = 'cash';
  if (notesEl)  notesEl.value  = '';
  if (dueEl)    dueEl.textContent = `Amount due: $${due.toFixed(2)}`;

  const modal = el('payment-modal');
  if (modal) modal.classList.remove('hidden');
}

function closePaymentModal() {
  const modal = el('payment-modal');
  if (modal) modal.classList.add('hidden');
  _paymentJobId = null;
}

async function _recordPaymentInner() {
  const jobId = _paymentJobId;
  if (!jobId) return;
  const j = proState.jobs.find(x => x.id === jobId);
  if (!j) return;

  const amount = parseFloat((el('pay-amount') || {}).value) || 0;
  const method = ((el('pay-method') || {}).value || '').trim();
  const notes  = ((el('pay-notes') || {}).value || '').trim();

  if (amount <= 0) {
    return showToast('Enter a valid payment amount', 'error');
  }

  /* Accumulate payments from the job row */
  const existingPaid = parseFloat(j.amount_paid) || 0;
  const totalPaid    = existingPaid + amount;
  const quoted       = parseFloat(j.quoted_price) || 0;
  const fullyPaid    = totalPaid >= quoted;

  const paymentPatch = {
    payment_status: fullyPaid ? 'paid' : 'partially_paid',
    amount_paid:    totalPaid,
    amount_due:     Math.max(0, quoted - totalPaid),
    paid_at:        fullyPaid ? new Date().toISOString() : (j.paid_at || null),
    payment_method: method,
    payment_notes:  notes
  };

  /* Disable the submit button while saving */
  const submitBtn = el('payment-submit-btn');
  if (submitBtn) submitBtn.disabled = true;

  try {
    await setJobPayment(jobId, paymentPatch);
    closePaymentModal();
    renderJobsList();
    updateKPIs();
    if (fullyPaid) {
      showPaymentConfirmModal(jobId);
    } else {
      showToast(
        `Partial payment of $${amount.toFixed(2)} recorded. ` +
        `$${(quoted - totalPaid).toFixed(2)} remaining.`
      );
    }
  } catch (e) {
    showToast('Failed to save payment. Please try again.', 'error');
    console.error('recordPayment error:', e);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}
const recordPayment = asyncGuard(_recordPaymentInner, 'recordPayment');

/* Post-payment confirmation: offer receipt */
let _receiptJobId = null;

function showPaymentConfirmModal(jobId) {
  _receiptJobId = jobId;
  const modal = el('payment-confirm-modal');
  if (modal) modal.classList.remove('hidden');
}

function closePaymentConfirmModal() {
  const modal = el('payment-confirm-modal');
  if (modal) modal.classList.add('hidden');
  _receiptJobId = null;
}

function paymentConfirmSendReceipt() {
  const jobId = _receiptJobId;
  closePaymentConfirmModal();
  if (jobId) openReceiptForJob(jobId);
}

function paymentConfirmSkip() {
  closePaymentConfirmModal();
  showToast('Payment recorded!', 'success');
}
