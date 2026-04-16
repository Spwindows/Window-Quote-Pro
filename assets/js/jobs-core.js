console.log("[WQP] jobs-core.js loaded");

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

async function _updateJobStatusInner(id, status) {
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
const updateJobStatus = asyncGuard(_updateJobStatusInner, 'updateJobStatus');

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

async function _saveTeamJobInner() {
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
    items_summary: getCustomerQuoteFormat() === 'summary'
      ? buildCustomerServiceSummary()
      : services
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
const saveTeamJob = asyncGuard(_saveTeamJobInner, 'saveTeamJob');

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

/* ---------- Cancel & Delete Job ---------- */
async function cancelJob(jobId) {
  if (!confirm('Cancel this job? It will be removed from active lists.')) return;
  await updateJobStatus(jobId, 'cancelled');
  showToast('Job cancelled', 'success');
}

async function _deleteJobInner(jobId) {
  if (!confirm('Permanently delete this job? This cannot be undone.')) return;
  const sb = await getSb();
  if (!sb) return showToast('Not signed in', 'error');
  const { error } = await sb.from('jobs').delete().eq('id', jobId);
  if (error) return showToast('Delete failed', 'error');
  proState.jobs = (proState.jobs || []).filter(j => j.id !== jobId);
  renderJobsList();
  updateKPIs();
  showToast('Job deleted', 'success');
}
const deleteJob = asyncGuard(_deleteJobInner, 'deleteJob');

function formatDateTime(value, emptyLabel = 'Not set') {
  if (!value) return emptyLabel;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return emptyLabel;
  return d.toLocaleString();
}
