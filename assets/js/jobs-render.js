console.log("[WQP] jobs-render.js loaded");

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
