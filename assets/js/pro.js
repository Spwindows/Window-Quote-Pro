console.log("[WQP] pro.js loaded");

function getSafeProState() {
  if (!window.proState || typeof window.proState !== 'object') {
    window.proState = JSON.parse(JSON.stringify(DEFAULT_PRO_STATE));
  }

  if (!Array.isArray(window.proState.jobs)) window.proState.jobs = [];
  if (typeof window.proState.user === 'undefined') window.proState.user = null;
  if (typeof window.proState.teamId === 'undefined') window.proState.teamId = null;
  if (typeof window.proState.teamName === 'undefined') window.proState.teamName = '';
  if (typeof window.proState.teamRole === 'undefined') window.proState.teamRole = '';
  if (typeof window.proState.inviteCode === 'undefined') window.proState.inviteCode = '';
  if (typeof window.proState.subscription === 'undefined') window.proState.subscription = null;
  if (typeof window.proState.entitlementSource === 'undefined') window.proState.entitlementSource = null;
  if (typeof window.proState.logoDataUrl === 'undefined') window.proState.logoDataUrl = null;

  return window.proState;
}

async function getSb() {
  getSafeProState();

  if (window.supabaseClient) return window.supabaseClient;

  try {
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return window.supabaseClient;
  } catch (e) {
    console.error('Supabase init failed', e);
    return null;
  }
}

function canUseProFeatures() {
  return hasProAccess();
}

function canUseTeamFeatures() {
  return hasTeamAccess();
}

function canUseTeamInviteFeatures() {
  const ps = getSafeProState();
  return hasTeamAccess() && String(ps.teamRole || '').toLowerCase() === 'owner';
}

async function _bootProInner() {
  const ps = getSafeProState();

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
    ps.user = null;
    renderProUI();
    return;
  }

  ps.user = user;

  try {
    const { data: team, error } = await sb.rpc('get_my_team');
    const noTeam =
      error ||
      !team ||
      (Array.isArray(team) && team.length === 0);

    if (noTeam) {
      ps.teamId = null;
      ps.teamName = '';
      ps.teamRole = '';
      ps.inviteCode = '';
      ps.jobs = [];

      if (window.pendingInviteCode) {
        try {
          const { error: joinErr } = await sb.rpc('join_team_by_invite', {
            p_invite_code: window.pendingInviteCode
          });
          if (joinErr) throw joinErr;

          showToast('Joined team!', 'success');
          localStorage.removeItem('pending_invite');
          window.pendingInviteCode = null;
          return await _bootProInner();
        } catch (joinE) {
          console.error('Auto-join failed:', joinE.message);
          showToast('Could not join team with that invite code', 'error');
          localStorage.removeItem('pending_invite');
          window.pendingInviteCode = null;
        }
      }
    } else {
      const t = Array.isArray(team) ? team[0] : team;

      ps.teamId = t.team_id || t.id;
      ps.teamName = t.business_name || t.team_name || '';
      ps.teamRole = t.role || 'staff';
      ps.inviteCode = t.invite_code;

      localStorage.removeItem('pending_invite');
      window.pendingInviteCode = null;

      const { data: jobs } = await sb
        .from('jobs')
        .select('*')
        .eq('team_id', ps.teamId)
        .order('created_at', { ascending: false });

      ps.jobs = jobs || [];

      const { data: s } = await sb
        .from('team_settings')
        .select('*')
        .eq('team_id', ps.teamId)
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

  renderProUI();
  renderSubscriptionUI();
  syncSettingsForm();
  renderSettingsGrids();
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
  if (!hasTeamAccess()) {
    showToast('Upgrade to Pro Team to create a team.', 'error');
    handleUpgradeClick('pro_team');
    return;
  }

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
  if (!hasTeamAccess()) {
    showToast('Upgrade to Pro Team to join a team.', 'error');
    handleUpgradeClick('pro_team');
    return;
  }

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
  const ps = getSafeProState();

  const authPanel = el('pro-auth-panel');
  const dashboard = el('pro-dashboard');
  const accountPanel = el('pro-account-card');
  const teamSetup = el('pro-team-setup');
  const teamDash = el('pro-team-dashboard');
  const headerBadge = el('pro-badge');

  if (!ps.user) {
    if (authPanel) authPanel.classList.remove('hidden');
    if (dashboard) dashboard.classList.add('hidden');
    if (accountPanel) accountPanel.classList.add('hidden');
    if (teamSetup) teamSetup.classList.add('hidden');
    if (teamDash) teamDash.classList.add('hidden');
    if (headerBadge) {
      headerBadge.textContent = 'FREE';
      headerBadge.className = 'badge-free';
    }
    return;
  }

  if (authPanel) authPanel.classList.add('hidden');
  if (dashboard) dashboard.classList.remove('hidden');
  if (accountPanel) accountPanel.classList.remove('hidden');

  const nameEl = el('team-name-display');
  const emailEl = el('team-email-display');
  const roleBadge = el('team-role-badge');

  if (nameEl) {
    nameEl.textContent = ps.teamName || ps.user.user_metadata?.full_name || 'My Account';
  }
  if (emailEl) emailEl.textContent = ps.user.email || '';

  if (roleBadge) {
    const role = String(ps.teamRole || 'owner').toLowerCase();
    roleBadge.textContent = role === 'owner' ? 'Owner' : 'Staff';
    roleBadge.className = role === 'owner' ? 'role-badge role-owner' : 'role-badge role-staff';
  }

  const planInfo = getPlanDisplayInfo();
  if (headerBadge) {
    headerBadge.textContent = planInfo.headerBadgeText;
    headerBadge.className = planInfo.headerBadgeClass;
  }

  const canTeam = hasTeamAccess();

  if (ps.teamId && canTeam) {
    if (teamSetup) teamSetup.classList.add('hidden');
    if (teamDash) teamDash.classList.remove('hidden');
  } else if (!ps.teamId && canTeam) {
    if (teamSetup) teamSetup.classList.remove('hidden');
    if (teamDash) teamDash.classList.add('hidden');
  } else {
    if (teamSetup) teamSetup.classList.add('hidden');
    if (teamDash) teamDash.classList.add('hidden');
  }

  const invoiceUpsellCard = el('invoice-upsell-card');
  const invoiceUpsellBtn = el('invoice-upsell-btn');
  if (invoiceUpsellCard) invoiceUpsellCard.classList.remove('hidden');

  if (invoiceUpsellBtn) {
    invoiceUpsellBtn.textContent = canUseProFeatures() ? 'Go to Invoices' : 'Unlock Invoices 🔒';
    invoiceUpsellBtn.classList.toggle('btn-primary', !canUseProFeatures());
    invoiceUpsellBtn.classList.toggle('btn-secondary', canUseProFeatures());
  }

  const logoSection = el('logo-upload-section');
  if (logoSection) {
    logoSection.classList.toggle('hidden', !canUseProFeatures() || !ps.teamId || !canAccessSettings());
  }

  if (canUseProFeatures() && ps.teamId && canAccessSettings()) {
    renderLogoPreview();
  }

  if (typeof renderRebookingSection === 'function') renderRebookingSection();
}

async function handleSignOut() {
  const ps = getSafeProState();
  const sb = await getSb();

  if (sb) {
    if (window.realtimeChannel) {
      window.realtimeChannel.unsubscribe();
      window.realtimeChannel = null;
    }
    await sb.auth.signOut();
  }

  ps.subscription = null;
  ps.entitlementSource = null;
  ps.logoDataUrl = null;
  location.reload();
}
