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
        { event: '*', schema: 'public', table: 'jobs', filter: `team_id=eq.${proState.teamId}` },
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
  if (patch.status === 'completed') patch.completed_at = now;

  try {
    const { error } = await sb.from('jobs').update(patch).eq('id', id);
    if (error) throw error;

    const j = proState.jobs.find(x => x.id === id);
    if (j) Object.assign(j, patch);

    renderJobsList();
    updateKPIs();
    showToast('Status updated!');
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

  const selectedDate = ((el('job-date') || {}).value || '').trim();
  const selectedTime = ((el('job-time') || {}).value || '').trim();

  let scheduledAt = null;
  if (selectedDate && selectedTime) {
    scheduledAt = new Date(`${selectedDate}T${selectedTime}`).toISOString();
  }

  const payload = {
    team_id: proState.teamId,
    customer_name: ((el('q-name') || {}).value || '').trim() || 'Customer',
    customer_phone: ((el('q-phone') || {}).value || '').trim(),
    customer_email: ((el('q-email') || {}).value || '').trim(),
    service_address: ((el('q-address') || {}).value || '').trim(),
    quoted_price: data.total,
    items_summary: services.filter(s => s.count > 0).map(s => `${s.count} ${s.name}`).join(', '),
    status: 'quoted',
    scheduled_at: scheduledAt,
    created_by: proState.user.id
  };

  try {
    const { error } = await sb.from('jobs').insert(payload);
    if (error) throw error;
    showToast('Job saved to team!');
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

  const active = jobs.filter(j => !['completed', 'cancelled'].includes(normalizeStatus(j.status))).length;

  const weekly = jobs.filter(j => {
    if (normalizeStatus(j.status) !== 'completed') return false;
    if (!j.completed_at) return false;
    const completedAt = new Date(j.completed_at);
    return completedAt >= startOfWeek;
  }).length;

  const collected = jobs
    .filter(j => normalizeStatus(j.status) === 'completed')
    .reduce((sum, j) => sum + (parseFloat(j.quoted_price) || 0), 0);

  const pending = jobs
    .filter(j => normalizeStatus(j.status) !== 'completed')
    .reduce((sum, j) => sum + (parseFloat(j.quoted_price) || 0), 0);

  const kpiActive = el('kpi-active');
  const kpiWeekly = el('kpi-weekly');
  const kpiCollected = el('kpi-collected');
  const kpiPending = el('kpi-pending');

  if (kpiActive) kpiActive.textContent = active;
  if (kpiWeekly) kpiWeekly.textContent = weekly;
  if (kpiCollected) kpiCollected.textContent = `$${collected.toFixed(0)}`;
  if (kpiPending) kpiPending.textContent = `$${pending.toFixed(0)}`;
}

function formatScheduledAt(value) {
  if (!value) return 'Not scheduled';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Not scheduled';
  return d.toLocaleString();
}

function renderJobsList() {
  const container = el('jobs-list-container');
  if (!container) return;

  const jobs = proState.jobs.filter(j => normalizeStatus(j.status) === jobFilter);

  const filters = [
    { v: 'quoted', l: 'Quoted' },
    { v: 'accepted', l: 'Accepted' },
    { v: 'in_progress', l: 'Active' },
    { v: 'completed', l: 'Done' }
  ];

  const filtersEl = el('job-filters');
  if (filtersEl) {
    filtersEl.innerHTML = filters.map(f => `
      <div class="chip" style="${jobFilter === f.v ? 'background:#dbeafe;color:#1d4ed8;border-color:#bfdbfe;' : ''}" onclick="jobFilter='${f.v}';renderJobsList();">
        ${f.l}
      </div>
    `).join('');
  }

  if (!jobs.length) {
    container.innerHTML = '<div style="text-align:center;padding:2rem;color:#9ca3af;">No jobs found.</div>';
    return;
  }

  container.innerHTML = jobs.map(j => `
    <div class="job-card">
      <div class="job-card-header" onclick="document.getElementById('job-body-${j.id}').classList.toggle('hidden')">
        <div>
          <div class="job-card-name">${escapeHtml(j.customer_name)}</div>
          <div class="job-card-meta">
            <span>$${(parseFloat(j.quoted_price) || 0).toFixed(2)}</span>
            <span>•</span>
            <span>${displayStatus(j.status)}</span>
            <span>•</span>
            <span>${escapeHtml(formatScheduledAt(j.scheduled_at))}</span>
          </div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
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
            <div class="job-detail-label">Status</div>
            <div class="job-detail-val">${displayStatus(j.status)}</div>
          </div>
          <div>
            <div class="job-detail-label">Scheduled</div>
            <div class="job-detail-val">${escapeHtml(formatScheduledAt(j.scheduled_at))}</div>
          </div>
          <div>
            <div class="job-detail-label">Created</div>
            <div class="job-detail-val">${escapeHtml(formatScheduledAt(j.created_at))}</div>
          </div>
        </div>

        <div class="job-actions">
          <button class="btn btn-secondary btn-sm" onclick="updateJobStatus('${j.id}', 'accepted')">Accept</button>
          <button class="btn btn-primary btn-sm" onclick="updateJobStatus('${j.id}', 'in_progress')">Start</button>
          <button class="btn btn-success btn-sm" onclick="updateJobStatus('${j.id}', 'completed')">Complete</button>
        </div>
      </div>
    </div>
  `).join('');
}
