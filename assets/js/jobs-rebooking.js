console.log("[WQP] jobs-rebooking.js loaded");

/* ---------------------------------------------------------------
 * Repeat Revenue Tracker — Rebooking Reminder System (PRO)
 *
 * Adds rebooking/reminder functionality to completed jobs.
 * Data is stored on the Supabase `jobs` table via four columns:
 *   rebooking_frequency, next_service_due, rebooking_status,
 *   last_contacted_at
 *
 * All functions are global-scope to match the app's existing
 * module pattern (script-tag loaded, no bundler).
 * --------------------------------------------------------------- */

/* ===== Rebooking Modal State ===== */
let _rebookingJobId = null;

/* ===== Status Calculation ===== */

/**
 * Determine the display status for a rebooking-enabled job.
 * @param {object} job — a job row from proState.jobs
 * @returns {'upcoming'|'due'|'overdue'|'contacted'|'dismissed'|null}
 */
function getRebookingStatus(job) {
  if (!job) return null;
  const rs = (job.rebooking_status || '').toLowerCase();
  if (rs === 'dismissed') return 'dismissed';
  if (rs === 'contacted') return 'contacted';

  const dueDateStr = job.next_service_due;
  if (!dueDateStr) return null;

  const due = new Date(dueDateStr);
  if (Number.isNaN(due.getTime())) return null;

  const now = new Date();
  now.setHours(0, 0, 0, 0);
  due.setHours(0, 0, 0, 0);

  const diffDays = Math.round((due - now) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'overdue';
  if (diffDays <= 7) return 'due';      // due within 7 days
  return 'upcoming';
}

/* ===== Rebooking Persistence ===== */

/**
 * Persist rebooking fields to Supabase and update in-memory job.
 * Gracefully degrades if columns don't exist yet.
 */
async function _saveRebookingFields(jobId, patch) {
  const j = (proState.jobs || []).find(x => x.id === jobId);
  if (j) Object.assign(j, patch);

  try {
    const sb = await getSb();
    if (!sb) return;
    const { error } = await sb.from('jobs').update(patch).eq('id', jobId);
    if (error) {
      console.warn('Rebooking field save warning:', error.message);
    }
  } catch (e) {
    console.error('_saveRebookingFields failed:', e);
  }
}

/**
 * Set a rebooking reminder on a completed job.
 * @param {string} jobId
 * @param {string} frequency — 'none'|'3_months'|'6_months'|'12_months'|'custom'
 * @param {string} [customDate] — ISO date string when frequency === 'custom'
 */
async function setRebookingReminder(jobId, frequency, customDate) {
  if (!hasProAccess()) return openPlansModal('pro_solo', 'Rebooking Reminders');

  const j = (proState.jobs || []).find(x => x.id === jobId);
  if (!j) return showToast('Job not found', 'error');

  let nextDue = null;
  const baseDate = j.completed_at ? new Date(j.completed_at) : new Date();

  if (frequency === 'none') {
    nextDue = null;
  } else if (frequency === 'custom') {
    if (!customDate) return showToast('Select a due date', 'error');
    nextDue = new Date(customDate).toISOString();
  } else {
    const monthsMap = { '3_months': 3, '6_months': 6, '12_months': 12 };
    const months = monthsMap[frequency] || 6;
    const d = new Date(baseDate);
    d.setMonth(d.getMonth() + months);
    nextDue = d.toISOString();
  }

  const patch = {
    rebooking_frequency: frequency === 'none' ? null : frequency,
    next_service_due: nextDue,
    rebooking_status: frequency === 'none' ? null : 'active',
    last_contacted_at: null
  };

  await _saveRebookingFields(jobId, patch);
  renderJobsList();
  renderRebookingSection();

  if (frequency === 'none') {
    showToast('Rebooking reminder removed');
  } else {
    const dueDate = nextDue ? new Date(nextDue).toLocaleDateString() : '';
    showToast(`Reminder set — next service due ${dueDate}`, 'success');
  }
}

/**
 * Mark a customer as contacted for their rebooking.
 */
async function markContacted(jobId) {
  if (!hasProAccess()) return openPlansModal('pro', 'Rebooking Reminders');

  const patch = {
    rebooking_status: 'contacted',
    last_contacted_at: new Date().toISOString()
  };

  await _saveRebookingFields(jobId, patch);
  renderRebookingSection();
  renderJobsList();
  showToast('Marked as contacted', 'success');
}

/**
 * Dismiss/archive a rebooking reminder.
 */
async function dismissReminder(jobId) {
  if (!hasProAccess()) return openPlansModal('pro', 'Rebooking Reminders');

  const patch = {
    rebooking_status: 'dismissed'
  };

  await _saveRebookingFields(jobId, patch);
  renderRebookingSection();
  renderJobsList();
  showToast('Reminder dismissed');
}

/**
 * Prefill a new quote from an existing job and switch to Quote tab.
 */
function requoteFromJob(jobId) {
  if (!hasProAccess()) return openPlansModal('pro', 'Rebooking Reminders');

  const j = (proState.jobs || []).find(x => x.id === jobId);
  if (!j) return showToast('Job not found', 'error');

  /* Prefill customer details */
  const nameEl = el('cust-name');
const phoneEl = el('cust-phone');
const emailEl = null;
const addrEl = el('cust-address');

  if (nameEl) nameEl.value = j.customer_name || '';
  if (phoneEl) phoneEl.value = j.customer_phone || '';
  if (emailEl) emailEl.value = j.customer_email || '';
  if (addrEl) addrEl.value = j.service_address || '';

  /* Try to restore service counts from items_summary if possible.
   * items_summary format: "3 Standard Windows, 2 Large Windows, 1 Sliding Doors"
   * This is best-effort — if it can't parse, the user just gets customer details. */
  const summary = j.items_summary || '';
  if (summary) {
    /* Reset all counts first */
    services.forEach(s => { s.count = 0; });

    const nameToId = {};
    services.forEach(s => {
      nameToId[s.name.toLowerCase()] = s.id;
    });

    /* Parse "N ServiceName" pairs */
    const parts = summary.split(',').map(p => p.trim());
    parts.forEach(part => {
      const match = part.match(/^(\d+)\s+(.+)$/);
      if (match) {
        const count = parseInt(match[1], 10);
        const name = match[2].trim().toLowerCase();
        /* Try exact match first */
        let sid = nameToId[name];
        /* Try partial match */
        if (!sid) {
          const keys = Object.keys(nameToId);
          for (const k of keys) {
            if (k.includes(name) || name.includes(k)) {
              sid = nameToId[k];
              break;
            }
          }
        }
        if (sid) {
          const svc = services.find(s => s.id === sid);
          if (svc) svc.count = count;
        }
      }
    });
  }

  /* Reset second storey and external only to defaults */
  quoteState.externalOnly = false;
  quoteState.secondStoreyEnabled = false;
  quoteState.upstairsCounts = { sw: 0, lw: 0, sd: 0 };

  const extToggle = el('external-only-toggle');
  if (extToggle) extToggle.checked = false;

  /* Refresh the Quote tab UI */
  renderSteppers();
  syncSecondStoreyUI();
  updateQuoteDisplay();

  /* Switch to Quote tab */
  switchTab('quote');
  showToast('Quote prefilled from previous job', 'success');
}

/* ===== Rebooking Modal ===== */

function openRebookingModal(jobId) {
  if (!hasProAccess()) return openPlansModal('pro', 'Rebooking Reminders');

  _rebookingJobId = jobId;
  const j = (proState.jobs || []).find(x => x.id === jobId);

  /* Update modal title with customer name */
  const titleEl = el('rebooking-modal-title');
  if (titleEl) {
    titleEl.textContent = j ? `Set Reminder — ${j.customer_name || 'Customer'}` : 'Set Rebooking Reminder';
  }

  /* Reset custom date field */
  const customWrap = el('rebooking-custom-wrap');
  if (customWrap) customWrap.classList.add('hidden');
  const customInput = el('rebooking-custom-date');
  if (customInput) customInput.value = '';

  /* Reset frequency selection */
  const freqSelect = el('rebooking-freq-select');
  if (freqSelect) freqSelect.value = '6_months';

  const modal = el('rebooking-modal');
  if (modal) modal.classList.remove('hidden');
}

function closeRebookingModal() {
  const modal = el('rebooking-modal');
  if (modal) modal.classList.add('hidden');
  _rebookingJobId = null;
}

function submitRebookingModal() {
  const jobId = _rebookingJobId;
  if (!jobId) return;

  const freqSelect = el('rebooking-freq-select');
  const freq = freqSelect ? freqSelect.value : '6_months';

  let customDate = null;
  if (freq === 'custom') {
    const customInput = el('rebooking-custom-date');
    customDate = customInput ? customInput.value : null;
    if (!customDate) {
      return showToast('Please select a due date', 'error');
    }
  }

  closeRebookingModal();
  setRebookingReminder(jobId, freq, customDate);
}

/* ===== Rebooking Dashboard Renderer ===== */

/**
 * Render the rebooking dashboard section inside the Pro tab.
 * Shows rebooking jobs grouped into collapsible time-based sections
 * (Overdue / This Week / This Month / This Year / Later).
 * Free users see a locked upsell card.
 */
function renderRebookingSection() {
  const container = el('rebooking-section');
  if (!container) return;

  /* Always show the section if user is logged in with a team */
  if (!proState.user || !proState.teamId) {
    container.innerHTML = '';
    return;
  }

  /* Pro gate: show upsell for free users */
  if (!hasProAccess()) {
    container.innerHTML = `
      <div class="card" style="margin-top:1rem;">
        <div class="card-title" style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
          <span>Repeat Revenue Tracker</span>
          <span class="paywall-chip">PRO</span>
        </div>
        <div style="font-size:0.88rem; color:#4b5563; line-height:1.5; margin-bottom:0.9rem;">
          Track when customers are due for their next clean and quickly create a new quote. Never lose repeat business.
        </div>
        <button class="btn btn-secondary btn-full" onclick="openPlansModal('pro', 'Rebooking Reminders')" type="button">
          Unlock Rebooking Reminders &#128274;
        </button>
      </div>
    `;
    return;
  }

  /* Gather rebooking-enabled completed jobs (not dismissed) */
  const allJobs = proState.jobs || [];
  const rebookingJobs = allJobs.filter(j => {
    if (normalizeStatus(j.status) !== 'completed') return false;
    if (!j.next_service_due) return false;
    const rs = getRebookingStatus(j);
    return rs && rs !== 'dismissed';
  });

  /* Sort: overdue first, then due, then upcoming, then contacted */
  const order = { overdue: 0, due: 1, upcoming: 2, contacted: 3 };
  rebookingJobs.sort((a, b) => {
    const sa = order[getRebookingStatus(a)] ?? 99;
    const sb2 = order[getRebookingStatus(b)] ?? 99;
    if (sa !== sb2) return sa - sb2;
    /* Within same status, sort by due date ascending */
    return new Date(a.next_service_due) - new Date(b.next_service_due);
  });

  /* Build the dashboard */
  let cardsHtml = '';

  if (rebookingJobs.length === 0) {
    cardsHtml = `
      <div style="text-align:center; padding:1.5rem; color:#9ca3af; font-size:0.88rem;">
        No upcoming rebookings yet. Set reminders on completed jobs to track repeat revenue.
      </div>
    `;
  } else {
    /* ---- Grouped collapsible sections ---- */

    /* Helper: render a single rebook card */
    function _rebookCardHtml(j) {
      const status = getRebookingStatus(j);
      const dueDate = j.next_service_due ? new Date(j.next_service_due).toLocaleDateString() : 'N/A';
      const lastService = j.completed_at ? new Date(j.completed_at).toLocaleDateString() : 'N/A';

      const badgeMap = {
        overdue:   '<span class="rebook-badge rebook-badge-overdue">Overdue</span>',
        due:       '<span class="rebook-badge rebook-badge-due">Due Soon</span>',
        upcoming:  '<span class="rebook-badge rebook-badge-upcoming">Upcoming</span>',
        contacted: '<span class="rebook-badge rebook-badge-contacted">Contacted</span>'
      };
      const badge = badgeMap[status] || '';

      const actionsHtml = status === 'contacted'
        ? `<button class="btn btn-primary btn-sm" onclick="requoteFromJob('${j.id}')">Requote</button>
           <button class="btn btn-secondary btn-sm" onclick="dismissReminder('${j.id}')">Dismiss</button>`
        : `<button class="btn btn-primary btn-sm" onclick="requoteFromJob('${j.id}')">Requote</button>
           <button class="btn btn-success btn-sm" onclick="markContacted('${j.id}')">Contacted</button>
           <button class="btn btn-secondary btn-sm" onclick="dismissReminder('${j.id}')">Dismiss</button>`;

      return `
        <div class="rebook-card">
          <div class="rebook-card-header">
            <div>
              <div class="rebook-card-name">${escapeHtml(j.customer_name || 'Customer')} ${badge}</div>
              <div class="rebook-card-address">${escapeHtml(j.service_address || '')}</div>
            </div>
          </div>
          <div class="rebook-card-dates">
            <div>
              <div class="rebook-date-label">Last Service</div>
              <div class="rebook-date-val">${escapeHtml(lastService)}</div>
            </div>
            <div>
              <div class="rebook-date-label">Next Due</div>
              <div class="rebook-date-val">${escapeHtml(dueDate)}</div>
            </div>
            <div>
              <div class="rebook-date-label">Quoted</div>
              <div class="rebook-date-val">$${(parseFloat(j.quoted_price) || 0).toFixed(2)}</div>
            </div>
          </div>
          <div class="rebook-card-actions">
            ${actionsHtml}
          </div>
        </div>
      `;
    }

    /* Define time buckets */
    function getRebookingGroups() {
      var now = new Date();
      now.setHours(0, 0, 0, 0);
      var sevenDaysLater = new Date(now); sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
      var thirtyDaysLater = new Date(now); thirtyDaysLater.setDate(thirtyDaysLater.getDate() + 30);
      var yearEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);

      return [
        { label: 'Overdue',    test: function(d) { return d && d < now; } },
        { label: 'This Week',  test: function(d) { return d && d >= now && d < sevenDaysLater; } },
        { label: 'This Month', test: function(d) { return d && d >= sevenDaysLater && d < thirtyDaysLater; } },
        { label: 'This Year',  test: function(d) { return d && d >= thirtyDaysLater && d <= yearEnd; } },
        { label: 'Later',      test: function()  { return true; } }
      ];
    }

    /* Assign each job to its bucket */
    var _groups = getRebookingGroups();
    var _grouped = _groups.map(function(g) { return { label: g.label, jobs: [] }; });
    var _fallback = _grouped[_grouped.length - 1];

    rebookingJobs.forEach(function(j) {
      var d = j.next_service_due ? new Date(j.next_service_due) : null;
      if (d) d.setHours(0, 0, 0, 0);
      var placed = false;
      for (var i = 0; i < _groups.length; i++) {
        if (_groups[i].test(d)) {
          _grouped[i].jobs.push(j);
          placed = true;
          break;
        }
      }
      if (!placed) _fallback.jobs.push(j);
    });

    /* Sort each bucket by next_service_due ascending */
    _grouped.forEach(function(g) {
      g.jobs.sort(function(a, b) {
        return new Date(a.next_service_due) - new Date(b.next_service_due);
      });
    });

    /* Remove empty buckets */
    _grouped = _grouped.filter(function(g) { return g.jobs.length > 0; });

    /* Default open: Overdue if present, otherwise first group */
    var _defaultOpen = 0;
    for (var _gi = 0; _gi < _grouped.length; _gi++) {
      if (_grouped[_gi].label === 'Overdue') { _defaultOpen = _gi; break; }
    }

    /* Render accordion sections */
    cardsHtml = _grouped.map(function(g, idx) {
      var isCollapsed = (idx !== _defaultOpen);
      var collapsedClass = isCollapsed ? ' collapsed' : '';
      var contentStyle = isCollapsed ? ' style="display:none;"' : '';
      return `
        <div class="job-group">
          <div class="job-group-header" onclick="this.closest('.job-group').querySelector('.job-group-content').style.display = this.closest('.job-group').querySelector('.job-group-content').style.display === 'none' ? '' : 'none'; this.querySelector('.job-group-chevron').classList.toggle('collapsed');">
            <span>${g.label}</span>
            <span class="job-group-count">${g.jobs.length}</span>
            <span class="job-group-chevron${collapsedClass}">&#8964;</span>
          </div>
          <div class="job-group-content"${contentStyle}>
            ${g.jobs.map(_rebookCardHtml).join('')}
          </div>
        </div>
      `;
    }).join('');
  }

  /* Count stats */
  const overdueCount = rebookingJobs.filter(j => getRebookingStatus(j) === 'overdue').length;
  const dueCount = rebookingJobs.filter(j => getRebookingStatus(j) === 'due').length;
  const upcomingCount = rebookingJobs.filter(j => getRebookingStatus(j) === 'upcoming').length;

  container.innerHTML = `
    <div class="card" style="margin-top:1rem;">
      <div class="card-title" style="display:flex; align-items:center; justify-content:space-between; gap:0.75rem;">
        <span>Repeat Revenue Tracker</span>
        <span class="paywall-chip">PRO</span>
      </div>

      ${rebookingJobs.length > 0 ? `
      <div class="rebook-stats">
        <div class="rebook-stat">
          <div class="rebook-stat-val rebook-stat-overdue">${overdueCount}</div>
          <div class="rebook-stat-label">Overdue</div>
        </div>
        <div class="rebook-stat">
          <div class="rebook-stat-val rebook-stat-due">${dueCount}</div>
          <div class="rebook-stat-label">Due Soon</div>
        </div>
        <div class="rebook-stat">
          <div class="rebook-stat-val rebook-stat-upcoming">${upcomingCount}</div>
          <div class="rebook-stat-label">Upcoming</div>
        </div>
      </div>
      ` : ''}

      ${cardsHtml}
    </div>
  `;
}

/* ===== Helper for completed job cards ===== */

/**
 * Returns a small HTML snippet for the completed job card:
 * - "Set Reminder" button if no rebooking is set
 * - Next due date display if one exists
 */
function rebookingJobCardHtml(job) {
  if (normalizeStatus(job.status) !== 'completed') return '';
  const rs = getRebookingStatus(job);

  if (!rs || !job.next_service_due) {
    /* No rebooking set — show Set Reminder button */
    return `
      <button class="btn btn-secondary btn-sm rebook-set-btn"
        onclick="event.stopPropagation(); openRebookingModal('${job.id}')">
        &#128197; Set Reminder
      </button>
    `;
  }

  /* Rebooking exists — show next due date with status badge */
  const dueDate = new Date(job.next_service_due).toLocaleDateString();
  const badgeMap = {
    overdue:   '<span class="rebook-badge rebook-badge-overdue">Overdue</span>',
    due:       '<span class="rebook-badge rebook-badge-due">Due Soon</span>',
    upcoming:  '<span class="rebook-badge rebook-badge-upcoming">Upcoming</span>',
    contacted: '<span class="rebook-badge rebook-badge-contacted">Contacted</span>',
    dismissed: '<span class="rebook-badge rebook-badge-dismissed">Dismissed</span>'
  };
  const badge = badgeMap[rs] || '';

  return `
    <div class="rebook-inline">
      <div class="rebook-date-label">Next Service</div>
      <div class="rebook-date-val">${escapeHtml(dueDate)} ${badge}</div>
    </div>
  `;
}
