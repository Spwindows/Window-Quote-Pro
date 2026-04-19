console.log("[WQP] pro.js loaded");

async function getSb() {
  if (supabaseClient) return supabaseClient;
  try {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return supabaseClient;
  } catch (e) {
    console.error('Supabase init failed', e);
    return null;
  }
}

function getCurrentPlanCode() {
  const sub = proState.subscription || {};
  return String(
    sub.subscription_plan ||
    sub.plan ||
    subscriptionState?.subscription_plan ||
    'free'
  ).toLowerCase();
}

function canUseProFeatures() {
  return typeof hasProAccess === 'function' ? hasProAccess() : false;
}

function canUseTeamFeatures() {
  return canUseProFeatures() && getCurrentPlanCode() === 'pro_team';
}

function isStaffUser() {
  return String(proState.teamRole || '').toLowerCase() === 'staff';
}

function isOwnerUser() {
  return String(proState.teamRole || '').toLowerCase() === 'owner';
}

function canManageTeamInvites() {
  return canUseTeamFeatures() && isOwnerUser();
}

function upsellToTeam(message) {
  showToast(message || 'This feature requires Pro Team.', 'info');
  if (typeof openPlansModal === 'function') {
    openPlansModal('team', 'Upgrade to Pro Team to invite staff and manage linked accounts.');
  }
}

function requireProTeamForTeamAction(actionLabel) {
  if (canUseTeamFeatures()) return true;
  upsellToTeam(`${actionLabel} requires Pro Team. Upgrade to unlock team features.`);
  return false;
}

function hasActiveLikeStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'trial' || s === 'trialing' || s === 'active';
}

async function loadTeamEntitlement(sb) {
  if (!proState.user || !proState.teamId) return;

  const role = String(proState.teamRole || '').toLowerCase();
  if (role === 'owner') return;

  try {
    const { data: ownerMember, error: ownerErr } = await sb
      .from('team_members')
      .select('user_id, role, status')
      .eq('team_id', proState.teamId)
      .eq('role', 'owner')
      .eq('status', 'active')
      .maybeSingle();

    if (ownerErr) throw ownerErr;
    if (!ownerMember?.user_id) return;

    const { data: ownerSub, error: subErr } = await sb
      .from('subscriptions')
      .select('*')
      .eq('user_id', ownerMember.user_id)
      .maybeSingle();

    if (subErr) throw subErr;
    if (!ownerSub) return;

    const plan = String(
      ownerSub.subscription_plan ||
      ownerSub.plan ||
      'free'
    ).toLowerCase();

    const status = String(
      ownerSub.subscription_status ||
      ownerSub.status ||
      'free'
    ).toLowerCase();

    const ownerHasTeamEntitlement =
      plan === 'pro_team' &&
      (
        status === 'active' ||
        status === 'trial' ||
        status === 'trialing'
      );

    if (!ownerHasTeamEntitlement) {
      proState.entitlementSource = null;
      return;
    }

    proState.subscription = {
      ...(proState.subscription || {}),
      ...ownerSub,
      subscription_plan: plan,
      subscription_status: status,
      plan,
      status
    };
    proState.entitlementSource = 'team';
  } catch (e) {
    console.error('Team entitlement load error', e);
  }
}

function gateTeamInviteControls() {
  const allowed = canManageTeamInvites();

  const sectionIds = [
    'team-invite-section',
    'team-invite-card',
    'settings-team-invite-card',
    'settings-team-invite-section'
  ];

  const textIds = [
    'team-invite-note',
    'team-invite-help',
    'team-invite-warning',
    'team-gate-message'
  ];

  const codeIds = [
    'team-invite-code',
    'invite-code-display',
    'team-invite-link',
    'team-share-link'
  ];

  const actionIds = [
    'team-invite-btn',
    'team-share-btn',
    'team-copy-btn',
    'copy-invite-btn',
    'share-invite-btn',
    'invite-staff-btn',
    'team-invite-share-btn',
    'team-invite-copy-btn',
    'invite-link-btn'
  ];

  const sections = sectionIds.map(id => el(id)).filter(Boolean);
  const texts = textIds.map(id => el(id)).filter(Boolean);
  const codes = codeIds.map(id => el(id)).filter(Boolean);
  const actions = actionIds.map(id => el(id)).filter(Boolean);

  if (allowed) {
    sections.forEach(node => node.classList.remove('team-upsell-locked'));
    texts.forEach(node => {
      if (node.dataset.originalText) node.textContent = node.dataset.originalText;
      node.classList.add('hidden');
    });
    codes.forEach(node => {
      node.classList.remove('blur-sm', 'opacity-60');
      if (node.dataset.originalText) node.textContent = node.dataset.originalText;
      if (node.dataset.originalHref) node.href = node.dataset.originalHref;
    });
    actions.forEach(btn => {
      btn.disabled = false;
      btn.classList.remove('btn-primary');
      if (btn.dataset.originalText) btn.textContent = btn.dataset.originalText;
      if (btn.dataset.originalOnclick) {
        try {
          btn.setAttribute('onclick', btn.dataset.originalOnclick);
        } catch (_) {}
      }
    });
    return;
  }

  sections.forEach(node => node.classList.remove('hidden'));

  texts.forEach(node => {
    if (!node.dataset.originalText) node.dataset.originalText = node.textContent || '';
    node.textContent = isOwnerUser()
      ? 'Upgrade to Pro Team to invite staff and use linked team accounts.'
      : 'Your owner must upgrade to Pro Team to enable team access.';
    node.classList.remove('hidden');
  });

  codes.forEach(node => {
    if (!node.dataset.originalText) node.dataset.originalText = node.textContent || '';
    if (node.tagName === 'A' && !node.dataset.originalHref) {
      node.dataset.originalHref = node.getAttribute('href') || '';
    }
    node.textContent = 'Upgrade to Pro Team';
    if (node.tagName === 'A') {
      node.removeAttribute('href');
    }
    node.classList.add('blur-sm', 'opacity-60');
  });

  actions.forEach(btn => {
    if (!btn.dataset.originalText) btn.dataset.originalText = btn.textContent || '';
    btn.textContent = 'Upgrade to Pro Team';
    btn.disabled = false;
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      upsellToTeam(isOwnerUser()
        ? 'Inviting staff requires Pro Team.'
        : 'Your owner must upgrade to Pro Team to enable invites.');
    };
    try {
      btn.removeAttribute('href');
      btn.setAttribute('type', 'button');
    } catch (_) {}
  });
}

/* bootPro is wrapped with asyncGuard after definition to prevent
 * concurrent calls from DOMContentLoaded, handleAuth, createTeam,
 * joinTeam, and saveTeamJob all firing overlapping Supabase RPCs. */
async function _bootProInner() {
  const sb = await getSb();
  if (!sb) return;

  let user = null;
  try {
    const { data } = await sb.auth.getUser();
    user = data?.user || null;
  } catch (e) {
    console.warn('getUser failed:', e.message);
  }

  if (!user) {
    proState.user = null;
    proState.teamId = null;
    proState.teamName = '';
    proState.teamRole = '';
    proState.inviteCode = '';
    proState.jobs = [];
    proState.subscription = null;
    proState.entitlementSource = null;
    renderProUI();
    return;
  }

  proState.user = user;

  try {
    const { data: team, error } = await sb.rpc('get_my_team');
    const noTeam =
      error ||
      !team ||
      (Array.isArray(team) && team.length === 0);

    if (noTeam) {
      proState.teamId = null;
      proState.teamName = '';
      proState.teamRole = '';
      proState.inviteCode = '';
      proState.jobs = [];

      if (pendingInviteCode) {
        if (!canUseTeamFeatures()) {
          showToast('Joining a team requires Pro Team. Upgrade to continue.', 'info');
          localStorage.removeItem('pending_invite');
          pendingInviteCode = null;

          if (typeof openPlansModal === 'function') {
            openPlansModal('team', 'Upgrade to Pro Team to join a team and access linked accounts.');
          }
        } else {
          try {
            const { error: joinErr } = await sb.rpc('join_team_by_invite', {
              p_invite_code: pendingInviteCode
            });

            if (joinErr) throw joinErr;

            showToast('Joined team!', 'success');
            localStorage.removeItem('pending_invite');
            pendingInviteCode = null;
            return await _bootProInner();
          } catch (joinE) {
            console.error('Auto-join failed:', joinE.message);
            showToast('Could not join team with that invite code', 'error');
            localStorage.removeItem('pending_invite');
            pendingInviteCode = null;
          }
        }
      }
    } else {
      const t = Array.isArray(team) ? team[0] : team;
      proState.teamId = t.team_id || t.id;
      proState.teamName = t.business_name || t.team_name || '';
      proState.teamRole = t.role || 'staff';
      proState.inviteCode = t.invite_code;
      localStorage.removeItem('pending_invite');
      pendingInviteCode = null;

      const { data: jobs } = await sb
        .from('jobs')
        .select('*')
        .eq('team_id', proState.teamId)
        .order('created_at', { ascending: false });

      proState.jobs = jobs || [];

      const { data: s } = await sb
        .from('team_settings')
        .select('*')
        .eq('team_id', proState.teamId)
        .single();

      if (s) applyTeamSettings(s);
      setupRealtimeChannel(sb);
    }
  } catch (e) {
    console.error(e);
  }

  try {
    await loadSubscription(sb);
  } catch (e) {
    console.error('Subscription load error', e);
  }

  try {
    await loadTeamEntitlement(sb);
  } catch (e) {
    console.error('Team subscription inheritance error', e);
  }

  renderProUI();
  renderSubscriptionUI();
  syncSettingsForm();
  renderSettingsGrids();
  gateTeamInviteControls();
  updateKPIs();
  renderJobsList();
  if (typeof renderRebookingSection === 'function') renderRebookingSection();
  updateQuoteDisplay();
}

const bootPro = asyncGuard(_bootProInner, 'bootPro');

async function _handleAuthInner() {
  const email = (el('auth-email') || {}).value || '';
  const password = (el('auth-password') || {}).value || '';
  const sb = await getSb();
  if (!sb) return;

  try {
    let res;
    if (authMode === 'signup') {
      const name = (el('auth-name') || {}).value || '';
      res = await sb.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } }
      });
    } else {
      res = await sb.auth.signInWithPassword({ email, password });
    }

    if (res.error) throw res.error;
    showToast('Welcome!', 'success');
    await bootPro();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

const handleAuth = asyncGuard(_handleAuthInner, 'handleAuth');

async function _createTeamInner() {
  if (!requireProTeamForTeamAction('Creating a team')) return;

  const name = ((el('team-name-input') || {}).value || '').trim();
  if (!name) return showToast('Enter business name', 'error');

  const sb = await getSb();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('create_team', {
      p_business_name: name
    });
    if (error) throw error;
    showToast('Team created!', 'success');
    await bootPro();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

const createTeam = asyncGuard(_createTeamInner, 'createTeam');

async function _joinTeamInner() {
  if (!requireProTeamForTeamAction('Joining a team')) return;

  const code = ((el('invite-code-input') || {}).value || '').trim();
  if (!code) return showToast('Enter invite code', 'error');

  const sb = await getSb();
  if (!sb) return;

  try {
    const { error } = await sb.rpc('join_team_by_invite', {
      p_invite_code: code
    });
    if (error) throw error;
    showToast('Joined team!', 'success');
    await bootPro();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

const joinTeam = asyncGuard(_joinTeamInner, 'joinTeam');

function renderProUI() {
  const authPanel = el('pro-auth-panel');
  const dashboard = el('pro-dashboard');
  const accountPanel = el('pro-account-card');
  const teamSetup = el('pro-team-setup');
  const teamDash = el('pro-team-dashboard');
  const headerBadge = el('pro-badge');

  const createTeamBtn = el('create-team-btn');
  const joinTeamBtn = el('join-team-btn');
  const inviteInput = el('invite-code-input');
  const teamNameInput = el('team-name-input');
  const teamGateMsg = el('team-gate-message');

  if (!proState.user) {
    if (createTeamBtn) createTeamBtn.disabled = false;
    if (joinTeamBtn) joinTeamBtn.disabled = false;
    if (inviteInput) inviteInput.disabled = false;
    if (teamNameInput) teamNameInput.disabled = false;

    if (authPanel) authPanel.classList.remove('hidden');
    if (dashboard) dashboard.classList.add('hidden');
    if (accountPanel) accountPanel.classList.add('hidden');
    if (teamSetup) teamSetup.classList.add('hidden');
    if (teamDash) teamDash.classList.add('hidden');
    if (headerBadge) {
      headerBadge.textContent = 'FREE';
      headerBadge.className = 'badge-free';
    }
    if (teamGateMsg) teamGateMsg.classList.add('hidden');
    return;
  }

  if (authPanel) authPanel.classList.add('hidden');
  if (dashboard) dashboard.classList.remove('hidden');
  if (accountPanel) accountPanel.classList.remove('hidden');

  const nameEl = el('team-name-display');
  const emailEl = el('team-email-display');
  const roleBadge = el('team-role-badge');

  if (nameEl) {
    nameEl.textContent = proState.teamName || proState.user.user_metadata?.full_name || 'My Account';
  }
  if (emailEl) emailEl.textContent = proState.user.email || '';
  if (roleBadge) {
    const role = (proState.teamRole || 'owner').toLowerCase();
    roleBadge.textContent = role === 'owner' ? 'Owner' : 'Staff';
    roleBadge.className = role === 'owner'
      ? 'role-badge role-owner'
      : 'role-badge role-staff';
  }

  const planInfo = getPlanDisplayInfo();
  if (headerBadge) {
    headerBadge.textContent = planInfo.headerBadgeText;
    headerBadge.className = planInfo.headerBadgeClass;
  }

  // Keep buttons clickable so they trigger the upgrade modal instead of doing nothing.
  if (createTeamBtn) createTeamBtn.disabled = false;
  if (joinTeamBtn) joinTeamBtn.disabled = false;
  if (inviteInput) inviteInput.disabled = false;
  if (teamNameInput) teamNameInput.disabled = false;

  const hasUnlockedTeam = canUseTeamFeatures();
  const hasPro = canUseProFeatures();
  const isOwner = isOwnerUser();
  const isStaff = isStaffUser();

  if (teamDash) {
    teamDash.classList.toggle('hidden', !hasUnlockedTeam);
  }

  if (teamSetup) {
    let showTeamSetup = false;

    if (!hasPro) {
      showTeamSetup = false;
    } else if (isStaff) {
      showTeamSetup = false;
    } else if (hasUnlockedTeam) {
      showTeamSetup = !proState.teamId;
    } else {
      showTeamSetup = true;
    }

    teamSetup.classList.toggle('hidden', !showTeamSetup);
  }

  if (teamGateMsg) {
    if (!hasPro) {
      teamGateMsg.classList.add('hidden');
    } else if (!hasUnlockedTeam) {
      teamGateMsg.textContent = isOwner
        ? 'Upgrade to Pro Team to create a team, invite staff, and use linked team accounts.'
        : 'Your owner must upgrade to Pro Team to enable team access.';
      teamGateMsg.classList.remove('hidden');
    } else {
      teamGateMsg.classList.add('hidden');
    }
  }

  const invoiceUpsellCard = el('invoice-upsell-card');
  const invoiceUpsellBtn = el('invoice-upsell-btn');
  if (invoiceUpsellCard) invoiceUpsellCard.classList.remove('hidden');
  if (invoiceUpsellBtn) {
    invoiceUpsellBtn.textContent = hasPro ? 'Go to Invoices' : 'Unlock Invoices 🔒';
    invoiceUpsellBtn.classList.toggle('btn-primary', !hasPro);
    invoiceUpsellBtn.classList.toggle('btn-secondary', hasPro);
  }

  const logoSection = el('logo-upload-section');
  if (logoSection) {
    logoSection.classList.toggle('hidden', !proState.teamId || !canAccessSettings());
  }
  if (proState.teamId && canAccessSettings()) {
    renderLogoPreview();
  }

  if (typeof renderRebookingSection === 'function') {
    renderRebookingSection();
  }

  gateTeamInviteControls();
}

async function handleSignOut() {
  const sb = await getSb();
  if (sb) {
    if (realtimeChannel) {
      realtimeChannel.unsubscribe();
      realtimeChannel = null;
    }
    await sb.auth.signOut();
  }

  proState.subscription = null;
  proState.entitlementSource = null;
  proState.logoDataUrl = null;
  location.reload();
}
