console.log("[WQP] jobs.js loaded");

function setupRealtimeChannel(sb) {
  try {
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }

    realtimeChannel = sb
      .channel(`team-jobs-${proState.teamId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'jobs',
          filter: `team_id=eq.${proState.teamId}`
        },
        async () => {
          try {
            const { data: updatedJobs } = await sb
              .from('jobs')
              .select('*')
              .eq('team_id', proState.teamId)
              .order('created_at', { ascending: false });

            proState.jobs = updatedJobs || [];
            renderJobsList();
            updateKPIs();
          } catch (e) {
            console.error('Realtime refresh failed', e);
          }
        }
      )
      .subscribe();
  } catch (e) {
    console.error('Realtime setup failed', e);
  }
}

async function updateJobStatus(id, status) {
  const sb = await getSb();
  if (!sb) return;

  const patch = { status: normalizeStatus(status) };
  const now = new Date().toISOString();

  if (patch.status === 'accepted') patch.accepted_at = now;
  if (patch.status === 'in_progress') patch.started_at = now;
  if (patch.status === 'completed') {
    patch.completed_at = now;
    /* Ensure payment fields are correctly initialised on completion.
     * amount_due must equal quoted_price so the payment modal shows
     * the correct amount owed. payment_status stays 'unpaid' unless
     * it was already recorded (guard: only reset if currently unpaid). */
    const jobBeingCompleted = proState.jobs.find(x => x.id === id);
    if (jobBeingCompleted) {
      const currentPs = jobBeingCompleted.payment_status || 'unpaid';
      if (currentPs === 'unpaid') {
        patch.payment_status = 'unpaid';
        patch.amount_due     = parseFloat(jobBeingCompleted.quoted_price) || 0;
        patch.amount_paid    = 0;
      }
    }
  }

  try {
    const { error } = await sb.from('jobs').update(patch).eq('id', id);
    if (error) throw error;

    const j = proState.jobs.find(x => x.id === id);
    if (j) Object.assign(j, patch);

    renderJobsList();
    updateKPIs();

    /* If completing, show next-step modal instead of generic toast */
    if (patch.status === 'completed') {
      showCompletionModal(id);
    } else {
      showToast('Status updated!');
    }
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function scheduleAcceptedJob(id) {
  const sb = await getSb();
  if (!sb) return;

  const dateEl = el(`schedule-date-${id}`);
  const timeEl = el(`schedule-time-${id}`);

  const date = dateEl?.value?.trim();
  const time = timeEl?.value?.trim();

  if (!date || !time) {
    return showToast('Select both date and time', 'error');
  }

  const scheduledAt = new Date(`${date}T${time}`);

  if (Number.isNaN(scheduledAt.getTime())) {
    return showToast('Invalid date/time', 'error');
  }

  try {
    const patch = {
      scheduled_at: scheduledAt.toISOString(),
      status: 'scheduled'
    };

    const { error } = await sb
      .from('jobs')
      .update(patch)
      .eq('id', id);

    if (error) throw error;

    const job = proState.jobs.find(j => j.id === id);
    if (job) Object.assign(job, patch);

    renderJobsList();
    updateKPIs();
    showToast('Job scheduled!');
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function saveTeamJob() {
  if (!proState.teamId) return showToast('Join a team first', 'error');
  if (!hasProAccess()) return showToast('Saving jobs requires a Pro subscription', 'error');

  const sb = await getSb();
  if (!sb) return;

  const data = getQuoteData();

  if (!services.some(s => s.count > 0)) {
    return showToast('Add at least one service before saving a job', 'error');
  }

  const payload = {
    team_id: proState.teamId,
    customer_name: ((el('q-name') || {}).value || '').trim() || 'Customer',
    customer_phone: ((el('q-phone') || {}).value || '').trim(),
    customer_email: ((el('q-email') || {}).value || '').trim(),
    service_address: ((el('q-address') || {}).value || '').trim(),
    quoted_price: data.total,
    items_summary: services
      .filter(s => s.count > 0)
      .map(s => `${s.count} ${s.name}`)
      .join(', '),
    status: 'quoted',
    scheduled_at: null,
    created_by: proState.user.id,
    /* Payment columns default — explicit for clarity */
    payment_status: 'unpaid',
    amount_paid: 0,
    amount_due: data.total
  };

  try {
    const { error } = await sb.from('jobs').insert(payload);
    if (error) throw error;

    showToast('Quote saved to pipeline!');
    await bootPro();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function updateKPIs() {
  const jobs = proState.jobs || [];
  const now = new Date();
  const startOfWeek = new Date(now);
  const day = startOfWeek.getDay();

  startOfWeek.setHours(0, 0, 0, 0);
  startOfWeek.setDate(startOfWeek.getDate() - day);

  const active = jobs.filter(j =>
    ['scheduled', 'in_progress'].includes(normalizeStatus(j.status))
  ).length;

  const weekly = jobs.filter(j => {
    if (normalizeStatus(j.status) !== 'completed') return false;
    if (!j.completed_at) return false;
    return new Date(j.completed_at) >= startOfWeek;
  }).length;

  /* Payment-aware KPIs — read directly from job row columns */
  let paidTotal = 0;
  let pendingTotal = 0;

  jobs.forEach(j => {
    const price = parseFloat(j.quoted_price) || 0;
    const ps = j.payment_status || 'unpaid';
    const amountPaid = parseFloat(j.amount_paid) || 0;

    if (normalizeStatus(j.status) === 'completed' && ps === 'paid') {
      paidTotal += amountPaid || price;
    } else {
      pendingTotal += price - amountPaid;
    }
  });

  const kpiActive     = el('kpi-active');
  const kpiWeekly     = el('kpi-weekly');
  const kpiCollected  = el('kpi-collected');
  const kpiPending    = el('kpi-pending');

  if (kpiActive)    kpiActive.textContent    = active;
  if (kpiWeekly)    kpiWeekly.textContent    = weekly;
  if (kpiCollected) kpiCollected.textContent = `$${paidTotal.toFixed(0)}`;
  if (kpiPending)   kpiPending.textContent   = `$${pendingTotal.toFixed(0)}`;
}

function formatDateTime(value, emptyLabel = 'Not set') {
  if (!value) return emptyLabel;

  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return emptyLabel;

  return d.toLocaleString();
}

/* Payment badge — reads from job row columns (cloud-backed) */
function paymentBadgeHtml(job) {
  if (normalizeStatus(job.status) !== 'completed') return '';
  const ps = job.payment_status || 'unpaid';
  const cls   = ps === 'paid' ? 'pay-badge-paid'
              : ps === 'partially_paid' ? 'pay-badge-partial'
              : 'pay-badge-unpaid';
  const label = ps === 'paid' ? 'Paid'
              : ps === 'partially_paid' ? 'Partially Paid'
              : 'Payment Due';
  return `<span class="pay-badge ${cls}">${label}</span>`;
}

function renderJobsList() {
  const container = el('jobs-list-container');
  if (!container) return;

  const jobs = proState.jobs.filter(j => normalizeStatus(j.status) === jobFilter);

  const filters = [
    { v: 'quoted',      l: 'Quoted'    },
    { v: 'accepted',    l: 'Accepted'  },
    { v: 'scheduled',   l: 'Scheduled' },
    { v: 'in_progress', l: 'Active'    },
    { v: 'completed',   l: 'Done'      }
  ];

  const filtersEl = el('job-filters');
  if (filtersEl) {
    filtersEl.innerHTML = filters.map(f => `
      <div class="chip"
        style="${jobFilter === f.v ? 'background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe;' : ''}"
        onclick="jobFilter='${f.v}';renderJobsList();">
        ${f.l}
      </div>
    `).join('');
  }

  if (!jobs.length) {
    container.innerHTML =
      '<div style="text-align:center;padding:2rem;color:#9ca3af;">No jobs found.</div>';
    return;
  }

  container.innerHTML = jobs.map(j => {
    const status = normalizeStatus(j.status);
    /* Read payment state directly from the job object (Supabase columns) */
    const ps          = j.payment_status || 'unpaid';
    const amountPaid  = parseFloat(j.amount_paid) || 0;
    const amountDue   = parseFloat(j.amount_due)  || 0;
    const paidAt      = j.paid_at || null;

    let actionsHtml = '';

    if (status === 'quoted') {
      actionsHtml = `
        <button class="btn btn-secondary btn-sm"
          onclick="updateJobStatus('${j.id}', 'accepted')">
          Accept
        </button>
      `;
    }

    if (status === 'accepted') {
      actionsHtml = `
        <div class="field-grid-2" style="margin-bottom:0.75rem;">
          <input type="date" class="field-input" id="schedule-date-${j.id}" />
          <input type="time" class="field-input" id="schedule-time-${j.id}" />
        </div>
        <button class="btn btn-primary btn-sm"
          onclick="scheduleAcceptedJob('${j.id}')">
          Schedule Job
        </button>
      `;
    }

    if (status === 'scheduled') {
      actionsHtml = `
        <button class="btn btn-primary btn-sm"
          onclick="updateJobStatus('${j.id}', 'in_progress')">
          Start
        </button>
      `;
    }

    if (status === 'in_progress') {
      actionsHtml = `
        <button class="btn btn-success btn-sm"
          onclick="updateJobStatus('${j.id}', 'completed')">
          Complete
        </button>
      `;
    }

    /* Completed jobs: show payment actions based on cloud payment_status */
    if (status === 'completed') {
      if (ps !== 'paid') {
        actionsHtml = `
          <div class="job-completed-actions">
            <button class="btn btn-primary btn-sm" onclick="openInvoiceForJob('${j.id}')">Send Invoice</button>
            <button class="btn btn-success btn-sm" onclick="openPaymentModal('${j.id}')">Record Payment</button>
          </div>
        `;
      } else {
        actionsHtml = `
          <div class="job-completed-actions">
            <button class="btn btn-secondary btn-sm" onclick="openReceiptForJob('${j.id}')">View Receipt</button>
          </div>
        `;
      }
    }

    return `
      <div class="job-card">
        <div class="job-card-header"
          onclick="document.getElementById('job-body-${j.id}').classList.toggle('hidden')">

          <div>
            <div class="job-card-name">${escapeHtml(j.customer_name)} ${paymentBadgeHtml(j)}</div>
            <div class="job-card-meta">
              <span>$${(parseFloat(j.quoted_price) || 0).toFixed(2)}</span>
              <span>•</span>
              <span>${displayStatus(j.status)}</span>
              <span>•</span>
              <span>${escapeHtml(formatDateTime(j.scheduled_at, 'Not scheduled'))}</span>
            </div>
          </div>

          <svg width="16" height="16" viewBox="0 0 24 24"
            fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="m6 9 6 6 6-6"></path>
          </svg>
        </div>

        <div class="job-card-body hidden" id="job-body-${j.id}">
          <div class="job-detail-grid">
            <div>
              <div class="job-detail-label">Address</div>
              <div class="job-detail-val">${escapeHtml(j.service_address || 'N/A')}</div>
            </div>

            <div>
              <div class="job-detail-label">Phone</div>
              <div class="job-detail-val">${escapeHtml(j.customer_phone || 'N/A')}</div>
            </div>

            <div>
              <div class="job-detail-label">Items</div>
              <div class="job-detail-val">${escapeHtml(j.items_summary || 'N/A')}</div>
            </div>

            <div>
              <div class="job-detail-label">Created</div>
              <div class="job-detail-val">${escapeHtml(formatDateTime(j.created_at, 'Unknown'))}</div>
            </div>

            <div>
              <div class="job-detail-label">Accepted</div>
              <div class="job-detail-val">${escapeHtml(formatDateTime(j.accepted_at, 'Not accepted yet'))}</div>
            </div>

            <div>
              <div class="job-detail-label">Scheduled</div>
              <div class="job-detail-val">${escapeHtml(formatDateTime(j.scheduled_at, 'Not scheduled'))}</div>
            </div>

            <div>
              <div class="job-detail-label">Started</div>
              <div class="job-detail-val">${escapeHtml(formatDateTime(j.started_at, 'Not started yet'))}</div>
            </div>

            <div>
              <div class="job-detail-label">Completed</div>
              <div class="job-detail-val">${escapeHtml(formatDateTime(j.completed_at, 'Not completed yet'))}</div>
            </div>

            ${status === 'completed' ? `
            <div>
              <div class="job-detail-label">Payment</div>
              <div class="job-detail-val">${
                ps === 'paid'           ? `Paid ($${amountPaid.toFixed(2)})`
              : ps === 'partially_paid' ? `Partially Paid ($${amountPaid.toFixed(2)} of $${(parseFloat(j.quoted_price) || 0).toFixed(2)})`
              : 'Unpaid'
              }</div>
            </div>
            ${paidAt ? `<div><div class="job-detail-label">Paid At</div><div class="job-detail-val">${escapeHtml(formatDateTime(paidAt))}</div></div>` : ''}
            ` : ''}
          </div>

          <div class="job-actions">
            ${actionsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

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
  showToast('Job completed! You can invoice or record payment later from the Done tab.');
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

async function recordPayment() {
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
      showToast(`Partial payment of $${amount.toFixed(2)} recorded. $${(quoted - totalPaid).toFixed(2)} remaining.`);
    }
  } catch (e) {
    showToast('Failed to save payment. Please try again.', 'error');
    console.error('recordPayment error:', e);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

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
