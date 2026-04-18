console.log("[WQP] subscription.js loaded");

let subscriptionState = {
  loaded: false,
  checkout_syncing: false,
  user_id: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_plan: 'free',
  subscription_status: 'free',
  current_period_end: null,
  cancel_at_period_end: false,
  trial_end: null,
  team_seat_count: 0
};

function normalizePlan(rawPlan) {
  const p = String(rawPlan || '').trim().toLowerCase();
  if (p === 'pro_solo') return 'pro_solo';
  if (p === 'pro_team') return 'pro_team';
  return 'free';
}

function normalizeStatus(rawStatus) {
  const s = String(rawStatus || '').trim().toLowerCase();
  if (s === 'trialing') return 'trial';
  if (s === 'canceled') return 'cancelled';
  if (s === 'past_due' || s === 'unpaid' || s === 'incomplete_expired') return 'expired';
  if (['free', 'trial', 'active', 'cancelled', 'expired'].includes(s)) return s;
  return 'free';
}

function _blankSubscriptionState(userId = null) {
  return {
    loaded: true,
    checkout_syncing: false,
    user_id: userId,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_plan: 'free',
    subscription_status: 'free',
    current_period_end: null,
    cancel_at_period_end: false,
    trial_end: null,
    team_seat_count: 0
  };
}

function _normalizeSubscriptionRecord(row, fallbackUserId = null) {
  if (!row) return _blankSubscriptionState(fallbackUserId);

  return {
    loaded: true,
    checkout_syncing: false,
    user_id: row.user_id || fallbackUserId || null,
    stripe_customer_id: row.stripe_customer_id || null,
    stripe_subscription_id: row.stripe_subscription_id || null,
    subscription_plan: normalizePlan(row.plan),
    subscription_status: normalizeStatus(row.status),
    current_period_end: row.current_period_end || null,
    cancel_at_period_end: !!row.cancel_at_period_end,
    trial_end: row.trial_end || null,
    team_seat_count: row.team_seat_count || 0
  };
}

function _applySubscriptionState(nextState, source, personalRow, teamRow) {
  subscriptionState = {
    ..._normalizeSubscriptionRecord(nextState, proState.user?.id || null),
    loaded: true,
    checkout_syncing: subscriptionState.checkout_syncing === true
  };

  proState.entitlementSource = source || 'personal';

  proState.subscription = {
    id: subscriptionState.stripe_subscription_id,
    plan: subscriptionState.subscription_plan === 'free' ? 'free' : 'pro',
    status: subscriptionState.subscription_status === 'trial' ? 'trialing' : subscriptionState.subscription_status,
    trial_ends_at: subscriptionState.trial_end,
    current_period_end: subscriptionState.current_period_end,
    stripe_customer_id: subscriptionState.stripe_customer_id,
    _source: source || 'personal',
    _score: source === 'team' ? 1 : 0,
    _personal: personalRow || null,
    _team: teamRow || null
  };
}

function _subscriptionHasProAccess(row) {
  if (!row) return false;

  const plan = normalizePlan(row.plan);
  const status = normalizeStatus(row.status);
  const now = new Date();

  const proPlan = plan === 'pro_solo' || plan === 'pro_team';
  if (!proPlan) return false;

  if (status === 'active') return true;

  if (status === 'trial') {
    if (!row.trial_end) return true;
    return new Date(row.trial_end) > now;
  }

  if (status === 'cancelled') {
    if (row.current_period_end && new Date(row.current_period_end) > now) {
      return true;
    }
  }

  return false;
}

async function _fetchPersonalSubscriptionRow(sb, userId) {
  const { data, error } = await sb
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
}

async function _fetchTeamOwnerSubscriptionRow(sb, teamId) {
  if (!teamId) return null;

  // Find the active owner of the team
  const { data: ownerMember, error: ownerErr } = await sb
    .from('team_members')
    .select('user_id')
    .eq('team_id', teamId)
    .eq('role', 'owner')
    .eq('status', 'active')
    .maybeSingle();

  if (ownerErr) throw ownerErr;
  if (!ownerMember?.user_id) return null;

  const { data: ownerSub, error: subErr } = await sb
    .from('subscriptions')
    .select('*')
    .eq('user_id', ownerMember.user_id)
    .maybeSingle();

  if (subErr) throw subErr;
  return ownerSub || null;
}

/* ================================================================
 * fetchSubscriptionState()
 * Queries the Supabase subscriptions table for the current user.
 * Also checks team-owner subscription inheritance for staff members.
 * Called on app boot and after returning from Stripe checkout.
 * ================================================================ */
async function fetchSubscriptionState() {
  const sb = await getSb();
  if (!sb) return;

  const user = proState.user;
  if (!user) {
    _applySubscriptionState(_blankSubscriptionState(null), 'personal', null, null);
    return;
  }

  let personalRow = null;
  let teamRow = null;

  try {
    personalRow = await _fetchPersonalSubscriptionRow(sb, user.id);
   
    console.log('[RAW DB ROW]', personalRow);

    // Default: personal subscription or free
    let effectiveRow = personalRow || _blankSubscriptionState(user.id);
    let source = 'personal';

    // If user's own row does not grant Pro access, check team-owner inheritance
    if (!_subscriptionHasProAccess(personalRow) && proState.teamId) {
      teamRow = await _fetchTeamOwnerSubscriptionRow(sb, proState.teamId);

      if (_subscriptionHasProAccess(teamRow)) {
        effectiveRow = {
          ...teamRow,
          user_id: user.id
        };
        source = 'team';
      }
    }

   _applySubscriptionState(effectiveRow, source, personalRow, teamRow);

console.log('[NORMALIZED STATE]', subscriptionState);
  } catch (e) {
    console.error('[Subscription] fetchSubscriptionState failed:', e);

    // Fall back cleanly instead of leaving stale state
    _applySubscriptionState(personalRow || _blankSubscriptionState(user.id), 'personal', personalRow, teamRow);
  }

  console.log('[Subscription] State loaded:', {
    plan: subscriptionState.subscription_plan,
    status: subscriptionState.subscription_status,
    source: proState.entitlementSource,
    hasProAccess: hasProAccess(),
    hasTeamAccess: hasTeamAccess()
  });
}

/* Map new plan names to legacy format used by getPlanDisplayInfo */
function _mapPlanToLegacy(plan) {
  if (plan === 'pro_solo' || plan === 'pro_team') return 'pro';
  return plan || 'free';
}

function _mapStatusToLegacy(status) {
  if (status === 'free') return 'expired';
  if (status === 'trial') return 'trialing'; // only for UI backwards compat
  return status || 'expired';
}

/* ================================================================
 * Entitlement checks
 * ================================================================ */

function getEntitlementStatus() {
  const status = normalizeStatus(subscriptionState.subscription_status);
  const plan = normalizePlan(subscriptionState.subscription_plan);

  if ((plan === 'pro_solo' || plan === 'pro_team') && status === 'active') {
    return 'active';
  }

  if (status === 'trial') {
    if (!subscriptionState.trial_end || new Date(subscriptionState.trial_end) > new Date()) {
      return 'trial';
    }
    return 'expired';
  }

  if (status === 'cancelled') {
    if (subscriptionState.current_period_end && new Date(subscriptionState.current_period_end) > new Date()) {
      return 'active';
    }
    return 'cancelled';
  }

  if (status === 'expired') return 'expired';

  return 'free';
}
function hasProAccess() {
  const plan = String(subscriptionState?.subscription_plan || '').toLowerCase();
  const status = String(subscriptionState?.subscription_status || '').toLowerCase();

  const validPlan = plan === 'pro_solo' || plan === 'pro_team';
  const validStatus = status === 'trial' || status === 'active';

  return validPlan && validStatus;
}

function hasTeamAccess() {
  const plan = String(subscriptionState?.subscription_plan || '').toLowerCase();
  const status = String(subscriptionState?.subscription_status || '').toLowerCase();

  return plan === 'pro_team' && (status === 'trial' || status === 'active');
}

function getTrialDaysRemaining() {
  const status = getEntitlementStatus();
  if (status !== 'trial') return null;
  if (!subscriptionState.trial_end) return null;

  const diff = new Date(subscriptionState.trial_end) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getPlanDisplayInfo() {
  const plan = String(subscriptionState?.subscription_plan || 'free').toLowerCase();
  const status = String(subscriptionState?.subscription_status || 'free').toLowerCase();

  if (plan === 'pro_team' && status === 'trial') {
    return {
      headerBadgeText: 'TRIAL',
      headerBadgeClass: 'badge-trial'
    };
  }

  if (plan === 'pro_team' && status === 'active') {
    return {
      headerBadgeText: 'PRO TEAM',
      headerBadgeClass: 'badge-pro'
    };
  }

  if (plan === 'pro_solo' && status === 'trial') {
    return {
      headerBadgeText: 'TRIAL',
      headerBadgeClass: 'badge-trial'
    };
  }

  if (plan === 'pro_solo' && status === 'active') {
    return {
      headerBadgeText: 'PRO',
      headerBadgeClass: 'badge-pro'
    };
  }

  return {
    headerBadgeText: 'FREE',
    headerBadgeClass: 'badge-free'
  };
}

/* ================================================================
 * Checkout & Billing Portal
 * ================================================================ */

/**
 * Start Stripe Checkout for the given plan.
 * @param {'pro_solo'|'pro_team'} plan
 */
async function startCheckout(plan) {
  if (!proState.user) {
    showToast('Please sign in first.', 'error');
    return;
  }

  const validPlans = ['pro_solo', 'pro_team'];
  if (!validPlans.includes(plan)) {
    showToast('Invalid plan selected.', 'error');
    return;
  }

  showToast('Redirecting to checkout...', 'info');

  try {
    const res = await fetch('/.netlify/functions/create-checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        plan: plan,
        userId: proState.user.id,
        email: proState.user.email
      })
    });

    const data = await res.json();

    if (!res.ok || !data.url) {
      throw new Error(data.error || 'Failed to create checkout session');
    }

    // Redirect to Stripe Checkout
    window.location.href = data.url;
  } catch (err) {
    console.error('[Checkout] Error:', err);
    showToast(err.message || 'Checkout failed. Please try again.', 'error');
  }
}

/**
 * Open Stripe Billing Portal for the current user.
 */
async function openBillingPortal() {
  if (!proState.user) {
    showToast('Please sign in first.', 'error');
    return;
  }

  showToast('Opening billing portal...', 'info');

  try {
    const res = await fetch('/.netlify/functions/billing-portal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: proState.user.id
      })
    });

    const data = await res.json();

    if (!res.ok || !data.url) {
      throw new Error(data.error || 'Failed to open billing portal');
    }

    window.location.href = data.url;
  } catch (err) {
    console.error('[BillingPortal] Error:', err);
    showToast(err.message || 'Could not open billing portal.', 'error');
  }
}

/* ================================================================
 * Legacy compatibility — loadSubscription wrapper
 * Called by existing bootPro code. Now delegates to fetchSubscriptionState.
 * ================================================================ */
async function loadSubscription(sb) {
  await fetchSubscriptionState();
}

/* ================================================================
 * normalizeSubscriptionRow — kept for backward compat but now
 * subscription state is managed via subscriptionState object.
 * ================================================================ */
function normalizeSubscriptionRow(row) {
  if (!row) return null;
  return {
    id: row.id || null,
    plan: row.plan || 'free',
status: row.status || 'expired',
    trial_ends_at: row.trial_ends_at || row.trial_end || null,
    current_period_end: row.current_period_end || null,
    stripe_customer_id: row.stripe_customer_id || null,
    _source: 'personal',
    _score: 0,
    _personal: null,
    _team: null
  };
}

/* ================================================================
 * Subscription UI rendering
 * ================================================================ */
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
  html += '<span style="font-weight:800;font-size:0.95rem;color:#111827;">Subscription</span>';
  html += `<span class="sub-plan-badge ${info.badgeClass}">${escapeHtml(info.label)}</span>`;
  html += '</div>';

  if (status === 'trial' && info.trialDays !== null) {
    const barClass = info.trialDays <= 2 ? 'critical' : (info.trialDays <= 4 ? 'low' : '');
    html += '<div class="sub-trial-bar">';
    html += `<div class="sub-trial-bar-fill ${barClass}" style="width:${info.trialPercent}%"></div>`;
    html += '</div>';
    html += `<div class="sub-status-detail">${info.trialDays} of 7 trial days remaining</div>`;
  }

  if (info.warning) {
    html += `<div class="sub-warning">${escapeHtml(info.warning)}</div>`;
  }

  if (status === 'active') {
    if (subscriptionState.current_period_end) {
      const renewDate = new Date(subscriptionState.current_period_end).toLocaleDateString();
      if (subscriptionState.cancel_at_period_end) {
        html += `<div class="sub-status-detail">Access until ${renewDate} (not renewing)</div>`;
      } else {
        html += `<div class="sub-status-detail">Renews on ${renewDate}</div>`;
      }
    }
  }

  if (proState.entitlementSource === 'team' && status !== 'free') {
    html += '<div class="sub-status-detail" style="color:#6366f1;">Access via team subscription</div>';
  }

  // Manage Subscription button for paid/trialing users
  if (status === 'active' || status === 'trial') {
    html += '<button class="btn btn-secondary btn-full btn-sm" id="manage-subscription-btn" type="button" style="margin-top:0.5rem;">Manage Subscription</button>';
  }

  // Upgrade CTA for non-pro users
  const isTeamStaff = proState.teamId && proState.teamRole !== 'owner';
  const isTeamEntitled = proState.entitlementSource === 'team';
  const showUpgrade = status !== 'active' && status !== 'trial' && !isTeamStaff && !isTeamEntitled;

  if (showUpgrade) {
    html += '<button class="btn btn-primary btn-full btn-sm" id="upgrade-cta-btn" type="button" style="margin-top:0.5rem;">View Pro Plans</button>';
  }

  html += '</div>';
  container.innerHTML = html;

  // Bind event handlers after rendering
  const manageBtn = el('manage-subscription-btn');
  if (manageBtn) {
    manageBtn.onclick = () => openBillingPortal();
  }

  const upgradeBtn = el('upgrade-cta-btn');
  if (upgradeBtn) {
    upgradeBtn.onclick = () => handleUpgradeClick('pro_solo');
  }
}

function handleUpgradeClick(plan) {
  openPlansModal(plan === 'pro_team' ? 'pro_team' : 'pro_solo', plan === 'pro_team' ? 'Team features' : 'Pro features');
}

function startUpgradeFlow(plan) {
  closePlansModal();
  if (plan === 'pro_team' || plan === 'team') {
    startCheckout('pro_team');
  } else {
    startCheckout('pro_solo');
  }
}

/* ================================================================
 * Checkout return handler
 * Checks URL params for ?checkout=success or ?checkout=cancel
 * ================================================================ */
async function handleCheckoutReturn() {
  const params = new URLSearchParams(window.location.search);
  const checkoutResult = params.get('checkout');

  if (!checkoutResult) return;

  // Clean the URL
  const url = new URL(window.location.href);
  url.searchParams.delete('checkout');
  window.history.replaceState({}, '', url.pathname + url.search);

  if (checkoutResult === 'success') {
    showToast('Subscription activated! Updating access...', 'success');

    // Retry because Stripe webhook + DB write can take longer than 2 seconds
    const maxAttempts = 8;
    const delayMs = 2000;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise(r => setTimeout(r, delayMs));
      await fetchSubscriptionState();

      if (hasProAccess()) {
        break;
      }

      console.log(`[CheckoutReturn] Waiting for subscription activation... attempt ${attempt}/${maxAttempts}`);
    }

    renderSubscriptionUI();
    renderProUI();
    syncSettingsForm();
    updateQuoteDisplay();

    if (hasProAccess()) {
      showToast('Pro access is now active.', 'success');
    } else {
      showToast('Checkout completed, but activation is still syncing. Please refresh in a moment.', 'info');
    }
  } else if (checkoutResult === 'cancel') {
    showToast('Checkout cancelled. You can upgrade anytime.', 'info');
  }
}
