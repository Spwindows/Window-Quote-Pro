console.log("[WQP] subscription.js loaded");

/* ================================================================
 * Subscription State Object
 * Holds the canonical subscription data fetched from Supabase.
 * All entitlement checks read from this object.
 * ================================================================ */
let subscriptionState = {
  loaded: false,
  user_id: null,
  stripe_customer_id: null,
  stripe_subscription_id: null,
  subscription_plan: 'free',     // 'free' | 'pro_solo' | 'pro_team'
  subscription_status: 'free',   // 'free' | 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid' | 'incomplete' | 'incomplete_expired'
  current_period_end: null,
  cancel_at_period_end: false,
  trial_end: null,
  team_seat_count: 0
};

/* ================================================================
 * fetchSubscriptionState()
 * Queries the Supabase subscriptions table for the current user.
 * Called on app boot and after returning from Stripe checkout.
 * ================================================================ */
async function fetchSubscriptionState() {
  const sb = await getSb();
  if (!sb) return;

  const user = proState.user;
  if (!user) {
    subscriptionState = { ...subscriptionState, loaded: true, subscription_plan: 'free', subscription_status: 'free' };
    return;
  }

  try {
    const { data, error } = await sb
      .from('subscriptions')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('[Subscription] Fetch error:', error.message);
      // Fall through — keep current state, mark loaded
    } else if (data) {
      subscriptionState = {
        loaded: true,
        user_id: data.user_id,
        stripe_customer_id: data.stripe_customer_id,
        stripe_subscription_id: data.stripe_subscription_id,
        subscription_plan: data.subscription_plan || 'free',
        subscription_status: data.subscription_status || 'free',
        current_period_end: data.current_period_end || null,
        cancel_at_period_end: !!data.cancel_at_period_end,
        trial_end: data.trial_end || null,
        team_seat_count: data.team_seat_count || 0
      };
    } else {
      // No row exists — user is on free plan
      subscriptionState = {
        loaded: true,
        user_id: user.id,
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
  } catch (e) {
    console.error('[Subscription] fetchSubscriptionState failed:', e);
  }

  subscriptionState.loaded = true;

  // Sync into proState.subscription for backward compatibility with
  // existing code that reads proState.subscription
  proState.subscription = {
    id: subscriptionState.stripe_subscription_id,
    plan: _mapPlanToLegacy(subscriptionState.subscription_plan),
    status: _mapStatusToLegacy(subscriptionState.subscription_status),
    trial_ends_at: subscriptionState.trial_end,
    current_period_end: subscriptionState.current_period_end,
    stripe_customer_id: subscriptionState.stripe_customer_id,
    _source: 'personal',
    _score: 0,
    _personal: null,
    _team: null
  };

  console.log('[Subscription] State loaded:', {
    plan: subscriptionState.subscription_plan,
    status: subscriptionState.subscription_status,
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
  return status || 'expired';
}

/* ================================================================
 * Entitlement checks
 * ================================================================ */

function getEntitlementStatus() {
  const status = String(subscriptionState.subscription_status || 'free').toLowerCase();
  const plan = String(subscriptionState.subscription_plan || 'free').toLowerCase();

  // Active subscription
  if (status === 'active' && (plan === 'pro_solo' || plan === 'pro_team' || plan === 'pro')) {
    return 'active';
  }

  // Trialing
  if (status === 'trialing') {
    if (!subscriptionState.trial_end || new Date(subscriptionState.trial_end) > new Date()) {
      return 'trial';
    }
    return 'expired';
  }

  // Canceled but still within paid period
  if (status === 'canceled') {
    if (subscriptionState.current_period_end && new Date(subscriptionState.current_period_end) > new Date()) {
      return 'active'; // Still has access until period end
    }
    return 'cancelled';
  }

  if (status === 'past_due') return 'past_due';
  if (status === 'unpaid') return 'expired';
  if (status === 'incomplete') return 'expired';
  if (status === 'incomplete_expired') return 'expired';

  return 'free';
}

function hasProAccess() {
  const s = getEntitlementStatus();
  return s === 'active' || s === 'trial';
}

function hasTeamAccess() {
  if (!hasProAccess()) return false;
  const plan = String(subscriptionState.subscription_plan || '').toLowerCase();
  return plan === 'pro_team';
}

function getTrialDaysRemaining() {
  const status = getEntitlementStatus();
  if (status !== 'trial') return null;
  if (!subscriptionState.trial_end) return null;

  const diff = new Date(subscriptionState.trial_end) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function getPlanDisplayInfo() {
  const status = getEntitlementStatus();
  const trialDays = getTrialDaysRemaining();
  const plan = String(subscriptionState.subscription_plan || 'free').toLowerCase();

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
      info.label = plan === 'pro_team' ? 'Pro Team' : 'Pro Solo';
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
      info.trialPercent = Math.max(0, Math.min(100, (trialDays / 7) * 100));
      if (trialDays <= 2) {
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
      info.label = 'Expired';
      info.badgeClass = 'sub-plan-expired';
      info.headerBadgeText = 'FREE';
      info.headerBadgeClass = 'badge-free';
      info.warning = 'Your subscription has expired. Upgrade to access Pro features.';
      break;
    default:
      break;
  }

  return info;
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
    plan: row.plan || row.subscription_plan || 'free',
    status: row.status || row.subscription_status || 'expired',
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
    upgradeBtn.onclick = () => handleUpgradeClick('pro');
  }
}

function handleUpgradeClick(plan) {
  openPlansModal(plan === 'team' ? 'team' : 'pro', plan === 'team' ? 'Team features' : 'Pro features');
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
    showToast('Subscription activated! Welcome to Pro.', 'success');
    // Wait a moment for webhook to process, then refresh state
    await new Promise(r => setTimeout(r, 2000));
    await fetchSubscriptionState();
    renderSubscriptionUI();
    renderProUI();
    syncSettingsForm();
    updateQuoteDisplay();
  } else if (checkoutResult === 'cancel') {
    showToast('Checkout cancelled. You can upgrade anytime.', 'info');
  }
}
