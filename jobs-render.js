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

/* ---------- Overflow menu (⋯) for Cancel / Delete ---------- */
function overflowMenuHtml(jobId) {
  return `
    <div class="job-overflow-wrap" onclick="event.stopPropagation()">
      <button class="job-overflow-btn" onclick="event.stopPropagation();toggleOverflowMenu('${jobId}')" aria-label="Job actions">&#x22EF;</button>
      <div class="job-overflow-menu hidden" id="overflow-menu-${jobId}">
        <button onclick="event.stopPropagation();closeAllOverflowMenus();cancelJob('${jobId}')">Cancel Job</button>
        <button class="danger" onclick="event.stopPropagation();closeAllOverflowMenus();deleteJob('${jobId}')">Delete Job</button>
      </div>
    </div>
  `;
}

function toggleOverflowMenu(jobId) {
  const menu = document.getElementById('overflow-menu-' + jobId);
  if (!menu) return;
  const wasHidden = menu.classList.contains('hidden');
  closeAllOverflowMenus();
  if (wasHidden) menu.classList.remove('hidden');
}

function closeAllOverflowMenus() {
  document.querySelectorAll('.job-overflow-menu').forEach(function(m) { m.classList.add('hidden'); });
}

/* Close overflow menus when clicking outside */
document.addEventListener('click', function(e) {
  if (!e.target.closest('.job-overflow-wrap')) {
    closeAllOverflowMenus();
  }
});

/* ---------- Grouped rendering helpers ---------- */

/**
 * Groups jobs by a date field into labelled buckets.
 * Each job goes into the FIRST matching group.
 * @param {Array} jobs
 * @param {string} dateField
 * @param {Array} groups - [{ label, test: (date) => boolean }]
 * @returns {Array} [{ label, jobs }]
 */
function groupJobsByDate(jobs, dateField, groups) {
  var result = groups.map(function(g) { return { label: g.label, jobs: [] }; });
  var fallback = result[result.length - 1];
  jobs.forEach(function(j) {
    var raw = j[dateField];
    var d = raw ? new Date(raw) : null;
    var placed = false;
    for (var i = 0; i < groups.length; i++) {
      if (groups[i].test(d)) {
        result[i].jobs.push(j);
        placed = true;
        break;
      }
    }
    if (!placed) fallback.jobs.push(j);
  });
  return result.filter(function(g) { return g.jobs.length > 0; });
}

/**
 * Renders grouped sections with collapsible accordions.
 * @param {Array} groupedData
 * @param {number} defaultOpenIndex
 * @param {Function} cardRenderer
 * @returns {string} HTML
 */
function renderGroupedSections(groupedData, defaultOpenIndex, cardRenderer) {
  return groupedData.map(function(group, idx) {
    var collapsed = idx !== defaultOpenIndex ? 'collapsed' : '';
    return '<div class="job-group ' + collapsed + '">' +
      '<div class="job-group-header" onclick="this.parentElement.classList.toggle(\'collapsed\')">' +
        '<span class="job-group-title">' + escapeHtml(group.label) +
          ' <span class="job-group-count">(' + group.jobs.length + ')</span>' +
        '</span>' +
        '<svg class="job-group-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
          '<path d="m6 9 6 6 6-6"></path>' +
        '</svg>' +
      '</div>' +
      '<div class="job-group-content">' +
        group.jobs.map(cardRenderer).join('') +
      '</div>' +
    '</div>';
  }).join('');
}

/* ---------- Completed groups definition ---------- */
function getCompletedGroups() {
  var now = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var sevenDaysAgo = new Date(todayStart);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  var thirtyDaysAgo = new Date(todayStart);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  var yearStart = new Date(now.getFullYear(), 0, 1);

  return [
    { label: 'This Week',  test: function(d) { return d && d >= sevenDaysAgo; } },
    { label: 'This Month', test: function(d) { return d && d >= thirtyDaysAgo; } },
    { label: 'This Year',  test: function(d) { return d && d >= yearStart; } },
    { label: 'Older',      test: function()  { return true; } }
  ];
}

/* ---------- Scheduled groups definition ---------- */
function getScheduledGroups() {
  var now = new Date();
  var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  var todayEnd = new Date(todayStart);
  todayEnd.setDate(todayEnd.getDate() + 1);

  var dayOfWeek = todayStart.getDay();
  var thisWeekEnd = new Date(todayStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + (7 - dayOfWeek));

  var nextWeekEnd = new Date(thisWeekEnd);
  nextWeekEnd.setDate(nextWeekEnd.getDate() + 7);

  var thisMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1);

  return [
    { label: 'Today',      test: function(d) { return d && d >= todayStart && d < todayEnd; } },
    { label: 'This Week',  test: function(d) { return d && d >= todayStart && d < thisWeekEnd; } },
    { label: 'Next Week',  test: function(d) { return d && d >= thisWeekEnd && d < nextWeekEnd; } },
    { label: 'This Month', test: function(d) { return d && d >= todayStart && d < thisMonthEnd; } },
    { label: 'Later',      test: function()  { return true; } }
  ];
}

/* ---------- Single job card renderer ---------- */
function renderJobCard(j) {
  var status = normalizeStatus(j.status);
  var ps          = j.payment_status || 'unpaid';
  var amountPaid  = parseFloat(j.amount_paid) || 0;
  var amountDue   = parseFloat(j.amount_due)  || 0;
  var paidAt      = j.paid_at || null;
  var actionsHtml = '';

  if (status === 'quoted') {
    actionsHtml =
      '<button class="btn btn-secondary btn-sm" onclick="updateJobStatus(\'' + j.id + '\', \'accepted\')">Accept</button>';
  }
  if (status === 'accepted') {
    actionsHtml =
      '<div class="field-grid-2" style="margin-bottom:0.75rem;">' +
        '<input type="date" class="field-input" id="schedule-date-' + j.id + '" />' +
        '<input type="time" class="field-input" id="schedule-time-' + j.id + '" />' +
      '</div>' +
      '<button class="btn btn-primary btn-sm" onclick="scheduleAcceptedJob(\'' + j.id + '\')">Schedule Job</button>';
  }
  if (status === 'scheduled') {
    actionsHtml =
      '<button class="btn btn-primary btn-sm" onclick="updateJobStatus(\'' + j.id + '\', \'in_progress\')">Start</button>';
  }
  if (status === 'in_progress') {
    actionsHtml =
      '<button class="btn btn-success btn-sm" onclick="updateJobStatus(\'' + j.id + '\', \'completed\')">Complete</button>';
  }
  if (status === 'completed') {
    if (ps !== 'paid') {
      actionsHtml =
        '<div class="job-completed-actions">' +
          '<button class="btn btn-primary btn-sm" onclick="openInvoiceForJob(\'' + j.id + '\')">Send Invoice</button>' +
          '<button class="btn btn-success btn-sm" onclick="openPaymentModal(\'' + j.id + '\')">Record Payment</button>' +
        '</div>';
    } else {
      actionsHtml =
        '<div class="job-completed-actions">' +
          '<button class="btn btn-secondary btn-sm" onclick="openReceiptForJob(\'' + j.id + '\')">View Receipt</button>' +
        '</div>';
    }
  }

  var paymentDetailHtml = '';
  if (status === 'completed') {
    paymentDetailHtml =
      '<div>' +
        '<div class="job-detail-label">Payment</div>' +
        '<div class="job-detail-val">' +
          (ps === 'paid' ? 'Paid ($' + amountPaid.toFixed(2) + ')'
          : ps === 'partially_paid' ? 'Partially Paid ($' + amountPaid.toFixed(2) + ' of $' + (parseFloat(j.quoted_price) || 0).toFixed(2) + ')'
          : 'Unpaid') +
        '</div>' +
      '</div>';
    if (paidAt) {
      paymentDetailHtml +=
        '<div><div class="job-detail-label">Paid At</div><div class="job-detail-val">' + escapeHtml(formatDateTime(paidAt)) + '</div></div>';
    }
  }

  var rebookHtml = '';
  if (status === 'completed' && typeof rebookingJobCardHtml === 'function') {
    rebookHtml = rebookingJobCardHtml(j);
  }

  return '<div class="job-card">' +
    '<div class="job-card-header" onclick="document.getElementById(\'job-body-' + j.id + '\').classList.toggle(\'hidden\')">' +
      '<div style="flex:1;min-width:0;">' +
        '<div class="job-card-name">' + escapeHtml(j.customer_name) + ' ' + paymentBadgeHtml(j) + '</div>' +
        '<div class="job-card-meta">' +
          '<span>$' + (parseFloat(j.quoted_price) || 0).toFixed(2) + '</span>' +
          '<span>&bull;</span>' +
          '<span>' + displayStatus(j.status) + '</span>' +
          '<span>&bull;</span>' +
          '<span>' + escapeHtml(formatDateTime(j.scheduled_at, 'Not scheduled')) + '</span>' +
        '</div>' +
      '</div>' +
      overflowMenuHtml(j.id) +
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">' +
        '<path d="m6 9 6 6 6-6"></path>' +
      '</svg>' +
    '</div>' +
    '<div class="job-card-body hidden" id="job-body-' + j.id + '">' +
      '<div class="job-detail-grid">' +
        '<div><div class="job-detail-label">Address</div><div class="job-detail-val">' + escapeHtml(j.service_address || 'N/A') + '</div></div>' +
        '<div><div class="job-detail-label">Phone</div><div class="job-detail-val">' + escapeHtml(j.customer_phone || 'N/A') + '</div></div>' +
        '<div><div class="job-detail-label">Items</div><div class="job-detail-val">' + escapeHtml(j.items_summary || 'N/A') + '</div></div>' +
        '<div><div class="job-detail-label">Created</div><div class="job-detail-val">' + escapeHtml(formatDateTime(j.created_at, 'Unknown')) + '</div></div>' +
        '<div><div class="job-detail-label">Accepted</div><div class="job-detail-val">' + escapeHtml(formatDateTime(j.accepted_at, 'Not accepted yet')) + '</div></div>' +
        '<div><div class="job-detail-label">Scheduled</div><div class="job-detail-val">' + escapeHtml(formatDateTime(j.scheduled_at, 'Not scheduled')) + '</div></div>' +
        '<div><div class="job-detail-label">Started</div><div class="job-detail-val">' + escapeHtml(formatDateTime(j.started_at, 'Not started yet')) + '</div></div>' +
        '<div><div class="job-detail-label">Completed</div><div class="job-detail-val">' + escapeHtml(formatDateTime(j.completed_at, 'Not completed yet')) + '</div></div>' +
        paymentDetailHtml +
      '</div>' +
      rebookHtml +
      '<div class="job-actions">' + actionsHtml + '</div>' +
    '</div>' +
  '</div>';
}

/* ---------- Main render function ---------- */
function renderJobsList() {
  var container = el('jobs-list-container');
  if (!container) return;
  var jobs = proState.jobs.filter(function(j) { return normalizeStatus(j.status) === jobFilter; });
  var filters = [
    { v: 'quoted',      l: 'Quoted'    },
    { v: 'accepted',    l: 'Accepted'  },
    { v: 'scheduled',   l: 'Scheduled' },
    { v: 'in_progress', l: 'Active'    },
    { v: 'completed',   l: 'Done'      }
  ];
  var filtersEl = el('job-filters');
  if (filtersEl) {
    filtersEl.innerHTML = filters.map(function(f) {
      return '<div class="chip" style="' +
        (jobFilter === f.v ? 'background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe;' : '') +
        '" onclick="jobFilter=\'' + f.v + '\';renderJobsList();">' + f.l + '</div>';
    }).join('');
  }
  if (!jobs.length) {
    container.innerHTML =
      '<div style="text-align:center;padding:2rem;color:#9ca3af;">No jobs found.</div>';
    return;
  }

  /* Grouped rendering for completed (Done) tab */
  if (jobFilter === 'completed') {
    var completedGrouped = groupJobsByDate(jobs, 'completed_at', getCompletedGroups());
    container.innerHTML = renderGroupedSections(completedGrouped, 0, renderJobCard);
    return;
  }

  /* Grouped rendering for scheduled tab */
  if (jobFilter === 'scheduled') {
    var scheduledGrouped = groupJobsByDate(jobs, 'scheduled_at', getScheduledGroups());
    container.innerHTML = renderGroupedSections(scheduledGrouped, 0, renderJobCard);
    return;
  }

  /* Default flat rendering for other tabs */
  container.innerHTML = jobs.map(function(j) { return renderJobCard(j); }).join('');
}
