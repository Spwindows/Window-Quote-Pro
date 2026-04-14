function getEntitlementStatus() {
  const sub = proState.subscription;
  if (!sub) return 'free';

  const status = String(sub.status || '').toLowerCase();
  const plan = String(sub.plan || '').toLowerCase();

  if (status === 'active' && plan === 'pro') return 'active';

  if (status === 'trialing' || plan === 'trial') {
    if (!sub.trial_ends_at) return 'expired';
    if (new Date(sub.trial_ends_at) > new Date()) return 'trial';
    return 'expired';
  }

  if (status === 'past_due') return 'past_due';
  if (status === 'cancelled' || status === 'canceled') return 'cancelled';
  if (status === 'expired') return 'expired';

  return 'free';
}

function hasProAccess() {
  const s = getEntitlementStatus();
  return s === 'active' || s === 'trial';
}

function getTrialDaysRemaining() {
  const sub = proState.subscription;
  if (!sub || !sub.trial_ends_at) return null;
  const status = getEntitlementStatus();
  if (status !== 'trial') return null;

  const diff = new Date(sub.trial_ends_at) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getPlanDisplayInfo() {
  const status = getEntitlementStatus();
  const trialDays = getTrialDaysRemaining();

  const info = {
    label: 'Free',
    badgeClass: 'sub-plan-free',
    headerBadgeText: 'FREE',
    headerBadgeClass: 'badge-free',
    warning: null,
    trialDays: null,
    trialPercent: 0
  };

  switch (status) {
    case 'active':
      info.label = 'Pro';
      info.badgeClass = 'sub-plan-active';
      info.headerBadgeText = 'PRO';
      info.headerBadgeClass = 'badge-pro';
      break;
    case 'trial':
      info.label = `Trial (${trialDays} day${trialDays !== 1 ? 's' : ''} left)`;
      info.badgeClass = 'sub-plan-trial';
      info.headerBadgeText = 'TRIAL';
      info.headerBadgeClass = 'badge-pro';
      info.trialDays = trialDays;
      info.trialPercent = Math.max(0, Math.min(100, (trialDays / 14) * 100));
      if (trialDays <= 3) {
        info.warning = `Your trial expires in ${trialDays} day${trialDays !== 1 ? 's' : ''}. Upgrade to keep Pro features.`;
      }
      break;
    case 'past_due':
      info.label = 'Past Due';
      info.badgeClass = 'sub-plan-expired';
      info.headerBadgeText = 'PAST DUE';
      info.headerBadgeClass = 'badge-free';
      info.warning = 'Your payment failed. Please update your billing to restore Pro access.';
      break;
    case 'cancelled':
      info.label = 'Cancelled';
      info.badgeClass = 'sub-plan-expired';
      info.headerBadgeText = 'FREE';
      info.headerBadgeClass = 'badge-free';
      info.warning = 'Your subscription has been cancelled. Upgrade to restore Pro features.';
      break;
    case 'expired':
      info.label = 'Trial Expired';
      info.badgeClass = 'sub-plan-expired';
      info.headerBadgeText = 'FREE';
      info.headerBadgeClass = 'badge-free';
      info.warning = 'Your free trial has ended. Upgrade to keep using Pro features.';
      break;
    default:
      break;
  }

  return info;
}

function normalizeSubscriptionRow(row) {
  if (!row) return null;

  const hasPrefixed = row.effective_plan !== undefined || row.effective_status !== undefined;

  if (hasPrefixed) {
    return {
      id: row.personal_id || row.team_sub_id || row.id || null,
      plan: row.effective_plan || 'free',
      status: row.effective_status || 'expired',
      trial_ends_at: row.effective_trial_ends_at || row.trial_ends_at || null,
      current_period_end: row.effective_current_period_end || row.current_period_end || null,
      stripe_customer_id: row.personal_stripe_customer_id || row.stripe_customer_id || null,
      _source: row.effective_source || 'personal',
      _score: row.effective_score || 0,
      _personal: row.personal_id ? { plan: row.personal_plan, status: row.personal_status } : null,
      _team: row.team_sub_id ? { plan: row.team_sub_plan, status: row.team_sub_status, team_id: row.team_sub_team_id } : null
    };
  }

  return {
    id: row.id || null,
    plan: row.plan || 'free',
    status: row.status || 'expired',
    trial_ends_at: row.trial_ends_at || null,
    current_period_end: row.current_period_end || null,
    stripe_customer_id: row.stripe_customer_id || null,
    _source: 'personal',
    _score: 0,
    _personal: null,
    _team: null
  };
}

async function loadSubscription(sb) {
  let row = null;

  try {
    const { data, error } = await sb.rpc('ensure_subscription');
    if (!error && data) {
      row = Array.isArray(data) ? data[0] : data;
    } else if (error) {
      console.warn('ensure_subscription unavailable:', error.message);
    }
  } catch (e) {
    console.warn('ensure_subscription call failed:', e.message);
  }

  if (!row) {
    try {
      const { data, error } = await sb.rpc('get_effective_entitlement');
      if (!error && data) {
        row = Array.isArray(data) ? data[0] : data;
      }
    } catch (e) {
      console.warn('get_effective_entitlement unavailable:', e.message);
    }
  }

  if (!row) {
    try {
      const { data, error } = await sb.rpc('get_my_subscription');
      if (!error && data) {
        row = Array.isArray(data) ? data[0] : data;
      }
    } catch (e) {
      console.warn('get_my_subscription unavailable:', e.message);
    }
  }

  const sub = normalizeSubscriptionRow(row);

  if (sub) {
    proState.subscription = sub;
    proState.entitlementSource = sub._source || 'personal';
  } else {
    proState.subscription = {
      id: null,
      plan: 'free',
      status: 'expired',
      trial_ends_at: null,
      current_period_end: null,
      stripe_customer_id: null,
      _source: 'personal',
      _score: 0,
      _personal: null,
      _team: null
    };
    proState.entitlementSource = 'personal';
  }

  console.log('[Entitlement] Resolved:', {
    plan: proState.subscription.plan,
    status: proState.subscription.status,
    source: proState.entitlementSource,
    trial_ends_at: proState.subscription.trial_ends_at,
    hasProAccess: hasProAccess()
  });
}

function renderSubscriptionUI() {
  const container = el('subscription-status-container');
  if (!container) return;

  if (!proState.user) {
    container.innerHTML = '';
    return;
  }

  const info = getPlanDisplayInfo();
  const status = getEntitlementStatus();

  let html = '<div class="sub-status-card">';
  html += '<div class="sub-status-header">';
  html += `<span style="font-weight:800;font-size:0.95rem;color:#111827;">Subscription</span>`;
  html += `<span class="sub-plan-badge ${info.badgeClass}">${escapeHtml(info.label)}</span>`;
  html += '</div>';

  if (status === 'trial' && info.trialDays !== null) {
    const barClass = info.trialDays <= 3 ? 'critical' : (info.trialDays <= 7 ? 'low' : '');
    html += '<div class="sub-trial-bar">';
    html += `<div class="sub-trial-bar-fill ${barClass}" style="width:${info.trialPercent}%"></div>`;
    html += '</div>';
    html += `<div class="sub-status-detail">${info.trialDays} of 14 trial days remaining</div>`;
  }

  if (info.warning) {
    html += `<div class="sub-warning">${escapeHtml(info.warning)}</div>`;
  }

  if (status === 'active') {
    const sub = proState.subscription;
    if (sub && sub.current_period_end) {
      const renewDate = new Date(sub.current_period_end).toLocaleDateString();
      html += `<div class="sub-status-detail">Renews on ${renewDate}</div>`;
    }
  }

  if (proState.entitlementSource === 'team' && status !== 'free') {
    html += `<div class="sub-status-detail" style="color:#6366f1;">Access via team subscription</div>`;
  }

  if (status !== 'active') {
    html += `<button class="btn btn-primary btn-full btn-sm" id="upgrade-cta-btn" type="button" onclick="handleUpgradeClick()">Upgrade to Pro - $49/month</button>`;
  }

  html += '</div>';
  container.innerHTML = html;
}

function handleUpgradeClick() {
  showToast('Billing integration coming soon! You are on a free trial.', 'success');
}